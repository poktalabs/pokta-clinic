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

type Step = { code: string; title: string; sub: ReactNode; lead?: boolean; cost?: boolean; mark?: ReactNode; branches?: { title: string; sub: string }[] };

function Timeline({ steps, even }: { steps: Step[]; even?: boolean }) {
  return (
    <ol className={even ? `${s.timeline} ${s.even}` : s.timeline}>
      {steps.map((step) => (
        <li key={step.code} className={[step.lead ? s.lead : "", step.cost ? s.cost : ""].join(" ").trim() || undefined}>
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
          {step.mark ? <span className={s.mark}>{step.mark}</span> : null}
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
    label: "Who it's for",
    body: (
      <>
        <Kicker>01 / Who it&apos;s for</Kicker>
        <h1 className={s.compact}>Grupo Médico Articular: three rheumatology clinics in Mexico City.</h1>
        <p className={s.note}>A fictional network, built for this scenario. Today&apos;s first visit:</p>
        <Timeline
          even
          steps={[
            { code: "01", title: "A new patient calls", sub: "The branch front desk answers, office hours only.", cost: true, mark: "Cost: after-hours calls" },
            { code: "02", title: "Reception does the intake", sub: "Takes consent and registers by hand, then books.", cost: true, mark: "Cost: front-desk hours" },
            { code: "03", title: "The patient arrives", sub: "First visit at the branch." },
            { code: "04", title: "The rheumatologist re-takes the history", sub: "The start of the visit goes to intake questions.", cost: true, mark: "Cost: specialist minutes" },
          ]}
        />
        <p className={s.sources}>
          Rheumatologists are scarce in Mexico: 0.58 per 100,000 people, about half the recommended minimum.{" "}
          <Source href="https://www.reumatologiaclinica.org/es-situacion-reumatologia-mexico-deficit-reumatologos-avance-S1699258X22000171">Reumatología Clínica, 2022</Source>
        </p>
      </>
    ),
    notes: "The customer: three rheumatology clinics in Mexico City. Front desks register patients by hand, then rheumatologists re-take the history.",
  },
  {
    label: "What it replaces",
    body: (
      <>
        <Kicker>02 / What it replaces</Kicker>
        <h1 className={s.compact}>The first call does the intake, so the first visit starts with the history taken.</h1>
        <Timeline
          even
          steps={[
            { code: "01", title: "The agent answers", sub: "Any hour. Consent first, under the LFPDPPP.", lead: true, mark: "Was: front desk, office hours" },
            {
              code: "02",
              title: "Intake on the call",
              sub: (
                <>
                  Identifies or registers the patient, takes the first-visit history into the EHR, books a real branch slot. <small>History pending clinician review</small>
                </>
              ),
              lead: true,
              mark: "Was: registration by hand",
            },
            { code: "03", title: "The patient arrives", sub: "Same branch, same visit." },
            { code: "04", title: "The rheumatologist starts with the history", sub: "Reviews it instead of re-taking it.", lead: true, mark: "Was: re-taking the history" },
          ]}
        />
        <p className={`${s.metric} ${s.alert}`}>
          <span>Red flags</span> From any step, the agent sends the caller to 911 or the ER instead of booking.
        </p>
      </>
    ),
    notes: "PoktaClinic does that intake on the first call, any hour: consent, registration, history into the EHR, a real booking. Red flags go to 911.",
  },
  {
    label: "Why they pay",
    body: (
      <>
        <Kicker>03 / Why they pay</Kicker>
        <h1 className={s.compact}>Buyer: the network&apos;s operations lead.</h1>
        <Sequence cols={3}>
          <Item code="01" title="Every call answered">
            After hours too.
          </Item>
          <Item code="02" title="Specialist minutes back">
            On every first visit, so the same doctors see more patients.
          </Item>
          <Item code="03" title="Front-desk hours freed" tag={<Source href="https://mx.indeed.com/career/recepcionista/salaries/Ciudad-de-M%C3%A9xico">Indeed MX, CDMX receptionist salaries (approx.)</Source>}>
            Approx. MXN 9,670/month per receptionist, per branch.
          </Item>
        </Sequence>
        <p className={s.metric}>
          <span>Measured by</span> specialist minutes per first visit <b>·</b> calls answered <b>·</b> no-shows
        </p>
        <p className={s.sources}>
          The category is being bought:{" "}
          <Source href="https://hitconsultant.net/2026/06/24/assort-health-raises-120-million-series-c-menlo/">Assort Health valued at $1.2B (US, June 2026)</Source>;{" "}
          <Source href="https://elevenlabs.io/blog/banner-health">Banner Health runs scheduling on ElevenAgents</Source>.
        </p>
      </>
    ),
    notes: "The operations lead pays for every call answered, specialist minutes back and front-desk hours freed. We track specialist minutes, calls answered and no-shows.",
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
