// What the /explainer page knows about the system: which components a tool call touches, what it
// sends to each, which guardrail it exercises, and which workflow Stage it belongs to. Pure data and
// reducers, so the diagram and the Expediente render from one state and the logic is testable.

export type Stage = "consent" | "identification" | "history" | "scheduling" | "escalation" | "end";
export const STAGES: { id: Stage; label: string; model: string }[] = [
  { id: "consent", label: "Consent", model: "Gemini 3.5 Flash" },
  { id: "identification", label: "Identification", model: "Gemini 3.5 Flash" },
  { id: "history", label: "History", model: "Claude Sonnet 5" },
  { id: "scheduling", label: "Scheduling", model: "Gemini 3.5 Flash" },
];

export type SystemId = "caller" | "agent" | "api" | "ehr" | "calendar" | "store" | "email";
export type EdgeId = "caller-agent" | "agent-api" | "api-ehr" | "api-calendar" | "api-store" | "api-email";

export type GuardrailId = "consent-gate" | "tool-secret" | "real-slots" | "idempotent-booking" | "red-flag" | "no-diagnosis" | "outbox";
export const GUARDRAILS: { id: GuardrailId; label: string; text: string }[] = [
  { id: "consent-gate", label: "Consent gate", text: "No data tool runs without a recorded yes." },
  { id: "tool-secret", label: "Signed tool calls", text: "A secret the LLM never sees; anything else gets 401." },
  { id: "red-flag", label: "Red flag from any step", text: "From any step: 911 or ER, logged, never booked." },
  { id: "no-diagnosis", label: "No diagnosis or advice", text: "It collects, never interprets; graded after every call." },
  { id: "real-slots", label: "Only real slots", text: "From live branch calendars, re-checked before booking." },
  { id: "idempotent-booking", label: "One booking per call", text: "Idempotent; a failed EHR write removes the event." },
  { id: "outbox", label: "EHR down, nothing lost", text: "Writes queue in an outbox and drain later." },
];

type Touch = { edge: EdgeId; request: string };
type ToolInfo = { stage: Stage; touches: Touch[]; guardrails: GuardrailId[]; summary: string };

const STORE_EVENT: Touch = { edge: "api-store", request: "timeline event" };

// Mirrors apps/web/src/app/api/tools/* and src/ehr/fhir-adapter.ts.
export const TOOLS: Record<string, ToolInfo> = {
  record_consent: {
    stage: "consent",
    summary: "Records the caller's yes or no to the aviso de privacidad",
    touches: [{ edge: "api-ehr", request: "POST /Consent" }, { edge: "api-store", request: "consent cache" }],
    guardrails: ["consent-gate", "tool-secret"],
  },
  find_patient: {
    stage: "identification",
    summary: "Looks the caller up by phone",
    touches: [{ edge: "api-ehr", request: "GET /Patient?phone=…" }, STORE_EVENT],
    guardrails: ["consent-gate", "tool-secret"],
  },
  save_patient: {
    stage: "identification",
    summary: "Registers a new patient",
    touches: [{ edge: "api-ehr", request: "POST /Patient" }, STORE_EVENT],
    guardrails: ["consent-gate", "tool-secret"],
  },
  get_questionnaire: {
    stage: "history",
    summary: "Loads the first-visit rheumatology Questionnaire",
    touches: [{ edge: "api-ehr", request: "GET /Questionnaire" }, STORE_EVENT],
    guardrails: ["consent-gate", "tool-secret"],
  },
  save_history: {
    stage: "history",
    summary: "Saves the answers as a QuestionnaireResponse pending clinician review",
    touches: [{ edge: "api-ehr", request: "PUT /QuestionnaireResponse" }, STORE_EVENT],
    guardrails: ["consent-gate", "no-diagnosis", "outbox"],
  },
  check_availability: {
    stage: "scheduling",
    summary: "Reads free/busy from the branch calendars",
    touches: [{ edge: "api-calendar", request: "freeBusy (branch calendars)" }, STORE_EVENT],
    guardrails: ["consent-gate", "real-slots"],
  },
  book_appointment: {
    stage: "scheduling",
    summary: "Books the slot in the branch calendar and the EHR",
    touches: [
      { edge: "api-calendar", request: "events.insert" },
      { edge: "api-ehr", request: "POST /Appointment" },
      { edge: "api-store", request: "booking record" },
      { edge: "api-email", request: "confirmation + patient link" },
    ],
    guardrails: ["consent-gate", "real-slots", "idempotent-booking", "outbox"],
  },
  reschedule_appointment: {
    stage: "scheduling",
    summary: "Books the new slot first, then cancels the old appointment",
    touches: [
      { edge: "api-calendar", request: "events.insert + events.delete" },
      { edge: "api-ehr", request: "POST /Appointment, PUT /Appointment (cancelled)" },
      { edge: "api-email", request: "change confirmation + patient link" },
    ],
    guardrails: ["consent-gate", "real-slots", "idempotent-booking"],
  },
  request_callback: {
    stage: "scheduling",
    summary: "Turns 'call me back' into work for the front desk",
    touches: [
      { edge: "api-ehr", request: "POST /Task (callback)" },
      { edge: "api-calendar", request: "events.insert (reminder, not busy)" },
      { edge: "api-email", request: "front desk + caller" },
    ],
    guardrails: ["consent-gate", "tool-secret"],
  },
  escalate: {
    stage: "escalation",
    summary: "Logs the red flag for the clinical team",
    touches: [{ edge: "api-ehr", request: "POST /Communication (stat)" }, STORE_EVENT],
    guardrails: ["red-flag", "tool-secret", "outbox"],
  },
};

// A tool call as the page sees it: started by the agent (SDK event), finished with a result (SDK event),
// and enriched with the HTTP status and latency the server recorded on the timeline.
export type Call = {
  id: string;
  tool: string;
  startedAt: number;
  done: boolean;
  isError: boolean;
  result: Record<string, unknown> | null;
  status?: number;
  ms?: number;
};

export type Expediente = {
  consent: { granted: boolean; at: number } | null;
  patient: { id: string | null; name: string | null; folio: string | null; returning: boolean } | null;
  history: { status: string; missing: string[] } | null;
  slotsOffered: number | null;
  appointment: { label: string; branch: string; practitioner: string; address: string; queued: boolean; previous: string | null } | null;
  callback: { availability: string; branch: string } | null;
  emails: string[];
  redFlag: { severity: string } | null;
};

export const EMPTY_EXPEDIENTE: Expediente = { consent: null, patient: null, history: null, slotsOffered: null, appointment: null, callback: null, emails: [], redFlag: null };

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

// Folds one finished tool call into the Expediente. Only the caller's own browser sees these results.
export function applyResult(exp: Expediente, call: Call): Expediente {
  const r = call.result;
  if (!r || call.isError || r.ok === false) return exp;
  switch (call.tool) {
    case "record_consent":
      return { ...exp, consent: { granted: r.granted === true, at: call.startedAt } };
    case "find_patient":
      return r.found ? { ...exp, patient: { id: str(r.patient_id), name: str(r.given_name), folio: null, returning: true } } : exp;
    case "save_patient":
      return { ...exp, patient: { id: str(r.patient_id), name: str(r.given_name), folio: str(r.folio), returning: r.already_registered === true } };
    case "save_history":
      return { ...exp, history: { status: str(r.status) ?? "in-progress", missing: Array.isArray(r.missing) ? r.missing.map(String) : [] } };
    case "check_availability":
      return { ...exp, slotsOffered: Array.isArray(r.slots) ? r.slots.length : 0 };
    case "book_appointment":
    case "reschedule_appointment":
      return r.booked || r.rescheduled
        ? {
            ...exp,
            appointment: {
              label: str(r.label) ?? "",
              branch: str(r.branch_name) ?? "",
              practitioner: str(r.practitioner_name) ?? "",
              address: str(r.address) ?? "",
              queued: r.queued === true,
              previous: str(r.old_label),
            },
            emails: r.emailed ? [...exp.emails, call.tool === "book_appointment" ? "Appointment confirmation with the patient link" : "Change confirmation with the patient link"] : exp.emails,
          }
        : exp;
    case "request_callback":
      return r.requested
        ? {
            ...exp,
            callback: { availability: str(r.availability) ?? "", branch: str(r.branch_name) ?? "" },
            emails: [...exp.emails, "Front desk: callback request", ...(r.emailed_caller ? ["Caller: we will call you, with the patient link"] : [])],
          }
        : exp;
    case "escalate":
      return { ...exp, redFlag: { severity: str(r.severity) ?? "red flag" } };
    default:
      return exp;
  }
}

// Workflow moves arrive as system tool results that name the target node.
const NODE_TO_STAGE: Record<string, Stage> = {
  consent: "consent",
  identification: "identification",
  history: "history",
  scheduling: "scheduling",
  escalation: "escalation",
  end_node: "end",
};

export function stageFromNode(node: string): Stage | null {
  return NODE_TO_STAGE[node] ?? null;
}

export function stageFromTransfer(fullResult: string): Stage | null {
  const matches = [...fullResult.matchAll(/"target_node_id"\s*:\s*"([a-z_]+)"/g)];
  const node = matches.at(-1)?.[1];
  return node ? (NODE_TO_STAGE[node] ?? null) : null;
}

export function parseResult(raw: string | undefined): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
