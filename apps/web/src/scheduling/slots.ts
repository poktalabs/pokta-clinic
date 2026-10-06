// The practice's scheduling rules as pure functions. Google Calendar says what is busy; this module
// says what could ever be offered. `now` is injected so the date math is testable.
const TIME_ZONE = "America/Mexico_City";
const SLOT_MINUTES = 60; // FIRST_VISIT_MINUTES in @pokta-clinic/fhir
// Mon-Fri 9:00-14:00 and 16:00-19:00, one hour each.
const START_HOURS = [9, 10, 11, 12, 13, 16, 17, 18];
const MIN_LEAD_MS = 24 * 3600_000;
const MAX_LEAD_DAYS = 14;
const HOUR_MS = 3600_000;

export type Slot = { start: string; label: string };
export type Interval = { start: string; end: string };
export type PartOfDay = "morning" | "afternoon";

type Local = { y: number; m: number; d: number; h: number; mi: number; s: number };

const zoneFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
});

// Wall-clock fields of an instant in the practice's zone, from the IANA database (no fixed offset).
function localOf(ms: number): Local {
  const p = Object.fromEntries(zoneFormat.formatToParts(ms).map((x) => [x.type, Number(x.value)]));
  return { y: p.year, m: p.month, d: p.day, h: p.hour, mi: p.minute, s: p.second };
}

function offsetMinutes(ms: number): number {
  const l = localOf(ms);
  return (Date.UTC(l.y, l.m - 1, l.d, l.h, l.mi, l.s) - Math.floor(ms / 1000) * 1000) / 60_000;
}

// The instant for a wall-clock time in the zone. Two passes settle the offset around a DST change.
function instantOf(y: number, m: number, d: number, h: number): number {
  const naive = Date.UTC(y, m - 1, d, h);
  const first = naive - offsetMinutes(naive) * 60_000;
  return naive - offsetMinutes(first) * 60_000;
}

const pad = (n: number) => String(n).padStart(2, "0");

// ISO 8601 with the zone's numeric offset, e.g. 2026-10-13T09:00:00-06:00.
export function isoOf(ms: number): string {
  const l = localOf(ms);
  const off = offsetMinutes(ms);
  const sign = off < 0 ? "-" : "+";
  const abs = Math.abs(off);
  return `${l.y}-${pad(l.m)}-${pad(l.d)}T${pad(l.h)}:${pad(l.mi)}:${pad(l.s)}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

const dateFormat = new Intl.DateTimeFormat("es-MX", { timeZone: TIME_ZONE, weekday: "long", day: "numeric", month: "long" });

// "martes 13 de octubre a las 9:00 de la mañana". Built from parts so punctuation does not depend on the ICU version.
export function labelOf(ms: number): string {
  const p = Object.fromEntries(dateFormat.formatToParts(ms).map((x) => [x.type, x.value]));
  const { h, mi } = localOf(ms);
  const clock = `${h % 12 || 12}:${pad(mi)}`;
  const period = h < 12 ? "de la mañana" : h === 12 ? "del día" : h < 19 ? "de la tarde" : "de la noche";
  return `${p.weekday} ${p.day} de ${p.month} a ${h % 12 === 1 ? "la" : "las"} ${clock} ${period}`;
}

// Bookable window: from now + 24 h to now + 14 days (inclusive of both ends).
export function bookableWindow(now: Date): { from: number; to: number } {
  return { from: now.getTime() + MIN_LEAD_MS, to: now.getTime() + MAX_LEAD_DAYS * 24 * HOUR_MS };
}

const slotOf = (ms: number): Slot => ({ start: isoOf(ms), label: labelOf(ms) });

// Every start the rules allow in the window, in time order, ignoring the calendar.
function candidates(now: Date): number[] {
  const { from, to } = bookableWindow(now);
  const today = localOf(now.getTime());
  const out: number[] = [];
  for (let i = 0; i <= MAX_LEAD_DAYS + 1; i++) {
    const day = new Date(Date.UTC(today.y, today.m - 1, today.d + i));
    const weekday = day.getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    for (const h of START_HOURS) {
      const ms = instantOf(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), h);
      if (ms >= from && ms <= to) out.push(ms);
    }
  }
  return out;
}

const overlaps = (ms: number, busy: Interval[]) =>
  busy.some((b) => ms < Date.parse(b.end) && Date.parse(b.start) < ms + SLOT_MINUTES * 60_000);

const dayKey = (ms: number) => {
  const l = localOf(ms);
  return `${l.y}-${pad(l.m)}-${pad(l.d)}`;
};

// Up to `max` free slots. Greedy for variety: prefer a day not yet chosen, then a start that is not
// adjacent to a chosen one on the same day, then the earliest.
export function freeSlots(input: { now: Date; busy: Interval[]; preferredDate?: string; partOfDay?: PartOfDay; max?: number }): Slot[] {
  const max = input.max ?? 3;
  const pool = candidates(input.now).filter((ms) => {
    if (input.preferredDate && dayKey(ms) !== input.preferredDate) return false;
    if (input.partOfDay === "morning" && localOf(ms).h >= 14) return false;
    if (input.partOfDay === "afternoon" && localOf(ms).h < 14) return false;
    return !overlaps(ms, input.busy);
  });
  const chosen: number[] = [];
  while (chosen.length < max && pool.length) {
    const rank = (ms: number) => {
      const sameDay = chosen.filter((c) => dayKey(c) === dayKey(ms));
      const adjacent = sameDay.some((c) => Math.abs(c - ms) <= HOUR_MS);
      return (sameDay.length ? 2 : 0) + (adjacent ? 1 : 0);
    };
    let best = 0;
    for (let i = 1; i < pool.length; i++) if (rank(pool[i]) < rank(pool[best])) best = i;
    chosen.push(pool.splice(best, 1)[0]);
  }
  return chosen.sort((a, b) => a - b).map(slotOf);
}

// Re-validates a start the agent sends back: it must be on the grid and inside the window. Returns the
// normalized slot with its end, or null.
export function resolveSlot(start: string, now: Date): (Slot & { end: string }) | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(start)) return null;
  const ms = Date.parse(start);
  if (Number.isNaN(ms)) return null;
  const match = candidates(now).includes(ms);
  return match ? { ...slotOf(ms), end: isoOf(ms + SLOT_MINUTES * 60_000) } : null;
}

export function describeStart(start: string): Slot {
  return slotOf(Date.parse(start));
}

// The full range to ask the calendar about.
export function busyRange(now: Date): { from: string; to: string } {
  const { from, to } = bookableWindow(now);
  return { from: new Date(from).toISOString(), to: new Date(to + SLOT_MINUTES * 60_000).toISOString() };
}
