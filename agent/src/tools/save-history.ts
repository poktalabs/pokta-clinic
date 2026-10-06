import type { ToolSpec } from "../types.ts";
import { conversationId } from "./conversation-id.ts";

// Mirrors apps/web/src/app/api/tools/save_history/route.ts:
// { conversation_id, patient_id, status, answers: [{ link_id, answer }], chief_complaint }.
export const saveHistory: ToolSpec = {
  name: "save_history",
  description:
    "Saves the patient's answers to the first-visit questionnaire. Call it with status completed once every required item from get_questionnaire is covered. If the response lists missing link_ids, ask about those items and call it again. If the caller must stop early, call it with status in-progress so nothing is lost. Send the answers gathered so far each time. The response has a message field that says what to do next; follow it.",
  required: ["conversation_id", "patient_id", "status", "answers", "chief_complaint"],
  properties: {
    conversation_id: conversationId,
    patient_id: {
      type: "string",
      description: "The patient's ID exactly as returned by find_patient or save_patient earlier in this conversation. Never invent it.",
    },
    status: {
      type: "string",
      enum: ["in-progress", "completed"],
      description: "completed when every required item is covered, in-progress when the caller must stop before that.",
    },
    answers: {
      type: "array",
      description: "One entry per questionnaire item answered so far, in the patient's own words, kept short. Skip items not yet asked.",
      items: {
        type: "object",
        description: "One answer to one questionnaire item.",
        required: ["link_id", "answer"],
        properties: {
          link_id: { type: "string", description: "The link_id of the item, exactly as returned by get_questionnaire." },
          answer: { type: "string", description: "What the patient said for this item, in their own words, short. Do not interpret or rephrase it clinically." },
        },
      },
    },
    chief_complaint: {
      type: "string",
      description: "The main reason for the visit in the patient's own words, one short sentence. Example: me duelen las manos desde hace tres meses.",
    },
  },
};
