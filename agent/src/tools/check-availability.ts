import type { ToolSpec } from "../types.ts";
import { conversationId } from "./conversation-id.ts";

// Mirrors apps/web/src/app/api/tools/check_availability/route.ts. The practice rules (Mon-Fri 9:00-14:00
// and 16:00-19:00 America/Mexico_City, 60 min, bookable 24 h to 14 days ahead) are enforced server side.
export const checkAvailability: ToolSpec = {
  name: "check_availability",
  description:
    "Returns up to 3 free first-consultation slots, each with an ISO start and a Spanish label to say aloud. Call it when the History stage is saved as completed and the caller is ready to pick a time, and again if the caller asks for another day or another part of the day. Only offer slots this tool returned; never invent or adjust a time. If it returns no slots, say so and ask for a different day or part of the day. The response has a message field that says what to do next; follow it.",
  required: ["conversation_id"],
  properties: {
    conversation_id: conversationId,
    preferred_date: {
      type: "string",
      description: "The day the caller prefers, as YYYY-MM-DD. Convert what the caller says using today's date. Omit it if the caller has no preference. Example: 2026-10-12.",
    },
    part_of_day: {
      type: "string",
      enum: ["morning", "afternoon"],
      description: "morning or afternoon if the caller expressed a preference. Omit it otherwise.",
    },
  },
};
