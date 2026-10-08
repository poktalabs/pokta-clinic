// Turns an exported conversation into a timeline the /review page can play, seek and scrub, and folds
// it into the same state the /explainer panels render (Stage, tool Calls, Expediente) at any second.
// Pure: the player only asks "what does the system look like at t?", so seeking backwards is free.
import { EMPTY_EXPEDIENTE, STAGES, applyResult, stageFromNode, type Call, type Expediente, type Stage } from "@/explainer/model";
import type { ReviewConversation, ReviewToolCall, ReviewToolResult } from "./export";

// A tool call made during the call. Workflow moves are not here: they are Transitions.
export type ReplayCall = {
  id: string;
  index: number;
  tool: string;
  type: string;
  start: number;
  end: number;
  stage: Stage | null;
  request: ReviewToolCall;
  response: ReviewToolResult | null;
};

export type Transition = { id: string; at: number; to: string; stage: Stage | null; edge: string | null; request: ReviewToolCall; response: ReviewToolResult };

export type TranscriptItem =
  | { kind: "turn"; key: string; at: number; role: "agent" | "user"; text: string; interrupted: boolean }
  | { kind: "tool"; key: string; at: number; callId: string; tool: string; type: string }
  | { kind: "transition"; key: string; at: number; transitionId: string; to: string };

export type Replay = {
  duration: number;
  startUnix: number;
  calls: ReplayCall[];
  transitions: Transition[];
  items: TranscriptItem[];
  stageEvents: { at: number; stage: Stage }[];
};

// A result that arrives in the same transcript second as its call still shows as "calling" briefly.
const MIN_PENDING_SECS = 0.6;

export function buildReplay(conv: ReviewConversation, audioDuration: number | null = null): Replay {
  const results = new Map<string, { at: number; result: ReviewToolResult }>();
  for (const turn of conv.transcript) for (const r of turn.tool_results) results.set(r.request_id, { at: turn.time_in_call_secs, result: r });

  const calls: ReplayCall[] = [];
  const transitions: Transition[] = [];
  const items: TranscriptItem[] = [];
  const stageEvents: { at: number; stage: Stage }[] = [];
  let node: string | null = null;

  conv.transcript.forEach((turn, i) => {
    const at = turn.time_in_call_secs;
    // The node an agent turn was produced in; covers moves the platform did not report as a workflow tool.
    if (turn.role === "agent" && turn.node && turn.node !== node) {
      node = turn.node;
      const stage = stageFromNode(turn.node);
      if (stage) stageEvents.push({ at, stage });
    }
    if (turn.message && turn.message.trim()) {
      items.push({ kind: "turn", key: `t${i}`, at, role: turn.role, text: turn.message.trim(), interrupted: turn.interrupted });
    }
    for (const call of turn.tool_calls) {
      const found = results.get(call.request_id);
      const response = found?.result ?? null;
      if (call.type === "workflow") {
        if (!response?.transition) continue;
        const end = found ? Math.max(found.at, at) : at;
        const stage = stageFromNode(response.transition.to);
        const id = call.request_id || `w${i}`;
        transitions.push({ id, at: end, to: response.transition.to, stage, edge: response.transition.edge, request: call, response });
        items.push({ kind: "transition", key: `w${id}`, at: end, transitionId: id, to: response.transition.to });
        if (stage) stageEvents.push({ at: end, stage });
        continue;
      }
      const latency = response?.latency_secs ?? 0;
      const end = found ? Math.max(found.at, at + Math.max(latency, MIN_PENDING_SECS)) : at + MIN_PENDING_SECS;
      const id = call.request_id || `c${i}-${calls.length}`;
      const stage = node ? stageFromNode(node) : null;
      calls.push({ id, index: calls.length, tool: call.tool_name, type: call.type, start: at, end, stage, request: call, response });
      items.push({ kind: "tool", key: `c${id}`, at, callId: id, tool: call.tool_name, type: call.type });
      // A red flag moves the call to Escalation as soon as the tool fires, as on the live page.
      if (call.type === "webhook" && call.tool_name === "escalate") stageEvents.push({ at, stage: "escalation" });
    }
  });

  stageEvents.sort((a, b) => a.at - b.at);
  const last = Math.max(0, ...conv.transcript.map((t) => t.time_in_call_secs), ...calls.map((c) => c.end), ...transitions.map((t) => t.at));
  return {
    duration: Math.max(audioDuration ?? 0, conv.metadata.call_duration_secs ?? 0, last),
    startUnix: conv.metadata.start_time_unix_secs ?? 0,
    calls,
    transitions,
    items,
    stageEvents,
  };
}

export type ReplayState = {
  stage: Stage | null;
  reachedIndex: number;
  calls: Call[];
  expediente: Expediente;
  currentTurnKey: string | null;
  currentCallId: string | null;
};

export function parseObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export function stateAt(replay: Replay, t: number): ReplayState {
  let stage: Stage | null = null;
  let reachedIndex = -1;
  for (const e of replay.stageEvents) {
    if (e.at > t) break;
    stage = e.stage;
    reachedIndex = Math.max(reachedIndex, STAGES.findIndex((s) => s.id === e.stage));
  }

  // The system diagram follows the webhook tools: the ones that reach the PoktaClinic API.
  const calls: Call[] = [];
  let expediente = EMPTY_EXPEDIENTE;
  let currentCallId: string | null = null;
  for (const c of replay.calls) {
    if (c.start > t) break;
    currentCallId = c.id;
    if (c.type !== "webhook") continue;
    const done = c.end <= t;
    const call: Call = {
      id: c.id,
      tool: c.tool,
      startedAt: (replay.startUnix + c.start) * 1000,
      done,
      isError: done && (c.response?.is_error ?? false),
      result: done ? parseObject(c.response?.result) : null,
      ms: done && c.response?.latency_secs != null ? Math.round(c.response.latency_secs * 1000) : undefined,
    };
    calls.push(call);
    if (done) expediente = applyResult(expediente, call);
  }

  let currentTurnKey: string | null = null;
  // Transcript order, not time order: a workflow move is listed where it was called but lands later.
  for (const item of replay.items) if (item.kind === "turn" && item.at <= t) currentTurnKey = item.key;

  return { stage, reachedIndex, calls, expediente, currentTurnKey, currentCallId };
}

export function formatClock(secs: number): string {
  const s = Math.max(0, Math.floor(secs));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
