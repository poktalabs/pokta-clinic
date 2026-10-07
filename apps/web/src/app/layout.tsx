import type { Metadata } from "next";
import "@fontsource-variable/source-serif-4";
import "@fontsource-variable/source-serif-4/wght-italic.css";
import "@fontsource-variable/manrope";
import "@fontsource-variable/funnel-display";
import "./globals.css";

export const metadata: Metadata = {
  title: "PoktaClinic: voice pre-consultation intake",
  description: "Live demo of a voice agent that runs the pre-visit intake for Grupo Médico Articular, a fictional rheumatology network with three branches in the Mexico City area. All data is fictional.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
