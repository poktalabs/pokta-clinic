import { z } from "zod";
import { EhrUnavailableError, ehr } from "@/ehr";
import { queueForEhr } from "@/outbox/queue";
import { callerEmail, rememberLead } from "@/tools/caller-email";
import { cacheConsent, conversationId, tool } from "@/tools/handler";

const Input = z.object({
  conversation_id: conversationId,
  granted: z.boolean(),
  caller_email: callerEmail,
});

// Writes the decision to the EHR (system of record) and to the store (so the consent gate keeps
// working while the EHR is down). If the EHR is down the decision is queued and the call goes on.
export const POST = tool("record_consent", Input, async ({ conversation_id, granted, caller_email }, ctx) => {
  // Lead capture: the email was typed on the page before the call, under the page's own notice.
  await rememberLead(conversation_id, caller_email);
  let consentId: string | null = null;
  const word = granted ? "granted" : "refused";
  try {
    const consent = await ehr.recordConsent(conversation_id, granted);
    consentId = consent.id;
    await cacheConsent(conversation_id, consent);
    ctx.outcome(`consent ${word}`);
  } catch (err) {
    if (!(err instanceof EhrUnavailableError)) throw err;
    if (!(await queueForEhr({ kind: "consent", conversationId: conversation_id, payload: { granted } }, err))) throw err;
    await cacheConsent(conversation_id, { id: "", granted, patientId: null });
    ctx.outcome(`consent ${word}, queued in outbox`);
  }
  return {
    ...(consentId ? { consent_id: consentId } : {}),
    granted,
    message: granted
      ? "Consent recorded. Continue with identification."
      : "Refusal recorded. Do not collect any personal or health data. Explain kindly that without consent the voice pre-consultation cannot continue, say they can contact the branch of their choice directly, and say goodbye.",
  };
});
