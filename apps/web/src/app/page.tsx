import { EhrPanel } from "@/components/ehr-panel";
import { Timeline } from "@/components/timeline";
import { VoiceWidget } from "@/components/voice-widget";

const EHR_URL = "https://pokta-clinic-ehr.onrender.com";

const STAGES = [
  { name: "Consent", text: "Asks for the aviso de privacidad. Nothing is read or written without a yes." },
  { name: "Identification", text: "Finds the patient by phone, or registers a new one." },
  { name: "History", text: "Collects the first-visit rheumatology Questionnaire as a conversation." },
  { name: "Scheduling", text: "Asks which branch suits the caller, offers real free slots from that branch's calendar (or any branch) and books the first consultation." },
];

export default function Home() {
  const agentId = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID || null;
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-10">
      <header>
        <h1 className="text-4xl font-semibold tracking-tight">pokta-clinic</h1>
        <p className="mt-2 max-w-3xl text-xl">Voice pre-consultation intake for Grupo Médico Articular, a rheumatology network with three branches in the Mexico City area: Del Valle, Polanco and Satélite (fictional). The agent talks to the patient and writes the result into the network&apos;s EHR over HL7 FHIR R4.</p>
        <p role="note" className="mt-4 rounded-lg border border-warn/50 bg-warn/10 px-4 py-3">
          <strong>All data here is fictional and the agent is an AI, not a clinician.</strong> Do not share real personal or health information. This is a take-home demo, not medical advice.
        </p>
      </header>

      <section aria-labelledby="talk-h" className="rounded-xl border border-line bg-panel p-5">
        <h2 id="talk-h" className="text-xl font-semibold">
          Talk to the agent
        </h2>
        <p className="mt-1 text-muted">
          Click the widget and speak Spanish; say &quot;I prefer English&quot; to switch. Allow the microphone when the browser asks. A quick path: accept the privacy notice, give a name and phone, answer the questions, book a slot.
        </p>
        <div className="mt-4 flex min-h-24 items-center">
          <VoiceWidget agentId={agentId} />
        </div>
      </section>

      <Timeline />
      <EhrPanel />

      <section aria-labelledby="how-h" className="rounded-xl border border-line bg-panel p-5">
        <h2 id="how-h" className="text-xl font-semibold">
          How it works
        </h2>
        <ol className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {STAGES.map((s, i) => (
            <li key={s.name} className="rounded-lg border border-line p-3">
              <span className="font-mono text-sm text-muted">{i + 1}</span>
              <h3 className="font-semibold">{s.name}</h3>
              <p className="text-sm text-muted">{s.text}</p>
            </li>
          ))}
        </ol>
        <p className="mt-3 rounded-lg border border-line p-3">
          <strong>Escalation</strong> <span className="text-muted">at any point: a Red flag symptom (Emergencia or Urgencia) ends the intake, the patient gets safety guidance, and a Practitioner is notified.</span>
        </p>
        <p className="mt-4 font-mono text-sm text-muted">ElevenLabs agent → pokta-clinic tools on Vercel → EHR over FHIR R4 on Render + one Google Calendar per branch</p>
      </section>

      <footer className="flex flex-wrap gap-x-6 gap-y-1 border-t border-line pt-4 text-sm">
        <a href={EHR_URL} target="_blank" rel="noreferrer">
          EHR info page
        </a>
        <a href={`${EHR_URL}/fhir/metadata`} target="_blank" rel="noreferrer">
          FHIR metadata (CapabilityStatement)
        </a>
        <span className="text-muted">The EHR can be switched off above; its pages load only while it is on.</span>
      </footer>
    </main>
  );
}
