import { z } from "zod";
import { BRANCH_CODES } from "@pokta-clinic/fhir";
import { calendar } from "@/calendar";
import { EhrRejectedError, EhrUnavailableError, ehr, type AppointmentRecord, type PatientDetail } from "@/ehr";
import { queueForEhr } from "@/outbox/queue";
import { BRANCHES, type BranchCode } from "@/scheduling/branches";
import { busyRange, describeStart, resolveSlot } from "@/scheduling/slots";
import { store, type BookingRecord } from "@/store";
import { appointmentConfirmation } from "@/email/templates";
import { patientLinkUrl } from "@/patient-link/token";
import { branchDetails } from "@/tools/branch-details";
import { callerEmail, resolveCallerEmail } from "@/tools/caller-email";
import { closePendingCallbacks } from "@/tools/close-callbacks";
import { sendLater } from "@/tools/notify";
import { CALM, NO_CONSENT, conversationId, grantedConsent, patientMismatch, tool } from "@/tools/handler";

const Input = z.object({
  conversation_id: conversationId,
  patient_id: z.string().min(1).max(100),
  branch: z.enum(BRANCH_CODES),
  start: z.string().min(1).max(40),
  caller_email: callerEmail,
});

const SLOT_TAKEN = {
  booked: false,
  message: "That slot is no longer available. Apologise briefly and call check_availability to offer other options.",
};

async function confirmed(appointment: { id: string | null; branch: BranchCode; start: string }, queued = false) {
  const { label } = describeStart(appointment.start);
  const { name, address, practitionerName } = await branchDetails(appointment.branch);
  const readBack = `the day, date and time (${label}), the branch name (${name}) and the practitioner (${practitionerName})`;
  return {
    booked: true,
    ...(appointment.id ? { appointment_id: appointment.id } : {}),
    ...(queued ? { queued: true } : {}),
    branch: appointment.branch,
    branch_name: name,
    address,
    practitioner_name: practitionerName,
    start: appointment.start,
    label,
    message: queued
      ? `Booked in the calendar. The clinic record system is offline and will sync the Appointment by itself. Read back ${readBack} to the caller (not the address: it is in the email; give it only if asked), do not mention any problem, and follow the instructions of your current stage.${CALM}`
      : `Booked. Read back ${readBack} to the caller; do not read the address unless they ask for it. Then follow the instructions of your current stage.${CALM}`,
  };
}

// The store remembers the booking of a Conversation so a repeat is answered while the EHR is down.
async function rememberBooking(conversationId: string, booking: BookingRecord) {
  try {
    await store.putBooking(conversationId, booking);
  } catch (err) {
    console.error(JSON.stringify({ booking_cache: "write_failed", error: (err as Error).name }));
  }
}

async function recalledBooking(conversationId: string): Promise<BookingRecord | null> {
  try {
    return await store.getBooking(conversationId);
  } catch (err) {
    console.error(JSON.stringify({ booking_cache: "read_failed", error: (err as Error).name }));
    return null;
  }
}

export const POST = tool("book_appointment", Input, async (input, ctx) => {
  const consent = await grantedConsent(input.conversation_id);
  if (!consent) return NO_CONSENT;
  const mismatch = patientMismatch(consent, input.patient_id);
  if (mismatch) return mismatch;

  // Idempotent per Conversation: a repeated call (the agent retrying, a double tap) returns the booking.
  // The store is asked first (it also knows bookings still queued for the EHR), the EHR second.
  const remembered = await recalledBooking(input.conversation_id);
  if (remembered) {
    if (remembered.patientId !== input.patient_id) return patientMismatch({ id: "", granted: true, patientId: remembered.patientId }, input.patient_id)!;
    ctx.outcome(`slot already booked ${describeOutcomeStart(remembered.start)}`);
    return confirmed({ id: remembered.appointmentId, branch: remembered.branch ?? input.branch, start: remembered.start });
  }
  // From here a failed EHR call does not stop the booking: only the Appointment write is queued.
  let ehrDown = false;
  let existing: AppointmentRecord | null = null;
  try {
    existing = await ehr.findAppointmentByConversation(input.conversation_id);
  } catch (err) {
    if (!(err instanceof EhrUnavailableError)) throw err;
    ehrDown = true;
  }
  if (existing) {
    if (existing.patientId !== input.patient_id) return patientMismatch({ id: "", granted: true, patientId: existing.patientId }, input.patient_id)!;
    ctx.outcome(`slot already booked ${describeOutcomeStart(existing.start)}`);
    return confirmed({ id: existing.id, branch: existing.branch ?? input.branch, start: existing.start });
  }

  // Never trust the start the LLM sends: re-check the branch's rules and its live calendar.
  const now = new Date();
  const slot = resolveSlot(input.start, now, input.branch);
  if (!slot) {
    ctx.outcome("start not bookable");
    return { ...SLOT_TAKEN, message: "That start is not a bookable slot. Call check_availability and offer only the slots it returns." };
  }
  const range = busyRange(now);
  const busy = await calendar.busy(input.branch, range.from, range.to);
  const startMs = Date.parse(slot.start);
  if (busy.some((b) => startMs < Date.parse(b.end) && Date.parse(b.start) < Date.parse(slot.end))) {
    ctx.outcome("slot taken");
    return SLOT_TAKEN;
  }

  let patient: PatientDetail | null = null;
  if (!ehrDown) {
    try {
      patient = await ehr.getPatient(input.patient_id);
    } catch (err) {
      if (!(err instanceof EhrUnavailableError)) throw err;
      ehrDown = true;
    }
    if (!ehrDown && !patient) {
      ctx.outcome("patient not found");
      return { booked: false, message: "That patient_id is not in the record system. Use the patient_id returned by find_patient or save_patient." };
    }
  }

  // No clinical data in the calendar: it is a third-party system outside the Expediente (NOM-004).
  // The folio and ids let the practice find the Patient in the EHR. While the EHR is down the name is
  // unknown, so the event carries the ids only.
  const event = await calendar.createEvent({
    branch: input.branch,
    start: slot.start,
    end: slot.end,
    summary: patient ? `Primera consulta: ${patient.givenName} ${patient.primerApellido}`.trim() : "Primera consulta (pendiente de sincronizar)",
    description: `Sucursal: ${BRANCHES[input.branch].name}\nFolio: ${patient?.folio ?? "n/a"}\nPatient ID: ${input.patient_id}\nConversation ID: ${input.conversation_id}`,
  });
  const appointmentInput = {
    conversationId: input.conversation_id,
    patientId: input.patient_id,
    branch: input.branch,
    start: slot.start,
    end: slot.end,
    calendarEventId: event.id,
    description: "Primera consulta agendada por el asistente de voz",
  };
  const booking = { patientId: input.patient_id, branch: input.branch, start: slot.start, end: slot.end, calendarEventId: event.id };
  // The calendar event exists: when the EHR is down keep it and queue the Appointment write with its id.
  const queue = (cause: EhrUnavailableError) =>
    queueForEhr(
      {
        kind: "appointment",
        conversationId: input.conversation_id,
        payload: { patientId: input.patient_id, branch: input.branch, start: slot.start, end: slot.end, calendarEventId: event.id, description: appointmentInput.description },
      },
      cause,
    );
  try {
    if (ehrDown) throw new EhrUnavailableError("down earlier in this call");
    const appointment = await ehr.createAppointment(appointmentInput);
    await rememberBooking(input.conversation_id, { ...booking, appointmentId: appointment.id });
    ctx.outcome(`slot booked ${input.branch} ${describeOutcomeStart(slot.start)}`);
    const result = await confirmed({ id: appointment.id, branch: input.branch, start: slot.start });
    closePendingCallbacks(input.patient_id);
    return withEmail(result, await emailConfirmation(input, patient, result));
  } catch (err) {
    if (err instanceof EhrUnavailableError && (await queue(err))) {
      await rememberBooking(input.conversation_id, { ...booking, appointmentId: null });
      ctx.outcome(`slot booked ${input.branch} ${describeOutcomeStart(slot.start)}, queued in outbox`);
      const result = await confirmed({ id: null, branch: input.branch, start: slot.start }, true);
      return withEmail(result, await emailConfirmation(input, patient, result));
    }
    // Compensate: no calendar event without an Appointment. Best effort, the original failure matters more.
    await calendar.deleteEvent(input.branch, event.id).catch(() => undefined);
    // 409 means another booking took the interval between our calendar check and now.
    if (err instanceof EhrRejectedError && err.status === 409) {
      ctx.outcome("slot taken");
      return SLOT_TAKEN;
    }
    throw err;
  }
});

// The model must not promise an email that was never sent, so the message says it either way.
function withEmail<T extends { message: string }>(result: T, emailed: boolean): T & { emailed: boolean } {
  const note = emailed
    ? " Before the goodbye, tell them an email with the details and a link to complete their data is on its way."
    : " No email was sent: do not mention any email.";
  return { ...result, emailed, message: result.message + note };
}

// The confirmation with the patient link goes to the email typed on the page, when there is one.
async function emailConfirmation(
  input: z.infer<typeof Input>,
  patient: PatientDetail | null,
  r: { label: string; branch_name: string; address: string; practitioner_name: string },
): Promise<boolean> {
  const to = await resolveCallerEmail(input.conversation_id, input.caller_email);
  if (!to) return false;
  const email = appointmentConfirmation({
    to,
    name: patient?.givenName ?? "",
    label: r.label,
    branchName: r.branch_name,
    address: r.address,
    practitioner: r.practitioner_name,
    link: patientLinkUrl(input.patient_id),
  });
  return sendLater(email) > 0;
}

// "2026-10-13 09:00" in the practice's local time, for the timeline.
function describeOutcomeStart(start: string): string {
  return start.slice(0, 16).replace("T", " ");
}
