import { describe, expect, it } from "vitest";
import { toReviewConversation } from "./export";
import { RAW_CONVERSATION } from "./fixture";
import { buildReplay, formatClock, stateAt } from "./replay";

const replay = buildReplay(toReviewConversation(RAW_CONVERSATION));

describe("buildReplay", () => {
  it("separates tool calls from workflow moves and keeps transcript order", () => {
    expect(replay.calls.map((c) => [c.tool, c.start, c.stage])).toEqual([
      ["record_consent", 10, "consent"],
      ["save_patient", 20, "identification"],
    ]);
    expect(replay.transitions.map((t) => [t.to, t.at, t.edge])).toEqual([["identification", 12, "consent_to_identification"]]);
    expect(replay.items.map((i) => i.kind)).toEqual(["turn", "turn", "tool", "transition", "turn", "tool"]);
    expect(replay.duration).toBe(60);
  });

  it("shows a same-second result as pending for a moment", () => {
    expect(replay.calls[0]?.end).toBeCloseTo(10.6);
    expect(replay.calls[1]?.end).toBe(21);
  });
});

describe("stateAt", () => {
  it("starts in Consent with nothing written", () => {
    const s = stateAt(replay, 0);
    expect(s.stage).toBe("consent");
    expect(s.calls).toEqual([]);
    expect(s.expediente.consent).toBeNull();
    expect(s.currentTurnKey).toBe("t0");
  });

  it("shows a call in flight, then its result in the Expediente", () => {
    const during = stateAt(replay, 10.2);
    expect(during.calls[0]).toMatchObject({ tool: "record_consent", done: false });
    expect(during.expediente.consent).toBeNull();
    const after = stateAt(replay, 11);
    expect(after.calls[0]).toMatchObject({ done: true, ms: 250 });
    expect(after.expediente.consent?.granted).toBe(true);
  });

  it("moves stages on workflow transitions and records the EHR patient id", () => {
    const s = stateAt(replay, 30);
    expect(s.stage).toBe("identification");
    expect(s.reachedIndex).toBe(1);
    expect(s.expediente.patient).toEqual({ id: "9dc20b62-37a4-4e0a-8a2f-0bae93fbe9ce", name: "Lucía", folio: "EXP-1", returning: false });
    expect(s.currentTurnKey).toBe("t6");
  });

  it("seeks backwards cleanly", () => {
    stateAt(replay, 30);
    expect(stateAt(replay, 6).expediente.patient).toBeNull();
  });
});

it("formats a clock", () => {
  expect(formatClock(437.2)).toBe("7:17");
});
