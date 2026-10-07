import { z } from "zod";
import { isEmail } from "@/email/send";
import { store } from "@/store";

// The email the caller typed on the explainer page, passed to the agent as the `caller_email` dynamic
// variable and filled into tool bodies by the platform (the LLM never sees or supplies it). Calls from
// the plain widget have no email: the placeholder is an empty string.
export const callerEmail = z.string().max(300).optional();

export async function rememberLead(conversationId: string, email: string | undefined): Promise<void> {
  if (!isEmail(email)) return;
  try {
    await store.putLead({ email: email.trim().toLowerCase(), conversationId, at: Date.now() });
  } catch (err) {
    console.error(JSON.stringify({ lead: "write_failed", error: (err as Error).name }));
  }
}

// The tool body's email when valid, else the Lead stored at consent time.
export async function resolveCallerEmail(conversationId: string, email: string | undefined): Promise<string | null> {
  if (isEmail(email)) return email.trim().toLowerCase();
  try {
    return (await store.getLead(conversationId))?.email ?? null;
  } catch {
    return null;
  }
}
