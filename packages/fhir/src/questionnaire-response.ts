import { z } from "zod";
import { CONVERSATION_SYSTEM } from "./consent.ts";
import { Identifier } from "./patient.ts";
import { TextExtension, ref, reference } from "./reference.ts";

// Validation is the Practitioner's act in the EHR; the agent can only leave a response pending.
export const VALIDATION_STATUS_EXT = "urn:pokta-clinic:extension:validation-status";
export const AGENT_AUTHOR = "pokta-clinic voice agent";

const Answer = z.union([
  z.object({ valueString: z.string() }).strict(),
  z.object({ valueInteger: z.number().int() }).strict(),
  z.object({ valueBoolean: z.boolean() }).strict(),
]);

export const QuestionnaireResponseItem = z.object({
  linkId: z.string(),
  text: z.string().optional(),
  answer: z.array(Answer).min(1),
});
export type QuestionnaireResponseItem = z.infer<typeof QuestionnaireResponseItem>;

export const QuestionnaireResponse = z.object({
  resourceType: z.literal("QuestionnaireResponse"),
  id: z.string().optional(),
  identifier: Identifier,
  questionnaire: z.string(),
  status: z.enum(["in-progress", "completed"]),
  subject: reference("Patient"),
  authored: z.string().optional(),
  author: z.object({ display: z.string() }).optional(),
  item: z.array(QuestionnaireResponseItem),
  extension: z.array(TextExtension).optional(),
});
export type QuestionnaireResponse = z.infer<typeof QuestionnaireResponse>;

export function questionnaireResponseResource(input: {
  id?: string;
  questionnaire: string;
  status: QuestionnaireResponse["status"];
  patientId: string;
  conversationId: string;
  authored?: string;
  items: QuestionnaireResponseItem[];
  validationStatus?: string;
}): QuestionnaireResponse {
  return {
    resourceType: "QuestionnaireResponse",
    id: input.id,
    identifier: { system: CONVERSATION_SYSTEM, value: input.conversationId },
    questionnaire: input.questionnaire,
    status: input.status,
    subject: ref("Patient", input.patientId),
    authored: input.authored,
    author: { display: AGENT_AUTHOR },
    item: input.items,
    extension: [{ url: VALIDATION_STATUS_EXT, valueString: input.validationStatus ?? "pending" }],
  };
}
