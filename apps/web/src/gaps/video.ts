// The five production gaps the walkthrough video covers, in speaking order, about 12 seconds each (1:00 in
// all). Each one condenses a card in data.ts (by id) and adds no new facts: the full why, fix, effort and
// sources stay on the card. data.test.ts checks the ids and the word budget.

export type VideoGap = {
  /** The card in data.ts this item condenses. */
  id: string;
  title: string;
  /** One sentence each, read aloud: what is missing, and the fix. */
  gap: string;
  fix: string;
};

export const VIDEO_LENGTH = "about 1:00";

export const VIDEO: VideoGap[] = [
  {
    id: "cofepris-samd",
    title: "COFEPRIS: is it a medical device?",
    gap: "Red-flag triage could give the agent a medical purpose, which would make it regulated software.",
    fix: "Counsel classifies it before launch; triage stays a fixed referral to 911.",
  },
  {
    id: "lfpdppp-written-consent",
    title: "Written consent under the data law",
    gap: "Health data needs express written consent; a spoken yes in the call is the demo's stand-in.",
    fix: "An e-signature step in the confirmation email; counsel reviews the aviso.",
  },
  {
    id: "nom024-ehr",
    title: "A certified EHR, not a mock",
    gap: "No NOM-024 certification, no CURP validation against RENAPO, no signed client assertion.",
    fix: "Connect the clinic's certified EHR over the same FHIR adapter.",
  },
  {
    id: "clinical-signoff",
    title: "Clinical sign-off",
    gap: "The questionnaire and red-flag list are drafts no rheumatologist has approved.",
    fix: "A rheumatologist signs each version; intakes keep waiting for the doctor's validation.",
  },
  {
    id: "operator-questionnaires",
    title: "Operators own the questionnaire",
    gap: "A new specialty, follow-up calls or history updates need an engineer today.",
    fix: "An operator console that versions questionnaires per specialty; the agent already loads them per call.",
  },
];

/** Words read aloud for one item: title, gap and fix. */
export const spokenWords = (v: VideoGap) => `${v.title} ${v.gap} ${v.fix}`.split(/\s+/).length;
