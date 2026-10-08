"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ExpedientePanel, SystemPanel } from "@/components/explainer";
import { STAGES, TOOLS, type Call } from "@/explainer/model";
import type { ReviewConversation } from "@/review/export";
import type { ConfigIndex, ReviewManifest } from "@/review/files";
import { buildReplay, formatClock, stateAt, type Replay, type ReplayCall, type Transition } from "@/review/replay";

const SPEEDS = [0.75, 1, 1.25, 1.5, 2];
const LANGUAGE_NAMES: Record<string, string> = { es: "Spanish", en: "English" };
const NODE_LABELS: Record<string, string> = { end_node: "End", ...Object.fromEntries([...STAGES.map((s) => [s.id, s.label]), ["escalation", "Escalation"]]) };
const noop = () => undefined;

// The /review page: a recorded call replayed against the same panels as /explainer. The audio element
// is the clock when there is audio; otherwise a virtual clock walks the transcript timestamps.
export function Review({ conversation, manifest, config }: { conversation: ReviewConversation; manifest: ReviewManifest; config: ConfigIndex | null }) {
  const base = `/review/${conversation.conversation_id}`;
  const audioSrc = manifest.audio ? `${base}/${manifest.audio}` : null;
  const [audioDuration, setAudioDuration] = useState<number | null>(null);
  const replay = useMemo(() => buildReplay(conversation, audioDuration), [conversation, audioDuration]);
  const [audioRef, player] = usePlayback(audioSrc, replay.duration);
  const state = useMemo(() => stateAt(replay, player.t), [replay, player.t]);
  const [selected, setSelected] = useState<string | null>(null);
  const inspected = selected ?? state.currentCallId ?? replay.calls[0]?.id ?? null;

  return (
    <>
      <MetaHeader conversation={conversation} manifest={manifest} base={base} />
      {audioSrc && (
        <audio ref={audioRef} src={audioSrc} preload="metadata" onLoadedMetadata={(e) => setAudioDuration(Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : null)} hidden />
      )}
      <PlayerBar player={player} replay={replay} hasAudio={Boolean(audioSrc)} />
      <div className="explainer">
        <TranscriptPanel replay={replay} currentTurnKey={state.currentTurnKey} t={player.t} playing={player.playing} lang={conversation.metadata.main_language} onSeek={player.seek} onInspect={setSelected} />
        <SystemPanel
          stage={state.stage}
          calls={state.calls}
          conversationId={null}
          setCalls={noop as React.Dispatch<React.SetStateAction<Call[]>>}
          reachedIndex={state.reachedIndex}
          title="The system, replayed"
          idleText="Press play: each tool the agent called lights up its path through the system at the moment it happened."
        />
        <ExpedientePanel stage={state.stage} expediente={state.expediente} note="What this call wrote to the clinic's EHR, rebuilt from the recorded tool results as the replay reaches them." />
      </div>
      <ToolsPanel replay={replay} t={player.t} inspected={inspected} onSelect={setSelected} onSeek={player.seek} />
      <AnalysisPanel conversation={conversation} />
      {config && <ConfigPanel config={config} manifest={manifest} />}
    </>
  );
}

type Player = ReturnType<typeof usePlayback>[1];

function usePlayback(audioSrc: string | null, duration: number) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeedState] = useState(1);
  const tRef = useRef(0);
  useEffect(() => {
    tRef.current = t;
  }, [t]);

  // One animation-frame loop drives both clocks, so the panels move smoothly between transcript seconds.
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const audio = audioRef.current;
      if (audioSrc && audio) {
        setT(audio.currentTime);
        if (audio.ended) setPlaying(false);
      } else {
        const next = Math.min(duration, tRef.current + ((now - last) / 1000) * speed);
        tRef.current = next;
        setT(next);
        if (next >= duration) setPlaying(false);
      }
      last = now;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, audioSrc, duration, speed]);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (playing) {
      audio?.pause();
      setPlaying(false);
      return;
    }
    if (audioSrc && audio) {
      if (audio.ended) audio.currentTime = 0;
      audio.play().then(() => setPlaying(true), () => setPlaying(false));
    } else {
      if (tRef.current >= duration) setT(0);
      setPlaying(true);
    }
  }, [playing, audioSrc, duration]);

  const seek = useCallback(
    (secs: number) => {
      const next = Math.max(0, Math.min(duration, secs));
      if (audioRef.current) audioRef.current.currentTime = next;
      setT(next);
    },
    [duration],
  );

  const setSpeed = useCallback((s: number) => {
    if (audioRef.current) audioRef.current.playbackRate = s;
    setSpeedState(s);
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onPause = () => setPlaying(false);
    const onSeeked = () => setT(audio.currentTime);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("seeked", onSeeked);
    return () => {
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("seeked", onSeeked);
    };
  }, [audioSrc]);

  return [audioRef, { t, playing, speed, duration, toggle, seek, setSpeed }] as const;
}

function MetaHeader({ conversation: c, manifest, base }: { conversation: ReviewConversation; manifest: ReviewManifest; base: string }) {
  const [copied, setCopied] = useState(false);
  const start = c.metadata.start_time_unix_secs ? new Date(c.metadata.start_time_unix_secs * 1000) : null;
  const tz = c.metadata.timezone ?? undefined;
  const lang = c.metadata.main_language;
  const channel = c.metadata.text_only ? "Text-only test run" : c.metadata.source === "react_sdk" ? "Browser voice call (ElevenLabs React SDK)" : c.metadata.source === "unknown" ? "Scripted test run (Agents WebSocket API)" : (c.metadata.source ?? "Call");
  const ok = c.analysis.call_successful;
  return (
    <section aria-labelledby="r-h" className="r-head">
      <p className="kicker">Call review · replay of a recorded call</p>
      <h1 id="r-h" className="headline">
        {c.analysis.call_summary_title ?? "Recorded call"}: press play to hear the real call and watch the system work.
      </h1>
      <dl className="r-meta small">
        <div>
          <dt>Conversation ID</dt>
          <dd>
            <code>{c.conversation_id}</code>{" "}
            <button type="button" className="link-btn" onClick={() => navigator.clipboard.writeText(c.conversation_id).then(() => setCopied(true), noop)} onBlur={() => setCopied(false)}>
              {copied ? "Copied" : "Copy"}
            </button>
          </dd>
        </div>
        {start && (
          <div>
            <dt>Date</dt>
            <dd className="num">
              {start.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: tz })}
              {tz && <span className="muted"> ({tz.replace("_", " ")})</span>}
            </dd>
          </div>
        )}
        <div>
          <dt>Duration</dt>
          <dd className="num">{formatClock(c.metadata.call_duration_secs ?? 0)}</dd>
        </div>
        <div>
          <dt>Language</dt>
          <dd>{lang ? (LANGUAGE_NAMES[lang] ?? lang) : "Unknown"}</dd>
        </div>
        <div>
          <dt>Channel</dt>
          <dd>{channel}</dd>
        </div>
        <div>
          <dt>Result</dt>
          <dd>
            <span className={`pill ${ok === "success" ? "pill-ok" : ok === "failure" ? "pill-spot" : "pill-attn"}`}>{ok ?? "unknown"}</span>
          </dd>
        </div>
      </dl>
      <p className="r-downloads small">
        {manifest.zip && (
          <a className="btn" href={`${base}/${manifest.zip}`} download>
            Download everything (.zip)
          </a>
        )}
        <a href={`${base}/conversation.json`}>Transcript, tool calls and analysis (JSON)</a>
        {manifest.audio && (
          <a href={`${base}/${manifest.audio}`} download>
            Audio (MP3)
          </a>
        )}
        <a href={`${base}/manifest.json`}>Manifest</a>
      </p>
      <p role="note" className="notice small">
        <strong>All data is fictional and the agent is an AI, not a clinician.</strong> Exported from the ElevenLabs Agents Platform API (read-only) on{" "}
        {new Date(manifest.exported_at).toLocaleDateString("en-US", { dateStyle: "medium" })}; secrets and request headers are removed. Grupo Médico Articular is a fictional rheumatology network.
      </p>
    </section>
  );
}

function PlayerBar({ player, replay, hasAudio }: { player: Player; replay: Replay; hasAudio: boolean }) {
  const { t, duration, playing, speed } = player;
  const pct = (x: number) => `${duration ? (x / duration) * 100 : 0}%`;
  return (
    <div className="r-player" role="group" aria-label="Call replay controls">
      <button type="button" className="btn btn-primary r-play" onClick={player.toggle} aria-label={playing ? "Pause" : "Play"}>
        {playing ? "Pause" : t > 0 && t < duration ? "Resume" : "Play"}
      </button>
      <button type="button" className="btn r-skip" onClick={() => player.seek(t - 10)} aria-label="Back 10 seconds">
        −10s
      </button>
      <span className="num small r-clock" aria-hidden>
        {formatClock(t)} / {formatClock(duration)}
      </span>
      <div className="r-track">
        <div className="r-marks" aria-hidden>
          {replay.calls.map((c) => (
            <span key={c.id} className={`r-mark ${c.response?.is_error ? "is-error" : ""}`} style={{ left: pct(c.start) }} title={c.tool} />
          ))}
          {replay.transitions.map((s) => (
            <span key={s.id} className="r-mark is-stage" style={{ left: pct(s.at) }} title={`to ${s.to}`} />
          ))}
        </div>
        <input
          type="range"
          className="r-range"
          min={0}
          max={duration}
          step={0.1}
          value={t}
          onChange={(e) => player.seek(Number(e.target.value))}
          aria-label="Position in the call"
          aria-valuetext={`${formatClock(t)} of ${formatClock(duration)}`}
        />
      </div>
      <label className="small r-speed">
        <span className="sr-only">Playback speed</span>
        <select value={speed} onChange={(e) => player.setSpeed(Number(e.target.value))}>
          {SPEEDS.map((s) => (
            <option key={s} value={s}>
              {s}×
            </option>
          ))}
        </select>
      </label>
      {!hasAudio && <span className="small muted">No audio for this conversation: the replay follows the transcript timestamps.</span>}
    </div>
  );
}

function TranscriptPanel({
  replay,
  currentTurnKey,
  t,
  playing,
  lang,
  onSeek,
  onInspect,
}: {
  replay: Replay;
  currentTurnKey: string | null;
  t: number;
  playing: boolean;
  lang: string | null;
  onSeek: (t: number) => void;
  onInspect: (id: string) => void;
}) {
  const box = useRef<HTMLOListElement>(null);
  useEffect(() => {
    if (!playing || !currentTurnKey || !box.current) return;
    const el = box.current.querySelector<HTMLElement>(`[data-key="${currentTurnKey}"]`);
    if (el) box.current.scrollTo({ top: el.offsetTop - box.current.clientHeight / 3, behavior: "smooth" });
  }, [currentTurnKey, playing]);

  return (
    <section className="card x-call" aria-labelledby="call-h">
      <p className="kicker">1 · The call</p>
      <h2 id="call-h" className="title">
        Transcript
      </h2>
      <p className="small muted">Click a line to jump there. Tool calls and workflow moves appear where the agent made them.</p>
      <ol className="x-transcript r-transcript" ref={box} lang={lang ?? undefined}>
        {replay.items.map((item) => {
          const future = item.at > t;
          if (item.kind === "turn") {
            const current = item.key === currentTurnKey;
            return (
              <li key={item.key} data-key={item.key}>
                <button type="button" className={`r-turn x-turn x-${item.role} ${current ? "is-current" : ""} ${future ? "is-future" : ""}`} onClick={() => onSeek(item.at)} aria-current={current ? "true" : undefined}>
                  <span className="x-who" lang="en">
                    {item.role === "agent" ? "Agent" : "Caller"} <span className="num">{formatClock(item.at)}</span>
                    {item.interrupted && " · interrupted"}
                  </span>
                  <TurnText text={item.text} />
                </button>
              </li>
            );
          }
          if (item.kind === "tool") {
            return (
              <li key={item.key} lang="en">
                <button type="button" className={`r-chip ${future ? "is-future" : ""}`} onClick={() => onInspect(item.callId)}>
                  <span className="muted">{item.type === "webhook" ? "tool" : item.type}</span> <code>{item.tool}</code> <span className="muted num">{formatClock(item.at)}</span>
                </button>
              </li>
            );
          }
          return (
            <li key={item.key} lang="en">
              <button type="button" className={`r-chip is-stage ${future ? "is-future" : ""}`} onClick={() => onInspect(item.transitionId)}>
                <span className="muted">workflow</span> to {NODE_LABELS[item.to] ?? item.to} <span className="muted num">{formatClock(item.at)}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

// Agent lines carry the TTS model's expression tags ([happy]); show them as tags, not as speech.
function TurnText({ text }: { text: string }) {
  const parts = text.split(/(\[[a-z ]{2,24}\])/gi);
  return (
    <span className="r-text">
      {parts.map((p, i) =>
        /^\[[a-z ]+\]$/i.test(p) ? (
          <span key={i} className="r-tag" lang="en" title="Voice expression tag sent to the TTS model">
            {p.slice(1, -1)}
          </span>
        ) : (
          p
        ),
      )}
    </span>
  );
}

type Entry = { kind: "call"; id: string; at: number; call: ReplayCall } | { kind: "transition"; id: string; at: number; transition: Transition };

function ToolsPanel({ replay, t, inspected, onSelect, onSeek }: { replay: Replay; t: number; inspected: string | null; onSelect: (id: string) => void; onSeek: (t: number) => void }) {
  const entries: Entry[] = useMemo(
    () => [...replay.calls.map((c) => ({ kind: "call" as const, id: c.id, at: c.start, call: c })), ...replay.transitions.map((s) => ({ kind: "transition" as const, id: s.id, at: s.at, transition: s }))].sort((a, b) => a.at - b.at),
    [replay],
  );
  const entry = entries.find((e) => e.id === inspected) ?? null;
  return (
    <section className="card r-tools" aria-labelledby="tools-h">
      <div>
        <p className="kicker">4 · Every tool call</p>
        <h2 id="tools-h" className="title">
          Tool timeline
        </h2>
        <p className="small muted">Select a call to inspect what the agent sent and what the PoktaClinic API answered.</p>
        <ol className="r-timeline">
          {entries.map((e) => {
            const state = e.at > t ? "is-future" : e.kind === "call" && e.call.end > t ? "is-active" : "is-past";
            const name = e.kind === "call" ? e.call.tool : `workflow to ${NODE_LABELS[e.transition.to] ?? e.transition.to}`;
            const meta = e.kind === "call" ? (e.call.response?.latency_secs != null ? `${Math.round(e.call.response.latency_secs * 1000)} ms` : "no result") : (e.transition.edge ?? "");
            return (
              <li key={e.id}>
                <button type="button" className={`r-row ${state} ${e.id === inspected ? "is-selected" : ""} ${e.kind === "transition" ? "is-stage" : ""}`} onClick={() => onSelect(e.id)} aria-pressed={e.id === inspected}>
                  <span className="num muted">{formatClock(e.at)}</span>
                  <code>{name}</code>
                  <span className="small muted num">{meta}</span>
                  {e.kind === "call" && e.call.response?.is_error && <span className="pill pill-spot">error</span>}
                </button>
              </li>
            );
          })}
        </ol>
      </div>
      <div className="r-inspector" aria-live="polite">
        {entry ? <Inspector entry={entry} onSeek={onSeek} /> : <p className="small muted">No tool calls in this conversation.</p>}
      </div>
    </section>
  );
}

function Inspector({ entry, onSeek }: { entry: Entry; onSeek: (t: number) => void }) {
  if (entry.kind === "transition") {
    const s = entry.transition;
    return (
      <>
        <h3 className="r-insp-title">
          Workflow move to <code>{s.to}</code>
        </h3>
        <p className="small soft">
          The agent met the exit condition of its current workflow node (<code>{s.request.tool_name}</code>) and the platform followed edge <code>{s.edge ?? "unknown"}</code>. The next node swaps in its own prompt, tools and, for History, its own LLM.
        </p>
        <button type="button" className="link-btn small" onClick={() => onSeek(Math.max(0, s.at - 2))}>
          Play from {formatClock(Math.max(0, s.at - 2))}
        </button>
        <Json label="Result" value={s.response.result} />
      </>
    );
  }
  const c = entry.call;
  const info = TOOLS[c.tool];
  return (
    <>
      <h3 className="r-insp-title">
        <code>{c.tool}</code>{" "}
        <span className={`pill ${c.response?.is_error ? "pill-spot" : c.response ? "pill-ok" : "pill-attn"}`}>{c.response?.is_error ? "error" : c.response ? "ok" : "no result"}</span>
      </h3>
      <p className="small soft">
        {info?.summary ?? `${c.type} tool`}
        {c.stage && ` · during ${NODE_LABELS[c.stage] ?? c.stage}`} · called at {formatClock(c.start)}
        {c.response?.latency_secs != null && ` · answered in ${Math.round(c.response.latency_secs * 1000)} ms`}
      </p>
      {info && (
        <ul className="x-requests small">
          {info.touches.map((touch) => (
            <li key={touch.edge + touch.request}>
              <span className="muted">{touch.edge.replace("api-", "")}</span> {touch.request}
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="link-btn small" onClick={() => onSeek(Math.max(0, c.start - 3))}>
        Play from {formatClock(Math.max(0, c.start - 3))}
      </button>
      <Json label="Parameters the LLM chose" value={c.request.params} />
      {c.request.url && <Json label={`Request: ${c.request.method ?? "POST"} ${c.request.url}`} value={c.request.body} note="Body as sent, including the conversation_id the platform injects from a system variable. The secret header is not exported." />}
      <Json label="Response" value={c.response?.result ?? null} />
    </>
  );
}

function Json({ label, value, note }: { label: string; value: unknown; note?: string }) {
  return (
    <div className="r-json">
      <p className="x-subhead">{label}</p>
      {note && <p className="small muted">{note}</p>}
      <pre tabIndex={0}>{JSON.stringify(value, null, 2)}</pre>
    </div>
  );
}

const humanize = (id: string) => id.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
const formatValue = (v: unknown) => (v === true ? "Yes" : v === false ? "No" : v === null || v === "" ? "None" : typeof v === "string" ? v : JSON.stringify(v));

function AnalysisPanel({ conversation: c }: { conversation: ReviewConversation }) {
  const a = c.analysis;
  return (
    <section className="card r-analysis" aria-labelledby="analysis-h">
      <p className="kicker">5 · Post-call analysis</p>
      <h2 id="analysis-h" className="title">
        How the platform graded this call{" "}
        <span className={`pill ${a.call_successful === "success" ? "pill-ok" : a.call_successful === "failure" ? "pill-spot" : "pill-attn"}`}>call {a.call_successful ?? "unknown"}</span>
      </h2>
      <p className="small muted">ElevenLabs runs the agent&apos;s evaluation criteria and data collection on the transcript after the call ends. Rationales are written by the grading LLM.</p>
      {a.transcript_summary && (
        <div>
          <h3 className="x-subhead">Summary</h3>
          <p className="r-summary">{a.transcript_summary}</p>
        </div>
      )}
      <div className="r-analysis-grid">
        <div>
          <h3 className="x-subhead">Evaluation criteria</h3>
          <ul className="r-criteria">
            {a.evaluation_criteria.map((e) => (
              <li key={e.id}>
                <p>
                  <strong>{humanize(e.id)}</strong> <span className={`pill ${e.result === "success" ? "pill-ok" : e.result === "failure" ? "pill-spot" : "pill-attn"}`}>{e.result}</span>
                </p>
                <p className="small soft">{e.rationale}</p>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="x-subhead">Data collection</h3>
          <dl className="r-data">
            {a.data_collection.map((d) => (
              <div key={d.id}>
                <dt>
                  {humanize(d.id)} <code className="muted small">{d.id}</code>
                </dt>
                <dd>
                  <strong>{formatValue(d.value)}</strong>
                  {d.description && <span className="small muted r-desc">{d.description}</span>}
                  {d.rationale && (
                    <details className="small">
                      <summary>Rationale</summary>
                      <p className="soft">{d.rationale}</p>
                    </details>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}

const KB_NOTES: Record<string, string> = {
  aviso: "The aviso de privacidad (privacy notice) the Consent step is grounded on.",
  faq: "Clinic FAQ: costs, insurance, branches and hours, for questions at any step.",
  "primera-visita": "First-visit guide: when to arrive, what to bring, how long it takes.",
};

function ConfigPanel({ config, manifest }: { config: ConfigIndex; manifest: ReviewManifest }) {
  const href = (path: string) => `/review/config/${path}`;
  const of = (kind: string) => config.files.filter((f) => f.kind === kind);
  const mismatch = manifest.call_version_id && config.agent_version_id && manifest.call_version_id !== config.agent_version_id;
  return (
    <section className="card r-config" aria-labelledby="config-h">
      <p className="kicker">6 · Configuration</p>
      <h2 id="config-h" className="title">
        The agent as pushed
      </h2>
      <p className="small muted">
        The files the ElevenLabs CLI pushes for this agent, generated from TypeScript in the repo. Tool secret headers are references to a workspace secret (<code>secret_id</code>), never the value.
        {mismatch && (
          <>
            {" "}
            This call ran on agent version <code>{manifest.call_version_id}</code>; these files are version <code>{config.agent_version_id}</code>, the latest push.
          </>
        )}
      </p>
      <div className="r-config-grid">
        <div>
          <h3 className="x-subhead">Agent and workflow</h3>
          <ul className="r-files">
            {of("agent").map((f) => (
              <li key={f.path}>
                <a href={href(f.path)}>{f.path}</a>
                <span className="small soft">Full agent: base prompt, LLMs, voice and language presets, workflow, evaluation criteria and data collection.</span>
              </li>
            ))}
            {of("workflow").map((f) => (
              <li key={f.path}>
                <a href={href(f.path)}>{f.path}</a>
                <span className="small soft">The workflow alone: Consent, Identification, History, Scheduling and Escalation nodes, each with its own prompt and tools, and the conditions on every edge.</span>
              </li>
            ))}
          </ul>
          <h3 className="x-subhead">Knowledge base</h3>
          <ul className="r-files">
            {of("kb").map((f) => (
              <li key={f.path}>
                <a href={href(f.path)}>{f.path}</a>
                <span className="small soft">{KB_NOTES[f.name] ?? "Knowledge base document."}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="x-subhead">Webhook tools</h3>
          <ul className="r-files">
            {of("tool").map((f) => (
              <li key={f.path}>
                <a href={href(f.path)}>{f.path}</a>
                <span className="small soft">{TOOLS[f.name]?.summary ?? "Webhook tool."}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
