import type { BranchCode } from "@pokta-clinic/fhir";

const CALENDAR_ID_VAR: Record<BranchCode, string> = {
  "del-valle": "GOOGLE_CALENDAR_ID_GMA_DEL_VALLE",
  polanco: "GOOGLE_CALENDAR_ID_GMA_POLANCO",
  satelite: "GOOGLE_CALENDAR_ID_GMA_SATELITE",
};

// Server-only configuration. Read lazily so `next build` works without secrets, and fail closed at the first call.
function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

export const env = {
  get ehrBaseUrl() {
    return required("EHR_BASE_URL").replace(/\/$/, "");
  },
  get ehrClientId() {
    return required("EHR_CLIENT_ID");
  },
  get ehrClientSecret() {
    return required("EHR_CLIENT_SECRET");
  },
  get toolSecret() {
    return required("TOOL_SECRET");
  },
  // "google" (default) or "fake" (local dev and tests only). Anything else fails closed.
  get calendarProvider(): "google" | "fake" {
    const value = process.env.CALENDAR_PROVIDER || "google";
    if (value !== "google" && value !== "fake") throw new Error(`Invalid CALENDAR_PROVIDER ${value}`);
    return value;
  },
  get googleServiceAccountKeyB64() {
    return required("GOOGLE_SERVICE_ACCOUNT_KEY_B64");
  },
  // One Google calendar per branch.
  googleCalendarId(branch: BranchCode): string {
    return required(CALENDAR_ID_VAR[branch]);
  },
  // "upstash" (default) or "memory" (local dev and tests only, refused on Vercel production). Anything else fails closed.
  get storeProvider(): "upstash" | "memory" {
    const value = process.env.STORE_PROVIDER || "upstash";
    if (value !== "upstash" && value !== "memory") throw new Error(`Invalid STORE_PROVIDER ${value}`);
    return value;
  },
  // The Vercel Marketplace integration injects KV_REST_API_* or UPSTASH_REDIS_REST_*, depending on how it was added.
  get upstashUrl() {
    const value = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
    if (!value) throw new Error("Missing environment variable KV_REST_API_URL (or UPSTASH_REDIS_REST_URL)");
    return value;
  },
  get upstashToken() {
    const value = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!value) throw new Error("Missing environment variable KV_REST_API_TOKEN (or UPSTASH_REDIS_REST_TOKEN)");
    return value;
  },
  get adminPassword() {
    return required("ADMIN_PASSWORD");
  },
  // Optional: signs the admin cookie. Without it the key is derived from ADMIN_PASSWORD.
  get adminSessionSecret() {
    return process.env.ADMIN_SESSION_SECRET || null;
  },
  get cronSecret() {
    return required("CRON_SECRET");
  },
  get webhookSecret() {
    return required("ELEVENLABS_WEBHOOK_SECRET");
  },
  // Optional: without it emails are skipped (logged), never fatal to a tool call.
  get resendApiKey(): string | null {
    return process.env.RESEND_API_KEY || null;
  },
  get emailFrom() {
    return process.env.EMAIL_FROM || "Grupo Médico Articular (demo) <citas@mail.poktalabs.com>";
  },
  // The front desk inbox that receives callback requests.
  get clinicNotifyEmail() {
    return process.env.CLINIC_NOTIFY_EMAIL || "dev@poktalabs.com";
  },
  // Absolute origin for links in emails (patient link).
  get publicBaseUrl() {
    if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/$/, "");
    if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
    return "http://localhost:3123";
  },
  get renderApiKey() {
    return required("RENDER_API_KEY");
  },
  get renderEhrServiceId() {
    return required("RENDER_EHR_SERVICE_ID");
  },
  get renderEhrPostgresId() {
    return required("RENDER_EHR_POSTGRES_ID");
  },
};
