// Fail closed: the server refuses to start without its secrets.
function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env ${name}`);
  return value;
}

export const env = {
  jwtSecret: required("EHR_JWT_SECRET"),
  clientId: required("EHR_CLIENT_ID"),
  clientSecret: required("EHR_CLIENT_SECRET"),
  // Optional: when unset the read-only console is disabled (404).
  consolePassword: process.env.EHR_CONSOLE_PASSWORD || undefined,
};
