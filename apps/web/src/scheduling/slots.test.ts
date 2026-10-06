import { describe, expect, it } from "vitest";
import { busyRange, describeStart, freeSlots, labelOf, resolveSlot } from "./slots";

// Tuesday 2026-10-06 09:00 in Mexico City (UTC-6).
const NOW = new Date("2026-10-06T15:00:00Z");
const all = (extra: Partial<Parameters<typeof freeSlots>[0]> = {}) => freeSlots({ now: NOW, busy: [], max: 1000, ...extra });
const hourOf = (start: string) => Number(start.slice(11, 13));
const dateOf = (start: string) => start.slice(0, 10);

describe("freeSlots", () => {
  it("only offers weekdays at the allowed hours, with a -06:00 offset", () => {
    const slots = all();
    expect(slots.length).toBeGreaterThan(0);
    for (const s of slots) {
      expect(s.start).toMatch(/-06:00$/);
      expect([9, 10, 11, 12, 13, 16, 17, 18]).toContain(hourOf(s.start));
      const weekday = new Date(`${dateOf(s.start)}T12:00:00Z`).getUTCDay();
      expect(weekday).not.toBe(0);
      expect(weekday).not.toBe(6);
    }
  });

  it("respects the 24 hour lead time and the 14 day horizon", () => {
    const slots = all();
    // Now is Tue 09:00, so the first start is Wed 09:00 (exactly 24 h, inclusive).
    expect(slots[0].start).toBe("2026-10-07T09:00:00-06:00");
    // Horizon is Tue 2026-10-20 09:00 inclusive.
    expect(slots.at(-1)!.start).toBe("2026-10-20T09:00:00-06:00");
    expect(all({ now: new Date("2026-10-06T15:00:01Z") })[0].start).toBe("2026-10-07T10:00:00-06:00");
  });

  it("skips the weekend", () => {
    const days = new Set(all().map((s) => dateOf(s.start)));
    expect(days.has("2026-10-10")).toBe(false);
    expect(days.has("2026-10-11")).toBe(false);
    expect(days.has("2026-10-12")).toBe(true);
  });

  it("filters by preferred date", () => {
    const slots = all({ preferredDate: "2026-10-13" });
    expect(slots).toHaveLength(8);
    expect(new Set(slots.map((s) => dateOf(s.start)))).toEqual(new Set(["2026-10-13"]));
    expect(all({ preferredDate: "2026-10-10" })).toEqual([]);
    expect(all({ preferredDate: "2026-10-06" })).toEqual([]);
  });

  it("filters by part of day, morning being before 14:00", () => {
    const morning = all({ partOfDay: "morning", preferredDate: "2026-10-13" });
    expect(morning.map((s) => hourOf(s.start))).toEqual([9, 10, 11, 12, 13]);
    const afternoon = all({ partOfDay: "afternoon", preferredDate: "2026-10-13" });
    expect(afternoon.map((s) => hourOf(s.start))).toEqual([16, 17, 18]);
  });

  it("excludes slots that overlap a busy interval, including partial overlaps", () => {
    const busy = [{ start: "2026-10-13T09:30:00-06:00", end: "2026-10-13T11:00:00-06:00" }];
    const hours = all({ preferredDate: "2026-10-13", busy }).map((s) => hourOf(s.start));
    expect(hours).toEqual([11, 12, 13, 16, 17, 18]);
  });

  it("does not treat a busy interval that ends at the slot start as a clash", () => {
    const busy = [{ start: "2026-10-13T08:00:00-06:00", end: "2026-10-13T09:00:00-06:00" }];
    expect(all({ preferredDate: "2026-10-13", busy }).map((s) => hourOf(s.start))[0]).toBe(9);
  });

  it("returns at most 3 by default and prefers variety across days", () => {
    const slots = freeSlots({ now: NOW, busy: [] });
    expect(slots).toHaveLength(3);
    expect(new Set(slots.map((s) => dateOf(s.start))).size).toBe(3);
  });

  it("avoids consecutive hours on one day when other options exist", () => {
    const slots = freeSlots({ now: NOW, busy: [], preferredDate: "2026-10-13" });
    const hours = slots.map((s) => hourOf(s.start));
    expect(hours).toEqual([9, 11, 13]);
  });

  it("falls back to adjacent hours when nothing else is free", () => {
    const slots = freeSlots({ now: NOW, busy: [], preferredDate: "2026-10-13", partOfDay: "afternoon" });
    expect(slots.map((s) => hourOf(s.start))).toEqual([16, 17, 18]);
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
    const slot = resolveSlot("2026-10-13T09:00:00-06:00", NOW);
    expect(slot).toMatchObject({ start: "2026-10-13T09:00:00-06:00", end: "2026-10-13T10:00:00-06:00" });
  });

  it("accepts an equivalent UTC instant", () => {
    expect(resolveSlot("2026-10-13T15:00:00Z", NOW)?.start).toBe("2026-10-13T09:00:00-06:00");
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
    expect(resolveSlot(start, NOW)).toBeNull();
  });
});

describe("busyRange", () => {
  it("covers the whole window plus the last slot", () => {
    const { from, to } = busyRange(NOW);
    expect(from).toBe("2026-10-07T15:00:00.000Z");
    expect(to).toBe("2026-10-20T16:00:00.000Z");
  });
});
