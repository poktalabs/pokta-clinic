// Turns a stored ElevenLabs conversation (GET /v1/convai/conversations/{id}) into the trimmed,
// public file the /review page replays. Whitelist only: every field kept is named here, so new API
// fields (dynamic variables, charging, client data, traces) never leak into the export by default.
// Pure and dependency-free: the export script (scripts/export-conversation.ts) and the tests import it.

export type ReviewToolCall = {
  request_id: string;
  type: string;
  tool_name: string;
  params: unknown;
  method: string | null;
  url: string | null;
  body: unknown;
};

export type ReviewToolResult = {
  request_id: string;
  type: string;
  tool_name: string;
  is_error: boolean;
  latency_secs: number | null;
  result: unknown;
  // Workflow moves only: the edge taken and the node it leads to.
  transition: { edge: string | null; to: string } | null;
};

export type ReviewTurn = {
  role: "agent" | "user";
  time_in_call_secs: number;
  message: string | null;
  interrupted: boolean;
  node: string | null;
  llm: string | null;
  source_medium: string | null;
  metrics: { llm_ttfb_secs: number | null; tts_ttfb_secs: number | null } | null;
  tool_calls: ReviewToolCall[];
  tool_results: ReviewToolResult[];
};

export type ReviewCriterion = { id: string; result: string; rationale: string };
export type ReviewDataPoint = { id: string; value: unknown; description: string | null; rationale: string | null };

export type ReviewConversation = {
  schema: 1;
  conversation_id: string;
  agent_id: string | null;
  agent_name: string | null;
  version_id: string | null;
  branch_id: string | null;
  status: string | null;
  has_audio: boolean;
  metadata: {
    start_time_unix_secs: number | null;
    call_duration_secs: number | null;
    main_language: string | null;
    termination_reason: string | null;
    text_only: boolean | null;
    source: string | null;
    timezone: string | null;
  };
  analysis: {
    call_successful: string | null;
    call_summary_title: string | null;
    transcript_summary: string | null;
    evaluation_criteria: ReviewCriterion[];
    data_collection: ReviewDataPoint[];
  };
  transcript: ReviewTurn[];
};

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const bool = (v: unknown): boolean | null => (typeof v === "boolean" ? v : null);

// Key names whose values are never exported, at any depth of a tool payload.
const SECRET_KEY = /secret|token|password|api[_-]?key|authorization|cookie|signature/i;
// Values that look like credentials even under an innocent key.
const SECRET_VALUE = /(sk_[A-Za-z0-9]{16,}|xi-[A-Za-z0-9]{16,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+|Bearer\s+\S{12,})/;
export const REDACTED = "[redacted]";

// Drops query strings and fragments (where signed URLs carry their tokens) and any userinfo.
export function cleanUrl(raw: string): string {
  try {
    const u = new URL(raw);
    return `${u.protocol}//${u.host}${u.pathname}`;
  } catch {
    return raw.split(/[?#]/)[0] ?? raw;
  }
}

// Deep copy that redacts secret-looking keys and values and cleans URLs.
export function scrub(value: unknown): unknown {
  if (typeof value === "string") {
    if (SECRET_VALUE.test(value)) return REDACTED;
    return /^https?:\/\//.test(value) ? cleanUrl(value) : value;
  }
  if (Array.isArray(value)) return value.map(scrub);
  if (value && typeof value === "object") {
    const out: Obj = {};
    for (const [k, v] of Object.entries(value as Obj)) out[k] = SECRET_KEY.test(k) ? REDACTED : scrub(v);
    return out;
  }
  return value;
}

// Tool payloads arrive as JSON strings; keep them as structured JSON when they parse.
export function parseJson(raw: unknown): unknown {
  if (typeof raw !== "string") return raw ?? null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function toolCall(raw: unknown): ReviewToolCall {
  const c = obj(raw);
  const details = obj(c.tool_details);
  return {
    request_id: str(c.request_id) ?? "",
    type: str(c.type) ?? "unknown",
    tool_name: str(c.tool_name) ?? "unknown",
    params: scrub(parseJson(c.params_as_json)),
    method: str(details.method),
    url: str(details.url) ? cleanUrl(str(details.url)!) : null,
    // Headers are dropped on purpose: they carry the tool secret (already "<REDACTED>" upstream).
    body: details.body === undefined ? null : scrub(parseJson(details.body)),
  };
}

// A workflow move's result lists its steps; the edge step names where the conversation went.
function transitionOf(result: unknown): { edge: string | null; to: string } | null {
  for (const step of arr(obj(result).steps)) {
    const s = obj(step);
    if (s.type === "edge" && typeof s.target_node_id === "string") return { edge: str(s.edge_id), to: s.target_node_id };
  }
  return null;
}

function toolResult(raw: unknown): ReviewToolResult {
  const r = obj(raw);
  const type = str(r.type) ?? "unknown";
  const parsed = parseJson(r.result_value);
  const transition = type === "workflow" ? transitionOf(parsed) : null;
  return {
    request_id: str(r.request_id) ?? "",
    type,
    tool_name: str(r.tool_name) ?? "unknown",
    is_error: r.is_error === true,
    latency_secs: num(r.tool_latency_secs),
    // Workflow results nest the platform's internal transfer plumbing; the transition is what matters.
    result: transition ? { transition } : scrub(parsed),
    transition,
  };
}

function metricsOf(raw: unknown): ReviewTurn["metrics"] {
  const m = obj(obj(raw).metrics);
  const llm = num(obj(m.convai_llm_service_ttfb).elapsed_time);
  const tts = num(obj(m.convai_tts_service_ttfb).elapsed_time);
  return llm === null && tts === null ? null : { llm_ttfb_secs: llm, tts_ttfb_secs: tts };
}

export function toReviewConversation(raw: unknown): ReviewConversation {
  const d = obj(raw);
  const meta = obj(d.metadata);
  const analysis = obj(d.analysis);
  const conversationId = str(d.conversation_id);
  if (!conversationId) throw new Error("Not a conversation: conversation_id is missing");

  const transcript: ReviewTurn[] = arr(d.transcript).map((t) => {
    const turn = obj(t);
    return {
      role: turn.role === "user" ? "user" : "agent",
      time_in_call_secs: num(turn.time_in_call_secs) ?? 0,
      message: str(turn.message),
      interrupted: turn.interrupted === true,
      node: str(obj(turn.agent_metadata).workflow_node_id),
      llm: str(turn.producing_llm),
      source_medium: str(turn.source_medium),
      metrics: metricsOf(turn.conversation_turn_metrics),
      tool_calls: arr(turn.tool_calls).map(toolCall),
      tool_results: arr(turn.tool_results).map(toolResult),
    };
  });

  return {
    schema: 1,
    conversation_id: conversationId,
    agent_id: str(d.agent_id),
    agent_name: str(d.agent_name),
    version_id: str(d.version_id),
    branch_id: str(d.branch_id),
    status: str(d.status),
    has_audio: d.has_audio === true,
    metadata: {
      start_time_unix_secs: num(meta.start_time_unix_secs),
      call_duration_secs: num(meta.call_duration_secs),
      main_language: str(meta.main_language),
      termination_reason: str(meta.termination_reason),
      text_only: bool(meta.text_only),
      source: str(meta.conversation_initiation_source),
      timezone: str(meta.timezone),
    },
    analysis: {
      call_successful: str(analysis.call_successful),
      call_summary_title: str(analysis.call_summary_title),
      transcript_summary: str(analysis.transcript_summary),
      evaluation_criteria: Object.entries(obj(analysis.evaluation_criteria_results)).map(([id, v]) => ({
        id,
        result: str(obj(v).result) ?? "unknown",
        rationale: str(obj(v).rationale) ?? "",
      })),
      data_collection: Object.entries(obj(analysis.data_collection_results)).map(([id, v]) => ({
        id,
        value: scrub(obj(v).value ?? null),
        description: str(obj(obj(v).json_schema).description),
        rationale: str(obj(v).rationale),
      })),
    },
    transcript,
  };
}

// Finds secret-looking values in a config file (an agent or tool config as pushed). Request headers
// must be secret references ({ "secret_id": ... }); a literal string header value is a leaked secret.
export function findConfigSecrets(value: unknown, path = "$"): string[] {
  const hits: string[] = [];
  if (typeof value === "string") {
    if (SECRET_VALUE.test(value)) hits.push(path);
    return hits;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => hits.push(...findConfigSecrets(v, `${path}[${i}]`)));
    return hits;
  }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Obj)) {
      const here = `${path}.${k}`;
      if (k === "request_headers") {
        for (const [h, hv] of Object.entries(obj(v))) if (typeof hv === "string" && SECRET_KEY.test(h)) hits.push(`${here}.${h}`);
        // Covered above; skip the generic key check for the same header.
        continue;
      }
      // `secret_id` is a reference to a workspace secret, not the secret itself.
      if (k !== "secret_id" && SECRET_KEY.test(k) && typeof v === "string" && v.length > 0) hits.push(here);
      hits.push(...findConfigSecrets(v, here));
    }
  }
  return hits;
}

// Replaces the values at the paths findConfigSecrets reported.
export function redactPaths(value: unknown, paths: string[]): unknown {
  if (!paths.length) return value;
  const walk = (v: unknown, path: string): unknown => {
    if (paths.includes(path)) return REDACTED;
    if (Array.isArray(v)) return v.map((x, i) => walk(x, `${path}[${i}]`));
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v as Obj).map(([k, x]) => [k, walk(x, `${path}.${k}`)]));
    return v;
  };
  return walk(value, "$");
}

// For plain-text config (knowledge base markdown): true if any credential-shaped string appears.
export function textHasSecret(text: string): boolean {
  return SECRET_VALUE.test(text);
}

export function redactText(text: string): string {
  return text.replace(new RegExp(SECRET_VALUE.source, "g"), REDACTED);
}
