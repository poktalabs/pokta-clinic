import { beforeAll, describe, expect, it } from "vitest";
import { patientLinkToken, verifyPatientLink } from "./token";

beforeAll(() => {
  process.env.TOOL_SECRET = "test-secret";
});

describe("patient link token", () => {
  const now = new Date("2026-10-07T12:00:00Z");
  it("round-trips the patient id", () => {
    expect(verifyPatientLink(patientLinkToken("abc-123", now), now)).toBe("abc-123");
  });
  it("rejects a tampered token", () => {
    const [id, exp, sig] = patientLinkToken("abc-123", now).split(".");
    expect(verifyPatientLink(`${Buffer.from("other").toString("base64url")}.${exp}.${sig}`, now)).toBeNull();
    expect(verifyPatientLink(`${id}.${Number(exp) + 1}.${sig}`, now)).toBeNull();
  });
  it("expires after 14 days", () => {
    const token = patientLinkToken("abc-123", now);
    expect(verifyPatientLink(token, new Date("2026-10-22T12:00:00Z"))).toBeNull();
  });
});
