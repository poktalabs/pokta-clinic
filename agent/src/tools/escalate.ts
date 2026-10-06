import type { ToolSpec } from "../types.ts";
import { conversationId } from "./conversation-id.ts";

// Mirrors apps/web/src/app/api/tools/escalate/route.ts. Deliberately does not require consent:
// a red flag is a safety event and must be logged and notified even if the caller never consented.
export const escalate: ToolSpec = {
  name: "escalate",
  description:
    "Logs a red flag Escalation and notifies the practitioner. Call it exactly once, in the Escalation stage, while you give the escalation script (do not wait for the end of the script to call it, and do not skip the script because of it). It works at any point, with or without consent. Pass patient_id only if the caller was already identified in this conversation. The response has a message field that says what to do next; follow it.",
  required: ["conversation_id", "severity", "patient_words", "instruction_given"],
  properties: {
    conversation_id: conversationId,
    severity: {
      type: "string",
      enum: ["emergencia", "urgencia"],
      description: "emergencia if the caller must call 911 now, urgencia if the caller must go to an emergency room today. If in doubt, emergencia.",
    },
    patient_words: {
      type: "string",
      description: "The caller's exact words describing the symptom, as transcribed. Do not paraphrase or interpret.",
    },
    instruction_given: {
      type: "string",
      description: "What you told the caller to do: call 911, call Línea de la Vida 800 911 2000, or go to the emergency room today.",
    },
    patient_id: {
      type: "string",
      description: "The patient's ID as returned by find_patient or save_patient. Omit it if the caller was not identified yet.",
    },
  },
};
