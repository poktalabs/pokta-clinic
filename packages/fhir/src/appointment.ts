import { z } from "zod";
import { CONVERSATION_SYSTEM } from "./consent.ts";
import { Identifier } from "./patient.ts";
import { ref, reference } from "./reference.ts";

// Google Calendar owns availability; the EHR only stores the event id of the booking.
export const CALENDAR_EVENT_SYSTEM = "urn:google:calendar:event";
export const FIRST_VISIT_SERVICE = "Primera consulta de reumatologia";
export const FIRST_VISIT_MINUTES = 60;

const Participant = z.object({
  actor: z.union([reference("Patient"), reference("Practitioner"), reference("Location")]),
  status: z.literal("accepted"),
});

export const Appointment = z.object({
  resourceType: z.literal("Appointment"),
  id: z.string().optional(),
  identifier: z.array(Identifier).min(1),
  status: z.literal("booked"),
  serviceType: z.array(z.object({ text: z.string() })).optional(),
  start: z.iso.datetime({ offset: true }),
  end: z.iso.datetime({ offset: true }),
  minutesDuration: z.number().int().positive().optional(),
  description: z.string().optional(),
  // Patient, Practitioner and the Location where they meet.
  participant: z.array(Participant).min(3),
});
export type Appointment = z.infer<typeof Appointment>;

export function appointmentResource(input: {
  id?: string;
  patientId: string;
  practitionerId: string;
  locationId: string;
  start: string;
  end: string;
  calendarEventId: string;
  conversationId?: string | null;
  description?: string | null;
}): Appointment {
  const identifier = [{ system: CALENDAR_EVENT_SYSTEM, value: input.calendarEventId }];
  if (input.conversationId) identifier.push({ system: CONVERSATION_SYSTEM, value: input.conversationId });
  return {
    resourceType: "Appointment",
    id: input.id,
    identifier,
    status: "booked",
    serviceType: [{ text: FIRST_VISIT_SERVICE }],
    start: input.start,
    end: input.end,
    minutesDuration: Math.round((Date.parse(input.end) - Date.parse(input.start)) / 60000),
    description: input.description ?? undefined,
    participant: [
      { actor: ref("Patient", input.patientId), status: "accepted" },
      { actor: ref("Practitioner", input.practitionerId), status: "accepted" },
      { actor: ref("Location", input.locationId), status: "accepted" },
    ],
  };
}
