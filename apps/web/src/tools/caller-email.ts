import { z } from "zod";
import { isEmail } from "@/email/send";
import { store } from "@/store";

// The email the caller typed on the explainer page, registered by the page through /api/lead when the
// call connects; tools look it up by conversation id. The agent never carries it (a tool parameter bound
// to a dynamic variable makes ElevenLabs refuse every call that does not pass it, like the plain widget).
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
