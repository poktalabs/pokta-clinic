import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { ConversationRecord } from "@/store";

// ElevenLabs signs the raw body: header `ElevenLabs-Signature: t=<unix seconds>,v0=<hex>` where
// v0 = HMAC-SHA256(secret, `${t}.${rawBody}`). Same scheme as `constructEvent` in the official SDK,
// whose tolerance is 30 minutes (the docs page does not spell it out).
export const SIGNATURE_HEADER = "elevenlabs-signature";
export const TOLERANCE_SECONDS = 30 * 60;

export function verifySignature(rawBody: string, header: string | null, secret: string, nowMs = Date.now()): boolean {
  if (!header || !secret) return false;
  const parts = header.split(",").map((p) => p.trim());
  const timestamp = parts.find((p) => p.startsWith("t="))?.slice(2);
  const signature = parts.find((p) => p.startsWith("v0="));
  if (!timestamp || !signature || !/^\d+$/.test(timestamp)) return false;
  // Both directions: an old signature is a replay, a far-future one is a forged clock.
  if (Math.abs(nowMs / 1000 - Number(timestamp)) > TOLERANCE_SECONDS) return false;
  const expected = `v0=${createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex")}`;
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Lenient on purpose: ElevenLabs adds fields over time and the page only needs a few. Unknown shapes
// are dropped instead of failing the webhook (a non-2xx makes ElevenLabs retry and eventually disable it).
const Turn = z
  .object({
    role: z.string(),
    message: z.string().nullish(),
    time_in_call_secs: z.number().nullish(),
    agent_metadata: z.object({ workflow_node_id: z.string().nullish() }).partial().nullish(),
    tool_calls: z.array(z.object({ tool_name: z.string(), params_as_json: z.string().nullish() }).partial()).nullish(),
  })
  .partial({ message: true });

const Payload = z.object({
  type: z.string(),
  event_timestamp: z.number().optional(),
  data: z.object({
    agent_id: z.string().nullish(),
    conversation_id: z.string().min(1).max(200),
    status: z.string().nullish(),
    transcript: z.array(Turn).default([]),
    metadata: z
      .object({ start_time_unix_secs: z.number().nullish(), call_duration_secs: z.number().nullish() })
      .partial()
      .nullish(),
    analysis: z
      .object({
        call_successful: z.string().nullish(),
        transcript_summary: z.string().nullish(),
        data_collection_results: z.record(z.string(), z.object({ value: z.unknown().optional(), rationale: z.string().nullish() }).partial()).nullish(),
        evaluation_criteria_results: z.record(z.string(), z.object({ result: z.string().nullish(), rationale: z.string().nullish() }).partial()).nullish(),
      })
      .partial()
      .nullish(),
  }),
});

export type ParsedWebhook = { type: string; record: ConversationRecord | null };

// Only post_call_transcription carries a transcript; other event types are acknowledged and ignored.
export function parseWebhook(body: unknown, now = Date.now()): ParsedWebhook | null {
  const parsed = Payload.safeParse(body);
  if (!parsed.success) return null;
  const { type, data } = parsed.data;
  if (type !== "post_call_transcription") return { type, record: null };
  const analysis = data.analysis ?? {};
  return {
    type,
    record: {
      id: data.conversation_id,
      agentId: data.agent_id ?? null,
      status: data.status ?? "unknown",
      receivedAt: now,
      startedAt: data.metadata?.start_time_unix_secs ? data.metadata.start_time_unix_secs * 1000 : null,
      durationSecs: data.metadata?.call_duration_secs ?? null,
      summary: analysis.transcript_summary ?? null,
      callSuccessful: analysis.call_successful ?? null,
      transcript: data.transcript.map((t) => ({
        role: t.role,
        text: t.message ?? "",
        nodeId: t.agent_metadata?.workflow_node_id ?? null,
        toolCalls: (t.tool_calls ?? []).filter((c) => c.tool_name).map((c) => ({ name: c.tool_name!, params: c.params_as_json ?? "" })),
        atSecs: t.time_in_call_secs ?? null,
      })),
      dataCollection: Object.fromEntries(Object.entries(analysis.data_collection_results ?? {}).map(([k, v]) => [k, { value: v.value ?? null, rationale: v.rationale ?? null }])),
      evaluation: Object.fromEntries(Object.entries(analysis.evaluation_criteria_results ?? {}).map(([k, v]) => [k, { result: v.result ?? "unknown", rationale: v.rationale ?? null }])),
    },
  };
}
