import { z } from "zod";
import { EhrRejectedError, ehr, type HistoryAnswer, type QuestionnaireItemDef } from "@/ehr";
import { NO_CONSENT, conversationId, grantedConsent, patientMismatch, tool } from "@/tools/handler";
import { coerceAnswer, isAnswered, missingRequired } from "@/tools/history";

const CHIEF_COMPLAINT = "chief-complaint";

const Input = z.object({
  conversation_id: conversationId,
  patient_id: z.string().min(1).max(100),
  status: z.enum(["in-progress", "completed"]),
  answers: z.array(z.object({ link_id: z.string().max(100), answer: z.string().max(2000) })).max(60),
  chief_complaint: z.string().max(1000),
});

function missingResult(items: QuestionnaireItemDef[]) {
  const list = items.map((i) => `${i.linkId}: ${i.text}`).join("; ");
  return {
    saved: false,
    missing: items.map((i) => i.linkId),
    message: `Not saved as completed: these items still have no answer. Ask the patient about them (${list}), then call save_history again with all the answers.`,
  };
}

// One QuestionnaireResponse per Conversation: look it up, then create or replace it. It stays pending
// until the Practitioner's Validation; this tool never marks it validated.
export const POST = tool("save_history", Input, async (input) => {
  const consent = await grantedConsent(input.conversation_id);
  if (!consent) return NO_CONSENT;
  const mismatch = patientMismatch(consent, input.patient_id);
  if (mismatch) return mismatch;

  const items = await ehr.getQuestionnaire();
  const defs = new Map(items.map((i) => [i.linkId, i]));
  const existing = await ehr.findQuestionnaireResponse(input.conversation_id);
  if (existing && existing.patientId !== input.patient_id) return patientMismatch({ id: "", granted: true, patientId: existing.patientId }, input.patient_id)!;

  // Merge over what is stored: a retry that only sends the newly asked items must not erase the rest.
  const merged = new Map<string, HistoryAnswer>((existing?.answers ?? []).map((a) => [a.linkId, a]));
  const incoming = new Map<string, HistoryAnswer>();
  for (const { link_id, answer } of input.answers) {
    const def = defs.get(link_id); // unknown link_ids are dropped, not an error
    if (!def || !answer.trim()) continue;
    incoming.set(link_id, { linkId: link_id, value: coerceAnswer(def, answer) });
  }
  const complaint = input.chief_complaint.trim();
  if (complaint && !incoming.has(CHIEF_COMPLAINT)) incoming.set(CHIEF_COMPLAINT, { linkId: CHIEF_COMPLAINT, value: complaint });
  for (const [id, a] of incoming) merged.set(id, a);
  const answers = items.map((i) => merged.get(i.linkId)).filter((a): a is HistoryAnswer => !!a && isAnswered(a));

  if (input.status === "completed") {
    const missing = missingRequired(items, answers);
    if (missing.length) return missingResult(missing);
  }

  try {
    await ehr.saveQuestionnaireResponse({
      conversationId: input.conversation_id,
      patientId: input.patient_id,
      status: input.status,
      answers,
      existing,
    });
  } catch (err) {
    // The EHR enforces the same rule; if its view of "missing" differs from ours, trust it.
    if (err instanceof EhrRejectedError && err.status === 422) {
      const ids = err.message.split(",").map((s) => s.trim());
      const unanswered = ids.map((id) => defs.get(id));
      if (ids.length && unanswered.every((d): d is QuestionnaireItemDef => !!d)) return missingResult(unanswered);
    }
    throw err;
  }
  return {
    saved: true,
    status: input.status,
    message: input.status === "completed" ? "History saved. Continue with your current stage." : "Progress saved. Continue with your current stage.",
  };
});
