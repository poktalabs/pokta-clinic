import { randomUUID } from "node:crypto";
import type { BranchCode } from "@/scheduling/branches";
import type { CalendarAdapter, Interval } from "./adapter";

// In-memory calendars (one per branch) for local dev and tests only. State is per server process and is lost on restart.
// Kept on globalThis so dev-server module reloads do not drop it.
const store = ((globalThis as { __fakeCalendar?: Map<string, Interval & { branch: BranchCode }> }).__fakeCalendar ??= new Map());

export const fakeCalendar: CalendarAdapter = {
  async busy(branch, from, to) {
    const lo = Date.parse(from);
    const hi = Date.parse(to);
    return [...store.values()].filter((e) => e.branch === branch && Date.parse(e.start) < hi && lo < Date.parse(e.end)).map(({ start, end }) => ({ start, end }));
  },
  async createEvent({ branch, start, end }) {
    const id = `fake-${randomUUID()}`;
    store.set(id, { branch, start, end });
    return { id };
  },
  async deleteEvent(branch, id) {
    if (store.get(id)?.branch === branch) store.delete(id);
  },
};
