import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));

const { issueToken, passwordMatches, tokenValid, SESSION_SECONDS } = await import("./session");

beforeEach(() => {
  vi.stubEnv("ADMIN_PASSWORD", "correct horse");
  vi.stubEnv("ADMIN_SESSION_SECRET", "");
});
afterEach(() => vi.unstubAllEnvs());

describe("admin session", () => {
  it("accepts only the right password", () => {
    expect(passwordMatches("correct horse")).toBe(true);
    expect(passwordMatches("correct horse ")).toBe(false);
    expect(passwordMatches("")).toBe(false);
  });
  it("accepts a fresh token and rejects expired, tampered and foreign ones", () => {
    const now = 1_800_000_000_000;
    const token = issueToken(now);
    expect(tokenValid(token, now + 1000)).toBe(true);
    expect(tokenValid(token, now + (SESSION_SECONDS + 1) * 1000)).toBe(false);
    const [exp, sig] = token.split(".");
    expect(tokenValid(`${Number(exp) + 99999}.${sig}`, now)).toBe(false);
    expect(tokenValid(`${exp}.${"0".repeat(sig.length)}`, now)).toBe(false);
    expect(tokenValid(undefined, now)).toBe(false);
    expect(tokenValid("garbage", now)).toBe(false);
  });
  it("invalidates sessions when the password changes (derived key)", () => {
    const token = issueToken(1_800_000_000_000);
    vi.stubEnv("ADMIN_PASSWORD", "another one");
    expect(tokenValid(token, 1_800_000_001_000)).toBe(false);
  });
  it("uses ADMIN_SESSION_SECRET when set, independent of the password", () => {
    vi.stubEnv("ADMIN_SESSION_SECRET", "s3cret");
    const token = issueToken(1_800_000_000_000);
    vi.stubEnv("ADMIN_PASSWORD", "changed");
    expect(tokenValid(token, 1_800_000_001_000)).toBe(true);
  });
});
