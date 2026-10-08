import type { Metadata } from "next";
import Link from "next/link";
import { DECISIONS, GROUPS, REPO_BLOB, type Decision } from "@/decisions/data";
import { ROADMAP, type RoadmapItem } from "@/decisions/roadmap";
import styles from "./decisions.module.css";

export const metadata: Metadata = {
  title: "PoktaClinic: decision log",
  description: "The design decisions behind PoktaClinic, with context, alternatives, trade-offs and links to the code.",
};

const DATE = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });
const formatDate = (iso: string) => DATE.format(new Date(`${iso}T00:00:00Z`));

function StatusPill({ d }: { d: Decision }) {
  const current = d.status === "current";
  return (
    <span className={`${styles.pill} ${current ? styles.pillOk : styles.pillOld}`}>
      {current ? "Current" : "Superseded"}
      {d.statusNote && <span className={styles.pillNote}> · {d.statusNote}</span>}
    </span>
  );
}

function Card({ d }: { d: Decision }) {
  return (
    <article id={d.id} className={styles.card} aria-labelledby={`${d.id}-h`}>
      <header className={styles.cardHead}>
        <div className={styles.cardMeta}>
          <StatusPill d={d} />
          <time dateTime={d.date} className="small muted">
            {formatDate(d.date)}
          </time>
        </div>
        <h3 id={`${d.id}-h`} className={styles.cardTitle}>
          <a href={`#${d.id}`} className={styles.anchor} aria-label={`Link to ${d.title}`}>
            #
          </a>
          {d.title}
        </h3>
      </header>

      <p className={styles.decision}>{d.decision}</p>

      <dl className={styles.fields}>
        <div>
          <dt>Context</dt>
          <dd>{d.context}</dd>
        </div>
        <div>
          <dt>Alternatives considered</dt>
          <dd>
            <ul className={styles.alts}>
              {d.alternatives.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </dd>
        </div>
        <div>
          <dt>Why</dt>
          <dd>{d.why}</dd>
        </div>
        <div>
          <dt>Trade-off</dt>
          <dd>{d.tradeoff}</dd>
        </div>
      </dl>

      <footer className={styles.links}>
        <span className={styles.linksLabel}>Code</span>
        {d.code.map((c) => (
          <a key={c.path + c.label} href={`${REPO_BLOB}${c.path}`} className={styles.codeLink} target="_blank" rel="noreferrer">
            {c.label}
          </a>
        ))}
        {d.related?.map((r) => (
          <Link key={r.href + r.label} href={r.href} className={styles.pageLink}>
            {r.label} →
          </Link>
        ))}
      </footer>
    </article>
  );
}

function RoadmapCard({ r }: { r: RoadmapItem }) {
  return (
    <article id={r.id} className={styles.card} aria-labelledby={`${r.id}-h`}>
      <header className={styles.cardHead}>
        <div className={styles.cardMeta}>
          <span className={`${styles.pill} ${styles.pillOk}`}>{r.kind}</span>
        </div>
        <h3 id={`${r.id}-h`} className={styles.cardTitle}>
          <a href={`#${r.id}`} className={styles.anchor} aria-label={`Link to ${r.title}`}>
            #
          </a>
          {r.title}
        </h3>
      </header>

      <p className={styles.decision}>{r.what}</p>

      <dl className={styles.fields}>
        <div>
          <dt>Why</dt>
          <dd>{r.why}</dd>
        </div>
        <div>
          <dt>How it plugs in</dt>
          <dd>{r.how}</dd>
        </div>
        <div>
          <dt>Effort</dt>
          <dd>{r.effort}</dd>
        </div>
      </dl>

      <footer className={styles.links}>
        <span className={styles.linksLabel}>Sources</span>
        {r.sources.map((s) => (
          <a key={s.href} href={s.href} className={styles.pageLink} target="_blank" rel="noreferrer">
            {s.label} ↗
          </a>
        ))}
        {r.code?.map((c) => (
          <a key={c.path} href={`${REPO_BLOB}${c.path}`} className={styles.codeLink} target="_blank" rel="noreferrer">
            {c.label}
          </a>
        ))}
      </footer>
    </article>
  );
}

// The decision log a Forward Deployed Engineer would want in a handoff. Content: src/decisions/data.ts.
export default function DecisionsPage() {
  const superseded = DECISIONS.filter((d) => d.status === "superseded").length;
  return (
    <>
      <main className={`wrap page ${styles.page}`}>
        <section aria-labelledby="dl-h" className={styles.intro}>
          <p className="kicker">Decision log</p>
          <h1 id="dl-h" className="headline">
            Why PoktaClinic is built the way it is.
          </h1>
          <p className={styles.lede}>
            {DECISIONS.length} decisions ({superseded} superseded), each with its context, the alternatives, the trade-off and links to the code. Dates are commit dates. Related: the <Link href="/tools">tool reference</Link> and the{" "}
            <Link href="/explainer">live system view</Link>. <Link href="/testing">How it is tested →</Link>
          </p>
          <p role="note" className={styles.note}>
            The GitHub repository (poktalabs/pokta-clinic) is private: code links work for people with access.
          </p>
        </section>

        <nav aria-label="Decision index" className={styles.index}>
          {GROUPS.map((g) => (
            <div key={g.id} className={styles.indexGroup}>
              <h2 className={styles.indexHead}>
                <a href={`#group-${g.id}`}>{g.label}</a>
              </h2>
              <ol className={styles.indexList}>
                {DECISIONS.filter((d) => d.group === g.id).map((d) => (
                  <li key={d.id}>
                    <a href={`#${d.id}`}>{d.title}</a>
                    {d.status === "superseded" && <span className={styles.indexTag}>superseded</span>}
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </nav>

        {GROUPS.map((g) => (
          <section key={g.id} id={`group-${g.id}`} aria-labelledby={`group-${g.id}-h`} className={styles.group}>
            <div className={styles.groupHead}>
              <h2 id={`group-${g.id}-h`} className="headline">
                {g.label}
              </h2>
              <p className="muted">{g.blurb}</p>
            </div>
            <div className={styles.cards}>
              {DECISIONS.filter((d) => d.group === g.id).map((d) => (
                <Card key={d.id} d={d} />
              ))}
            </div>
          </section>
        ))}

        <section id="roadmap" aria-labelledby="roadmap-h" className={styles.group}>
          <div className={styles.groupHead}>
            <h2 id="roadmap-h" className="headline">
              Roadmap and expansion
            </h2>
            <p className="muted">Where the clinic gets more value from more ElevenLabs products. Not built yet.</p>
          </div>
          <div className={styles.cards}>
            {ROADMAP.map((r) => (
              <RoadmapCard key={r.id} r={r} />
            ))}
          </div>
        </section>

        <p className={`small muted ${styles.back}`}>
          <a href="#dl-h">Back to the index</a>
        </p>
      </main>
    </>
  );
}
