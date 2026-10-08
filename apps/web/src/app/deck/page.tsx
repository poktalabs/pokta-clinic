import type { Metadata } from "next";
import { Deck } from "./deck";

export const metadata: Metadata = {
  title: "PoktaClinic: the scenario",
  description: "Six slides that set up the PoktaClinic demo: the rheumatology queue in Mexico, who pays, and how the voice agent is built on ElevenLabs Agents.",
};

// The scenario deck for the walkthrough video. Full screen, no site header; keyboard driven (see deck.tsx).
export default function DeckPage() {
  return <Deck />;
}
