// The decision log behind /decisions. Every entry is sourced from the repo (docs/adr, docs/agent.md,
// docs/deploy.md, docs/security, code comments) or the commit log; dates are commit dates.

export const REPO_BLOB = "https://github.com/poktalabs/pokta-clinic/blob/main/";

export type DecisionGroup = "agent" | "integrations" | "safety" | "operations";

export const GROUPS: { id: DecisionGroup; label: string; blurb: string }[] = [
  { id: "agent", label: "Agent design", blurb: "How the conversation is structured and which models run it." },
  { id: "integrations", label: "Integrations", blurb: "How the agent reaches the web app, the calendar and the EHR." },
  { id: "safety", label: "Safety & compliance", blurb: "What the model can see, what is enforced in code, and the legal frame." },
  { id: "operations", label: "Operations", blurb: "Running, resetting and reviewing the demo." },
];

export type Decision = {
  id: string;
  group: DecisionGroup;
  title: string;
  date: string;
  status: "current" | "superseded";
  statusNote?: string;
  decision: string;
  context: string;
  alternatives: string[];
  why: string;
  tradeoff: string;
  code: { label: string; path: string }[];
  related?: { label: string; href: string }[];
};

export const DECISIONS: Decision[] = [
  // ---- Agent design ----
  {
    id: "workflow-nodes",
    group: "agent",
    title: "A workflow of stage nodes, not one big prompt",
    date: "2026-10-05",
    status: "current",
    decision:
      "The agent is an ElevenLabs workflow with one subagent node per stage: Consent, Identification, History, Scheduling, plus Escalation. Each node appends its own prompt to a shared base prompt (personality, guardrails, red flags, escalation script) and moves on through edges.",
    context:
      "The intake has a fixed legal order (aviso and express consent before any patient data) and one interrupt that beats everything (a red flag ends the call with the escalation script, never with an appointment).",
    alternatives: [
      "One system prompt covering all stages, with every tool available all the time.",
      "A fixed form instead of an adaptive History (rejected in scoping: the History is the part worth automating).",
    ],
    why:
      "It follows ElevenLabs' own healthcare reference (one subagent per stage). Each node gets a short prompt, only its own tools and, where it pays off, its own LLM. The stage order is enforced by the graph, every transcript turn is tagged with its node, and the drop_off_stage data collection field falls out of it.",
    tradeoff:
      "Transitions are judged by an LLM, so edge wording becomes a source of bugs (see the goodbye condition). The platform rejects two edges between the same pair of nodes, so the build asserts one edge per pair and merges reasons into one condition.",
    code: [
      { label: "agent/src/workflow.ts", path: "agent/src/workflow.ts" },
      { label: "agent/src/prompts/base.md", path: "agent/src/prompts/base.md" },
      { label: "docs/agent.md (Workflow)", path: "docs/agent.md" },
    ],
    related: [{ label: "Live call with the workflow view", href: "/explainer" }],
  },
  {
    id: "per-node-llm",
    group: "agent",
    title: "Per-node LLMs: Gemini 3.5 Flash for speed, Claude Sonnet 5 on History",
    date: "2026-10-06",
    status: "current",
    decision:
      "gemini-3.5-flash (reasoning effort low, temperature 0.3) runs every node except History. History overrides the model through the node's conversation_config: claude-sonnet-5, reasoning effort low.",
    context:
      "History is the one open-ended node: the model chooses question order and follow-ups, tracks eleven required Questionnaire items across turns and builds a nested save_history payload. The other nodes are short, scripted turns where latency matters most.",
    alternatives: [
      "One model for the whole agent.",
      "gemini-3.x-flash or gpt-5.4-mini on History: faster, weaker.",
      "claude-sonnet-5-5 or claude-opus-5 on History: heavier.",
    ],
    why:
      "Fast turn-by-turn voice where the work is simple, a stronger tool-capable model only where the reasoning is. Good Spanish and reliable tool use; low reasoning effort keeps voice latency acceptable.",
    tradeoff:
      "Two models to evaluate instead of one. History latency was flagged to check on the first real calls, with gemini-3.8-flash or gpt-5.5 as the fallback if it drags.",
    code: [
      { label: "agent/config.json (llm, history_llm)", path: "agent/config.json" },
      { label: "agent/src/workflow.ts (History override)", path: "agent/src/workflow.ts" },
    ],
  },
  {
    id: "haiku-trial",
    group: "agent",
    title: "Claude Haiku 4.5 as the main model: tried and rolled back",
    date: "2026-10-08",
    status: "superseded",
    statusNote: "Rolled back within the hour",
    decision:
      "Swapped claude-haiku-4-5 in as the main LLM to fix two Gemini failures, then rolled back to gemini-3.5-flash the same hour.",
    context:
      "Two Gemini failures: English chain-of-thought spoken once on entering Identification, and the scheduling_to_end edge firing silently for a returning caller.",
    alternatives: [
      "Fix the edge condition instead of changing the model (what shipped).",
      "A node model without exposed reasoning, tested first (the noted fix for the reasoning leak).",
    ],
    why:
      "The scripted real-conversation runs (pnpm agent:converse, which check the node path, the tool calls and the evaluation criteria) caught it: in 3 of 4 live runs Haiku never left the Consent node and invented a booking without calling any tool.",
    tradeoff:
      "The returning-caller failure was then fixed by the stricter scheduling_to_end condition (2 of 2 reschedules passed). The reasoning leak was not reproduced in 6 later runs but stays a known risk.",
    code: [
      { label: "agent/config.json", path: "agent/config.json" },
      { label: "scripts/converse-scenarios.ts", path: "scripts/converse-scenarios.ts" },
      { label: "docs/agent.md (Model choices)", path: "docs/agent.md" },
    ],
  },
  {
    id: "edges-goodbye",
    group: "agent",
    title: "LLM-judged edges, and \"goodbye already spoken\" before ending",
    date: "2026-10-07",
    status: "current",
    decision:
      "Edges are LLM conditions, escalation edges evaluated first on every node. scheduling_to_end only fires after the last tool result, once the agent has said a goodbye in its own spoken message; \"A tool call or tool result alone does not meet this condition.\"",
    context:
      "A returning caller who rescheduled was hung up on: the edge fired as soon as the booking tool returned, before anything was spoken. The refusal edge on Consent had the same shape and got the same fix on 2026-10-06.",
    alternatives: [
      "The earlier wording, where \"was given a goodbye\" was one clause among several and the model counted the tool result as enough.",
      "Swapping the model (the Haiku trial, rolled back).",
    ],
    why:
      "The condition names the observable event the edge must wait for, so a tool result can no longer satisfy it. 2 of 2 reschedule runs passed after the change.",
    tradeoff:
      "Behaviour still depends on how an LLM reads a sentence; each edge needs a scripted scenario that walks through it.",
    code: [{ label: "agent/src/workflow.ts (scheduling_to_end)", path: "agent/src/workflow.ts" }],
    related: [{ label: "Watch the edges move live", href: "/explainer" }],
  },
  {
    id: "knowledge-base",
    group: "agent",
    title: "Knowledge base: RAG for the guide and FAQ, the aviso in the prompt",
    date: "2026-10-08",
    status: "current",
    decision:
      "Three documents as code. The first-visit guide and the FAQ use RAG (usage_mode auto) at agent level on every node. The aviso de privacidad is the whole document in the prompt (usage_mode prompt), on the Consent node only.",
    context:
      "Callers ask off-script questions (price, insurers, what to bring, parking) in the middle of the intake, including during History. The aviso is legal text the caller is consenting to.",
    alternatives: [
      "Prompt mode for every document (exact, but grows the prompt with every document).",
      "A per-node RAG override, off on Escalation (semantics for auto documents unverified).",
    ],
    why:
      "Latency vs scale vs exactness: RAG scales to a real network with dozens of documents at roughly 250 ms per turn; legal text is quoted exactly, never paraphrased from a retrieved chunk, and only where the caller decides. Embedding model multilingual_e5_large_instruct for Spanish content and callers.",
    tradeoff:
      "A retrieval miss is possible; it is guarded by the \"Eso no lo tengo; el personal de la sucursal se lo confirma\" rule and the kb_grounded evaluation. The knowledge base is never used for medical topics.",
    code: [
      { label: "agent/src/kb/", path: "agent/src/kb/index.ts" },
      { label: "agent/scripts/push-kb.ts", path: "agent/scripts/push-kb.ts" },
    ],
    related: [{ label: "Full aviso de privacidad", href: "/privacidad" }],
  },
  {
    id: "calm-tone",
    group: "agent",
    title: "A calm, even tone, and the \"in Spanish\" tool-suffix bug",
    date: "2026-10-08",
    status: "current",
    decision:
      "expressive_mode off, TTS speed 0.95 and stability 0.6, no exclamation marks or celebration in prompts and tool messages. Tool results that carry good news end with a CALM suffix asking for one calm, neutral sentence in the language of the conversation.",
    context:
      "Models celebrate bookings and registrations; a receptionist does not. The first CALM suffix said \"in Spanish\", and in English calls Gemini started reasoning aloud in English about which language to use.",
    alternatives: [
      "Expressive mode and the model's default tone.",
      "Tone rules only in the prompt, not in tool messages.",
    ],
    why:
      "Tool messages are read by the model right before it speaks, so that is where the tone instruction lands. Making the suffix language-neutral removed the conflict with the English preset.",
    tradeoff:
      "Every tool message is effectively a prompt: language-specific wording in a server response changes agent behaviour, so tool copy is reviewed like prompt copy.",
    code: [
      { label: "apps/web/src/tools/handler.ts (CALM)", path: "apps/web/src/tools/handler.ts" },
      { label: "agent/src/agent.ts (TTS settings)", path: "agent/src/agent.ts" },
    ],
    related: [{ label: "Tool messages", href: "/tools" }],
  },
  {
    id: "language",
    group: "agent",
    title: "Spanish by default, an English preset, and a language-only client override",
    date: "2026-10-08",
    status: "current",
    decision:
      "The agent starts in es with the language detection tool and an en preset (English first message, English voice, \"One moment.\"). Clients may override only agent.language; the /explainer toggle uses it, the home widget passes nothing.",
    context:
      "The callers are es-MX; reviewers and some callers speak English. An English call has to stay English to the end, with clinic, branch and practitioner names untranslated.",
    alternatives: [
      "Detection only, always opening in Spanish.",
      "Broader client overrides (prompt, voice, first message).",
    ],
    why:
      "One permission (platform_settings.overrides.conversation_config_override.agent.language) gives an English session from the first word; the platform rejects any other override, so nothing else is opened to a public client.",
    tradeoff:
      "English calls depend on translation inside the prompt (fixed lines, questionnaire items, knowledge base facts) rather than English source documents.",
    code: [
      { label: "agent/src/agent.ts (presets, overrides)", path: "agent/src/agent.ts" },
      { label: "apps/web/src/components/explainer.tsx", path: "apps/web/src/components/explainer.tsx" },
    ],
    related: [{ label: "Language toggle", href: "/explainer" }],
  },

  // ---- Integrations ----
  {
    id: "webhook-tools",
    group: "integrations",
    title: "Webhook tools with a secret header the LLM never sees",
    date: "2026-10-05",
    status: "current",
    decision:
      "Each tool is a POST to /api/tools/<name>. The x-pokta-tool-secret header references an ElevenLabs workspace secret by ID; conversation_id is bound to system__conversation_id. The web app compares the secret in constant time and validates the body with zod.",
    context:
      "The tool endpoints are public URLs that write to an EHR. They need to know the call came from this agent and which Conversation it belongs to, without trusting the model for either.",
    alternatives: [
      "A secret__ dynamic variable in the header (the design note): it is supplied by the client at session start, which a public widget cannot hold safely.",
      "Letting the LLM fill the conversation id.",
    ],
    why:
      "The secret value never reaches the LLM or the repo, and the platform fills system__conversation_id on every session, so the model neither sees nor supplies it. The id keys consent, bookings and the outbox.",
    tradeoff:
      "A shared secret is a bearer credential: rotation means updating Vercel, redeploying, then updating the ElevenLabs secret, in that order.",
    code: [
      { label: "agent/src/tools/index.ts", path: "agent/src/tools/index.ts" },
      { label: "apps/web/src/tools/handler.ts", path: "apps/web/src/tools/handler.ts" },
      { label: "docs/security/elevenlabs-api-keys.md", path: "docs/security/elevenlabs-api-keys.md" },
    ],
    related: [{ label: "All tools", href: "/tools" }],
  },
  {
    id: "caller-email",
    group: "integrations",
    title: "Caller email through /api/lead, keyed by conversation id",
    date: "2026-10-07",
    status: "current",
    decision:
      "The explainer page POSTs { conversation_id, email } to /api/lead when the call connects; tools resolve the email by conversation id. The agent has no dynamic variables: the build fails on \"{{\" anywhere and on a tool parameter bound to anything but a system__ variable.",
    context:
      "The first version bound a tool parameter to a caller_email dynamic variable. ElevenLabs then refused every session that did not pass it (WebSocket close 1008): the home widget and the scripted runs broke for about 10 minutes. Placeholder values only apply to dashboard tests.",
    alternatives: [
      "The caller_email dynamic variable (the incident).",
      "Passing it from every client, including the plain widget.",
    ],
    why:
      "Page to server keeps the agent config independent of any one client; the conversation id is already in every tool body.",
    tradeoff:
      "Only calls started from a page that collected an email get a confirmation email; tool messages say when no email was sent.",
    code: [
      { label: "apps/web/src/tools/caller-email.ts", path: "apps/web/src/tools/caller-email.ts" },
      { label: "apps/web/src/app/api/lead/route.ts", path: "apps/web/src/app/api/lead/route.ts" },
      { label: "agent/src/build.ts (no dynamic variables)", path: "agent/src/build.ts" },
    ],
    related: [{ label: "Explainer", href: "/explainer" }],
  },
  {
    id: "calendar-booking",
    group: "integrations",
    title: "Real calendar slots, re-checked before booking; idempotent booking",
    date: "2026-10-06",
    status: "current",
    decision:
      "check_availability returns up to 3 free slots from the branch's Google Calendar within branch hours (60 min, 24 h to 14 days ahead). book_appointment never trusts the start the LLM sends: it re-resolves it against the branch rules and the live free/busy, and is idempotent per Conversation (store first, EHR second).",
    context:
      "The model must never invent a slot, and an agent retry or a double tap must not create two appointments.",
    alternatives: [
      "Book whatever start the model passes.",
      "Keep availability in the EHR instead of the calendar the practice already uses.",
    ],
    why:
      "Google Calendar owns availability; the EHR gets the Appointment with the event id. A taken slot returns a message telling the agent to offer new options. The calendar event carries ids and the folio only, no clinical data (NOM-004).",
    tradeoff:
      "Without the calendar variables the tools fail closed with an error instead of using a fake calendar. A fake calendar exists only for local development and is refused on Vercel production.",
    code: [
      { label: "apps/web/src/app/api/tools/book_appointment/route.ts", path: "apps/web/src/app/api/tools/book_appointment/route.ts" },
      { label: "apps/web/src/scheduling/slots.ts", path: "apps/web/src/scheduling/slots.ts" },
      { label: "apps/web/src/calendar/google.ts", path: "apps/web/src/calendar/google.ts" },
    ],
    related: [{ label: "check_availability and book_appointment", href: "/tools" }],
  },
  {
    id: "websocket",
    group: "integrations",
    title: "WebSocket, not WebRTC, for browser calls",
    date: "2026-10-07",
    status: "current",
    decision: "The /explainer call starts the session with connectionType \"websocket\".",
    context: "Over WebRTC the LiveKit signal stream dropped on connect in the browser; the socket path was reliable.",
    alternatives: ["WebRTC (the SDK's other connection type)."],
    why: "A demo call that connects every time is worth more than a transport that fails on connect. The scripted test harness already used the WebSocket API.",
    tradeoff: "The WebRTC drop was worked around, not diagnosed; it needs a look before a production deployment chooses its transport.",
    code: [{ label: "apps/web/src/components/explainer.tsx", path: "apps/web/src/components/explainer.tsx" }],
    related: [{ label: "Explainer", href: "/explainer" }],
  },
  {
    id: "outbox",
    group: "integrations",
    title: "Own store and an outbox when the EHR is down",
    date: "2026-10-06",
    status: "current",
    decision:
      "PoktaClinic keeps its own Upstash Redis store (timeline, consent cache, outbox; 7 day TTL). While the EHR is off, save_history, the Appointment write, escalate and record_consent are queued and replayed idempotently when it returns. find_patient and save_patient still need the EHR.",
    context:
      "The EHR is a third-party system on Render that can be suspended from the admin toggle. A call should not fail because the record system is briefly offline.",
    alternatives: ["Fail the call whenever the EHR is down.", "Free-tier sleep instead of an explicit suspend and resume."],
    why:
      "The caller hears a normal confirmation; the data syncs on its own, drained by the toggle, a button and Vercel Cron. If the store cannot take the write either, the tool tells the agent the truth instead of \"saved\".",
    tradeoff:
      "Queued answers and red-flag words sit in Redis until they expire; for a real practice the store needs the same LFPDPPP review as the EHR.",
    code: [
      { label: "apps/web/src/outbox/queue.ts", path: "apps/web/src/outbox/queue.ts" },
      { label: "apps/web/src/outbox/drain.ts", path: "apps/web/src/outbox/drain.ts" },
      { label: "docs/deploy.md (Outbox)", path: "docs/deploy.md" },
    ],
    related: [{ label: "EHR and outbox panel", href: "/explainer" }],
  },

  // ---- Safety & compliance ----
  {
    id: "tools-per-node",
    group: "safety",
    title: "Tools attached per node, so data tools are invisible before consent",
    date: "2026-10-05",
    status: "current",
    decision:
      "Tools are attached per node (additional_tool_ids), not globally: Consent sees only record_consent; Identification, History and Scheduling see their own; Escalation sees escalate. The web app enforces the same rule server side.",
    context: "Consent (aviso de privacidad, LFPDPPP) must come before any patient data is read or written.",
    alternatives: ["All tools on the agent (prompt.tool_ids) with a prompt rule to wait for consent."],
    why:
      "The model cannot call a tool it cannot see, and a prompt rule is not a control. The server check is the second layer if a node is ever misconfigured.",
    tradeoff:
      "Every new tool means touching the node that owns it. escalate works without consent on purpose: a red flag is a safety event.",
    code: [
      { label: "agent/src/workflow.ts", path: "agent/src/workflow.ts" },
      { label: "apps/web/src/tools/handler.ts (grantedConsent)", path: "apps/web/src/tools/handler.ts" },
    ],
    related: [{ label: "Which node sees which tool", href: "/tools" }],
  },
  {
    id: "consent-gates-reads",
    group: "safety",
    title: "Consent gates reads as well as writes",
    date: "2026-10-05",
    status: "current",
    decision:
      "Every tool except record_consent and escalate refuses with consent_required until the Conversation has a granted Consent (store first, EHR second). find_patient reveals nothing about a found record until the date of birth matches; save_patient links the Consent only to a record it created.",
    context: "The original scope said consent before any write.",
    alternatives: ["Gate writes only."],
    why: "Reading back a name to an unidentified caller is already a disclosure.",
    tradeoff: "A refusal blocks everything after it, so a caller who declines cannot be identified or booked by the agent.",
    code: [{ label: "apps/web/src/tools/handler.ts", path: "apps/web/src/tools/handler.ts" }],
  },
  {
    id: "identity-by-birth-date",
    group: "safety",
    title: "Consent per call; identity verified by date of birth before revealing anything",
    date: "2026-10-08",
    status: "current",
    decision:
      "Every call asks for consent again, returning callers included. After the phone matches a record, find_patient says nothing about it, not even the name, until the caller's date of birth matches Patient.birthDate (checked server side, a second find_patient call with birth_date). Two tries per conversation; after the second miss the record stays closed, the caller is referred to a branch, and the agent does not register a duplicate. On a match it returns the upcoming appointment and the chief complaint of the latest questionnaire, so the agent can read both back, and links the Consent to that patient.",
    context:
      "Looking up a stored consent needs personal data first: the phone is the only key, and a phone is not proof of who is calling. The earlier check (\"¿Hablo con Lucía?\") read the name out before anything was proven.",
    alternatives: [
      "Reuse the consent stored on the record and skip the aviso for returning callers.",
      "Confirm by name only, as before.",
      "A separate verify_patient tool (one more tool, node attachment, mock and catalog entry for the same lookup).",
    ],
    why:
      "The date of birth is already on every record the agent registers, the caller knows it, and the server compares it, so the model never sees it and cannot leak or guess it. One optional parameter on find_patient keeps the tool count at ten.",
    tradeoff:
      "A returning call is a few seconds longer (aviso plus one question). A date of birth is weak proof against someone close to the patient; a real deployment would add an OTP to the phone. With more time: verify identity first, then reuse the stored consent instead of asking again. A record saved without a date of birth cannot be reached by phone. Retention is explicit too: ElevenLabs keeps transcripts and audio 30 days (platform_settings.privacy), not the unlimited default, with voice recording on and zero retention off because reviewers need the evidence.",
    code: [
      { label: "apps/web/src/tools/find-patient.ts", path: "apps/web/src/tools/find-patient.ts" },
      { label: "agent/src/prompts/identification.md", path: "agent/src/prompts/identification.md" },
      { label: "agent/src/agent.ts (privacy)", path: "agent/src/agent.ts" },
      { label: "docs/agent.md (Identity verification, Data retention)", path: "docs/agent.md" },
    ],
    related: [{ label: "find_patient on the tools page", href: "/tools" }],
  },
  {
    id: "fhir-edge",
    group: "safety",
    title: "NOM-first data model, FHIR R4 at the edge (ADR 0001)",
    date: "2026-10-05",
    status: "current",
    decision:
      "The EHR's tables follow NOM-004 and NOM-024; FHIR R4 is only the exchange format. The agent's QuestionnaireResponse is a patient-reported document pending the Practitioner's Validation, authored by a Device, not the Historia clinica. Tools reach the EHR only through an EhrAdapter.",
    context:
      "No official Mexican FHIR implementation guide exists, and an AI agent is not health personnel and cannot sign a note (NOM-004 4.4, 5.10).",
    alternatives: [
      "A FHIR-first schema: simpler, but foreign to Mexican practice and to the norms an EHR vendor is certified against.",
      "Writing the agent's output straight into the record: faster demo, legally wrong.",
    ],
    why:
      "Core R4 resources with local identifier systems and name extensions travel to any FHIR EHR; pointing at another one is a config change, a non-FHIR EHR is one new adapter.",
    tradeoff: "A mapping layer to maintain on the EHR side, and a Practitioner step before the intake becomes clinical record.",
    code: [
      { label: "docs/adr/0001", path: "docs/adr/0001-nom-first-data-model-fhir-at-the-edge.md" },
      { label: "apps/mock-ehr/docs/data-model.md", path: "apps/mock-ehr/docs/data-model.md" },
      { label: "apps/web/src/ehr/adapter.ts", path: "apps/web/src/ehr/adapter.ts" },
    ],
  },

  // ---- Operations ----
  {
    id: "config-as-code",
    group: "operations",
    title: "Agent configuration as code, validated against the live API spec",
    date: "2026-10-05",
    status: "current",
    decision:
      "Prompts, tools, workflow and knowledge base are typed sources under agent/. A generator writes the CLI project (committed), agent:validate checks it against ElevenLabs' live OpenAPI spec, then the ElevenLabs CLI pushes. Nothing is edited in the dashboard.",
    context: "The CLI's own --dry-run is local only and its embedded spec lags the API.",
    alternatives: ["Editing in the dashboard and pulling.", "Trusting the CLI dry run."],
    why: "A pull request shows exactly what will be pushed, and schema errors fail before a push.",
    tradeoff: "A dashboard edit is overwritten by the next build; tools and knowledge base must be pushed before the agent because it references their IDs.",
    code: [
      { label: "agent/src/build.ts", path: "agent/src/build.ts" },
      { label: "agent/src/validate.ts", path: "agent/src/validate.ts" },
      { label: "docs/agent.md", path: "docs/agent.md" },
    ],
  },
  {
    id: "client-console",
    group: "operations",
    title: "A read-only client console behind Basic auth",
    date: "2026-10-08",
    status: "current",
    decision:
      "The EHR's clinic-facing console at / is GET-only (overview, patients with the pre-consultation summary, appointments, callbacks, alerts, branches, staff, questionnaire, audit trail), behind HTTP Basic auth. The developer view moved to /developer and shows counts only.",
    context: "The clinic administrator and reviewers need to see what the agent wrote without being able to change it.",
    alternatives: ["An open console with fictional data.", "A separate admin app with user accounts."],
    why:
      "Basic auth with a constant-time compare is enough for a demo, and the console returns 404 unless its password is set, so it is off by default.",
    tradeoff: "One shared password, no per-user identity in the audit trail.",
    code: [
      { label: "apps/mock-ehr/src/console-auth.ts", path: "apps/mock-ehr/src/console-auth.ts" },
      { label: "apps/mock-ehr/src/routes/client.tsx", path: "apps/mock-ehr/src/routes/client.tsx" },
    ],
  },
  {
    id: "reset",
    group: "operations",
    title: "A protected reset endpoint for demo data",
    date: "2026-10-08",
    status: "current",
    decision:
      "POST /developer/reset wipes patient-generated rows in one transaction and keeps the network, staff and Questionnaire. It needs the console password and a typed confirmation, is linked from nowhere in the UI, and records the reset as the first event of the new audit trail.",
    context: "Demo runs write fictional patients to production; the free Postgres has no backups.",
    alternatives: ["Delete and recreate the database.", "Ad hoc SQL against production."],
    why:
      "Repeatable and auditable. The audit table is append-only through a row trigger; TRUNCATE fires no row triggers, so the trigger stays in place.",
    tradeoff: "It erases the demo audit trail, which is acceptable only because all data is fictional.",
    code: [{ label: "apps/mock-ehr/src/routes/reset.ts", path: "apps/mock-ehr/src/routes/reset.ts" }],
  },
  {
    id: "review-export",
    group: "operations",
    title: "A review export instead of workspace access",
    date: "2026-10-08",
    status: "current",
    decision:
      "pnpm review:export <conversation_id> turns a stored ElevenLabs conversation into static files (trimmed conversation, audio, the agent config as pushed, a zip) that /review/<id> replays with the transcript, tool calls and workflow following the audio.",
    context: "Reviewers cannot open a Conversation ID from another ElevenLabs workspace.",
    alternatives: [
      "Inviting reviewers into the workspace.",
      "The post-call webhook records (kept as an admin-only fallback).",
    ],
    why:
      "GET-only against the API, and a whitelist export: every field kept is named, so new API fields never leak by default, and secrets are redacted.",
    tradeoff: "A snapshot, not live: each call to review has to be exported and deployed.",
    code: [
      { label: "scripts/export-conversation.ts", path: "scripts/export-conversation.ts" },
      { label: "apps/web/src/review/export.ts", path: "apps/web/src/review/export.ts" },
    ],
    related: [{ label: "Recorded calls", href: "/review" }],
  },
];
