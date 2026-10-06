import { EhrRejectedError, type EhrAdapter, type HistoryAnswer, type QuestionnaireItemDef } from "@/ehr";
import type { ToolResult } from "@/tools/handler";
import { coerceAnswer, isAnswered, missingRequired } from "@/tools/history";
import { patientMismatch } from "@/tools/patient-guard";

const CHIEF_COMPLAINT = "chief-complaint";

export type SaveHistoryInput = {
  conversationId: string;
  patientId: string;
  status: "in-progress" | "completed";
  answers: { link_id: string; answer: string }[];
  chiefComplaint: string;
};

function missingResult(items: QuestionnaireItemDef[]) {
  const list = items.map((i) => `${i.linkId}: ${i.text}`).join("; ");
  return {
    saved: false,
    missing: items.map((i) => i.linkId),
    message: `Not saved as completed: these items still have no answer. Ask the patient about them (${list}), then call save_history again with all the answers.`,
  };
}

// The EHR half of save_history, shared by the tool and the outbox drain: one QuestionnaireResponse per
// Conversation, looked up and then created or replaced, so replaying it is idempotent. It stays pending
// until the Practitioner's Validation; this never marks it validated. Needs the EHR; throws
// EhrUnavailableError when it is down.
export async function saveHistory(ehr: EhrAdapter, input: SaveHistoryInput): Promise<ToolResult> {
  const items = await ehr.getQuestionnaire();
  const defs = new Map(items.map((i) => [i.linkId, i]));
  const existing = await ehr.findQuestionnaireResponse(input.conversationId);
  if (existing && existing.patientId !== input.patientId) return patientMismatch({ id: "", granted: true, patientId: existing.patientId }, input.patientId)!;

  // Merge over what is stored: a retry that only sends the newly asked items must not erase the rest.
  const merged = new Map<string, HistoryAnswer>((existing?.answers ?? []).map((a) => [a.linkId, a]));
  const incoming = new Map<string, HistoryAnswer>();
  for (const { link_id, answer } of input.answers) {
    const def = defs.get(link_id); // unknown link_ids are dropped, not an error
    if (!def || !answer.trim()) continue;
    incoming.set(link_id, { linkId: link_id, value: coerceAnswer(def, answer) });
  }
  const complaint = input.chiefComplaint.trim();
  if (complaint && !incoming.has(CHIEF_COMPLAINT)) incoming.set(CHIEF_COMPLAINT, { linkId: CHIEF_COMPLAINT, value: complaint });
  for (const [id, a] of incoming) merged.set(id, a);
  const answers = items.map((i) => merged.get(i.linkId)).filter((a): a is HistoryAnswer => !!a && isAnswered(a));

  if (input.status === "completed") {
    const missing = missingRequired(items, answers);
    if (missing.length) return missingResult(missing);
  }

  try {
    await ehr.saveQuestionnaireResponse({ conversationId: input.conversationId, patientId: input.patientId, status: input.status, answers, existing });
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
}
