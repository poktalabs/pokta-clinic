import { z } from "zod";

// The Conversation that captured the consent, so a tool call can check it before any Patient data moves.
export const CONVERSATION_SYSTEM = "urn:elevenlabs:conversation";

// LFPDPPP express consent for sensitive data, spoken during the call. `provision.type` carries the answer.
export const Consent = z.object({
  resourceType: z.literal("Consent"),
  id: z.string().optional(),
  status: z.enum(["active", "rejected"]),
  scope: z.object({ coding: z.array(z.object({ system: z.string(), code: z.string() })) }),
  category: z.array(z.object({ coding: z.array(z.object({ system: z.string(), code: z.string() })) })).min(1),
  patient: z.object({ reference: z.string().regex(/^Patient\/.+/) }).optional(),
  dateTime: z.string().optional(),
  identifier: z.array(z.object({ system: z.string(), value: z.string() })).min(1),
  provision: z.object({ type: z.enum(["permit", "deny"]) }),
  extension: z.array(z.object({ url: z.string(), valueString: z.string() })).optional(),
});
export type Consent = z.infer<typeof Consent>;

export const CONSENT_METHOD_EXT = "urn:pokta-clinic:extension:consent-method";

export function consentResource(input: { conversationId: string; granted: boolean; patientId?: string | null; id?: string; dateTime?: string }): Consent {
  return {
    resourceType: "Consent",
    id: input.id,
    status: input.granted ? "active" : "rejected",
    scope: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/consentscope", code: "patient-privacy" }] },
    category: [{ coding: [{ system: "http://loinc.org", code: "59284-0" }] }],
    patient: input.patientId ? { reference: `Patient/${input.patientId}` } : undefined,
    dateTime: input.dateTime,
    identifier: [{ system: CONVERSATION_SYSTEM, value: input.conversationId }],
    provision: { type: input.granted ? "permit" : "deny" },
    extension: [{ url: CONSENT_METHOD_EXT, valueString: "voice" }],
  };
}
