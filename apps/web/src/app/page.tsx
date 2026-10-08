import Image from "next/image";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { EhrPanel } from "@/components/ehr-panel";
import { Timeline } from "@/components/timeline";
import { VoiceWidget } from "@/components/voice-widget";
import { EHR_URL } from "@/ehr-console";

const STAGES = [
  { name: "Consent", text: "Asks for the aviso de privacidad. Nothing is read or written without a yes." },
  { name: "Identification", text: "Finds the patient by phone, or registers a new one." },
  { name: "History", text: "Collects the first-visit rheumatology Questionnaire as a conversation." },
  { name: "Scheduling", text: "Asks which branch suits the caller, offers real free slots from that branch's calendar (or any branch) and books the first consultation." },
];

export default function Home() {
  const agentId = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID || null;
  return (
    <>
      <header className="site-header">
        <div className="wrap">
          <Link className="brand" href="/">
            <Image src="/poktacare-logo.svg" alt="" width={20} height={20} priority />
            <span className="wordmark">
              Pokta<b>Clinic</b>
            </span>
          </Link>
          <span className="header-end">
            <span className="kicker muted">Pokta Labs demo</span>
            <ThemeToggle />
          </span>
        </div>
      </header>

      <main className="wrap page">
        <section aria-labelledby="intro-h">
          <p className="kicker">Voice pre-consultation intake</p>
          <h1 id="intro-h" className="display">
            A patient talks, the <em>EHR</em> is written.
          </h1>
          <p className="lede">
            Grupo Médico Articular is a rheumatology network with three branches in the Mexico City area: Del Valle, Polanco and Satélite (fictional). The agent talks to the patient and writes the result into the network&apos;s EHR over HL7 FHIR R4.
          </p>
          <p role="note" className="notice">
            <strong>All data here is fictional and the agent is an AI, not a clinician.</strong> Do not share real personal or health information. This is a take-home demo, not medical advice. The agent points callers to the <Link href="/privacidad">aviso de privacidad</Link> (fictional).
          </p>
        </section>

        <section aria-labelledby="talk-h" className="panel-brand talk">
          <div>
            <h2 id="talk-h" className="headline">
              Talk to the agent
            </h2>
            <p className="sub">
              Click the widget and speak Spanish; say &quot;I prefer English&quot; to switch. Allow the microphone when the browser asks. A quick path: accept the privacy notice, give a name and phone, answer the questions, book a slot.
            </p>
          </div>
          <div className="widget-slot">
            <VoiceWidget agentId={agentId} />
          </div>
        </section>

        <div className="grid-2">
          <Timeline />
          <EhrPanel />
        </div>

        <section aria-labelledby="how-h" className="card">
          <h2 id="how-h" className="headline">
            How it works
          </h2>
          <ol className="steps">
            {STAGES.map((s, i) => (
              <li key={s.name} className="step">
                <span className="step-n">{String(i + 1).padStart(2, "0")}</span>
                <h3>{s.name}</h3>
                <p>{s.text}</p>
              </li>
            ))}
          </ol>
          <p className="escalation">
            <strong>Escalation</strong> <span className="soft">at any point: a Red flag symptom (Emergencia or Urgencia) ends the intake, the patient gets safety guidance, and a Practitioner is notified.</span>
          </p>
          <p className="flow">ElevenLabs agent → PoktaClinic tools on Vercel → EHR over FHIR R4 on Render + one Google Calendar per branch</p>
        </section>
      </main>

      <footer className="wrap site-footer">
        <a href={`${EHR_URL}/developer`} target="_blank" rel="noreferrer">
          EHR developer page
        </a>
        <a href={`${EHR_URL}/fhir/metadata`} target="_blank" rel="noreferrer">
          FHIR metadata (CapabilityStatement)
        </a>
        <span className="muted">The EHR can be switched off above; its pages load only while it is on.</span>
      </footer>
    </>
  );
}
