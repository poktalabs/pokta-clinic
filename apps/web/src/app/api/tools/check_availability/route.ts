import { z } from "zod";
import { BRANCH_CODES } from "@pokta-clinic/fhir";
import { calendar } from "@/calendar";
import type { BranchCode } from "@/scheduling/branches";
import { freeSlots, busyRange, type Interval } from "@/scheduling/slots";
import { branchDetails } from "@/tools/branch-details";
import { NO_CONSENT, conversationId, grantedConsent, tool } from "@/tools/handler";

const Input = z.object({
  conversation_id: conversationId,
  branch: z.enum([...BRANCH_CODES, "any"]).optional(),
  preferred_date: z.iso.date().optional(),
  part_of_day: z.enum(["morning", "afternoon"]).optional(),
});

// Each branch's calendar says what is busy; the branch rules (src/scheduling) say what may be offered.
// "any" or no branch searches all three and keeps variety across branches and days. A branch whose
// calendar does not answer is left out while another one does; if none answers the call fails (503).
export const POST = tool("check_availability", Input, async (input, ctx) => {
  if (!(await grantedConsent(input.conversation_id))) return NO_CONSENT;
  const now = new Date();
  const range = busyRange(now);
  const branches: BranchCode[] = !input.branch || input.branch === "any" ? [...BRANCH_CODES] : [input.branch];
  const results = await Promise.allSettled(branches.map((b) => calendar.busy(b, range.from, range.to)));
  const busy: Partial<Record<BranchCode, Interval[]>> = {};
  results.forEach((r, i) => {
    if (r.status === "fulfilled") busy[branches[i]] = r.value;
  });
  const failed = results.find((r) => r.status === "rejected");
  if (failed && !Object.keys(busy).length) throw failed.reason;

  const picked = freeSlots({ now, busy, preferredDate: input.preferred_date, partOfDay: input.part_of_day });
  const details = new Map(await Promise.all([...new Set(picked.map((s) => s.branch))].map(async (b) => [b, await branchDetails(b)] as const)));
  const slots = picked.map(({ branch, start, label }) => ({
    branch,
    branch_name: details.get(branch)!.name,
    practitioner_name: details.get(branch)!.practitionerName,
    start,
    label,
  }));
  ctx.outcome(`${slots.length} slots offered`);
  if (!slots.length) {
    return {
      slots: [],
      message: "No free slots for that request. Say so and ask for a different day, part of the day or branch, then call check_availability again.",
    };
  }
  return {
    slots,
    message:
      "Offer these options by reading each label aloud, with the branch name when the options are at different branches. When the caller chooses one, call book_appointment with its branch and start exactly as given.",
  };
});
