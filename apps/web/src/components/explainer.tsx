"use client";
import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  EMPTY_EXPEDIENTE,
  GUARDRAILS,
  STAGES,
  TOOLS,
  applyResult,
  parseResult,
  stageFromTransfer,
  type Call,
  type EdgeId,
  type Expediente,
  type GuardrailId,
  type Stage,
} from "@/explainer/model";
import { SAMPLE } from "@/explainer/sample";
import { ehrLinks } from "@/ehr-console";
import { usePoll } from "./use-poll";

type Turn = { id: number; role: "user" | "agent"; text: string };
type ServerEvent = { id: string; conversationId: string; tool: string; ok: boolean; status: number; ms: number; at: number };

const POLL_MS = 1200;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// The call language, sent as the session's language override. Spanish is the agent's own default;
// English applies the agent's `en` preset (English first message and voice).
type Language = "es" | "en";
const LANGUAGES: { id: Language; label: string; lang: string }[] = [
  { id: "es", label: "Español", lang: "es" },
  { id: "en", label: "English", lang: "en" },
];

// The /explainer page: our own call panel on the ElevenLabs React SDK (same public agent as the widget),
// a live system diagram and the Expediente the call is writing. Tool calls and their results arrive in
// this browser as SDK client events; the HTTP status and latency come from the server's tool timeline.
export function Explainer({ agentId }: { agentId: string | null }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [calls, setCalls] = useState<Call[]>([]);
  const [stage, setStage] = useState<Stage | null>(null);
  const [expediente, setExpediente] = useState<Expediente>(EMPTY_EXPEDIENTE);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setTurns([]);
    setCalls([]);
    setStage("consent");
    setExpediente(EMPTY_EXPEDIENTE);
    setConversationId(null);
    setError(null);
  };

  const onToolRequest = useCallback((e: { tool_name: string; tool_call_id: string; tool_type: string }) => {
    if (e.tool_type === "system") return;
    setCalls((old) => [...old, { id: e.tool_call_id, tool: e.tool_name, startedAt: Date.now(), done: false, isError: false, result: null }]);
    const info = TOOLS[e.tool_name];
    if (info && info.stage === "escalation") setStage("escalation");
  }, []);

  const onToolResponse = useCallback((e: { tool_name: string; tool_call_id: string; tool_type: string; is_error: boolean; full_tool_result?: string }) => {
    if (e.tool_type === "system") {
      const next = e.full_tool_result ? stageFromTransfer(e.full_tool_result) : null;
      if (next) setStage(next);
      return;
    }
    const result = parseResult(e.full_tool_result);
    setCalls((old) => {
      const known = old.some((c) => c.id === e.tool_call_id);
      const base = known ? old : [...old, { id: e.tool_call_id, tool: e.tool_name, startedAt: Date.now(), done: false, isError: false, result: null }];
      return base.map((c) => (c.id === e.tool_call_id ? { ...c, done: true, isError: e.is_error, result: result ?? c.result } : c));
    });
    if (result) setExpediente((old) => applyResult(old, { id: e.tool_call_id, tool: e.tool_name, startedAt: Date.now(), done: true, isError: e.is_error, result }));
  }, []);

  // Plays SAMPLE through the same handlers a live call uses, so the diagrams behave identically.
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const pendingEmail = useRef("");
  const [replaying, setReplaying] = useState(false);
  const stopReplay = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setReplaying(false);
  };
  const replay = () => {
    stopReplay();
    reset();
    setReplaying(true);
    SAMPLE.forEach((step, i) => {
      const id = `sample-${i}`;
      if ("say" in step) {
        timers.current.push(setTimeout(() => setTurns((old) => [...old, { id: i, role: step.say, text: step.text }]), step.at));
      } else if ("tool" in step) {
        timers.current.push(setTimeout(() => onToolRequest({ tool_name: step.tool, tool_call_id: id, tool_type: "webhook" }), step.at));
        timers.current.push(
          setTimeout(() => {
            onToolResponse({ tool_name: step.tool, tool_call_id: id, tool_type: "webhook", is_error: false, full_tool_result: JSON.stringify(step.result) });
            setCalls((old) => old.map((c) => (c.id === id ? { ...c, status: step.status, ms: step.ms } : c)));
          }, step.at + Math.max(step.ms, 450)),
        );
      } else {
        timers.current.push(setTimeout(() => setStage(step.stage), step.at));
      }
    });
    const last = SAMPLE.at(-1)?.at ?? 0;
    timers.current.push(setTimeout(() => setReplaying(false), last + 500));
  };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  if (!agentId) return <p className="empty">The agent is not configured (NEXT_PUBLIC_ELEVENLABS_AGENT_ID).</p>;

  return (
    <ConversationProvider
      onConnect={({ conversationId: id }) => {
        setConversationId(id);
        // Best effort: without it the call still works, only the emails are skipped.
        if (pendingEmail.current) fetch("/api/lead", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ conversation_id: id, email: pendingEmail.current }) }).catch(() => undefined);
      }}
      onDisconnect={() => setStage((s) => (s === "escalation" ? s : "end"))}
      onError={(message) => setError(String(message))}
      onMessage={({ message, role, event_id }) => setTurns((old) => [...old, { id: event_id ?? old.length, role, text: message }])}
      onAgentToolRequest={onToolRequest}
      onAgentToolResponse={onToolResponse}
    >
      <div className="explainer">
        <CallPanel agentId={agentId} conversationId={conversationId} turns={turns} error={error} onStart={(email) => { stopReplay(); reset(); pendingEmail.current = email; }} replaying={replaying} onReplay={replay} onStopReplay={stopReplay} />
        <SystemPanel stage={stage} calls={calls} conversationId={conversationId} setCalls={setCalls} />
        <ExpedientePanel stage={stage} expediente={expediente} />
      </div>
    </ConversationProvider>
  );
}

function CallPanel({
  agentId,
  conversationId,
  turns,
  error,
  onStart,
  replaying,
  onReplay,
  onStopReplay,
}: {
  agentId: string;
  conversationId: string | null;
  turns: Turn[];
  error: string | null;
  onStart: (email: string) => void;
  replaying: boolean;
  onReplay: () => void;
  onStopReplay: () => void;
}) {
  const { startSession, endSession, status, isSpeaking } = useConversation();
  const [email, setEmail] = useState("");
  const [language, setLanguage] = useState<Language>("es");
  const [micError, setMicError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const transcript = useRef<HTMLDivElement>(null);
  const connected = status === "connected";
  const busy = status === "connecting";

  useEffect(() => {
    transcript.current?.scrollTo({ top: transcript.current.scrollHeight, behavior: "smooth" });
  }, [turns]);

  const start = async () => {
    setMicError(null);
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setMicError("Allow the microphone to talk to the agent.");
      return;
    }
    onStart(email.trim());
    // WebSocket, not WebRTC: the LiveKit signal stream dropped on connect in the browser, while the
    // socket path is reliable. The email goes to our server on connect (see onConnect), not to the agent.
    // The agent allows exactly one client override, the language (platform_settings.overrides).
    startSession({ agentId, connectionType: "websocket", overrides: { agent: { language } } });
  };

  return (
    <section className="card x-call" aria-labelledby="call-h">
      <p className="kicker">1 · The call</p>
      <h2 id="call-h" className="title">
        Talk to the agent
      </h2>
      <label className="x-label small" htmlFor="x-email">
        Your email
      </label>
      <input
        id="x-email"
        className="x-input"
        type="email"
        autoComplete="email"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={connected || busy}
      />
      <p className="small muted">Where the clinic would send your appointment details. Use any address; the data here is fictional.</p>
      <fieldset className="x-lang" disabled={connected || busy}>
        <legend className="x-label small">Idioma / Language</legend>
        <div className="x-seg">
          {LANGUAGES.map((l) => (
            <label key={l.id} className="x-seg-opt" lang={l.lang}>
              <input type="radio" name="x-language" value={l.id} checked={language === l.id} onChange={() => setLanguage(l.id)} />
              <span>{l.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {connected ? (
        <button type="button" className="btn x-start" onClick={() => endSession()}>
          End call
        </button>
      ) : (
        <button type="button" className="btn btn-primary x-start" onClick={start} disabled={busy || !EMAIL.test(email)}>
          {busy ? "Connecting…" : "Start call"}
        </button>
      )}
      {!connected && !busy && (
        <button type="button" className="link-btn x-sample" onClick={replaying ? onStopReplay : onReplay}>
          {replaying ? "Stop the sample" : "Or replay a sample call (no microphone)"}
        </button>
      )}
      <p className="x-mode" role="status">
        <span className={`x-dot ${connected ? (isSpeaking ? "is-speaking" : "is-listening") : ""}`} aria-hidden />
        {connected ? (isSpeaking ? "Agent speaking" : "Listening to you") : status === "connecting" ? "Connecting" : replaying ? "Replaying a recorded sample" : "Not connected"}
      </p>
      {conversationId && (
        <p className="small x-conv">
          Conversation ID <code>{conversationId}</code>{" "}
          <button
            type="button"
            className="link-btn"
            onClick={() => navigator.clipboard.writeText(conversationId).then(() => setCopied(true), () => undefined)}
            onBlur={() => setCopied(false)}
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </p>
      )}
      {(micError || error) && <p className="small x-error">{micError ?? error}</p>}
      <div className="x-transcript" ref={transcript} aria-live="polite">
        {turns.length === 0 ? (
          <p className="small muted">The live transcript appears here. The call starts in the language you pick; in a Spanish call, say &quot;I prefer English&quot; to switch.</p>
        ) : (
          turns.map((t) => (
            <p key={`${t.id}-${t.role}`} className={`x-turn x-${t.role}`}>
              <span className="x-who">{t.role === "agent" ? "Agent" : "You"}</span>
              {t.text}
            </p>
          ))
        )}
      </div>
    </section>
  );
}

// Box layout of the system diagram, in viewBox units.
const BOX = {
  caller: { x: 20, y: 16, w: 520, h: 44, title: "Caller", sub: "Browser, WebSocket audio" },
  agent: { x: 20, y: 96, w: 520, h: 132, title: "ElevenLabs agent", sub: "ASR · workflow · LLM per step · TTS" },
  api: { x: 20, y: 270, w: 520, h: 52, title: "PoktaClinic API", sub: "Next.js on Vercel · 10 webhook tools" },
  ehr: { x: 20, y: 380, w: 124, h: 64, title: "EHR", sub: "FHIR R4 · OAuth2" },
  calendar: { x: 152, y: 380, w: 124, h: 64, title: "Calendars", sub: "Google · 3 branches" },
  store: { x: 284, y: 380, w: 124, h: 64, title: "Store", sub: "Upstash · outbox" },
  email: { x: 416, y: 380, w: 124, h: 64, title: "Email", sub: "Resend" },
} as const;

const EDGES: { id: EdgeId; x: number; y1: number; y2: number; label: string }[] = [
  { id: "caller-agent", x: 280, y1: 60, y2: 96, label: "voice" },
  { id: "agent-api", x: 280, y1: 228, y2: 270, label: "HTTPS webhook + secret" },
  { id: "api-ehr", x: 82, y1: 322, y2: 380, label: "" },
  { id: "api-calendar", x: 214, y1: 322, y2: 380, label: "" },
  { id: "api-store", x: 346, y1: 322, y2: 380, label: "" },
  { id: "api-email", x: 478, y1: 322, y2: 380, label: "" },
];

// Shared with /review, which replays a recorded call: it passes no conversation (no live polling), the
// furthest Stage reached so far (seeking can jump), and its own idle text.
export function SystemPanel({
  stage,
  calls,
  conversationId,
  setCalls,
  reachedIndex,
  idleText = "Start a call: each tool the agent calls lights up its path through the system.",
  title = "The system, live",
}: {
  stage: Stage | null;
  calls: Call[];
  conversationId: string | null;
  setCalls: React.Dispatch<React.SetStateAction<Call[]>>;
  reachedIndex?: number;
  idleText?: string;
  title?: string;
}) {
  const since = useRef(0);
  const live = useRef<string | null>(null);
  if (live.current !== conversationId) {
    live.current = conversationId;
    since.current = 0;
  }

  // Server-side status and latency for this Conversation's calls, matched to SDK calls in order per tool.
  usePoll(async () => {
    if (!conversationId) return;
    const res = await fetch(`/api/live/events?since=${since.current}`, { cache: "no-store" });
    if (!res.ok) return;
    const { events } = (await res.json()) as { events: ServerEvent[] };
    const mine = events.filter((e) => e.conversationId === conversationId);
    if (!events.length) return;
    since.current = Math.max(since.current, ...events.map((e) => e.at));
    if (!mine.length) return;
    setCalls((old) => {
      const next = [...old];
      for (const ev of mine) {
        const i = next.findIndex((c) => c.tool === ev.tool && c.status === undefined);
        if (i >= 0) next[i] = { ...next[i], status: ev.status, ms: ev.ms };
      }
      return next;
    });
  }, POLL_MS);

  const current = calls.at(-1);
  const info = current ? TOOLS[current.tool] : undefined;
  const activeEdges = new Set<EdgeId>(current && info && stage !== "end" ? ["agent-api", ...info.touches.map((t) => t.edge)] : []);
  const pending = current && !current.done;
  const fired = new Set<GuardrailId>(calls.flatMap((c) => TOOLS[c.tool]?.guardrails ?? []));
  const flowStage = stage ?? null;
  const reached = useRef(-1);
  const idx = STAGES.findIndex((t) => t.id === flowStage);
  if (flowStage === null || (flowStage === "consent" && calls.length === 0)) reached.current = idx;
  else if (idx > reached.current) reached.current = idx;
  const furthest = reachedIndex ?? reached.current;
  const ended = flowStage === "end";
  const nowRails = new Set<GuardrailId>(!ended && info ? info.guardrails : []);

  return (
    <section className="card x-system" aria-labelledby="system-h">
      <p className="kicker">2 · What is happening</p>
      <h2 id="system-h" className="title">
        {title}
      </h2>
      <svg className="x-diagram" viewBox="0 0 560 456" role="img" aria-label="System diagram: caller, ElevenLabs agent, PoktaClinic API, EHR, calendars, store and email">
        {EDGES.map((e) => {
          const on = activeEdges.has(e.id) || (e.id === "caller-agent" && flowStage !== null && flowStage !== "end");
          return (
            <g key={e.id} className={`x-edge ${on ? "is-on" : ""} ${on && pending && e.id !== "caller-agent" ? "is-pending" : ""} ${on && current?.isError ? "is-error" : ""}`}>
              <line x1={e.x} y1={e.y1} x2={e.x} y2={e.y2} />
              {e.label && (
                <text x={e.x + 8} y={(e.y1 + e.y2) / 2 + 4} className="x-edge-label">
                  {e.label}
                </text>
              )}
            </g>
          );
        })}
        {Object.entries(BOX).map(([id, b]) => {
          const on =
            (id === "caller" && flowStage !== null && flowStage !== "end") ||
            (id === "agent" && flowStage !== null && flowStage !== "end") ||
            (id === "api" && !!current && activeEdges.has("agent-api")) ||
            (id !== "caller" && id !== "agent" && id !== "api" && activeEdges.has(`api-${id}` as EdgeId));
          return (
            <g key={id} className={`x-box ${on ? "is-on" : ""}`}>
              <rect x={b.x} y={b.y} width={b.w} height={b.h} />
              <text x={b.x + 12} y={b.y + 20} className="x-box-title">
                {b.title}
              </text>
              <text x={b.x + 12} y={b.y + 36} className="x-box-sub">
                {b.sub}
              </text>
            </g>
          );
        })}
        <g className="x-flow">
          {STAGES.map((s, i) => {
            const x = 32 + i * 128;
            const on = flowStage === s.id;
            const done = ended ? furthest >= i : idx > i;
            return (
              <g key={s.id} className={`x-step ${on ? "is-on" : ""} ${done ? "is-done" : ""}`}>
                <rect x={x} y={150} width={116} height={40} />
                <text x={x + 8} y={166} className="x-step-title">
                  {s.label}
                </text>
                <text x={x + 8} y={181} className="x-step-sub">
                  {s.model}
                </text>
              </g>
            );
          })}
          <g className={`x-step x-escalation ${flowStage === "escalation" ? "is-on" : ""}`}>
            <rect x={32} y={196} width={500} height={24} />
            <text x={42} y={212} className="x-step-sub">
              Escalation: a red flag from any step → 911 or ER today, never booked
            </text>
          </g>
        </g>
      </svg>
      <div className="x-now" aria-live="polite">
        {current && info ? (
          <>
            <p className="x-now-tool">
              <code>{current.tool}</code>
              <span className={`pill ${current.isError ? "pill-spot" : current.done ? "pill-ok" : "pill-brand"}`}>
                {current.isError ? "error" : current.done ? "done" : "calling"}
              </span>
              {current.ms !== undefined && (
                <span className="small muted num">
                  {current.status !== undefined && `HTTP ${current.status} · `}
                  {current.ms} ms
                </span>
              )}
            </p>
            <p className="small soft">{info.summary}</p>
            <ul className="x-requests small">
              {info.touches.map((t) => (
                <li key={t.edge + t.request}>
                  <span className="muted">{t.edge.replace("api-", "")}</span> {t.request}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="small muted">{idleText}</p>
        )}
      </div>
      <h3 className="x-subhead">Guardrails</h3>
      <ul className="x-guardrails">
        {GUARDRAILS.map((g) => (
          <li key={g.id} className={nowRails.has(g.id) || (g.id === "red-flag" && flowStage === "escalation") ? "is-now" : fired.has(g.id) ? "is-on" : ""}>
            <strong>{g.label}</strong>
            <span className="small soft">{g.text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

const ITEMS = 11;

// Shared with /review. Each filled field links to the record it created in the clinic's EHR console.
export function ExpedientePanel({
  stage,
  expediente: e,
  note = "What the call has written to the clinic's EHR so far. Only this browser sees it.",
}: {
  stage: Stage | null;
  expediente: Expediente;
  note?: string;
}) {
  const historyDone = e.history ? ITEMS - e.history.missing.length : 0;
  const patientId = e.patient?.id ?? null;
  return (
    <section className="card x-record" aria-labelledby="record-h">
      <p className="kicker">3 · The result</p>
      <h2 id="record-h" className="title">
        Expediente
      </h2>
      <p className="small muted">{note}</p>
      <dl className="x-fields">
        <Field label="Consent" state={e.consent ? (e.consent.granted ? "ok" : "attn") : null}>
          {e.consent ? (e.consent.granted ? `Granted at ${new Date(e.consent.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Refused: no data collected") : "Waiting"}
        </Field>
        <Field label="Patient" state={e.patient ? "ok" : null} link={patientId ? { href: ehrLinks.patient(patientId), label: "Open patient record in the EHR" } : null}>
          {e.patient ? (
            <>
              {e.patient.name ?? "Identified"}
              {e.patient.folio && <span className="muted num"> · {e.patient.folio}</span>}
              <span className="muted"> · {e.patient.returning ? "returning" : "new"}</span>
            </>
          ) : (
            "Waiting"
          )}
        </Field>
        <Field
          label="History"
          state={e.history ? (e.history.status === "completed" ? "ok" : "attn") : null}
          link={e.history && patientId ? { href: ehrLinks.history(patientId), label: "Open pre-consultation summary in the EHR" } : null}
        >
          {e.history ? (
            <>
              {historyDone}/{ITEMS} items · pending clinician review
              <span className="x-bar" aria-hidden>
                <span style={{ width: `${(historyDone / ITEMS) * 100}%` }} />
              </span>
            </>
          ) : stage === "history" ? (
            "Collecting with Claude Sonnet 5…"
          ) : (
            "Waiting"
          )}
        </Field>
        <Field
          label="Appointment"
          state={e.appointment ? "ok" : e.callback ? "attn" : null}
          link={
            e.appointment
              ? { href: ehrLinks.appointments(patientId), label: "Open appointments in the EHR" }
              : e.callback
                ? { href: ehrLinks.callbacks(patientId), label: "Open callback requests in the EHR" }
                : null
          }
        >
          {e.appointment ? (
            <>
              {e.appointment.previous && <span className="muted">Moved from {e.appointment.previous} · </span>}
              {e.appointment.label}
              <br />
              <span className="soft">
                {e.appointment.branch} · {e.appointment.practitioner}
              </span>
              {e.appointment.queued && <span className="muted"> · queued for the EHR</span>}
            </>
          ) : e.callback ? (
            <>
              Callback requested: {e.callback.availability}
              <br />
              <span className="soft">Task in the EHR · reminder in the {e.callback.branch} calendar</span>
            </>
          ) : e.slotsOffered !== null ? (
            `${e.slotsOffered} free slots offered`
          ) : (
            "Waiting"
          )}
        </Field>
        {e.redFlag && (
          <Field label="Red flag" state="spot" link={{ href: ehrLinks.alerts(), label: "Open clinical alerts in the EHR" }}>
            {e.redFlag.severity === "emergencia" ? "Emergency: told to call 911" : "Urgent: told to go to the ER today"} · logged for the clinical team
          </Field>
        )}
        <Field label="Email" state={e.emails.length ? "ok" : null}>
          {e.emails.length ? (
            <ul className="x-emails">
              {e.emails.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          ) : (
            "Sent after booking or a callback request, with a link to complete missing data"
          )}
        </Field>
      </dl>
      {patientId && (
        <a className="btn x-ehr-open" href={ehrLinks.consultation(patientId)} target="_blank" rel="noreferrer">
          Open consultation view<span className="sr-only"> (opens the EHR console in a new tab)</span>
        </a>
      )}
      <p className="small muted">EHR links open the clinic&apos;s console in a new tab. The console is password protected; reviewers get the credentials in the submission notes.</p>
    </section>
  );
}

function Field({ label, state, link, children }: { label: string; state: "ok" | "attn" | "spot" | null; link?: { href: string; label: string } | null; children: React.ReactNode }) {
  return (
    <div className={`x-field ${state ? `is-${state}` : ""}`}>
      <dt>{label}</dt>
      <dd>{children}</dd>
      {link && (
        <dd className="x-ehr-link small">
          <a href={link.href} target="_blank" rel="noreferrer">
            {link.label}
            <span className="sr-only"> (new tab)</span>
          </a>
        </dd>
      )}
    </div>
  );
}
