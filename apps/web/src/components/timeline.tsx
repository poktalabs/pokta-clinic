"use client";
import { useRef, useState } from "react";
import { usePoll } from "./use-poll";

type ToolEvent = { id: string; conversationId: string; tool: string; ok: boolean; status: number; ms: number; at: number; outcome: string };

const POLL_MS = 1500;
const KEEP = 200;
const SHOW_CONVERSATIONS = 6;

const clock = (at: number) => new Date(at).toLocaleTimeString([], { hour12: false });

// Live tool calls, grouped by Conversation, newest Conversation on top. Polls /api/live/events while the tab is visible.
export function Timeline() {
  const [events, setEvents] = useState<ToolEvent[]>([]);
  const [offline, setOffline] = useState(false);
  const since = useRef(0);

  usePoll(async () => {
    try {
      const res = await fetch(`/api/live/events?since=${since.current}`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const { events: fresh } = (await res.json()) as { events: ToolEvent[] };
      setOffline(false);
      if (!fresh.length) return;
      since.current = Math.max(since.current, ...fresh.map((e) => e.at));
      setEvents((old) => {
        const seen = new Set(old.map((e) => e.id));
        return [...old, ...fresh.filter((e) => !seen.has(e.id))].sort((a, b) => a.at - b.at).slice(-KEEP);
      });
    } catch {
      setOffline(true);
    }
  }, POLL_MS);

  const groups = new Map<string, ToolEvent[]>();
  for (const e of events) groups.set(e.conversationId, [...(groups.get(e.conversationId) ?? []), e]);
  const ordered = [...groups.entries()].sort((a, b) => b[1][b[1].length - 1].at - a[1][a[1].length - 1].at).slice(0, SHOW_CONVERSATIONS);

  return (
    <section aria-labelledby="timeline-h" className="card">
      <div className="section-head">
        <h2 id="timeline-h" className="headline">
          Tool timeline
        </h2>
        <span className="small muted num" role="status">
          {offline ? "Reconnecting…" : "Live, refreshes every 1.5 s"}
        </span>
      </div>
      <p className="sub small">Every call the agent makes to a PoktaClinic tool. No patient answers, names or phones are shown.</p>
      {ordered.length === 0 ? (
        <p className="empty" style={{ marginTop: 20 }}>No tool calls yet. Start a conversation with the widget above.</p>
      ) : (
        <div aria-live="polite">
          {ordered.map(([id, list], i) => (
            <div key={id} className="convo">
              <h3 className="convo-head">
                <span>{id.length > 28 ? `${id.slice(0, 28)}…` : id}</span>
                {i === 0 && <span className="pill pill-brand">latest</span>}
              </h3>
              <ol className="events">
                {list.map((e) => (
                  <li key={e.id} className="event">
                    <time>{clock(e.at)}</time>
                    <span className="tool">{e.tool}</span>
                    <span className="outcome">{e.outcome}</span>
                    <span className="result">
                      <span className={e.ok ? "pill pill-ok" : "pill pill-spot"}>{e.ok ? "ok" : `error ${e.status}`}</span>
                      <span className="ms">{e.ms} ms</span>
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
