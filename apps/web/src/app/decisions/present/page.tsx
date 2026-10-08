import type { Metadata } from "next";
import { Present } from "./present";

export const metadata: Metadata = {
  title: "PoktaClinic: decisions, present mode",
  description: "The PoktaClinic design decisions, one per screen: the decision, why, and the trade-off.",
};

// One decision per screen for the walkthrough video. Full screen, no site header (CHROMELESS_PREFIXES in
// site-nav.tsx); keyboard driven like /deck (see present.tsx).
// Defaults to the key decisions; ?all=1 shows every decision.
export default async function PresentPage({ searchParams }: PageProps<"/decisions/present">) {
  const { all } = await searchParams;
  return <Present all={all === "1"} />;
}
