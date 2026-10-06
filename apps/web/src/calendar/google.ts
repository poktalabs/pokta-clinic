import { JWT } from "google-auth-library";
import { env } from "@/env";
import type { BranchCode } from "@/scheduling/branches";
import { CalendarUnavailableError, type CalendarAdapter } from "./adapter";

// Google Calendar REST API with a service account (each branch shares its calendar with the
// service account's email). google-auth-library rather than hand-rolled node:crypto: it signs the JWT,
// exchanges it for an access token, caches it and renews it, which is the part easy to get subtly wrong.
const API = "https://www.googleapis.com/calendar/v3";
const SCOPES = ["https://www.googleapis.com/auth/calendar.events", "https://www.googleapis.com/auth/calendar.freebusy"];
const TIME_ZONE = "America/Mexico_City";
const TIMEOUT_MS = 8000;

let client: JWT | null = null;

function auth(): JWT {
  if (client) return client;
  // The key is the service account JSON, base64-encoded so it fits in one env var.
  let key: { client_email?: string; private_key?: string };
  try {
    key = JSON.parse(Buffer.from(env.googleServiceAccountKeyB64, "base64").toString("utf8"));
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY_B64 is not base64 of a JSON key");
  }
  if (!key.client_email || !key.private_key) throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY_B64 lacks client_email or private_key");
  client = new JWT({ email: key.client_email, key: key.private_key, scopes: SCOPES });
  return client;
}

async function call<T>(method: "GET" | "POST" | "DELETE", url: string, data?: unknown): Promise<T | null> {
  try {
    const res = await auth().request<T>({ url, method, data, timeout: TIMEOUT_MS });
    return res.data ?? null;
  } catch (err) {
    const e = err as { status?: number; response?: { status?: number } };
    throw new CalendarUnavailableError(`${method} ${new URL(url).pathname.split("/").slice(-1)[0]} returned ${e.status ?? e.response?.status ?? "no response"}`);
  }
}

const eventsUrl = (branch: BranchCode) => `${API}/calendars/${encodeURIComponent(env.googleCalendarId(branch))}/events`;

export const googleCalendar: CalendarAdapter = {
  async busy(branch, from, to) {
    const id = env.googleCalendarId(branch);
    const body = await call<{ calendars?: Record<string, { busy?: { start: string; end: string }[]; errors?: unknown[] }> }>(
      "POST",
      `${API}/freeBusy`,
      { timeMin: from, timeMax: to, timeZone: TIME_ZONE, items: [{ id }] },
    );
    const cal = body?.calendars?.[id];
    // A calendar the service account cannot read comes back as 200 with errors: treat it as unavailable, never as free.
    if (!cal || cal.errors?.length) throw new CalendarUnavailableError("freeBusy returned no data for the calendar");
    return (cal.busy ?? []).map((b) => ({ start: b.start, end: b.end }));
  },

  async createEvent({ branch, start, end, summary, description }) {
    const event = await call<{ id?: string }>("POST", eventsUrl(branch), {
      summary,
      description,
      start: { dateTime: start, timeZone: TIME_ZONE },
      end: { dateTime: end, timeZone: TIME_ZONE },
    });
    if (!event?.id) throw new CalendarUnavailableError("events.insert returned no id");
    return { id: event.id };
  },

  async deleteEvent(branch, id) {
    try {
      await call("DELETE", `${eventsUrl(branch)}/${encodeURIComponent(id)}`);
    } catch (err) {
      // Already gone is the goal of a delete.
      if (!/returned (404|410)/.test((err as Error).message)) throw err;
    }
  },
};
