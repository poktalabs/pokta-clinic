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
};
