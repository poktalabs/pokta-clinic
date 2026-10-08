import Link from "next/link";
import results from "@/test-results/results.json";
import styles from "./test-results.module.css";

// The ElevenLabs platform test suite and its latest results, for reviewers who cannot open the agent's
// Tests tab in our workspace. Data: src/test-results/results.json, written by `pnpm tests:export`
// (scripts/export-test-results.ts) from the test definitions, the agent config and GET-only API reads.
// Rendered in full on /testing; the home page shows TestedLine, a one-line summary linking there.

const WHEN = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Mexico_City" });
const when = (iso: string | null) => (iso ? `${WHEN.format(new Date(iso))} (Mexico City)` : "not run yet");
const { totals } = results;
const allPassed = totals.runs > 0 && totals.passed === totals.runs;
const rate = (passed: number | null, runs: number | null) => (runs ? `${passed ?? 0}/${runs}` : "not run");

/** One line for the home page: links to the full panel on /testing. */
export function TestedLine({ className }: { className?: string }) {
  return (
    <p className={`${styles.line} ${className ?? ""}`}>
      <span className={`pill ${allPassed ? "pill-ok" : "pill-attn"}`}>Tested</span>{" "}
      <Link href="/testing">
        {totals.passed} of {totals.runs} platform test runs passed
      </Link>{" "}
      <span className="muted small">
        ({totals.tests} ElevenLabs agent tests, latest run {totals.last_run_at ? WHEN.format(new Date(totals.last_run_at)) : "pending"})
      </span>
    </p>
  );
}

/** The full panel on /testing: platform tests, run history, scripted calls, post-call analysis, how to rerun. */
export function TestResults({ id, kicker, title }: { id?: string; kicker: string; title: string }) {
  const headingId = `${id ?? "tests"}-h`;
  return (
    <section id={id} aria-labelledby={headingId} className={`card ${styles.panel}`}>
      <header className={styles.head}>
        <p className="kicker">{kicker}</p>
        <h2 id={headingId} className="headline">
          {title}
        </h2>
        <p className={styles.lede}>
          The agent&apos;s behavior is checked three ways: platform tests run by ElevenLabs Agent Testing against the live agent, scripted text calls, and the post-call analysis the platform runs on every real call.
        </p>
      </header>

      <div className={styles.stat}>
        <span className={`pill pill-lg ${allPassed ? "pill-ok" : "pill-attn"}`}>
          {totals.passed} of {totals.runs} passed
        </span>
        <p className="small soft">
          Latest run of each of the {totals.tests} platform tests, {when(totals.last_run_at)}. Each test runs several times because the agent and the judge are LLMs: one pass proves little.
        </p>
      </div>

      <p className={styles.story}>
        <strong>Found a real bug:</strong> refused consent ended without a goodbye (the call ended on the &ldquo;Un momento&rdquo; filler, 1 run in 5). Fixed in the workflow&apos;s end edges; now passing.
      </p>

      <h3 className="x-subhead">1 · Platform tests (ElevenLabs Agent Testing)</h3>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Test</th>
              <th scope="col">Type</th>
              <th scope="col">Checks</th>
              <th scope="col" className={styles.num}>
                Passed
              </th>
            </tr>
          </thead>
          <tbody>
            {results.tests.map((t) => (
              <tr key={t.key}>
                <td>
                  <strong>{t.name}</strong>
                  <code className={styles.key}>{t.key}</code>
                </td>
                <td className={styles.type}>
                  {t.type}
                  <span className="small muted">{t.node === "start" ? "full call" : `starts at ${t.node}`}</span>
                </td>
                <td>
                  {t.checks.length > 1 ? (
                    <details className={styles.checks}>
                      <summary>{t.summary}</summary>
                      <ul>
                        {t.checks.map((c) => (
                          <li key={c}>{c}</li>
                        ))}
                      </ul>
                    </details>
                  ) : (
                    <span className={styles.checksOne}>{t.summary}</span>
                  )}
                </td>
                <td className={styles.num}>
                  <span className={`pill ${t.runs && t.passed === t.runs ? "pill-ok" : t.runs ? "pill-spot" : "pill-attn"}`}>{rate(t.passed, t.runs)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p role="note" className={styles.note}>
        Every simulation mocks all of the agent&apos;s webhook tools, and next-reply and tool-call tests only generate the agent&apos;s next turn, so no test touches the EHR, the calendar or the mailer: no production data is read or written.
      </p>

      {results.history.length > 0 && (
        <details className={styles.history}>
          <summary>Run history ({results.history.length} invocations)</summary>
          <ol>
            {results.history.map((h) => (
              <li key={h.invocation_id}>
                <span className="num">{WHEN.format(new Date(h.run_at))}</span>
                <span>
                  {h.title}
                  {h.repeat > 1 ? `, ${h.repeat} runs each` : ""}
                </span>
                <span className={`pill ${h.passed === h.runs ? "pill-ok" : "pill-attn"}`}>
                  {h.passed}/{h.runs}
                </span>
              </li>
            ))}
          </ol>
        </details>
      )}

      <div className={styles.layers}>
        <div>
          <h3 className="x-subhead">2 · Scripted text calls ({results.scenarios.length})</h3>
          <p className="small muted">
            A scripted caller talks to the live agent over the text WebSocket API, with the real tools and fictional patients; the run prints the workflow nodes, tool calls and post-call analysis for review. Run one with <code>pnpm agent:converse &lt;name&gt;</code>.
          </p>
          <ul className={styles.list}>
            {results.scenarios.map((s) => (
              <li key={s.key}>
                <code>{s.key}</code> <span className="small soft">{s.description}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="x-subhead">3 · Post-call analysis on every call</h3>
          <p className="small muted">
            {results.evaluation_criteria.length} evaluation criteria and {results.data_collection.length} data collection fields, graded by the platform after each call. The <Link href="/review">call review</Link> shows them for a recorded call.
          </p>
          <ul className={styles.list}>
            {results.evaluation_criteria.map((c) => (
              <li key={c.id}>
                <strong>{c.name}</strong> <span className="small soft">{c.checks}</span>
              </li>
            ))}
          </ul>
          <p className={styles.fields}>
            {results.data_collection.map((d) => (
              <code key={d.id} title={d.description}>
                {d.id}
              </code>
            ))}
          </p>
        </div>
      </div>

      <p className={`small ${styles.rerun}`}>
        <span className="muted">Rerun:</span> <code>pnpm agent:tests:run</code> (3 runs per test; uses credits, never changes the agent), then <code>pnpm tests:export</code> to refresh this page.
      </p>
      <p className="small muted">Source: {results.source}, exported {when(results.exported_at)}.</p>
    </section>
  );
}
