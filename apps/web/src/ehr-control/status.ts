import { after } from "next/server";
import { ehr } from "@/ehr";
import { drainOutbox } from "@/outbox/drain";
import { store } from "@/store";
import { deriveState, ehrHealthy, type EhrState } from "./state";
import { renderConfigured, renderFlags, type RenderFlags } from "./render";

const WAKING_WINDOW_MS = 10 * 60 * 1000;

export type EhrStatus = { state: EhrState; render: RenderFlags | null; renderConfigured: boolean; checkedAt: number };

async function intent() {
  try {
    return await store.getEhrIntent();
  } catch {
    return null;
  }
}

// Public part: health plus the toggle's own intent. Render's flags only when asked for (admins), so
// the public page never spends Render API calls. When the toggle resumed the EHR and it has just
// become healthy, the outbox drain starts here, once, after the response is sent.
export async function ehrStatus(opts: { withRender: boolean }): Promise<EhrStatus> {
  const now = Date.now();
  const [healthy, pending] = await Promise.all([ehrHealthy(), intent()]);
  let flags: RenderFlags | null = null;
  if (opts.withRender && renderConfigured()) flags = await renderFlags().catch(() => null);

  if (healthy && pending?.action === "resume" && pending.drainPending) {
    await store.putEhrIntent({ ...pending, drainPending: false }).catch(() => undefined);
    const task = drainOutbox({ store, ehr }).catch((err) => console.error(JSON.stringify({ outbox: "drain_failed", error: (err as Error).name })));
    try {
      after(task);
    } catch {
      // Outside a request scope the promise runs on its own.
    }
  }
  const state = deriveState({
    healthy,
    resumeRequestedRecently: pending?.action === "resume" && now - pending.at < WAKING_WINDOW_MS,
    renderServiceSuspended: flags ? flags.serviceSuspended : null,
  });
  return { state, render: flags, renderConfigured: renderConfigured(), checkedAt: now };
}
