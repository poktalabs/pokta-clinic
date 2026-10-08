import { z } from "zod";
import { ehr } from "@/ehr";
import { store } from "@/store";
import { branchDetails } from "@/tools/branch-details";
import { findPatient } from "@/tools/find-patient";
import { NO_CONSENT, conversationId, grantedConsent, tool } from "@/tools/handler";
import { INVALID_PHONE, normalizePhone } from "@/tools/phone";

const Input = z.object({
  conversation_id: conversationId,
  phone: z.string().min(1).max(30),
  birth_date: z.string().max(40).optional(),
});

// Nothing about a record is said until the caller's date of birth matches it (tools/find-patient.ts).
// Once verified it returns what the agent needs to pick up where they left off: an upcoming first
// consultation with its reason, a pending callback, a saved history.
export const POST = tool("find_patient", Input, async ({ conversation_id, phone, birth_date }, ctx) => {
  const consent = await grantedConsent(conversation_id);
  if (!consent) return NO_CONSENT;
  const normalized = normalizePhone(phone);
  if (normalized.length !== 10) return INVALID_PHONE;
  const { result, outcome } = await findPatient(
    { ehr, store, branchName: async (code) => (await branchDetails(code)).name, now: new Date() },
    { conversationId: conversation_id, phone: normalized, birthDate: birth_date, consent },
  );
  ctx.outcome(outcome);
  return result;
});
