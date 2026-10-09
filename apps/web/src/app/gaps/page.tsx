import type { Metadata } from "next";
import Link from "next/link";
import { REPO_BLOB } from "@/decisions/data";
import { GAPS, GROUPS, bySeverity, type Gap, type Severity } from "@/gaps/data";
import { VIDEO, VIDEO_LENGTH } from "@/gaps/video";
import { OpenFromHash } from "../decisions/open-from-hash";
import styles from "../decisions/decisions.module.css";
import g from "./gaps.module.css";

export const metadata: Metadata = {
  title: "PoktaClinic: production gaps",
  description: "What stands between the PoktaClinic demo and a real clinic network: regulatory, legal, clinical, integration and operations gaps, with fixes and sources.",
};

const SEV_CLASS: Record<Severity, string> = { "blocks launch": g.sevLaunch, "before scale": g.sevScale, hardening: g.sevHardening };

function SeverityPill({ s }: { s: Severity }) {
  return <span className={`${styles.pill} ${SEV_CLASS[s]}`}>{s}</span>;
}

const isUrl = (href: string) => href.startsWith("http");

// Collapsed by default, like the decision cards: the gap in one sentence, why and the fix. The rest sits in <details>.
function Card({ x }: { x: Gap }) {
  return (
    <article id={x.id} className={styles.card} aria-labelledby={`${x.id}-h`}>
      <header className={styles.cardHead}>
        <div className={styles.cardMeta}>
          <SeverityPill s={x.severity} />
        </div>
        <h3 id={`${x.id}-h`} className={styles.cardTitle}>
          <a href={`#${x.id}`} className={styles.anchor} aria-label={`Link to ${x.title}`}>
            #
          </a>
          {x.title}
        </h3>
      </header>

      <p className={styles.decision}>{x.summary}</p>
      <p className={styles.why}>
        <span className={styles.whyLabel}>Why</span> {x.presentWhy}
      </p>
      <p className={styles.why}>
        <span className={`${styles.whyLabel} ${g.fixLabel}`}>Fix</span> {x.presentFix}
      </p>

      <details className={styles.more}>
        <summary>Details</summary>
        <div className={styles.moreBody}>
          <dl className={styles.fields}>
            <div>
              <dt>Why it matters</dt>
              <dd>{x.why}</dd>
            </div>
            <div>
              <dt>Fix</dt>
              <dd>{x.fix}</dd>
            </div>
            <div>
              <dt>Effort</dt>
              <dd>{x.effort}</dd>
            </div>
          </dl>

          <footer className={styles.links}>
            <span className={styles.linksLabel}>Sources</span>
            {x.evidence.map((e) =>
              isUrl(e.href) ? (
                <a key={e.href + e.label} href={e.href} className={styles.pageLink} target="_blank" rel="noreferrer">
                  {e.label} ↗
                </a>
              ) : (
                <a key={e.href + e.label} href={`${REPO_BLOB}${e.href}`} className={styles.codeLink} target="_blank" rel="noreferrer">
                  {e.label}
                </a>
              ),
            )}
            {x.related?.map((r) => (
              <Link key={r.href + r.label} href={r.href} className={styles.pageLink}>
                {r.label} →
              </Link>
            ))}
          </footer>
        </div>
      </details>
    </article>
  );
}

// What a Forward Deployed Engineer must close before a real clinic network goes live. Above the fold, the
// 5 gaps the walkthrough video covers (src/gaps/video.ts); below it, an index and collapsed cards for every
// gap, grouped. /gaps/present shows the same content one gap per screen. Layout shared with /decisions.
export default function GapsPage() {
  const blockers = GAPS.filter((x) => x.severity === "blocks launch").length;
  return (
    <>
      <OpenFromHash />
      <main className={`wrap page ${styles.page}`}>
        <header className={styles.top}>
          <div className={styles.topCopy}>
            <p className="kicker">Production gaps</p>
            <h1 id="gaps-h" className="headline">
              What stands between this demo and a real clinic.
            </h1>
          </div>
          <Link href="/gaps/present" className={`btn btn-primary ${styles.present}`}>
            Present ▸
          </Link>
        </header>

        <section aria-labelledby="video-h" className={styles.video}>
          <div className={styles.videoHead}>
            <h2 id="video-h" className={styles.videoTitle}>
              {VIDEO.length} gaps before production
            </h2>
            <span className={styles.videoTime}>{VIDEO_LENGTH}</span>
          </div>
          <ol className={styles.videoList}>
            {VIDEO.map((v, i) => (
              <li key={v.id} className={styles.videoItem}>
                <span className={styles.videoNum} aria-hidden="true">
                  {i + 1}
                </span>
                <h3 className={styles.videoItemTitle}>
                  <a href={`#${v.id}`}>{v.title}</a>
                </h3>
                <div className={styles.videoText}>
                  <p className={styles.videoWhat}>{v.gap}</p>
                  <p className={styles.videoWhy}>
                    <span className={`${styles.whyLabel} ${g.fixLabel}`}>Fix</span> {v.fix}
                  </p>
                  <p className={styles.videoCards}>
                    <span className={styles.videoCardsLabel}>Full card</span>
                    <a href={`#${v.id}`}>Why, effort and sources</a>
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="all-h" className={styles.intro}>
          <h2 id="all-h" className="headline">
            All gaps
          </h2>
          <p className={styles.lede}>
            {GAPS.length} gaps ({blockers} block launch), each in one sentence with why and the fix, most severe first in each group. Open a card&apos;s details for the full reasoning, the effort and the sources. Regulatory items say what needs classification or legal review; they are not legal advice.
          </p>
          <p className="small muted">
            Present mode shows the {VIDEO.length} above, one per screen; <Link href="/gaps/present?all=1">all {GAPS.length}</Link> are a click away. Related: <Link href="/decisions">decisions</Link>, <Link href="/testing">how it is tested</Link>, <Link href="/decisions#roadmap">roadmap and expansion →</Link>
          </p>
        </section>

        <nav aria-label="Gap index" className={styles.index}>
          {GROUPS.map((grp) => (
            <div key={grp.id} className={styles.indexGroup}>
              <h2 className={styles.indexHead}>
                <a href={`#group-${grp.id}`}>{grp.label}</a>
              </h2>
              <ol className={styles.indexList}>
                {bySeverity(GAPS.filter((x) => x.group === grp.id)).map((x) => (
                  <li key={x.id}>
                    <span className={styles.indexItem}>
                      <a href={`#${x.id}`}>{x.title}</a>
                      <span className={x.severity === "blocks launch" ? styles.indexTag : `${styles.indexTag} ${g.tagMuted}`}>{x.severity}</span>
                      <span className={styles.indexSummary}>{x.summary}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </nav>

        {GROUPS.map((grp) => (
          <section key={grp.id} id={`group-${grp.id}`} aria-labelledby={`group-${grp.id}-h`} className={styles.group}>
            <div className={styles.groupHead}>
              <h2 id={`group-${grp.id}-h`} className="headline">
                {grp.label}
              </h2>
              <p className="muted">{grp.blurb}</p>
            </div>
            <div className={styles.cards}>
              {bySeverity(GAPS.filter((x) => x.group === grp.id)).map((x) => (
                <Card key={x.id} x={x} />
              ))}
            </div>
          </section>
        ))}

        <section aria-labelledby="next-h" className={styles.intro}>
          <h2 id="next-h" className="headline">
            After the gaps: expansion
          </h2>
          <p className={styles.lede}>
            Once the intake is in production, the same clinic gets more value from Scribe v2 Medical (a clinical-grade transcript of every intake call, then a consultation scribe for the rheumatologists) and outbound reminder calls. <Link href="/decisions#roadmap">Roadmap and expansion →</Link>
          </p>
        </section>

        <p className={`small muted ${styles.back}`}>
          <a href="#all-h">Back to the index</a>
        </p>
      </main>
    </>
  );
}
