import { env } from "@/env";

// Suspends and resumes the EHR web service and its Postgres through the Render API
// (https://api-docs.render.com: POST /v1/services/{id}/suspend|resume, POST /v1/postgres/{id}/suspend|resume,
// GET /v1/services/{id} and GET /v1/postgres/{id} report `suspended`). The key is account-wide.
const BASE = "https://api.render.com/v1";
const TIMEOUT_MS = 10_000;

export class RenderNotConfiguredError extends Error {
  constructor() {
    super("Render toggle is not configured (RENDER_API_KEY, RENDER_EHR_SERVICE_ID, RENDER_EHR_POSTGRES_ID)");
    this.name = "RenderNotConfiguredError";
  }
}

export class RenderApiError extends Error {
  constructor(readonly status: number) {
    super(`Render API call failed with status ${status}`);
    this.name = "RenderApiError";
  }
}

export type RenderFlags = { serviceSuspended: boolean; databaseSuspended: boolean };
export type RenderFetch = (url: string, init: RequestInit) => Promise<Response>;

type Config = { apiKey: string; serviceId: string; postgresId: string };

function config(): Config {
  try {
    return { apiKey: env.renderApiKey, serviceId: env.renderEhrServiceId, postgresId: env.renderEhrPostgresId };
  } catch {
    throw new RenderNotConfiguredError();
  }
}

export function renderConfigured(): boolean {
  try {
    config();
    return true;
  } catch {
    return false;
  }
}

async function call(cfg: Config, fetcher: RenderFetch, method: "GET" | "POST", path: string): Promise<unknown> {
  const res = await fetcher(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${cfg.apiKey}`, Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new RenderApiError(res.status);
  return res.json().catch(() => null);
}

export async function renderFlags(fetcher: RenderFetch = fetch): Promise<RenderFlags> {
  const cfg = config();
  const [service, database] = (await Promise.all([call(cfg, fetcher, "GET", `/services/${cfg.serviceId}`), call(cfg, fetcher, "GET", `/postgres/${cfg.postgresId}`)])) as {
    suspended?: string;
  }[];
  return { serviceSuspended: service?.suspended === "suspended", databaseSuspended: database?.suspended === "suspended" };
}

// Database first: the EHR migrates on boot and retries while Postgres wakes, but would only fail without it.
export async function resumeEhr(fetcher: RenderFetch = fetch): Promise<void> {
  const cfg = config();
  await call(cfg, fetcher, "POST", `/postgres/${cfg.postgresId}/resume`);
  await call(cfg, fetcher, "POST", `/services/${cfg.serviceId}/resume`);
}

// Service first: stop the writer before the database goes away.
export async function suspendEhr(fetcher: RenderFetch = fetch): Promise<void> {
  const cfg = config();
  await call(cfg, fetcher, "POST", `/services/${cfg.serviceId}/suspend`);
  await call(cfg, fetcher, "POST", `/postgres/${cfg.postgresId}/suspend`);
}
