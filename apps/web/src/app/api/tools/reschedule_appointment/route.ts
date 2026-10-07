import { z } from "zod";
import { BRANCH_CODES } from "@pokta-clinic/fhir";
import { calendar } from "@/calendar";
import { rescheduled } from "@/email/templates";
import { EhrRejectedError, ehr } from "@/ehr";
import { patientLinkUrl } from "@/patient-link/token";
import { BRANCHES } from "@/scheduling/branches";
import { busyRange, describeStart, resolveSlot } from "@/scheduling/slots";
import { store } from "@/store";
import { branchDetails } from "@/tools/branch-details";
import { callerEmail, resolveCallerEmail } from "@/tools/caller-email";
import { NO_CONSENT, conversationId, grantedConsent, patientMismatch, tool } from "@/tools/handler";
import { sendLater } from "@/tools/notify";

const Input = z.object({
  conversation_id: conversationId,
  patient_id: z.string().min(1).max(100),
  appointment_id: z.string().min(1).max(100),
  branch: z.enum(BRANCH_CODES),
  start: z.string().min(1).max(40),
  caller_email: callerEmail,
});

const SLOT_TAKEN = {
  rescheduled: false,
  message: "That slot is no longer available. Apologise briefly and call check_availability to offer other options.",
};

// Moves a returning Patient's upcoming first consultation: books the new slot first (calendar, then EHR),
// and only then cancels the old one, so a failure never leaves the Patient with no appointment.
export const POST = tool("reschedule_appointment", Input, async (input, ctx) => {
  const consent = await grantedConsent(input.conversation_id);
  if (!consent) return NO_CONSENT;
  const mismatch = patientMismatch(consent, input.patient_id);
  if (mismatch) return mismatch;

  // Idempotent per Conversation: a retry returns the move already made.
  const remembered = await store.getBooking(input.conversation_id).catch(() => null);
  if (remembered && remembered.patientId === input.patient_id) {
    const { name, address, practitionerName } = await branchDetails(remembered.branch);
    ctx.outcome("already rescheduled");
    return { rescheduled: true, branch_name: name, address, practitioner_name: practitionerName, label: describeStart(remembered.start).label, message: "Already rescheduled. Read back the new day, time and branch." };
  }

  const now = new Date();
  const old = (await ehr.upcomingAppointments(input.patient_id, now)).find((a) => a.id === input.appointment_id);
  if (!old) {
    ctx.outcome("appointment not found");
    return { rescheduled: false, message: "That appointment_id is not an upcoming appointment of this patient. Use the upcoming_appointment returned by find_patient." };
  }

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

  const patient = await ehr.getPatient(input.patient_id);
  const event = await calendar.createEvent({
    branch: input.branch,
    start: slot.start,
    end: slot.end,
    summary: `Primera consulta: ${patient ? `${patient.givenName} ${patient.primerApellido}`.trim() : "paciente"}`,
    description: `Sucursal: ${BRANCHES[input.branch].name}\nFolio: ${patient?.folio ?? "n/a"}\nPatient ID: ${input.patient_id}\nConversation ID: ${input.conversation_id}\nReagendada (antes: ${describeStart(old.start).label})`,
  });
  let newId: string;
  try {
    const created = await ehr.createAppointment({
      conversationId: input.conversation_id,
      patientId: input.patient_id,
      branch: input.branch,
      start: slot.start,
      end: slot.end,
      calendarEventId: event.id,
      description: "Primera consulta reagendada por el asistente de voz",
    });
    newId = created.id;
  } catch (err) {
    await calendar.deleteEvent(input.branch, event.id).catch(() => undefined);
    if (err instanceof EhrRejectedError && err.status === 409) {
      ctx.outcome("slot taken");
      return SLOT_TAKEN;
    }
    throw err;
  }

  // The new appointment exists; cancelling the old one is best effort and flagged if it fails.
  let oldCancelled = true;
  try {
    await ehr.cancelAppointment(old.id);
    if (old.calendarEventId && old.branch) await calendar.deleteEvent(old.branch, old.calendarEventId);
  } catch (err) {
    oldCancelled = false;
    console.error(JSON.stringify({ reschedule: "old_cancel_failed", error: (err as Error).name }));
  }
  await store
    .putBooking(input.conversation_id, { appointmentId: newId, branch: input.branch, patientId: input.patient_id, start: slot.start, end: slot.end, calendarEventId: event.id })
    .catch(() => undefined);

  const oldLabel = describeStart(old.start).label;
  const { name, address, practitionerName } = await branchDetails(input.branch);
  const to = await resolveCallerEmail(input.conversation_id, input.caller_email);
  if (to) {
    sendLater(rescheduled({ to, name: patient?.givenName ?? "", oldLabel, label: slot.label, branchName: name, address, practitioner: practitionerName, link: patientLinkUrl(input.patient_id) }));
  }
  ctx.outcome(`rescheduled ${input.branch} ${slot.start.slice(0, 16).replace("T", " ")}${oldCancelled ? "" : ", old not cancelled"}`);
  return {
    rescheduled: true,
    appointment_id: newId,
    old_label: oldLabel,
    branch: input.branch,
    branch_name: name,
    address,
    practitioner_name: practitionerName,
    start: slot.start,
    label: slot.label,
    emailed: Boolean(to),
    message: `Rescheduled. Tell the caller their appointment of ${oldLabel} is cancelled and read back the new one: ${slot.label} at ${name} with ${practitionerName}. Say the address once${to ? " and that they will get an email with the details" : ""}. Then follow the instructions of your current stage.`,
  };
});
