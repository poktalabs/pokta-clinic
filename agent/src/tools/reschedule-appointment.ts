import type { ToolSpec } from "../types.ts";
import { conversationId } from "./conversation-id.ts";

// Mirrors apps/web/src/app/api/tools/reschedule_appointment/route.ts.
export const rescheduleAppointment: ToolSpec = {
  name: "reschedule_appointment",
  description:
    "Moves a returning caller's upcoming first consultation to a new slot: it books the new one and then cancels the old one. Use it instead of book_appointment when find_patient returned an upcoming_appointment and the caller wants to change it. Call it once, after the caller picked one of the slots returned by check_availability, passing that slot's branch and start exactly as returned. Read back the cancelled and the new appointment. The response has a message field that says what to do next; follow it.",
  required: ["conversation_id", "patient_id", "appointment_id", "branch", "start"],
  properties: {
    conversation_id: conversationId,
    patient_id: { type: "string", description: "The patient's ID exactly as returned by find_patient earlier in this conversation." },
    appointment_id: { type: "string", description: "The appointment_id of the upcoming_appointment returned by find_patient. Never invent it." },
    branch: {
      type: "string",
      enum: ["del-valle", "polanco", "satelite"],
      description: "The branch code of the chosen slot, copied exactly as check_availability returned it.",
    },
    start: { type: "string", description: "The ISO start of the chosen slot, copied exactly as check_availability returned it." },
  },
};
