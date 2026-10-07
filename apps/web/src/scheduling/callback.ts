import { BRANCHES, type BranchCode } from "./branches";
import { isoOf } from "./slots";

const TIME_ZONE = "America/Mexico_City";
const REMINDER_MINUTES = 15;

const partsOf = (ms: number) =>
  Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric" })
      .formatToParts(ms)
      .map((p) => [p.type, Number(p.value)]),
  );

// The front desk's reminder: 15 minutes at the branch's first opening hour on the next day it is open.
// Mexico City has no DST since 2022, so the fixed -06:00 offset of `isoOf` holds.
export function nextCallbackSlot(now: Date, branch: BranchCode): { start: string; end: string } {
  const today = partsOf(now.getTime());
  for (let i = 1; i <= 7; i++) {
    const day = new Date(Date.UTC(today.year, today.month - 1, today.day + i));
    const hours = BRANCHES[branch].schedule[day.getUTCDay()];
    if (!hours?.length) continue;
    const startMs = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hours[0] + 6);
    return { start: isoOf(startMs), end: isoOf(startMs + REMINDER_MINUTES * 60_000) };
  }
  throw new Error(`branch ${branch} has no opening hours`);
}
