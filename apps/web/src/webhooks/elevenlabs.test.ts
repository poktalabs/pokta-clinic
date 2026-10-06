import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseWebhook, verifySignature } from "./elevenlabs";

// Known vector, also reproduced with `openssl dgst -sha256 -hmac`: HMAC-SHA256(secret, `${t}.${body}`).
const SECRET = "wsec_test_secret";
const BODY = '{"type":"post_call_transcription","event_timestamp":1700000000,"data":{"conversation_id":"conv_test"}}';
const T = 1700000000;
const SIG = "52f36539aba011ba92541c49fc0c16555f2fdc49879f8ec2c10e532749ebd004";
const NOW = T * 1000 + 60_000;

describe("verifySignature", () => {
  it("accepts the known vector", () => {
    expect(verifySignature(BODY, `t=${T},v0=${SIG}`, SECRET, NOW)).toBe(true);
  });
  it("accepts any header part order and spaces", () => {
    expect(verifySignature(BODY, `v0=${SIG}, t=${T}`, SECRET, NOW)).toBe(true);
  });
  it("rejects a changed body, secret, timestamp or signature", () => {
    expect(verifySignature(BODY + " ", `t=${T},v0=${SIG}`, SECRET, NOW)).toBe(false);
    expect(verifySignature(BODY, `t=${T},v0=${SIG}`, "other", NOW)).toBe(false);
    expect(verifySignature(BODY, `t=${T + 1},v0=${SIG}`, SECRET, NOW)).toBe(false);
    expect(verifySignature(BODY, `t=${T},v0=${SIG.replace(/.$/, "0")}`, SECRET, NOW)).toBe(false);
  });
  it("rejects missing or malformed headers", () => {
    expect(verifySignature(BODY, null, SECRET, NOW)).toBe(false);
    expect(verifySignature(BODY, `v0=${SIG}`, SECRET, NOW)).toBe(false);
    expect(verifySignature(BODY, `t=${T}`, SECRET, NOW)).toBe(false);
    expect(verifySignature(BODY, `t=abc,v0=${SIG}`, SECRET, NOW)).toBe(false);
    expect(verifySignature(BODY, `t=${T},v0=${SIG}`, "", NOW)).toBe(false);
  });
  it("enforces the 30 minute tolerance in both directions", () => {
    const sign = (t: number) => `t=${t},v0=${createHmac("sha256", SECRET).update(`${t}.${BODY}`).digest("hex")}`;
    expect(verifySignature(BODY, sign(T), SECRET, T * 1000 + 29 * 60_000)).toBe(true);
    expect(verifySignature(BODY, sign(T), SECRET, T * 1000 + 31 * 60_000)).toBe(false);
    expect(verifySignature(BODY, sign(T + 3600), SECRET, T * 1000)).toBe(false);
  });
});

describe("parseWebhook", () => {
  it("maps a post_call_transcription", () => {
    const parsed = parseWebhook(
      {
        type: "post_call_transcription",
        data: {
          agent_id: "agent_1",
          conversation_id: "conv_1",
          status: "done",
          transcript: [
            { role: "agent", message: "Hola", time_in_call_secs: 0, agent_metadata: { workflow_node_id: "consent" } },
            { role: "agent", message: null, tool_calls: [{ tool_name: "record_consent", params_as_json: "{}" }] },
          ],
          metadata: { call_duration_secs: 42 },
          analysis: { call_successful: "success", transcript_summary: "ok", data_collection_results: { phone: { value: "x", rationale: "r" } }, evaluation_criteria_results: { consent: { result: "success" } } },
        },
      },
      5,
    );
    expect(parsed?.record).toMatchObject({ id: "conv_1", status: "done", durationSecs: 42, receivedAt: 5, callSuccessful: "success" });
    expect(parsed?.record?.transcript[0]).toMatchObject({ role: "agent", text: "Hola", nodeId: "consent" });
    expect(parsed?.record?.transcript[1].toolCalls).toEqual([{ name: "record_consent", params: "{}" }]);
    expect(parsed?.record?.dataCollection.phone).toEqual({ value: "x", rationale: "r" });
    expect(parsed?.record?.evaluation.consent.result).toBe("success");
  });
  it("acknowledges other event types without a record and rejects junk", () => {
    expect(parseWebhook({ type: "post_call_audio", data: { conversation_id: "c" } })).toEqual({ type: "post_call_audio", record: null });
    expect(parseWebhook("nope")).toBeNull();
  });
});
