// The five decisions the walkthrough video covers, in speaking order, about 20 seconds each (1:45 in
// all). Each one condenses existing cards in data.ts (by slug) and adds no new facts: the full context,
// alternatives and trade-offs stay on those cards. data.test.ts checks the slugs and the word budget.

export type VideoCard = { id: string; label: string };

export type VideoItem = {
  /** The cards in data.ts this item condenses (id = decision slug, label = short link text); the first is where the title links. */
  cards: [VideoCard, ...VideoCard[]];
  title: string;
  /** One sentence each, read aloud: what was decided, and why. */
  what: string;
  why: string;
};

export const VIDEO_LENGTH = "about 1:45";

export const VIDEO: VideoItem[] = [
  {
    cards: [{ id: "workflow-nodes", label: "Workflow nodes" }, { id: "tools-per-node", label: "Tools per node" }],
    title: "A workflow with per‑stage tools",
    what: "One workflow node per stage, each with only its own tools.",
    why: "The model cannot call a tool it cannot see, so before consent it sees no data tools.",
  },
  {
    cards: [{ id: "per-node-llm", label: "Per-node LLMs" }, { id: "haiku-trial", label: "Haiku trial" }],
    title: "Model per stage, proven by tests",
    what: "Gemini 3.5 Flash on short stages, Claude Sonnet 5 on History and Scheduling.",
    why: "Scripted test calls caught a Claude Haiku swap inventing a booking; rolled back within the hour.",
  },
  {
    cards: [{ id: "knowledge-base", label: "Knowledge base" }],
    title: "RAG for answers, exact legal text",
    what: "The guide and FAQ use RAG; the privacy notice sits whole in the Consent prompt.",
    why: "RAG scales at roughly 250 ms per turn; legal text is quoted exactly, never paraphrased.",
  },
  {
    cards: [{ id: "webhook-tools", label: "Webhook tools" }, { id: "consent-gates-reads", label: "Consent gate" }, { id: "calendar-booking", label: "Calendar booking" }],
    title: "Integrations behind a secret and consent",
    what: "Webhook tools carry a workspace secret the LLM never sees; data tools refuse without this call's consent.",
    why: "No invented slots: booking re-checks the live calendar and is idempotent.",
  },
  {
    cards: [{ id: "identity-by-birth-date", label: "Identity check" }],
    title: "Returning callers verified first",
    what: "Consent on every call; the date of birth is checked server side before the appointment or reason is read back.",
    why: "A phone is not proof of identity; only the server compares the date.",
  },
];

/** Words read aloud for one item: title, what and why. */
export const spokenWords = (v: VideoItem) => `${v.title} ${v.what} ${v.why}`.split(/\s+/).length;
