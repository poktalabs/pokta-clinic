import { describe, expect, it } from "vitest";
import { DECISIONS, KEY_ORDER } from "./data";
import { ROADMAP } from "./roadmap";

describe("decision log content", () => {
  it("orders exactly the key decisions for present mode", () => {
    const keyed = DECISIONS.filter((d) => d.key).map((d) => d.id);
    expect([...KEY_ORDER].sort()).toEqual([...keyed].sort());
  });

  it("keeps every summary to one short sentence", () => {
    for (const item of [...DECISIONS, ...ROADMAP]) expect(item.summary.split(/\s+/).length, item.id).toBeLessThanOrEqual(22);
  });

  it("uses no em-dashes", () => {
    expect(JSON.stringify([DECISIONS, ROADMAP])).not.toContain("\u2014");
  });
});
