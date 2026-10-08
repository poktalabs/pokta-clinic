import type { Metadata } from "next";
import "@fontsource-variable/source-serif-4";
import "@fontsource-variable/source-serif-4/wght-italic.css";
import "@fontsource-variable/manrope";
import "@fontsource-variable/funnel-display";
import { SiteFooter, SiteHeader } from "@/components/site-nav";
import "./globals.css";

// Applies a stored light/dark choice before first paint (see components/theme-toggle.tsx).
const THEME_SCRIPT = `try{var t=localStorage.getItem("pokta-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export const metadata: Metadata = {
  title: "PoktaClinic: voice pre-consultation intake",
  description: "Live demo of a voice agent that runs the pre-visit intake for Grupo Médico Articular, a fictional rheumatology network with three branches in the Mexico City area. All data is fictional.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <SiteHeader />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
