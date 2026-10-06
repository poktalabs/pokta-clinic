import { env } from "@/env";

export type EhrState = "on" | "off" | "waking";

// The EHR's own /healthz, with a short timeout: a suspended or booting service must not hang the page.
// Note for the idle (not suspended) free tier: this request itself wakes a service Render spun down.
export async function ehrHealthy(timeoutMs = 2500, fetcher: typeof fetch = fetch): Promise<boolean> {
  try {
    const res = await fetcher(`${env.ehrBaseUrl}/healthz`, { cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
    return res.ok;
  } catch {
    return false;
  }
}

// Healthy means on. Not healthy is waking while a resume was requested recently (or Render reports the
// service as not suspended), otherwise off.
export function deriveState(input: { healthy: boolean; resumeRequestedRecently: boolean; renderServiceSuspended: boolean | null }): EhrState {
  if (input.healthy) return "on";
  if (input.renderServiceSuspended === false) return "waking";
  if (input.renderServiceSuspended === null && input.resumeRequestedRecently) return "waking";
  return "off";
}
