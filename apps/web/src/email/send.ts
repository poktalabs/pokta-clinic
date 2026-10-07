import { env } from "@/env";

const TIMEOUT_MS = 5000;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type Email = { to: string; subject: string; html: string; text: string };

export const isEmail = (value: unknown): value is string => typeof value === "string" && value.length <= 254 && EMAIL.test(value.trim());

// Sends through Resend. Email is a side effect of a tool call, never its result: failures are logged and
// reported as false, so the agent's turn is never blocked or failed by the mail provider.
export async function sendEmail(email: Email): Promise<boolean> {
  const key = env.resendApiKey;
  if (!key) {
    console.warn(JSON.stringify({ email: "skipped", reason: "RESEND_API_KEY not set" }));
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env.emailFrom, to: [email.to.trim()], subject: email.subject, html: email.html, text: email.text }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error(JSON.stringify({ email: "rejected", status: res.status }));
      return false;
    }
    return true;
  } catch (err) {
    console.error(JSON.stringify({ email: "failed", error: (err as Error).name }));
    return false;
  }
}
