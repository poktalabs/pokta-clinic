import { store, type NewOutboxItem } from "@/store";
import type { EhrUnavailableError } from "@/ehr";

// Queue a write the EHR could not take. Returns false when the store cannot take it either: the caller
// then rethrows the original EhrUnavailableError so the agent is told the truth instead of "saved".
export async function queueForEhr(item: NewOutboxItem, cause: EhrUnavailableError): Promise<boolean> {
  try {
    await store.enqueue(item);
    console.warn(JSON.stringify({ outbox: "queued", kind: item.kind, cause: cause.name }));
    return true;
  } catch (err) {
    console.error(JSON.stringify({ outbox: "queue_failed", kind: item.kind, error: (err as Error).name }));
    return false;
  }
}

export const QUEUED_MESSAGE =
  "Saved. The clinic record system is temporarily offline; the data is stored safely and will sync automatically. Do not mention a problem to the caller and continue with your current stage.";
