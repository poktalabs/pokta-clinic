import { z } from "zod";
import { CONVERSATION_SYSTEM } from "./consent.ts";
import { Identifier } from "./patient.ts";
import { TextExtension, ref, reference } from "./reference.ts";

// The Escalation record for a Red flag: it notifies the Practitioner. Emergencia is priority stat, Urgencia is urgent.
export const RED_FLAG_SEVERITY_EXT = "urn:pokta-clinic:extension:red-flag-severity";
export const RED_FLAG_CATEGORY = "red-flag";

export const RED_FLAG_SEVERITY = ["emergencia", "urgencia"] as const;
export type RedFlagSeverity = (typeof RED_FLAG_SEVERITY)[number];
export const PRIORITY_BY_SEVERITY = { emergencia: "stat", urgencia: "urgent" } as const;

export const Communication = z.object({
  resourceType: z.literal("Communication"),
  id: z.string().optional(),
  identifier: z.array(Identifier).min(1),
  status: z.literal("completed"),
  priority: z.enum(["stat", "urgent"]),
  category: z.array(z.object({ text: z.literal(RED_FLAG_CATEGORY) })).optional(),
  // Optional: an Escalation can happen before the caller is identified.
  subject: reference("Patient").optional(),
  recipient: z.array(reference("Practitioner")).min(1),
  sent: z.iso.datetime({ offset: true }).optional(),
  // payload[0] is the patient's exact words; payload[1] is the instruction the agent gave.
  payload: z.array(z.object({ contentString: z.string() })).min(1),
  extension: z.array(TextExtension).optional(),
});
export type Communication = z.infer<typeof Communication>;

export function communicationResource(input: {
  id?: string;
  conversationId: string;
  severity: RedFlagSeverity;
  patientId?: string | null;
  practitionerId: string;
  sent?: string;
  patientWords: string;
  instruction?: string | null;
}): Communication {
  const payload = [{ contentString: input.patientWords }];
  if (input.instruction) payload.push({ contentString: input.instruction });
  return {
    resourceType: "Communication",
    id: input.id,
    identifier: [{ system: CONVERSATION_SYSTEM, value: input.conversationId }],
    status: "completed",
    priority: PRIORITY_BY_SEVERITY[input.severity],
    category: [{ text: RED_FLAG_CATEGORY }],
    subject: input.patientId ? ref("Patient", input.patientId) : undefined,
    recipient: [ref("Practitioner", input.practitionerId)],
    sent: input.sent,
    payload,
    extension: [{ url: RED_FLAG_SEVERITY_EXT, valueString: input.severity }],
  };
}
