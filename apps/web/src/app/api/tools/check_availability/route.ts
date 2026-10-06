import { z } from "zod";
import { calendar } from "@/calendar";
import { freeSlots, busyRange } from "@/scheduling/slots";
import { NO_CONSENT, conversationId, grantedConsent, tool } from "@/tools/handler";

const Input = z.object({
  conversation_id: conversationId,
  preferred_date: z.iso.date().optional(),
  part_of_day: z.enum(["morning", "afternoon"]).optional(),
});

// The calendar says what is busy; the practice rules (src/scheduling/slots.ts) say what may be offered.
export const POST = tool("check_availability", Input, async (input) => {
  if (!(await grantedConsent(input.conversation_id))) return NO_CONSENT;
  const now = new Date();
  const range = busyRange(now);
  const busy = await calendar.busy(range.from, range.to);
  const slots = freeSlots({ now, busy, preferredDate: input.preferred_date, partOfDay: input.part_of_day });
  if (!slots.length) {
    return {
      slots: [],
      message: "No free slots for that request. Say so and ask for a different day or part of the day, then call check_availability again.",
    };
  }
  return {
    slots,
    message: "Offer these options by reading each label aloud. When the caller chooses one, call book_appointment with its start exactly as given.",
  };
});
