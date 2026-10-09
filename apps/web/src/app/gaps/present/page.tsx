import type { Metadata } from "next";
import { Present } from "./present";

export const metadata: Metadata = {
  title: "PoktaClinic: production gaps, present mode",
  description: "The PoktaClinic production gaps, one per screen: the gap, why it matters, and the fix.",
};

// One gap per screen for the walkthrough video, on the /decisions/present look and keys. Full screen, no
// site header (CHROMELESS_PREFIXES in site-nav.tsx). Defaults to the 5 video gaps; ?all=1 shows every gap.
export default async function PresentPage({ searchParams }: PageProps<"/gaps/present">) {
  const { all } = await searchParams;
  return <Present all={all === "1"} />;
}
