import Link from "next/link";
import { EhrPanel } from "@/components/ehr-panel";
import { EHR_URL } from "@/ehr-console";
import s from "./home.module.css";

// The live demo is /explainer; home only orients a reviewer and links out. The operator section keeps the
// EHR on/off control (the Render service can be suspended to show the outbox at work).

const STAGES = [
  { name: "Consent", text: "Reads the aviso de privacidad. Nothing is looked up or written without a yes." },
  { name: "Identification", text: "Finds the patient by phone, or registers a new one." },
  { name: "History", text: "Takes the first-visit rheumatology questionnaire as a conversation and saves it to the EHR as FHIR." },
  { name: "Scheduling", text: "Offers real free slots from each branch's calendar and books the first consultation." },
  { name: "Escalation", text: "At any point a red flag ends the intake: safety guidance, and a practitioner is notified.", spot: true },
];

const FLOW = [
  { name: "Caller", text: "Talks in the browser, Spanish by default, English on request" },
  { name: "ElevenLabs agent", text: "Workflow: consent, identification, history, scheduling, escalation" },
  { name: "PoktaClinic API", text: "Next.js on Vercel: 10 tool webhooks, outbox, post-call webhook" },
  { name: "Clinic systems", text: "EHR over FHIR R4 on Render, Google Calendar per branch, email" },
];

const BUILT_ON = [
  { name: "Agent workflow", text: "Five stage nodes with LLM-routed edges; the History node runs a stronger LLM than the scripted stages." },
  { name: "10 webhook tools", text: "Consent, find and save patient, questionnaire, save history, availability, book, reschedule, callback, escalate." },
  { name: "Knowledge base with RAG", text: "Privacy notice, first-visit guide and FAQ; off-script answers stay grounded." },
  { name: "Evaluation and data collection", text: "Six evaluation criteria (consent first, no diagnosis, red flag not booked) and ten data collection fields." },
  { name: "Language presets", text: "es-MX by default; an en preset with its own first message and voice." },
  { name: "Post-call webhook", text: "HMAC-verified; transcripts, evaluations and collected data feed the call review." },
  { name: "React SDK", text: "@elevenlabs/react drives the live explainer: transcript, tool calls and workflow state." },
];

const SECONDARY = [
  { href: "/review", label: "Call review", text: "Replay a recorded call" },
  { href: "/deck", label: "Scenario deck", text: "The brief and the build" },
  { href: "/decisions", label: "Decisions", text: "Why it is built this way" },
  { href: "/tools", label: "Tools", text: "The 10 webhook tools" },
];

export default function Home() {
  return (
    <main className={`wrap ${s.page}`}>
      <section aria-labelledby="intro-h" className={s.hero}>
        <p className="kicker">PoktaClinic · voice pre-consultation intake</p>
        <h1 id="intro-h" className="display">
          A patient talks, the <em>EHR</em> is written.
        </h1>
        <p className="lede">
          An ElevenLabs voice agent runs the first-visit intake for Grupo Médico Articular, a rheumatology network in the Mexico City area (Del Valle, Polanco, Satélite; fictional). It takes consent, identifies the patient, takes the first-visit history into the EHR as FHIR, books a real calendar slot, and escalates red flags.
        </p>
        <div className={s.ctas}>
          <Link className={`btn btn-primary ${s.primary}`} href="/explainer">
            Talk to the agent <span aria-hidden="true">→</span>
          </Link>
          <span className="small muted">Live call in the browser, with the workflow and every tool call shown as it happens.</span>
        </div>
        <nav aria-label="More of the demo" className={s.secondary}>
          {SECONDARY.map((l) => (
            <Link key={l.href} href={l.href} className={s.secLink}>
              <strong>{l.label}</strong>
              <span>{l.text}</span>
            </Link>
          ))}
          <a href={EHR_URL} target="_blank" rel="noreferrer" className={s.secLink}>
            <strong>
              EHR console <span aria-hidden="true">↗</span>
            </strong>
            <span>The clinic&apos;s side (password protected)</span>
          </a>
        </nav>
      </section>

      <section aria-labelledby="why-h" className={s.why}>
        <h2 id="why-h" className="kicker">
          Why it matters
        </h2>
        <dl className={s.stats}>
          <div className={s.stat}>
            <dt>Rheumatologists per 100,000 people in Mexico</dt>
            <dd>
              <span className={s.big}>0.58</span> <span className="soft">against a 1.0 minimum</span>
            </dd>
          </div>
          <div className={s.stat}>
            <dt>Median wait from referral to rheumatology pre-consultation at the INR</dt>
            <dd>
              <span className={s.big}>24</span> <span className="soft">months</span>
            </dd>
          </div>
        </dl>
        <p className="soft">Every specialist hour spent collecting a first-visit history by hand is an hour not spent seeing the queue. The agent takes the intake so the first consultation starts with the history already in the record.</p>
        <p className={s.sources}>
          Sources:{" "}
          <a href="https://www.reumatologiaclinica.org/es-situacion-reumatologia-mexico-deficit-reumatologos-avance-S1699258X22000171" target="_blank" rel="noreferrer">
            Reumatología Clínica, situación de la reumatología en México
          </a>
          ;{" "}
          <a href="https://dsm.inr.gob.mx/indiscap/index.php/INDISCAP/article/view/769" target="_blank" rel="noreferrer">
            INDISCAP, Instituto Nacional de Rehabilitación
          </a>
          .
        </p>
      </section>

      <section aria-labelledby="how-h" className="card">
        <h2 id="how-h" className="headline">
          How it works
        </h2>
        <ol className={s.flow}>
          {FLOW.map((f) => (
            <li key={f.name} className={s.node}>
              <strong>{f.name}</strong>
              <span>{f.text}</span>
            </li>
          ))}
        </ol>
        <ol className={s.stages} aria-label="Agent workflow stages">
          {STAGES.map((st, i) => (
            <li key={st.name} className={st.spot ? `${s.stage} ${s.spot}` : s.stage}>
              <span className={s.n}>{st.spot ? "Any" : String(i + 1).padStart(2, "0")}</span>
              <h3>{st.name}</h3>
              <p>{st.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="built-h" className={s.built}>
        <h2 id="built-h" className="headline">
          Built on <em>ElevenLabs</em> Agents
        </h2>
        <p className="sub">The agent is configuration as code (agent/ in the repo), pushed with the ElevenLabs CLI.</p>
        <ul className={s.builtList}>
          {BUILT_ON.map((b) => (
            <li key={b.name}>
              <strong>{b.name}</strong>
              <span>{b.text}</span>
            </li>
          ))}
        </ul>
      </section>

      <p role="note" className="notice">
        <strong>All data here is fictional and the agent is an AI, not a clinician.</strong> Do not share real personal or health information. This is a take-home demo, not medical advice. The agent points callers to the <Link href="/privacidad">aviso de privacidad</Link> (fictional).
      </p>

      <section aria-labelledby="ops-h" className={s.ops}>
        <div>
          <h2 id="ops-h" className="kicker">
            Operator
          </h2>
          <p className="sub small">The EHR runs on Render and can be suspended to show resilience: while it is off, the agent&apos;s writes wait in an outbox and sync when it returns. Its pages load only while it is on.</p>
          <ul className={s.opsLinks}>
            <li>
              <a href={EHR_URL} target="_blank" rel="noreferrer">
                EHR console
              </a>
            </li>
            <li>
              <a href={`${EHR_URL}/developer`} target="_blank" rel="noreferrer">
                EHR developer page
              </a>
            </li>
            <li>
              <a href={`${EHR_URL}/fhir/metadata`} target="_blank" rel="noreferrer">
                FHIR metadata (CapabilityStatement)
              </a>
            </li>
          </ul>
        </div>
        <EhrPanel />
      </section>
    </main>
  );
}
