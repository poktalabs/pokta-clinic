import { env } from "@/env";
import { EhrRejectedError, EhrUnavailableError } from "./adapter";

// OAuth2 client credentials against the EHR's token endpoint. One token per server instance, renewed
// a minute before it expires, and once more if the EHR rejects it early.
const TIMEOUT_MS = 8000;
const RENEW_MARGIN_MS = 60_000;

let cached: { token: string; expiresAt: number } | null = null;

async function request(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    throw new EhrUnavailableError((err as Error).name);
  }
}

async function token(): Promise<string> {
  if (cached && cached.expiresAt - RENEW_MARGIN_MS > Date.now()) return cached.token;
  const basic = Buffer.from(`${env.ehrClientId}:${env.ehrClientSecret}`).toString("base64");
  const res = await request(`${env.ehrBaseUrl}/oauth/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new EhrUnavailableError(`token endpoint returned ${res.status}`);
  const body = (await res.json()) as { access_token: string; expires_in: number };
  cached = { token: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
  return cached.token;
}

export async function fhir<T>(method: "GET" | "POST" | "PUT", path: string, body?: unknown): Promise<{ status: number; data: T }> {
  const send = async () =>
    request(`${env.ehrBaseUrl}/fhir${path}`, {
      method,
      headers: { Authorization: `Bearer ${await token()}`, Accept: "application/fhir+json", "Content-Type": "application/fhir+json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  let res = await send();
  if (res.status === 401) {
    cached = null;
    res = await send();
  }
  if (res.status >= 500 || res.status === 401) throw new EhrUnavailableError(`${method} ${path} returned ${res.status}`);
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const diagnostics = (data as { issue?: { diagnostics?: string }[] } | null)?.issue?.[0]?.diagnostics ?? `status ${res.status}`;
    throw new EhrRejectedError(res.status, diagnostics);
  }
  return { status: res.status, data: data as T };
}
