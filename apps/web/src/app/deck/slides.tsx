import type { CSSProperties, ReactNode } from "react";
import s from "./deck.module.css";

// Slide content for /deck. Every number and technical claim here is checked against the repo
// (agent/src, docs/agent.md) or the cited source; change one only with its source.

export interface Slide {
  /** Short label for the notes panel and the slide's aria-label. */
  label: string;
  body: ReactNode;
  /** What to say over the slide (shown with N). About 110 spoken words across the deck, ~45 seconds. */
  notes: string;
}

// ---- components (the framework's stamp, kicker, sequence, split, timeline, prompt) ----

function Stamp({ title, sub }: { title: string; sub: string }) {
  return (
    <div className={s.stamp}>
      <strong>{title}</strong>
      <span>{sub}</span>
    </div>
  );
}

function Kicker({ children }: { children: ReactNode }) {
  return <p className={s.kicker}>{children}</p>;
}

function Sequence({ cols, children }: { cols: number; children: ReactNode }) {
  return (
    <div className={s.sequence} style={{ "--cols": cols } as CSSProperties}>
      {children}
    </div>
  );
}

function Item({ code, title, children, lead, tag }: { code: string; title: ReactNode; children?: ReactNode; lead?: boolean; tag?: ReactNode }) {
  return (
    <article className={lead ? s.lead : undefined}>
      <span className={s.code}>{code}</span>
      <h2>{title}</h2>
      {children ? <p>{children}</p> : null}
      {tag ? <span className={s.tag}>{tag}</span> : null}
    </article>
  );
}

function Split({ children }: { children: ReactNode }) {
  return <div className={s.split}>{children}</div>;
}

function Column({ heading, items, brand }: { heading: string; items: ReactNode[]; brand?: boolean }) {
  return (
    <div className={brand ? `${s.column} ${s.columnBrand}` : `${s.column} ${s.columnSoft}`}>
      <p className={s.columnHead}>{heading}</p>
      <ul>
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function Timeline({ steps }: { steps: { code: string; title: string; sub: ReactNode; lead?: boolean; branches?: { title: string; sub: string }[] }[] }) {
  return (
    <ol className={s.timeline}>
      {steps.map((step) => (
        <li key={step.code} className={step.lead ? s.lead : undefined}>
          <span className={s.code}>{step.code}</span>
          <h2>{step.title}</h2>
          <p>{step.sub}</p>
          {step.branches ? (
            <ul className={s.branches}>
              {step.branches.map((b) => (
                <li key={b.title}>
                  <b>{b.title}</b>
                  <span>{b.sub}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

function Prompt({ children }: { children: ReactNode }) {
  return (
    <p className={s.prompt}>
      <span aria-hidden="true">›</span>
      {children}
    </p>
  );
}

function Source({ href, children }: { href?: string; children: ReactNode }) {
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ) : (
    <span>{children}</span>
  );
}

// ---- slides ----

export const SLIDES: Slide[] = [
  {
    label: "Title",
    body: (
      <>
        <Stamp title="POKTACLINIC" sub="Pokta Labs / ElevenLabs Agents" />
        <h1 className={s.hero}>
          Voice <span className={s.nowrap}>pre-consultation</span> for rheumatology in Mexico.
        </h1>
        <p className={s.lede}>
          Built on <b>ElevenLabs Agents.</b>
        </p>
        <p className={s.micro}>
          Mel <b>·</b> Solutions Engineer candidate
        </p>
      </>
    ),
    notes: "I'm Mel. This is a handoff of PoktaClinic: an ElevenLabs voice agent that runs pre-consultation calls for a Mexico City rheumatology network.",
  },
  {
    label: "The queue",
    body: (
      <>
        <Kicker>01 / The queue</Kicker>
        <h1>
          <span className={s.em}>24 months</span> from referral to a rheumatology <span className={s.nowrap}>pre-consultation.</span>
        </h1>
        <div className={s.stats}>
          <div className={s.stat}>
            <div className={`${s.v} ${s.tone}`}>0.58</div>
            <div className={s.l}>rheumatologists per 100,000 people (minimum recommended 1.0)</div>
          </div>
          <div className={s.stat}>
            <div className={s.v}>733</div>
            <div className={s.l}>certified and active rheumatologists</div>
          </div>
          <div className={s.stat}>
            <div className={s.v}>58%</div>
            <div className={s.l}>of them in three metro areas</div>
          </div>
          <div className={s.stat}>
            <div className={`${s.v} ${s.tone}`}>24 mo</div>
            <div className={s.l}>median wait, referral to pre-consultation (INR, 2023-24 cohort)</div>
          </div>
        </div>
        <p className={s.sources}>
          Sources:{" "}
          <Source href="https://www.reumatologiaclinica.org/es-situacion-reumatologia-mexico-deficit-reumatologos-avance-S1699258X22000171">Reumatología Clínica, 2022</Source>
          {" · "}
          <Source href="https://dsm.inr.gob.mx/indiscap/index.php/INDISCAP/article/view/769">Instituto Nacional de Rehabilitación (INR)</Source>
        </p>
      </>
    ),
    notes: "Mexico has half the recommended rheumatologists; the median wait for a first pre-consultation is 24 months.",
  },
  {
    label: "Who pays",
    body: (
      <>
        <Kicker>02 / Who pays, and what it replaces</Kicker>
        <h1>
          Front desks take the calls. Specialists <span className={s.nowrap}>re-take</span> the history.
        </h1>
        <Split>
          <Column
            heading="Today · Grupo Médico Articular (fictional, 3 branches)"
            items={[
              "Front desks answer every call, office hours only",
              <>
                Approx. MXN 9,670/month per receptionist, per branch <small>CDMX, Indeed MX</small>
              </>,
              "Takes consent, registers the patient, books",
              "The specialist spends the first visit re-taking the history",
            ]}
          />
          <Column
            brand
            heading="With PoktaClinic"
            items={[
              "Consent under the LFPDPPP, then identification",
              <>
                Structured first-visit history into the EHR <small>FHIR QuestionnaireResponse, pending clinician review</small>
              </>,
              "Booking into the real branch calendars",
              "Red-flag escalation",
            ]}
          />
        </Split>
        <p className={s.metric}>
          <span>Success metric</span> specialist minutes saved per first visit <b>·</b> calls answered <b>·</b> no-shows
        </p>
        <p className={s.sources}>
          Source: <Source href="https://mx.indeed.com/career/recepcionista/salaries/Ciudad-de-M%C3%A9xico">Indeed MX, receptionist salaries in Mexico City (approx.)</Source>
        </p>
      </>
    ),
    notes: "The buyer is the operations lead, paying front desks about 9,670 pesos a month per receptionist, office hours only, while specialists re-take the history. Metric: specialist minutes saved, calls answered, no-shows.",
  },
  {
    label: "Market proof",
    body: (
      <>
        <Kicker>03 / Market proof</Kicker>
        <h1>Voice front desks for healthcare are being bought now.</h1>
        <Sequence cols={3}>
          <Item code="Jun 2026" title="Assort Health" lead tag={<Source href="https://hitconsultant.net/2026/06/24/assort-health-raises-120-million-series-c-menlo/">HIT Consultant</Source>}>
            $120M Series C at a $1.2B valuation. ~15,000 doctors.
          </Item>
          <Item code="Sep 2025" title="Hello Patient">
            $22.5M Series A.
          </Item>
          <Item code="Oct 2026" title="Banner Health" tag={<Source href="https://elevenlabs.io/blog/banner-health">ElevenLabs blog</Source>}>
            Live on ElevenAgents for scheduling.
          </Item>
        </Sequence>
      </>
    ),
    notes: "Buyers are paying: Assort Health is valued at 1.2 billion, and Banner Health runs on ElevenAgents.",
  },
  {
    label: "Beyond the reference build",
    body: (
      <>
        <Kicker>04 / Beyond the reference build</Kicker>
        <h1>
          Beyond the ElevenLabs <span className={s.em}>healthcare scheduling</span> reference.
        </h1>
        <Sequence cols={3}>
          <Item code="01" title="Spanish first" lead>
            English through a language preset.
          </Item>
          <Item code="02" title="Consent gate">
            LFPDPPP consent before any personal data.
          </Item>
          <Item code="03" title="Clinical questionnaire">
            FHIR first-visit history, not just a slot.
          </Item>
          <Item code="04" title="Red-flag escalation">
            911 or the ER, from any step.
          </Item>
          <Item code="05" title="Knowledge base">
            Guide and FAQ, retrieved with RAG.
          </Item>
          <Item code="06" title="Scored on every call">
            6 evaluation criteria, 9 data fields.
          </Item>
        </Sequence>
        <p className={s.sources}>
          Reference:{" "}
          <Source href="https://elevenlabs.io/blog/elevenagents-for-healthcare-build-an-inbound-appointment-scheduling-agent">ElevenAgents for healthcare: build an inbound appointment scheduling agent</Source>
        </p>
      </>
    ),
    notes: "Beyond the ElevenLabs healthcare reference: Spanish first, legal consent, a clinical questionnaire, red-flag escalation and RAG.",
  },
  {
    label: "Architecture",
    body: (
      <>
        <Kicker>05 / How it is built</Kicker>
        <h1 className={s.compact}>One call, three systems.</h1>
        <Timeline
          steps={[
            { code: "01", title: "Caller", sub: "Spanish first, English on request" },
            {
              code: "02",
              title: "ElevenLabs agent",
              lead: true,
              sub: (
                <>
                  Workflow: consent, identification, history, scheduling, escalation. <small>Gemini Flash; Claude Sonnet on History and Scheduling</small>
                </>
              ),
            },
            { code: "03", title: "PoktaClinic API", sub: "Next.js on Vercel, 10 webhook tools" },
            {
              code: "04",
              title: "What it writes to",
              sub: "",
              branches: [
                { title: "EHR", sub: "FHIR R4, on Render" },
                { title: "Google Calendar", sub: "one per branch, 3 branches" },
                { title: "Email", sub: "Resend" },
              ],
            },
          ]}
        />
        <Prompt>Live demo next</Prompt>
      </>
    ),
    notes: "One workflow, ten webhook tools, writing to an EHR, branch calendars and email. Live demo next.",
  },
];
