import type { Metadata } from "next";
import { Present } from "./present";

export const metadata: Metadata = {
  title: "PoktaClinic: decisions, present mode",
  description: "The PoktaClinic design decisions, one per screen: the decision, why, and the trade-off.",
};

// One decision per screen for the walkthrough video. Full screen, no site header (CHROMELESS_PREFIXES in
// site-nav.tsx); keyboard driven like /deck (see present.tsx).
// Defaults to the 5 video decisions; ?all=1 shows every decision, ?key=1 the key ones.
export default async function PresentPage({ searchParams }: PageProps<"/decisions/present">) {
  const { all, key } = await searchParams;
  return <Present mode={all === "1" ? "all" : key === "1" ? "key" : "video"} />;
}
