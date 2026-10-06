import type { ToolSpec } from "../types.ts";
import { conversationId } from "./conversation-id.ts";

// Mirrors apps/web/src/app/api/tools/find_patient/route.ts: { conversation_id, phone }.
export const findPatient: ToolSpec = {
  name: "find_patient",
  description:
    "Looks up whether the GMA network already has a record for a phone number. Call it once the caller has given a 10-digit phone number and consent was granted, and before asking for any other personal data. It returns only the given name, which you must confirm with the caller before using the record. The response has a message field that says what to do next; follow it.",
  required: ["conversation_id", "phone"],
  properties: {
    conversation_id: conversationId,
    phone: {
      type: "string",
      description: "The caller's phone number as 10 digits, with no spaces, dashes, country code or +52. Example: 5512345678.",
    },
  },
};
