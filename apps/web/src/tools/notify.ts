import { after } from "next/server";
import { sendEmail, type Email } from "@/email/send";

// Emails leave after the tool response, so the caller never waits on the mail provider. Outside a
// request scope (tests, scripts) the promise simply runs on its own.
export function sendLater(...emails: (Email | null)[]): number {
  const list = emails.filter((e): e is Email => !!e);
  const task = Promise.all(list.map(sendEmail)).then(() => undefined);
  try {
    after(task);
  } catch {
    // no request scope
  }
  return list.length;
}
