import type { ToolSpec } from "../types.ts";
import { conversationId } from "./conversation-id.ts";

// Mirrors apps/web/src/app/api/tools/get_questionnaire/route.ts: { conversation_id }. No LLM fields.
export const getQuestionnaire: ToolSpec = {
  name: "get_questionnaire",
  description:
    "Returns the required items of the first-visit questionnaire, each with a link_id and the question text in Spanish. Call it once, at the start of the History stage, before asking the first question. Use the items as a checklist: you decide the order and the follow-ups, but every item must end up covered. Keep the link_id values, they are what save_history needs. The response has a message field that says what to do next; follow it.",
  required: ["conversation_id"],
  properties: { conversation_id: conversationId },
};
