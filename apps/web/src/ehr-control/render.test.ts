import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RenderNotConfiguredError, renderFlags, resumeEhr, suspendEhr } from "./render";
import { deriveState } from "./state";

// The Render API is never called for real: a recording fake stands in for fetch.
function recorder(responses: Record<string, unknown> = {}) {
  const calls: string[] = [];
  const fetcher = async (url: string, init: RequestInit) => {
    const path = new URL(url).pathname;
    calls.push(`${init.method} ${path}`);
    return new Response(JSON.stringify(responses[path] ?? {}), { status: 202 });
  };
  return { calls, fetcher };
}

beforeEach(() => {
  vi.stubEnv("RENDER_API_KEY", "rnd_test");
  vi.stubEnv("RENDER_EHR_SERVICE_ID", "srv-1");
  vi.stubEnv("RENDER_EHR_POSTGRES_ID", "dpg-1");
});
afterEach(() => vi.unstubAllEnvs());

describe("render toggle", () => {
  it("resumes the database before the service", async () => {
    const { calls, fetcher } = recorder();
    await resumeEhr(fetcher);
    expect(calls).toEqual(["POST /v1/postgres/dpg-1/resume", "POST /v1/services/srv-1/resume"]);
  });
  it("suspends the service before the database", async () => {
    const { calls, fetcher } = recorder();
    await suspendEhr(fetcher);
    expect(calls).toEqual(["POST /v1/services/srv-1/suspend", "POST /v1/postgres/dpg-1/suspend"]);
  });
  it("stops after the first failed call", async () => {
    const calls: string[] = [];
    const fetcher = async (url: string, init: RequestInit) => {
      calls.push(`${init.method} ${new URL(url).pathname}`);
      return new Response("{}", { status: 401 });
    };
    await expect(resumeEhr(fetcher)).rejects.toThrow("401");
    expect(calls).toHaveLength(1);
  });
  it("reads the suspended flags", async () => {
    const { fetcher } = recorder({ "/v1/services/srv-1": { suspended: "suspended" }, "/v1/postgres/dpg-1": { suspended: "not_suspended" } });
    expect(await renderFlags(fetcher)).toEqual({ serviceSuspended: true, databaseSuspended: false });
  });
  it("fails clearly when not configured", async () => {
    vi.stubEnv("RENDER_API_KEY", "");
    await expect(resumeEhr(recorder().fetcher)).rejects.toBeInstanceOf(RenderNotConfiguredError);
  });
});

describe("deriveState", () => {
  it("is on when healthy, waking after a resume, off otherwise", () => {
    expect(deriveState({ healthy: true, resumeRequestedRecently: false, renderServiceSuspended: null })).toBe("on");
    expect(deriveState({ healthy: false, resumeRequestedRecently: true, renderServiceSuspended: null })).toBe("waking");
    expect(deriveState({ healthy: false, resumeRequestedRecently: false, renderServiceSuspended: null })).toBe("off");
    expect(deriveState({ healthy: false, resumeRequestedRecently: false, renderServiceSuspended: false })).toBe("waking");
    expect(deriveState({ healthy: false, resumeRequestedRecently: true, renderServiceSuspended: true })).toBe("off");
  });
});
