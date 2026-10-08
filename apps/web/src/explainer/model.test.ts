import { describe, expect, it } from "vitest";
import { EMPTY_EXPEDIENTE, applyResult, stageFromNode, type Call } from "./model";

const call = (tool: string, result: Record<string, unknown>): Call => ({ id: "1", tool, startedAt: 0, done: true, isError: false, result });

describe("applyResult patient id", () => {
  it("keeps the EHR patient id from find_patient and save_patient, for the EHR console links", () => {
    expect(applyResult(EMPTY_EXPEDIENTE, call("find_patient", { ok: true, found: true, patient_id: "p-1", given_name: "Rolando" })).patient).toEqual({ id: "p-1", name: "Rolando", folio: null, returning: true });
    expect(applyResult(EMPTY_EXPEDIENTE, call("save_patient", { ok: true, patient_id: "p-2", folio: "EXP-1", given_name: "Lucía" })).patient?.id).toBe("p-2");
    expect(applyResult(EMPTY_EXPEDIENTE, call("save_patient", { ok: true, given_name: "Lucía" })).patient?.id).toBeNull();
  });
});

it("maps workflow nodes to Stages", () => {
  expect(stageFromNode("end_node")).toBe("end");
  expect(stageFromNode("nope")).toBeNull();
});
