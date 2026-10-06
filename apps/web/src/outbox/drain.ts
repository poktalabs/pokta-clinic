import { BRANCH_CODE } from "@pokta-clinic/fhir";
import { EhrRejectedError, EhrUnavailableError, type EhrAdapter } from "@/ehr";
import type { OutboxItem, Store } from "@/store";
import { saveHistory } from "@/tools/save-history";

export type DrainResult = {
  attempted: number;
  succeeded: number;
  failed: number;
  remaining: number;
  // True when the run stopped early because the EHR is still down.
  ehrDown: boolean;
  // True when another drain held the lock and nothing ran.
  skipped: boolean;
};

const LOCK_SECONDS = 55;

// Replays one item. Every write first checks what the EHR already holds for the Conversation, so a
// replay after a half-finished earlier run (or a double drain) never creates a second record.
async function replay(ehr: EhrAdapter, item: OutboxItem): Promise<void> {
  switch (item.kind) {
    case "consent": {
      const current = await ehr.latestConsent(item.conversationId);
      if (current && current.granted === item.payload.granted) return;
      await ehr.recordConsent(item.conversationId, item.payload.granted);
      return;
    }
    case "save_history": {
      // saveHistory upserts by Conversation and merges over what is stored.
      const request = { conversationId: item.conversationId, ...item.payload };
      const result = await saveHistory(ehr, request);
      // The call was answered "saved" while the EHR was off, before required items could be checked. If
      // the EHR now says some are missing, keep what the patient said as in-progress, still pending Validation.
      if (result.saved === false && Array.isArray(result.missing)) await saveHistory(ehr, { ...request, status: "in-progress" });
      else if (result.patient_mismatch) throw new EhrRejectedError(409, "patient mismatch");
      return;
    }
    case "appointment": {
      if (await ehr.findAppointmentByConversation(item.conversationId)) return;
      // Items queued before the branch network have no branch: the old single practice is now Del Valle.
      await ehr.createAppointment({ conversationId: item.conversationId, ...item.payload, branch: item.payload.branch ?? BRANCH_CODE.delValle });
      return;
    }
    case "escalate": {
      const known = await ehr.findCommunicationsByConversation(item.conversationId);
      if (known.some((c) => c.severity === item.payload.severity && c.patientWords === item.payload.patientWords)) return;
      await ehr.createCommunication({
        conversationId: item.conversationId,
        severity: item.payload.severity,
        patientWords: item.payload.patientWords,
        instruction: item.payload.instruction,
        patientId: item.payload.patientId,
        branch: item.payload.branch,
        sent: item.payload.sent,
      });
      return;
    }
  }
}

// Replays the outbox in enqueue order. Successes are removed. A failure stays queued with its attempt
// count; if the EHR is unreachable the run stops (later items would fail the same way and must keep
// their order), while a rejection of one item does not block the items behind it.
export async function drainOutbox(deps: { store: Store; ehr: EhrAdapter }): Promise<DrainResult> {
  const { store, ehr } = deps;
  const release = await store.lock("outbox-drain", LOCK_SECONDS);
  if (!release) return { attempted: 0, succeeded: 0, failed: 0, remaining: (await store.outbox()).length, ehrDown: false, skipped: true };
  const result: DrainResult = { attempted: 0, succeeded: 0, failed: 0, remaining: 0, ehrDown: false, skipped: false };
  try {
    for (const item of await store.outbox()) {
      result.attempted++;
      try {
        await replay(ehr, item);
        await store.removeOutboxItem(item.id);
        result.succeeded++;
      } catch (err) {
        result.failed++;
        // Error class only: EHR diagnostics can echo patient data.
        await store.updateOutboxItem({ ...item, attempts: item.attempts + 1, lastError: (err as Error).name } as OutboxItem);
        console.error(JSON.stringify({ outbox: "replay_failed", kind: item.kind, attempts: item.attempts + 1, error: (err as Error).name }));
        if (err instanceof EhrUnavailableError) {
          result.ehrDown = true;
          break;
        }
      }
    }
    result.remaining = (await store.outbox()).length;
    return result;
  } finally {
    await release();
  }
}
