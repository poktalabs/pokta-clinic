import type { ToolProperty } from "../types.ts";

// The platform fills this from the conversation's own ID; the LLM never sees or supplies it.
// The web app uses it to find the Consent recorded for this Conversation.
export const conversationId: ToolProperty = { type: "string", dynamic_variable: "system__conversation_id" };
