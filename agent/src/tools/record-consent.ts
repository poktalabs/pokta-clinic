import type { ToolSpec } from "../types.ts";
import { conversationId } from "./conversation-id.ts";

// Mirrors apps/web/src/app/api/tools/record_consent/route.ts: { conversation_id, granted }.
export const recordConsent: ToolSpec = {
  name: "record_consent",
  description:
    "Records the caller's answer to the aviso de privacidad. Call it exactly once, right after the caller gives a clear yes or a clear no to the consent question, and never before. Pass granted=true for a clear yes and granted=false for a clear no. Do not call it for an unclear or missing answer: ask again instead. The response has a message field that says what to do next; follow it.",
  required: ["conversation_id", "granted"],
  properties: {
    conversation_id: conversationId,
    granted: {
      type: "boolean",
      description: "true if the caller expressly agreed to the aviso de privacidad, false if the caller refused.",
    },
  },
};
