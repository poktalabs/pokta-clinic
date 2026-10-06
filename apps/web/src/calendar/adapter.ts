// The only contract the tools know for the Practitioner's calendar. Google Calendar owns
// availability; the EHR only stores the event id of a booking.

export type Interval = { start: string; end: string };

export interface CalendarAdapter {
  busy(from: string, to: string): Promise<Interval[]>;
  createEvent(input: { start: string; end: string; summary: string; description: string }): Promise<{ id: string }>;
  deleteEvent(id: string): Promise<void>;
}

// The calendar did not answer or refused; tools tell the agent to apologise instead of guessing.
export class CalendarUnavailableError extends Error {
  constructor(detail: string) {
    super(`Calendar unavailable: ${detail}`);
    this.name = "CalendarUnavailableError";
  }
}
