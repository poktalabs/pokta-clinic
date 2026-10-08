import type { Metadata } from "next";
import Link from "next/link";
import { formatClock } from "@/review/replay";
import { reviewIndex } from "@/review/files";

export const metadata: Metadata = { title: "PoktaClinic: recorded call reviews", robots: { index: false } };

const LANGUAGE_NAMES: Record<string, string> = { es: "Spanish", en: "English" };

// Lists the exported conversations (apps/web/public/review/index.json, written by `pnpm review:export`).
export default function ReviewIndexPage() {
  const conversations = reviewIndex();
  return (
    <>
      <main className="wrap x-wide x-page">
        <section aria-labelledby="ri-h">
          <p className="kicker">Call reviews</p>
          <h1 id="ri-h" className="headline">
            Recorded PoktaClinic calls, replayed with the system working alongside.
          </h1>
          <p className="sub">Each review plays the real call audio while the transcript, tool calls, workflow and Expediente follow it, with the post-call analysis and the agent configuration. All data is fictional.</p>
        </section>
        {conversations.length === 0 ? (
          <p className="empty">No conversations exported yet. Run pnpm review:export &lt;conversation_id&gt;.</p>
        ) : (
          <ul className="r-index">
            {conversations.map((c) => (
              <li key={c.conversation_id} className="card">
                <Link href={`/review/${c.conversation_id}`} className="title">
                  {c.title ?? c.conversation_id}
                </Link>
                <p className="small muted num">
                  <code>{c.conversation_id}</code>
                  {c.start_time_unix_secs && ` · ${new Date(c.start_time_unix_secs * 1000).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Mexico_City" })} (Mexico City)`}
                  {` · ${formatClock(c.call_duration_secs ?? 0)}`}
                  {c.main_language && ` · ${LANGUAGE_NAMES[c.main_language] ?? c.main_language}`}
                  {c.has_audio ? " · audio" : " · transcript only"}
                </p>
                <span className={`pill ${c.call_successful === "success" ? "pill-ok" : "pill-attn"}`}>{c.call_successful ?? "unknown"}</span>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
