import type { Metadata } from "next";
import Link from "next/link";
import { Explainer } from "@/components/explainer";

export const metadata: Metadata = {
  title: "PoktaClinic: how the voice intake works, live",
};

// Trial page: the same public agent as the home page widget, with our own call panel so the page can
// show the system working during the call.
export default function ExplainerPage() {
  const agentId = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID || null;
  return (
    <>
      <main className="wrap x-wide x-page">
        <section aria-labelledby="x-h">
          <p className="kicker">Voice pre-consultation intake, live</p>
          <h1 id="x-h" className="headline">
            Talk on the left, watch the system work in the middle, see the EHR fill on the right.
          </h1>
          <p role="note" className="notice small">
            <strong>All data here is fictional and the agent is an AI, not a clinician.</strong> Do not share real personal or health information. Grupo Médico Articular is a fictional rheumatology network.{" "}
            <Link href="/privacidad">Aviso de privacidad</Link>.
          </p>
        </section>
        <Explainer agentId={agentId} />
      </main>
    </>
  );
}
