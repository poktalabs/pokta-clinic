import { z } from "zod";
import { ehr } from "@/ehr";
import { NO_CONSENT, conversationId, grantedConsent, tool } from "@/tools/handler";

const Input = z.object({ conversation_id: conversationId });

// The agent gets the required items only: link_id to save by, Spanish text to ask from. The order
// and the follow-ups are the agent's; what must be covered is the Questionnaire's.
export const POST = tool("get_questionnaire", Input, async ({ conversation_id }) => {
  if (!(await grantedConsent(conversation_id))) return NO_CONSENT;
  const items = (await ehr.getQuestionnaire()).filter((i) => i.required);
  return {
    items: items.map((i) => ({ link_id: i.linkId, text: i.text })),
    message: "Cover every item in your own order, with natural follow-ups. Keep the link_id values: save_history needs them. Then call save_history with the answers so far.",
  };
});
