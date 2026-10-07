import type { ToolSpec } from "../types.ts";
import { callerEmail } from "./caller-email.ts";
import { conversationId } from "./conversation-id.ts";

// Mirrors apps/web/src/app/api/tools/book_appointment/route.ts: { conversation_id, patient_id, branch, start }.
export const bookAppointment: ToolSpec = {
  name: "book_appointment",
  description:
    "Books the first consultation in a slot the caller chose. Call it once, only after the caller picked one of the slots returned by check_availability, passing that slot's branch and start exactly as returned. It returns the confirmed branch name, branch address, practitioner name and the date and time as a Spanish label: read the day, date, time, branch name and practitioner name back to the caller, and say the address once. If the slot was taken meanwhile, the response says so: offer the caller other slots with check_availability. Never call it after a red flag. The response has a message field that says what to do next; follow it.",
  required: ["conversation_id", "patient_id", "branch", "start"],
  properties: {
    conversation_id: conversationId,
    patient_id: {
      type: "string",
      description: "The patient's ID exactly as returned by find_patient or save_patient earlier in this conversation. Never invent it.",
    },
    branch: {
      type: "string",
      enum: ["del-valle", "polanco", "satelite"],
      description: "The branch code of the chosen slot, copied exactly as check_availability returned it in that slot's branch field. Never infer it from what the caller said.",
    },
    start: {
      type: "string",
      description: "The ISO start of the chosen slot, copied exactly as check_availability returned it. Never build or edit it yourself.",
    },
    caller_email: callerEmail,
  },
};
