"use client";
import { createElement, useEffect, useRef } from "react";
import Script from "next/script";

// The ElevenLabs embed: a custom element plus its script. The agent id is public by design (the agent is
// public, restricted by an origin allowlist in ElevenLabs), so it is safe in the browser.
// The widget only exposes brand colour through the avatar orb attributes, which cannot read CSS variables,
// so the current theme's tokens are resolved after mount and set on the element.
export function VoiceWidget({ agentId }: { agentId: string | null }) {
  const ref = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const css = getComputedStyle(document.documentElement);
    ref.current?.setAttribute("avatar-orb-color-1", css.getPropertyValue("--primary").trim());
    ref.current?.setAttribute("avatar-orb-color-2", css.getPropertyValue("--primary-ink").trim());
  }, []);

  if (!agentId) {
    return <p className="empty">The voice widget is not configured (NEXT_PUBLIC_ELEVENLABS_AGENT_ID).</p>;
  }
  return (
    <>
      {createElement("elevenlabs-convai", { "agent-id": agentId, ref })}
      <Script src="https://unpkg.com/@elevenlabs/convai-widget-embed" strategy="afterInteractive" />
    </>
  );
}
