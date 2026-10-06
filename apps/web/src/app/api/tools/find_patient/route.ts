import { z } from "zod";
import { ehr } from "@/ehr";
import { NO_CONSENT, conversationId, grantedConsent, tool } from "@/tools/handler";
import { INVALID_PHONE, normalizePhone } from "@/tools/phone";

const Input = z.object({
  conversation_id: conversationId,
  phone: z.string().min(1).max(30),
});

// Returns the given name only: a phone number alone does not prove identity, so the agent confirms
// the name with the caller before it uses the record.
export const POST = tool("find_patient", Input, async ({ conversation_id, phone }, ctx) => {
  if (!(await grantedConsent(conversation_id))) return NO_CONSENT;
  const normalized = normalizePhone(phone);
  if (normalized.length !== 10) return INVALID_PHONE;
  const [match] = await ehr.findPatientsByPhone(normalized);
  if (!match) {
    ctx.outcome("new patient");
    return { found: false, message: "No record for this phone. Treat the caller as a new patient and collect the registration data." };
  }
  ctx.outcome("patient found");
  return {
    found: true,
    patient_id: match.id,
    given_name: match.givenName,
    message: `A record exists. Ask the caller to confirm they are ${match.givenName} before you continue.`,
  };
});
