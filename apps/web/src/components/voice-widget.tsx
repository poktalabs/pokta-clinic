"use client";
import { createElement } from "react";
import Script from "next/script";

// The ElevenLabs embed: a custom element plus its script. The agent id is public by design (the agent is
// public, restricted by an origin allowlist in ElevenLabs), so it is safe in the browser.
export function VoiceWidget({ agentId }: { agentId: string | null }) {
  if (!agentId) {
    return <p className="rounded-lg border border-dashed border-line p-4 text-muted">The voice widget is not configured (NEXT_PUBLIC_ELEVENLABS_AGENT_ID).</p>;
  }
  return (
    <>
      {createElement("elevenlabs-convai", { "agent-id": agentId })}
      <Script src="https://unpkg.com/@elevenlabs/convai-widget-embed" strategy="afterInteractive" />
    </>
  );
}
