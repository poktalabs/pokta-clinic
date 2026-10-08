import type { Metadata } from "next";
import Link from "next/link";
import { TestResults } from "@/components/test-results";
import styles from "./testing.module.css";

export const metadata: Metadata = {
  title: "PoktaClinic: how it is tested",
  description: "The PoktaClinic agent's ElevenLabs platform tests with their latest results, the scripted text calls and the post-call evaluation criteria.",
};

// Evidence for reviewers who cannot open the agent's Tests tab in our ElevenLabs workspace. Content:
// src/test-results/results.json via the TestResults panel.
export default function TestingPage() {
  return (
    <main className={`wrap page ${styles.page}`}>
      <section aria-labelledby="testing-h" className={styles.intro}>
        <p className="kicker">Evidence</p>
        <h1 id="testing-h" className="headline">
          How PoktaClinic is tested.
        </h1>
        <p className={styles.lede}>
          Three layers, from the platform&apos;s own test runner to the analysis graded on every real call. The reasons behind the design are in the <Link href="/decisions">decision log</Link>; recorded calls are in the{" "}
          <Link href="/review">call review</Link>.
        </p>
      </section>
      <TestResults id="testing" kicker="Platform tests, scripted calls, post-call analysis" title="Latest results and how to rerun them" />
    </main>
  );
}
