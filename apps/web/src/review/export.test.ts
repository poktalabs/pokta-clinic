import { describe, expect, it } from "vitest";
import { REDACTED, cleanUrl, findConfigSecrets, redactPaths, toReviewConversation } from "./export";
import { RAW_CONVERSATION } from "./fixture";

describe("toReviewConversation", () => {
  const conv = toReviewConversation(RAW_CONVERSATION);
  const text = JSON.stringify(conv);

  it("keeps the call, its timings, tool params, results and analysis", () => {
    expect(conv.conversation_id).toBe("conv_test1");
    expect(conv.metadata).toMatchObject({ call_duration_secs: 60, main_language: "es", source: "react_sdk" });
    expect(conv.transcript).toHaveLength(9);
    expect(conv.transcript[2]?.tool_calls[0]).toMatchObject({ tool_name: "record_consent", params: { granted: true }, body: { conversation_id: "conv_test1", granted: true } });
    expect(conv.transcript[3]?.tool_results[0]).toMatchObject({ latency_secs: 0.25, result: { ok: true, granted: true } });
    expect(conv.analysis.evaluation_criteria).toEqual([{ id: "consent_first", result: "success", rationale: "Consent came first." }]);
    expect(conv.analysis.data_collection[0]).toMatchObject({ id: "consent_granted", value: true, description: "True if consent." });
  });

  it("drops client data, charging, headers and query strings, and redacts secret-named keys", () => {
    expect(text).not.toContain("private@example.com");
    expect(text).not.toContain("conversation_history");
    expect(text).not.toContain("charging");
    expect(text).not.toContain("headers");
    expect(text).not.toContain("sig=abc");
    expect(text).not.toContain("leak");
    expect(conv.transcript[2]?.tool_calls[0]?.url).toBe("https://example.com/api/tools/record_consent");
  });

  it("reduces a workflow result to its transition", () => {
    const r = conv.transcript[5]?.tool_results[0];
    expect(r?.transition).toEqual({ edge: "consent_to_identification", to: "identification" });
    expect(r?.result).toEqual({ transition: { edge: "consent_to_identification", to: "identification" } });
  });

  it("rejects something that is not a conversation", () => {
    expect(() => toReviewConversation({})).toThrow();
  });
});

describe("config secret check", () => {
  it("accepts secret references and flags literal secret headers and key-shaped values", () => {
    const ok = { api_schema: { request_headers: { "x-pokta-tool-secret": { secret_id: "abc123" } } } };
    expect(findConfigSecrets(ok)).toEqual([]);
    const bad = { api_schema: { request_headers: { "x-pokta-tool-secret": "plain-value" } }, note: "sk_abcdefghijklmnopqrstuv" };
    const hits = findConfigSecrets(bad);
    expect(hits).toEqual(["$.api_schema.request_headers.x-pokta-tool-secret", "$.note"]);
    expect(redactPaths(bad, hits)).toEqual({ api_schema: { request_headers: { "x-pokta-tool-secret": REDACTED } }, note: REDACTED });
  });

  it("cleans URLs", () => {
    expect(cleanUrl("https://user:pw@host.test/a/b?token=1#x")).toBe("https://host.test/a/b");
  });
});
