import type { ToolSpec } from "../types.ts";
import { conversationId } from "./conversation-id.ts";

// Mirrors apps/web/src/app/api/tools/request_callback/route.ts.
export const requestCallback: ToolSpec = {
  name: "request_callback",
  description:
    "Records that the clinic must call the caller back to schedule, when no offered slot works for them, when they prefer a call, or when the scheduling tools failed. It creates a task in the clinic record, a reminder in the branch calendar and emails the front desk (and the caller, when they gave an email on the page). Call it once, only after the caller agreed to be called back and told you when they can take the call. Never call it after a red flag. The response has a message field that says what to do next; follow it.",
  required: ["conversation_id", "availability", "reason"],
  properties: {
    conversation_id: conversationId,
    patient_id: {
      type: "string",
      description: "The patient's ID exactly as returned by find_patient or save_patient earlier in this conversation. Omit it only if the caller was never identified.",
    },
    branch: {
      type: "string",
      enum: ["del-valle", "polanco", "satelite"],
      description: "The branch the caller prefers, if they said one. Omit it otherwise.",
    },
    availability: {
      type: "string",
      description: "When the caller can take the call, in their words, short and in Spanish. Example: 'entre semana de 11 a 2'.",
    },
    reason: {
      type: "string",
      enum: ["no_suitable_slot", "caller_prefers", "tools_failed"],
      description: "no_suitable_slot if none of the offered slots worked, caller_prefers if they asked to be called, tools_failed if the scheduling tools did not respond.",
    },
  },
};
