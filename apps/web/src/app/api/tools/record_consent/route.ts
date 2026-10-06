import { z } from "zod";
import { ehr } from "@/ehr";
import { conversationId, tool } from "@/tools/handler";

const Input = z.object({
  conversation_id: conversationId,
  granted: z.boolean(),
});

export const POST = tool("record_consent", Input, async ({ conversation_id, granted }) => {
  const consent = await ehr.recordConsent(conversation_id, granted);
  return {
    consent_id: consent.id,
    granted,
    message: granted
      ? "Consent recorded. Continue with identification."
      : "Refusal recorded. Do not collect any personal or health data. Offer to have the clinic call back, then end the call politely.",
  };
});
