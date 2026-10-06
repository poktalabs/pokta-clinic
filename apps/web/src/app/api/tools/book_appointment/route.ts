import { z } from "zod";
import { calendar } from "@/calendar";
import { EhrRejectedError, ehr } from "@/ehr";
import { busyRange, describeStart, resolveSlot } from "@/scheduling/slots";
import { NO_CONSENT, conversationId, grantedConsent, patientMismatch, tool } from "@/tools/handler";

const Input = z.object({
  conversation_id: conversationId,
  patient_id: z.string().min(1).max(100),
  start: z.string().min(1).max(40),
});

const SLOT_TAKEN = {
  booked: false,
  message: "That slot is no longer available. Apologise briefly and call check_availability to offer other options.",
};

function confirmed(appointment: { id: string; start: string }) {
  const { label } = describeStart(appointment.start);
  return {
    booked: true,
    appointment_id: appointment.id,
    start: appointment.start,
    label,
    message: `Booked. Read back the day, date and time to the caller: ${label}. Then follow the instructions of your current stage.`,
  };
}

export const POST = tool("book_appointment", Input, async (input) => {
  const consent = await grantedConsent(input.conversation_id);
  if (!consent) return NO_CONSENT;
  const mismatch = patientMismatch(consent, input.patient_id);
  if (mismatch) return mismatch;

  // Idempotent per Conversation: a repeated call (the agent retrying, a double tap) returns the booking.
  const existing = await ehr.findAppointmentByConversation(input.conversation_id);
  if (existing) return existing.patientId === input.patient_id ? confirmed(existing) : patientMismatch({ id: "", granted: true, patientId: existing.patientId }, input.patient_id)!;

  // Never trust the start the LLM sends: re-check the practice rules and the live calendar.
  const now = new Date();
  const slot = resolveSlot(input.start, now);
  if (!slot) return { ...SLOT_TAKEN, message: "That start is not a bookable slot. Call check_availability and offer only the slots it returns." };
  const range = busyRange(now);
  const busy = await calendar.busy(range.from, range.to);
  const startMs = Date.parse(slot.start);
  if (busy.some((b) => startMs < Date.parse(b.end) && Date.parse(b.start) < Date.parse(slot.end))) return SLOT_TAKEN;

  const patient = await ehr.getPatient(input.patient_id);
  if (!patient) return { booked: false, message: "That patient_id is not in the record system. Use the patient_id returned by find_patient or save_patient." };

  // No clinical data in the calendar: it is a third-party system outside the Expediente (NOM-004).
  // The folio and ids let the practice find the Patient in the EHR.
  const event = await calendar.createEvent({
    start: slot.start,
    end: slot.end,
    summary: `Primera consulta: ${patient.givenName} ${patient.primerApellido}`.trim(),
    description: `Folio: ${patient.folio ?? "n/a"}\nPatient ID: ${patient.id}\nConversation ID: ${input.conversation_id}`,
  });
  try {
    const appointment = await ehr.createAppointment({
      conversationId: input.conversation_id,
      patientId: patient.id,
      start: slot.start,
      end: slot.end,
      calendarEventId: event.id,
      description: "Primera consulta agendada por el asistente de voz",
    });
    return confirmed({ id: appointment.id, start: slot.start });
  } catch (err) {
    // Compensate: no calendar event without an Appointment. Best effort, the original failure matters more.
    await calendar.deleteEvent(event.id).catch(() => undefined);
    // 409 means another booking took the interval between our calendar check and now.
    if (err instanceof EhrRejectedError && err.status === 409) return SLOT_TAKEN;
    throw err;
  }
});
