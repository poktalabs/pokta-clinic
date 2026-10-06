import { randomUUID } from "node:crypto";
import type { CalendarAdapter, Interval } from "./adapter";

// In-memory calendar for local dev and tests only. State is per server process and is lost on restart.
// Kept on globalThis so dev-server module reloads do not drop it.
const store = ((globalThis as { __fakeCalendar?: Map<string, Interval> }).__fakeCalendar ??= new Map());

export const fakeCalendar: CalendarAdapter = {
  async busy(from, to) {
    const lo = Date.parse(from);
    const hi = Date.parse(to);
    return [...store.values()].filter((e) => Date.parse(e.start) < hi && lo < Date.parse(e.end));
  },
  async createEvent({ start, end }) {
    const id = `fake-${randomUUID()}`;
    store.set(id, { start, end });
    return { id };
  },
  async deleteEvent(id) {
    store.delete(id);
  },
};
