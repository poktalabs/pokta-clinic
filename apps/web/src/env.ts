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
  get googleCalendarId() {
    return required("GOOGLE_CALENDAR_ID");
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
