import { z } from "zod";
import { EhrUnavailableError, ehr } from "@/ehr";
import { QUEUED_MESSAGE, queueForEhr } from "@/outbox/queue";
import { NO_CONSENT, conversationId, grantedConsent, patientMismatch, tool } from "@/tools/handler";
import { saveHistory } from "@/tools/save-history";

const Input = z.object({
  conversation_id: conversationId,
  patient_id: z.string().min(1).max(100),
  status: z.enum(["in-progress", "completed"]),
  answers: z.array(z.object({ link_id: z.string().max(100), answer: z.string().max(2000) })).max(60),
  chief_complaint: z.string().max(1000),
});

// The merge and upsert live in saveHistory (shared with the outbox drain). If the EHR is down the raw
// input is queued, so the drain redoes the merge against whatever the EHR holds by then.
export const POST = tool("save_history", Input, async (input, ctx) => {
  const consent = await grantedConsent(input.conversation_id);
  if (!consent) return NO_CONSENT;
  const mismatch = patientMismatch(consent, input.patient_id);
  if (mismatch) return mismatch;

  const request = {
    conversationId: input.conversation_id,
    patientId: input.patient_id,
    status: input.status,
    answers: input.answers,
    chiefComplaint: input.chief_complaint,
  };
  try {
    const result = await saveHistory(ehr, request);
    ctx.outcome(result.saved ? `history saved (${input.status})` : "history incomplete");
    return result;
  } catch (err) {
    if (!(err instanceof EhrUnavailableError)) throw err;
    const payload = { patientId: request.patientId, status: request.status, answers: request.answers, chiefComplaint: request.chiefComplaint };
    if (!(await queueForEhr({ kind: "save_history", conversationId: input.conversation_id, payload }, err))) throw err;
    ctx.outcome("queued in outbox");
    return { saved: true, queued: true, status: input.status, message: QUEUED_MESSAGE };
  }
});
