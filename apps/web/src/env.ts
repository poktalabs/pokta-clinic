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
};
