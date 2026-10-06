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
    <section aria-labelledby="timeline-h" className="rounded-xl border border-line bg-panel p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="timeline-h" className="text-xl font-semibold">
          Tool timeline
        </h2>
        <span className="text-sm text-muted" role="status">
          {offline ? "Reconnecting…" : "Live, refreshes every 1.5 s"}
        </span>
      </div>
      <p className="mt-1 text-muted">Every call the agent makes to a pokta-clinic tool. No patient answers, names or phones are shown.</p>
      {ordered.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-line p-4 text-muted">No tool calls yet. Start a conversation with the widget above.</p>
      ) : (
        <div className="mt-4 space-y-5" aria-live="polite">
          {ordered.map(([id, list], i) => (
            <div key={id}>
              <h3 className="mb-2 flex flex-wrap items-center gap-2 text-sm font-medium text-muted">
                <span className="font-mono">{id.length > 28 ? `${id.slice(0, 28)}…` : id}</span>
                {i === 0 && <span className="rounded-full bg-accent/15 px-2 py-0.5 text-xs text-accent">latest</span>}
              </h3>
              <ol className="divide-y divide-line rounded-lg border border-line">
                {list.map((e) => (
                  <li key={e.id} className="grid grid-cols-[4.5rem_1fr_auto] items-baseline gap-x-3 gap-y-1 px-3 py-2 sm:grid-cols-[5rem_11rem_1fr_auto]">
                    <time className="font-mono text-sm text-muted">{clock(e.at)}</time>
                    <span className="font-mono text-sm font-medium">{e.tool}</span>
                    <span className="col-span-2 sm:col-span-1 sm:col-start-3 sm:row-start-1">{e.outcome}</span>
                    <span className="flex items-center gap-2 justify-self-end text-sm">
                      <span className={e.ok ? "rounded bg-ok/15 px-1.5 py-0.5 font-medium text-ok" : "rounded bg-bad/15 px-1.5 py-0.5 font-medium text-bad"}>
                        {e.ok ? "ok" : `error ${e.status}`}
                      </span>
                      <span className="font-mono text-muted">{e.ms} ms</span>
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
