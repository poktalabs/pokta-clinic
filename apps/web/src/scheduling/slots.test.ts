import type { BranchCode } from "@pokta-clinic/fhir";
import { describe, expect, it } from "vitest";
import { busyRange, describeStart, freeSlots, labelOf, resolveSlot, type FreeSlotsInput } from "./slots";

// Tuesday 2026-10-06 09:00 in Mexico City (UTC-6).
const NOW = new Date("2026-10-06T15:00:00Z");
const ALL: BranchCode[] = ["del-valle", "polanco", "satelite"];
const noBusy = (branches: BranchCode[]) => Object.fromEntries(branches.map((b) => [b, []]));
// Every free slot of one branch (or several), no cap.
const all = (branch: BranchCode | BranchCode[] = "del-valle", extra: Partial<FreeSlotsInput> = {}) =>
  freeSlots({ now: NOW, busy: noBusy([branch].flat()), max: 1000, ...extra });
const hourOf = (start: string) => Number(start.slice(11, 13));
const dateOf = (start: string) => start.slice(0, 10);
const weekdayOf = (start: string) => new Date(`${dateOf(start)}T12:00:00Z`).getUTCDay();

describe("freeSlots at Del Valle (Mon-Fri 9-14 and 16-19)", () => {
  it("only offers weekdays at the allowed hours, with a -06:00 offset", () => {
    const slots = all();
    expect(slots.length).toBeGreaterThan(0);
    for (const s of slots) {
      expect(s.start).toMatch(/-06:00$/);
      expect([9, 10, 11, 12, 13, 16, 17, 18]).toContain(hourOf(s.start));
      expect(weekdayOf(s.start)).not.toBe(0);
      expect(weekdayOf(s.start)).not.toBe(6);
    }
  });

  it("respects the 24 hour lead time and the 14 day horizon", () => {
    const slots = all();
    // Now is Tue 09:00, so the first start is Wed 09:00 (exactly 24 h, inclusive).
    expect(slots[0].start).toBe("2026-10-07T09:00:00-06:00");
    // Horizon is Tue 2026-10-20 09:00 inclusive.
    expect(slots.at(-1)!.start).toBe("2026-10-20T09:00:00-06:00");
    expect(all("del-valle", { now: new Date("2026-10-06T15:00:01Z") })[0].start).toBe("2026-10-07T10:00:00-06:00");
  });

  it("skips the weekend", () => {
    const days = new Set(all().map((s) => dateOf(s.start)));
    expect(days.has("2026-10-10")).toBe(false);
    expect(days.has("2026-10-11")).toBe(false);
    expect(days.has("2026-10-12")).toBe(true);
  });

  it("filters by preferred date", () => {
    const slots = all("del-valle", { preferredDate: "2026-10-13" });
    expect(slots).toHaveLength(8);
    expect(new Set(slots.map((s) => dateOf(s.start)))).toEqual(new Set(["2026-10-13"]));
    expect(all("del-valle", { preferredDate: "2026-10-10" })).toEqual([]);
    expect(all("del-valle", { preferredDate: "2026-10-06" })).toEqual([]);
  });

  it("filters by part of day, morning being before 14:00", () => {
    const morning = all("del-valle", { partOfDay: "morning", preferredDate: "2026-10-13" });
    expect(morning.map((s) => hourOf(s.start))).toEqual([9, 10, 11, 12, 13]);
    const afternoon = all("del-valle", { partOfDay: "afternoon", preferredDate: "2026-10-13" });
    expect(afternoon.map((s) => hourOf(s.start))).toEqual([16, 17, 18]);
  });

  it("fits the whole consultation inside a time window (11:00-14:00 gives 11, 12 and 13)", () => {
    const slots = all("del-valle", { preferredDate: "2026-10-13", timeFrom: "11:00", timeTo: "14:00" });
    expect(slots.map((s) => hourOf(s.start))).toEqual([11, 12, 13]);
    expect(all("del-valle", { preferredDate: "2026-10-13", timeFrom: "13:30", timeTo: "14:00" })).toEqual([]);
  });

  it("excludes slots that overlap a busy interval, including partial overlaps", () => {
    const busy = { "del-valle": [{ start: "2026-10-13T09:30:00-06:00", end: "2026-10-13T11:00:00-06:00" }] };
    const hours = freeSlots({ now: NOW, busy, max: 1000, preferredDate: "2026-10-13" }).map((s) => hourOf(s.start));
    expect(hours).toEqual([11, 12, 13, 16, 17, 18]);
  });

  it("does not treat a busy interval that ends at the slot start as a clash", () => {
    const busy = { "del-valle": [{ start: "2026-10-13T08:00:00-06:00", end: "2026-10-13T09:00:00-06:00" }] };
    expect(freeSlots({ now: NOW, busy, max: 1000, preferredDate: "2026-10-13" }).map((s) => hourOf(s.start))[0]).toBe(9);
  });

  it("returns at most 3 by default and prefers variety across days", () => {
    const slots = freeSlots({ now: NOW, busy: noBusy(["del-valle"]) });
    expect(slots).toHaveLength(3);
    expect(new Set(slots.map((s) => dateOf(s.start))).size).toBe(3);
  });

  it("avoids consecutive hours on one day when other options exist", () => {
    const slots = freeSlots({ now: NOW, busy: noBusy(["del-valle"]), preferredDate: "2026-10-13" });
    expect(slots.map((s) => hourOf(s.start))).toEqual([9, 11, 13]);
  });

  it("falls back to adjacent hours when nothing else is free", () => {
    const slots = freeSlots({ now: NOW, busy: noBusy(["del-valle"]), preferredDate: "2026-10-13", partOfDay: "afternoon" });
    expect(slots.map((s) => hourOf(s.start))).toEqual([16, 17, 18]);
  });
});

describe("per-branch hours", () => {
  const hoursOn = (branch: BranchCode, date: string) => all(branch, { preferredDate: date }).map((s) => hourOf(s.start));

  it("Polanco is Mon-Fri 10:00-18:00 with no break", () => {
    expect(hoursOn("polanco", "2026-10-13")).toEqual([10, 11, 12, 13, 14, 15, 16, 17]);
    expect(hoursOn("polanco", "2026-10-10")).toEqual([]);
  });

  it("Del Valle has a gap between 14:00 and 16:00", () => {
    expect(hoursOn("del-valle", "2026-10-13")).toEqual([9, 10, 11, 12, 13, 16, 17, 18]);
  });

  it("Satélite works Saturday mornings only, 9:00-13:00", () => {
    expect(hoursOn("satelite", "2026-10-13")).toEqual([9, 10, 11, 12, 13]);
    expect(hoursOn("satelite", "2026-10-10")).toEqual([9, 10, 11, 12]);
    expect(hoursOn("satelite", "2026-10-11")).toEqual([]);
  });

  it("only Satélite is offered on a Saturday, nobody on a Sunday", () => {
    const saturday = freeSlots({ now: NOW, busy: noBusy(ALL), max: 1000, preferredDate: "2026-10-10" });
    expect(new Set(saturday.map((s) => s.branch))).toEqual(new Set(["satelite"]));
    expect(freeSlots({ now: NOW, busy: noBusy(ALL), max: 1000, preferredDate: "2026-10-11" })).toEqual([]);
    expect(all(ALL).some((s) => weekdayOf(s.start) === 0)).toBe(false);
  });

  it("tags every slot with its branch", () => {
    const slots = all(ALL, { preferredDate: "2026-10-13" });
    expect(slots.filter((s) => s.branch === "polanco")).toHaveLength(8);
    expect(slots.filter((s) => s.branch === "del-valle")).toHaveLength(8);
    expect(slots.filter((s) => s.branch === "satelite")).toHaveLength(5);
  });
});

describe("across branches", () => {
  it("any variety: three slots, three days, three branches", () => {
    const slots = freeSlots({ now: NOW, busy: noBusy(ALL) });
    expect(slots).toHaveLength(3);
    expect(new Set(slots.map((s) => s.branch)).size).toBe(3);
    expect(new Set(slots.map((s) => dateOf(s.start))).size).toBe(3);
  });

  it("on one day, still spreads over branches", () => {
    const slots = freeSlots({ now: NOW, busy: noBusy(ALL), preferredDate: "2026-10-13" });
    expect(new Set(slots.map((s) => s.branch)).size).toBe(3);
  });

  it("searches only the branches it is given (the branch filter)", () => {
    const slots = freeSlots({ now: NOW, busy: noBusy(["polanco"]) });
    expect(slots).toHaveLength(3);
    expect(new Set(slots.map((s) => s.branch))).toEqual(new Set(["polanco"]));
  });

  it("a busy slot at one branch does not block the same time at another", () => {
    const busy = { ...noBusy(ALL), "del-valle": [{ start: "2026-10-13T09:00:00-06:00", end: "2026-10-13T10:00:00-06:00" }] };
    const slots = freeSlots({ now: NOW, busy, max: 1000, preferredDate: "2026-10-13", partOfDay: "morning" });
    expect(slots.some((s) => s.branch === "del-valle" && hourOf(s.start) === 9)).toBe(false);
    expect(slots.some((s) => s.branch === "satelite" && hourOf(s.start) === 9)).toBe(true);
  });
});

describe("labels", () => {
  it("writes Spanish labels with the right period of the day", () => {
    expect(labelOf(Date.parse("2026-10-13T09:00:00-06:00"))).toBe("martes 13 de octubre a las 9:00 de la mañana");
    expect(labelOf(Date.parse("2026-10-13T17:00:00-06:00"))).toBe("martes 13 de octubre a las 5:00 de la tarde");
    expect(labelOf(Date.parse("2026-10-13T12:00:00-06:00"))).toBe("martes 13 de octubre a las 12:00 del día");
    expect(labelOf(Date.parse("2026-10-14T13:00:00-06:00"))).toBe("miércoles 14 de octubre a la 1:00 de la tarde");
  });

  it("labels the same instant the same way whatever offset the start string carries", () => {
    expect(describeStart("2026-10-13T15:00:00Z").label).toBe("martes 13 de octubre a las 9:00 de la mañana");
  });
});

describe("resolveSlot", () => {
  it("accepts an offered slot and returns its end", () => {
    const slot = resolveSlot("2026-10-13T09:00:00-06:00", NOW, "del-valle");
    expect(slot).toMatchObject({ start: "2026-10-13T09:00:00-06:00", end: "2026-10-13T10:00:00-06:00" });
  });

  it("accepts an equivalent UTC instant", () => {
    expect(resolveSlot("2026-10-13T15:00:00Z", NOW, "del-valle")?.start).toBe("2026-10-13T09:00:00-06:00");
  });

  it.each([
    ["off the hour grid", "2026-10-13T09:30:00-06:00"],
    ["lunch gap", "2026-10-13T14:00:00-06:00"],
    ["after hours", "2026-10-13T19:00:00-06:00"],
    ["weekend", "2026-10-10T09:00:00-06:00"],
    ["inside 24 h", "2026-10-06T18:00:00-06:00"],
    ["beyond 14 days", "2026-10-21T09:00:00-06:00"],
    ["no offset", "2026-10-13T09:00:00"],
    ["garbage", "mañana"],
  ])("rejects %s", (_name, start) => {
    expect(resolveSlot(start, NOW, "del-valle")).toBeNull();
  });

  it("validates against the branch asked for, not any branch", () => {
    // 09:00 is a Del Valle start but not a Polanco one; Saturday is Satélite only; 14:00 is a Polanco start only.
    expect(resolveSlot("2026-10-13T09:00:00-06:00", NOW, "polanco")).toBeNull();
    expect(resolveSlot("2026-10-10T09:00:00-06:00", NOW, "del-valle")).toBeNull();
    expect(resolveSlot("2026-10-10T09:00:00-06:00", NOW, "satelite")).not.toBeNull();
    expect(resolveSlot("2026-10-13T14:00:00-06:00", NOW, "polanco")).not.toBeNull();
    expect(resolveSlot("2026-10-13T14:00:00-06:00", NOW, "satelite")).toBeNull();
  });
});

describe("busyRange", () => {
  it("covers the whole window plus the last slot", () => {
    const { from, to } = busyRange(NOW);
    expect(from).toBe("2026-10-07T15:00:00.000Z");
    expect(to).toBe("2026-10-20T16:00:00.000Z");
  });
});
