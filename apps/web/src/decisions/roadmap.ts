// Roadmap and expansion items shown after the decision log on /decisions. Each item is something the
// clinic would get more value from with another ElevenLabs product, with the ElevenLabs source it
// relies on. Facts checked against the ElevenLabs docs on 2026-10-08.

export type RoadmapItem = {
  id: string;
  title: string;
  kind: "next build" | "account expansion";
  /** One sentence for the collapsed card and present mode; the full text stays in what and why. */
  summary: string;
  presentWhy: string;
  /** Shown as a final slide in /decisions/present. */
  inPresent?: boolean;
  what: string;
  why: string;
  how: string;
  effort: string;
  sources: { label: string; href: string }[];
  code?: { label: string; path: string }[];
};

export const ROADMAP: RoadmapItem[] = [
  {
    id: "scribe-medical-post-call",
    title: "Clinical-grade transcript of every intake call (Scribe v2 Medical)",
    kind: "next build",
    summary: "After each finished call, Scribe v2 Medical transcribes the recording and the transcript is attached to the patient's record.",
    presentWhy: "The rheumatologist can check the summary against what the patient said, with about 35% lower word error rate on clinical audio.",
    inPresent: true,
    what:
      "After each finished call, send the recording to Scribe v2 Medical with the clinic's keyterms and attach the transcript to the patient's record (a FHIR DocumentReference) next to the pre-consultation summary.",
    why:
      "The rheumatologist reviews the pre-consultation summary; a transcript that gets medication names, anatomy and diagnoses right is what lets them check it against what the patient actually said. ElevenLabs reports about 35% lower word error rate on clinical audio than Scribe v2, billed at the same rate. It runs after the call, not during it: the agent's live speech recognition options are Scribe Realtime and Scribe v2 Turbo, and the agent keeps Scribe Realtime with its boosted medical keywords.",
    how:
      "The HMAC-verified post-call webhook already receives every finished conversation. On that event, fetch the call audio, call Create transcript with model_id scribe_v2_medical, the same keyterm list the agent boosts (drug names, conditions, insurers), diarization and entity detection, then queue the DocumentReference write through the existing EHR outbox so an EHR outage does not lose it.",
    effort: "About 1 to 2 days: one webhook branch, one API call, one outbox job, plus tests.",
    sources: [
      { label: "Scribe v2 Medical announcement", href: "https://elevenlabs.io/blog/scribe-v2-medical-is-now-available-to-everyone" },
      { label: "Changelog", href: "https://elevenlabs.io/docs/changelog/2026/9/11" },
      { label: "Keyterm prompting", href: "https://elevenlabs.io/docs/eleven-api/guides/how-to/speech-to-text/batch/keyterm-prompting" },
    ],
    code: [{ label: "apps/web/src/app/api/webhooks/elevenlabs/route.ts", path: "apps/web/src/app/api/webhooks/elevenlabs/route.ts" }],
  },
  {
    id: "scribe-medical-consultation",
    title: "Consultation scribe for the rheumatologists (Scribe v2 Medical)",
    kind: "account expansion",
    summary: "Scribe v2 Medical as a dictation or ambient scribe in the rheumatologists' consultations.",
    presentWhy: "It expands the account from intake calls to every consultation minute, for the same buyer on the same EHR integration.",
    inPresent: true,
    what:
      "The same clinic network's rheumatologists dictate or record their consultations. Scribe v2 Medical as a dictation or ambient scribe in the consultation room turns PoktaClinic from a front-desk agent into a front-desk plus clinician product.",
    why:
      "It expands the account from intake calls to every consultation minute, for the same buyer, on the same EHR integration and consent records. The specialist time the intake already saves before the visit is then also saved during it.",
    how:
      "Record in the EHR console's Consulta view, transcribe with Scribe v2 Medical (keyterms per specialty, diarization to separate doctor and patient), and save the transcript to the visit for the doctor to edit and sign. Needs a separate consent step for recording the consultation.",
    effort: "A pilot with one branch: about 2 to 3 weeks, most of it the recording UI and the consent flow.",
    sources: [
      { label: "Scribe v2 Medical announcement", href: "https://elevenlabs.io/blog/scribe-v2-medical-is-now-available-to-everyone" },
      { label: "Speech to Text overview", href: "https://elevenlabs.io/docs/overview/capabilities/speech-to-text" },
    ],
  },
  {
    id: "outbound-reminders",
    title: "Outbound reminder calls to cut no-shows (batch calling)",
    kind: "account expansion",
    summary: "The day before each visit, the same agent calls the patient to confirm, reschedule or cancel.",
    presentWhy: "No-shows are one of the buyer's three metrics, and a freed slot goes back to a waiting list measured in months.",
    what:
      "The day before each visit, the same agent calls the patient to confirm, reschedule or cancel, using the booking and rescheduling tools it already has.",
    why:
      "No-shows are one of the buyer's three metrics, and a confirmed or freed slot goes back to a waiting list measured in months.",
    how:
      "Once the phone channel (Twilio) is live, a daily job reads the next day's appointments and submits them as an ElevenLabs batch call with the appointment as dynamic variables.",
    effort: "About 2 to 3 days after the phone channel.",
    sources: [{ label: "Batch calling", href: "https://elevenlabs.io/docs/eleven-agents/phone-numbers/batch-calls" }],
  },
];
