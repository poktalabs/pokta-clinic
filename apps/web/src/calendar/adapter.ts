import type { BranchCode } from "@/scheduling/branches";

// The only contract the tools know for a branch's calendar. Each branch has its own Google Calendar,
// which owns availability; the EHR only stores the event id of a booking.

export type Interval = { start: string; end: string };

export interface CalendarAdapter {
  busy(branch: BranchCode, from: string, to: string): Promise<Interval[]>;
  // `transparent` events (callback reminders) show in the calendar but never count as busy.
  createEvent(input: { branch: BranchCode; start: string; end: string; summary: string; description: string; transparent?: boolean }): Promise<{ id: string }>;
  deleteEvent(branch: BranchCode, id: string): Promise<void>;
}

// The calendar did not answer or refused; tools tell the agent to apologise instead of guessing.
export class CalendarUnavailableError extends Error {
  constructor(detail: string) {
    super(`Calendar unavailable: ${detail}`);
    this.name = "CalendarUnavailableError";
  }
}
