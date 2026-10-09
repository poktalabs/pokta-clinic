import { describe, expect, it } from "vitest";
import { GAPS, GROUPS } from "./data";
import { VIDEO, spokenWords } from "./video";

describe("production gaps content", () => {
  it("gives every gap a unique id and a known group", () => {
    expect(new Set(GAPS.map((g) => g.id)).size).toBe(GAPS.length);
    const groups = new Set(GROUPS.map((g) => g.id));
    for (const g of GAPS) expect(groups.has(g.group), g.id).toBe(true);
  });

  it("keeps every summary to one short sentence", () => {
    for (const g of GAPS) expect(g.summary.split(/\s+/).length, g.id).toBeLessThanOrEqual(24);
  });

  it("leads the video with exactly 5 distinct gaps from the full list", () => {
    const ids = new Set(GAPS.map((g) => g.id));
    expect(VIDEO).toHaveLength(5);
    for (const v of VIDEO) expect(ids.has(v.id), v.id).toBe(true);
    expect(new Set(VIDEO.map((v) => v.id)).size).toBe(VIDEO.length);
  });

  it("keeps each video gap to about 12 seconds spoken (title, gap and fix)", () => {
    for (const v of VIDEO) expect(spokenWords(v), v.title).toBeLessThanOrEqual(34);
  });

  it("gives every gap at least one source", () => {
    for (const g of GAPS) expect(g.evidence.length, g.id).toBeGreaterThan(0);
  });

  it("uses no em-dashes", () => {
    expect(JSON.stringify([GAPS, VIDEO])).not.toContain("\u2014");
  });
});
