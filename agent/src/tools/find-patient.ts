import type { ToolSpec } from "../types.ts";
import { conversationId } from "./conversation-id.ts";

// Mirrors apps/web/src/app/api/tools/find_patient/route.ts: { conversation_id, phone, birth_date? }.
export const findPatient: ToolSpec = {
  name: "find_patient",
  description:
    "Looks up whether the GMA network already has a record for a phone number, and verifies the caller's identity before saying anything about it. Call it once the caller has given a 10-digit phone number and consent was granted, and before asking for any other personal data. If a record exists, it reveals nothing until the date of birth matches: ask the caller for it and call find_patient again with the same phone and birth_date. The response has a message field that says what to do next; follow it.",
  required: ["conversation_id", "phone"],
  properties: {
    conversation_id: conversationId,
    phone: {
      type: "string",
      description: "The caller's phone number as 10 digits, with no spaces, dashes, country code or +52. Example: 5512345678.",
    },
    birth_date: {
      type: "string",
      description:
        "Only when a previous find_patient call in this conversation found a record and asked for it: the date of birth the caller just said, as YYYY-MM-DD. Example: 1988-03-14. Leave it out on the first call.",
    },
  },
};
