import { after } from "next/server";
import { calendar } from "@/calendar";
import { ehr } from "@/ehr";

// A patient who books no longer needs the callback they asked for earlier: complete the Task and
// remove its reminder from the branch calendar. Runs after the response; best effort.
export function closePendingCallbacks(patientId: string): void {
  const task = (async () => {
    const pending = await ehr.pendingCallbacks(patientId);
    for (const cb of pending) {
      await ehr.completeCallback(cb.id);
      if (cb.branch && cb.calendarEventId) await calendar.deleteEvent(cb.branch, cb.calendarEventId).catch(() => undefined);
    }
  })().catch((err) => console.error("closing pending callbacks failed", err));
  try {
    after(task);
  } catch {
    // no request scope
  }
}
