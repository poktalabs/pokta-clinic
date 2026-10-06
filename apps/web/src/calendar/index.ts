import { env } from "@/env";
import type { CalendarAdapter } from "./adapter";
import { fakeCalendar } from "./fake";
import { googleCalendar } from "./google";

// Chosen per call from CALENDAR_PROVIDER so `next build` needs no env. Default is google; a missing
// google variable throws at first use. The fake never stands in for google silently, and it is
// refused outright on Vercel production.
function select(): CalendarAdapter {
  const provider = env.calendarProvider;
  if (provider === "fake") {
    if (process.env.VERCEL_ENV === "production") throw new Error("CALENDAR_PROVIDER=fake is not allowed in production");
    return fakeCalendar;
  }
  return googleCalendar;
}

export const calendar: CalendarAdapter = {
  busy: (branch, from, to) => select().busy(branch, from, to),
  createEvent: (input) => select().createEvent(input),
  deleteEvent: (branch, id) => select().deleteEvent(branch, id),
};

export * from "./adapter";
