import { describe, expect, it } from "vitest";
import { DECISIONS, KEY_ORDER } from "./data";
import { ROADMAP } from "./roadmap";
import { VIDEO, spokenWords } from "./video";

describe("decision log content", () => {
  it("orders exactly the key decisions for present mode", () => {
    const keyed = DECISIONS.filter((d) => d.key).map((d) => d.id);
    expect([...KEY_ORDER].sort()).toEqual([...keyed].sort());
  });

  it("keeps every summary to one short sentence", () => {
    for (const item of [...DECISIONS, ...ROADMAP]) expect(item.summary.split(/\s+/).length, item.id).toBeLessThanOrEqual(22);
  });

  it("leads the video with exactly 5 items, each condensing existing decisions", () => {
    const ids = new Set(DECISIONS.map((d) => d.id));
    expect(VIDEO).toHaveLength(5);
    for (const v of VIDEO) for (const c of v.cards) expect(ids.has(c.id), c.id).toBe(true);
    expect(new Set(VIDEO.map((v) => v.cards[0].id)).size).toBe(VIDEO.length);
  });

  it("keeps each video item to about 20 seconds spoken (title, what and why)", () => {
    for (const v of VIDEO) expect(spokenWords(v), v.title).toBeLessThanOrEqual(40);
  });

  it("uses no em-dashes", () => {
    expect(JSON.stringify([DECISIONS, ROADMAP, VIDEO])).not.toContain("\u2014");
  });
});
