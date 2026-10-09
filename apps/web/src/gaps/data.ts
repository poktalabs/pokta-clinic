// The production gaps behind /gaps: what stands between this demo and a real clinic network. Every entry
// is sourced from the repo (docs/agent.md, docs/deploy.md, apps/mock-ehr/README.md and docs/data-model.md,
// docs/adr, src/decisions) or an official source (DOF, COFEPRIS, ElevenLabs docs), checked on 2026-10-08.
// Regulatory items are phrased as what needs classification or review, not as legal conclusions.

export type GapGroup = "regulatory" | "clinical" | "integration" | "agent" | "operations";

export const GROUPS: { id: GapGroup; label: string; blurb: string }[] = [
  { id: "regulatory", label: "Regulatory & legal", blurb: "What a regulator, a lawyer or a data protection review would ask first." },
  { id: "clinical", label: "Clinical governance", blurb: "Who signs off on what the agent asks, and what it must never do." },
  { id: "integration", label: "EHR, identity & product", blurb: "The real systems and controls the mock stands in for." },
  { id: "agent", label: "Agent reliability", blurb: "Failure modes seen in testing, and what makes them structural instead of prompt-level." },
  { id: "operations", label: "Operations & scale", blurb: "Running it for a clinic network, not one demo." },
];

export type Severity = "blocks launch" | "before scale" | "hardening";

export type Gap = {
  id: string;
  group: GapGroup;
  title: string;
  severity: Severity;
  /** The gap in one sentence (max ~22 words): the index, the collapsed card and present mode. */
  summary: string;
  /** One-sentence why and fix for the collapsed card and present mode; the full text stays in why and fix. */
  presentWhy: string;
  presentFix: string;
  why: string;
  fix: string;
  effort: string;
  /** Repo paths (shown as code links) or absolute URLs (official sources). */
  evidence: { label: string; href: string }[];
  related?: { label: string; href: string }[];
};

const DOF_LFPDPPP_2025 = "https://www.diputados.gob.mx/LeyesBiblio/pdf/LFPDPPP.pdf";
const COFEPRIS_GUIDE =
  "https://www.gob.mx/cms/uploads/attachment/file/876069/GUIA_PARA_LA_OBTENCION_DEL_REGISTRO_SANITARIO_DE_DISPOSITIVOS_MEDICOS_CLASE_I-II-III_Y_SOFTWARE_COMO_DISPOSITIVO_MEDICO.pdf";
const NOM_004 = "https://dof.gob.mx/nota_detalle_popup.php?codigo=5272787";
const NOM_024 = "https://dof.gob.mx/nota_detalle_popup.php?codigo=5280847";
const EL_DOCS = "https://elevenlabs.io/docs/";

export const GAPS: Gap[] = [
  // ---- Regulatory & legal ----
  {
    id: "cofepris-samd",
    group: "regulatory",
    title: "COFEPRIS classification: is it software as a medical device?",
    severity: "blocks launch",
    summary: "No regulatory classification yet: red-flag triage may give the agent a medical purpose under COFEPRIS's software-as-a-medical-device definition.",
    presentWhy: "If it is a medical device, it needs a COFEPRIS sanitary registration before any patient uses it.",
    presentFix: "Regulatory counsel classifies it before launch; triage stays a fixed referral to 911, never a clinical judgment.",
    why:
      "COFEPRIS's registration guide defines software as a medical device as software used for one or more medical purposes (diagnosis, prevention, monitoring or aid in treatment), taken from the FEUM medical device supplement 5.0, and classifies devices by risk under article 83 of the Reglamento de Insumos para la Salud. Intake, registration and scheduling are administrative. The red-flag rules are the part that could read as a medical purpose: the agent decides, from symptoms, that a caller must call 911 or go to an emergency room. Whether that is triage software or a safety referral is a classification call for counsel, not for the build.",
    fix:
      "Before launch, a regulatory specialist classifies the intended use. Design to stay administrative: red flags stay a fixed list approved by the clinic, the escalation is a scripted referral (911 or the ER) and never a severity score or a recommendation, and the intended-use statement says so. If it is classified as a device, plan the registration (class, technical dossier, software validation) before any clinical feature.",
    effort: "Counsel review: 2 to 4 weeks. A registration, if needed, is months.",
    evidence: [
      { label: "COFEPRIS guide: registration of medical devices and software as a medical device", href: COFEPRIS_GUIDE },
      { label: "agent/src/prompts/base.md (Red flags, escalation script)", href: "agent/src/prompts/base.md" },
    ],
  },
  {
    id: "lfpdppp-written-consent",
    group: "regulatory",
    title: "Written consent for health data under the 2025 data law",
    severity: "blocks launch",
    summary: "Health data needs express, written consent; the spoken yes recorded in the call is the demo's stand-in.",
    presentWhy: "The 2025 LFPDPPP, article 8, asks for a handwritten or electronic signature or another authentication mechanism for sensitive data.",
    presentFix: "An e-signature consent step (for example in the confirmation email) and a legal review of the aviso de privacidad.",
    why:
      "The new Ley Federal de Protección de Datos Personales en Posesión de los Particulares (DOF 20 March 2025) treats health data as sensitive, and article 8 requires the express and written consent of the data subject, through a handwritten signature, an electronic signature or any authentication mechanism established for it. Today the agent reads a short aviso and records a spoken yes (record_consent, with the conversation id). Whether a recorded voice consent counts as such a mechanism is a legal question; the demo should not assume it does.",
    fix:
      "Keep the spoken consent as the gate for the call, and add a signed consent before the visit: an e-signature link in the confirmation email, stored with the consent record. Counsel reviews the aviso de privacidad (the demo's is marked fictional) and the revocation and ARCO procedures it names.",
    effort: "About 1 week of build plus legal review.",
    evidence: [
      { label: "LFPDPPP 2025, article 8 (Cámara de Diputados, current text)", href: DOF_LFPDPPP_2025 },
      { label: "Aviso de privacidad (fictional)", href: "apps/web/src/content/aviso-privacidad.ts" },
      { label: "record_consent route", href: "apps/web/src/app/api/tools/record_consent/route.ts" },
    ],
    related: [{ label: "Consent gate decision", href: "/decisions#consent-gates-reads" }],
  },
  {
    id: "data-processors",
    group: "regulatory",
    title: "Vendors, retention, redaction and data residency",
    severity: "blocks launch",
    summary: "Transcripts and audio of health conversations pass through ElevenLabs, Vercel, Upstash, Render and Google with no data processing agreements in place.",
    presentWhy: "Each vendor is a processor of sensitive data, and the aviso must name the transfers and the retention.",
    presentFix: "Processing agreements per vendor, a retention and redaction policy for transcripts, and a residency decision.",
    why:
      "ElevenLabs keeps transcripts and audio for 30 days (retention_days 30, set explicitly because the default is unlimited); the web app keeps post-call records for 7 days; the outbox and post-call transcripts sit in Redis until they expire. docs/deploy.md already says a real practice would need its own review of that store (region, encryption, retention). None of it is redacted.",
    fix:
      "Sign processing agreements with each vendor, name them in the aviso, decide where data may live, and choose per store: shorter retention, redaction of identifiers in transcripts, or ElevenLabs zero retention mode where the review export does not need audio.",
    effort: "About 1 to 2 weeks, mostly procurement and legal.",
    evidence: [
      { label: "docs/agent.md (Data retention)", href: "docs/agent.md" },
      { label: "docs/deploy.md (data note)", href: "docs/deploy.md" },
      { label: "agent/src/agent.ts (privacy settings)", href: "agent/src/agent.ts" },
    ],
  },
  {
    id: "hipaa-baa-path",
    group: "regulatory",
    title: "HIPAA path for a US expansion",
    severity: "before scale",
    summary: "The demo runs on normal workspaces; a US customer would need HIPAA workspaces and BAAs with every vendor.",
    presentWhy: "The same stack serves a US clinic only with Business Associate Agreements end to end.",
    presentFix: "Render's HIPAA workspace with a BAA, plus BAAs with ElevenLabs, Vercel and Google.",
    why:
      "The mock EHR runs on a normal Render workspace because it holds no real patient data. Mexico's frame is LFPDPPP, NOM-004 and NOM-024, but the same product sold to a US network would need HIPAA. The decision log records the production path: a Render HIPAA workspace with a BAA (about 20% more, and an irreversible switch) and BAAs with ElevenLabs, Vercel and Google.",
    fix: "Only when a US customer is in scope: move to HIPAA workspaces and sign the BAAs before any real data.",
    effort: "Days of setup; the switch on Render is irreversible.",
    evidence: [{ label: "docs/deploy.md (Cost and free-tier limits)", href: "docs/deploy.md" }],
  },

  // ---- Clinical governance ----
  {
    id: "clinical-signoff",
    group: "clinical",
    title: "Clinical sign-off on the questionnaire and red flags",
    severity: "blocks launch",
    summary: "The questionnaire is a draft for clinical review, and no rheumatologist has approved the red-flag list.",
    presentWhy: "What the agent asks and when it sends someone to 911 are clinical decisions, not engineering ones.",
    presentFix: "A rheumatologist signs each questionnaire version and the red-flag list; intakes keep waiting for the doctor's validation.",
    why:
      "docs/questionnaire-rheum-first-visit.md is marked \"draft for clinical review\". The red flags live in the shared prompt. The intake is already stored as a patient-reported document pending the practitioner's validation (NOM-004; ADR 0001), so the agent never writes the clinical record itself, but the content it collects still needs an owner who signs it.",
    fix:
      "A clinical review loop: the clinic's lead rheumatologist approves each questionnaire version and the red-flag list, the approval is recorded with the version, and changes go through the same loop. The validation step in the EHR stays, and becomes a signed act (firma electrónica) instead of a console button.",
    effort: "A few hours of the clinician's time per version; about 1 week to build the versioning and approval record.",
    evidence: [
      { label: "docs/questionnaire-rheum-first-visit.md", href: "docs/questionnaire-rheum-first-visit.md" },
      { label: "ADR 0001: NOM-first data model, agent output pending validation", href: "docs/adr/0001-nom-first-data-model-fhir-at-the-edge.md" },
      { label: "NOM-004-SSA3-2012 (DOF)", href: NOM_004 },
    ],
  },
  {
    id: "medical-advice-guardrail",
    group: "clinical",
    title: "A live no-medical-advice guardrail that cannot block the 911 path",
    severity: "before scale",
    summary: "\"No diagnosis or advice\" is enforced by the prompt and checked after the call, not blocked live.",
    presentWhy: "An evaluation finds advice after the caller heard it; a guardrail stops it before it is spoken.",
    presentFix: "An ElevenLabs custom guardrail against medical advice, tested so it never blocks the escalation script.",
    why:
      "The prompt forbids diagnosis and advice, the no_diagnosis_or_advice evaluation criterion checks every call, and a platform test covers it, but all of that is after the fact. ElevenLabs custom guardrails validate each agent reply before delivery, and the docs use exactly this case: a healthcare receptionist should not give medical advice. The risk is the opposite failure: a guardrail that reads \"call 911 now\" as advice and blocks it.",
    fix:
      "Add the custom guardrail with a narrow rule (no diagnosis, no medication or dosing advice) that explicitly allows the escalation script, then add platform tests for both directions: advice is blocked, the red-flag script is never blocked.",
    effort: "About 1 to 2 days with tests.",
    evidence: [
      { label: "ElevenLabs: Guardrails", href: `${EL_DOCS}eleven-agents/best-practices/guardrails` },
      { label: "docs/agent.md (evaluation criteria)", href: "docs/agent.md" },
    ],
    related: [{ label: "Testing", href: "/testing" }],
  },
  {
    id: "deterministic-escalation",
    group: "clinical",
    title: "Deterministic escalation, not only an LLM-judged edge",
    severity: "before scale",
    summary: "Red-flag detection is the model following the prompt; the move to Escalation is an LLM-judged edge.",
    presentWhy: "The one path that must never fail rests on the same mechanism that misfired elsewhere in testing.",
    presentFix: "A server-side keyword check on every saved answer that forces escalation, with the script as an exact Say step.",
    why:
      "Every red-flag test passes today (scripted runs and platform tests), but detection and the jump to Escalation are both model judgments. The LLM-judged end edge did misfire in testing on another stage, which is why Scheduling moved to Claude Sonnet 5.",
    fix:
      "Defense in depth: the save_history route already sees the patient's words, so a server-side check for the approved red-flag terms can return an instruction to escalate; and the escalation script can become a structured procedure with exact Say steps.",
    effort: "About 2 to 3 days.",
    evidence: [
      { label: "agent/src/workflow.ts (edges)", href: "agent/src/workflow.ts" },
      { label: "save_history route", href: "apps/web/src/app/api/tools/save_history/route.ts" },
      { label: "ElevenLabs: Structured procedures", href: `${EL_DOCS}eleven-agents/customization/procedures/structured-procedures` },
    ],
    related: [{ label: "Edges decision", href: "/decisions#edges-goodbye" }],
  },

  // ---- EHR, identity & product ----
  {
    id: "nom024-ehr",
    group: "integration",
    title: "A NOM-024 certified EHR instead of the mock",
    severity: "blocks launch",
    summary: "The EHR is a mock: no DGIS certification, no CURP validation against RENAPO, and no signed client assertion.",
    presentWhy: "A clinic's record system must meet NOM-024; the agent should reach the clinic's own certified vendor.",
    presentFix: "Integrate the clinic's certified EHR over the same FHIR R4 adapter, with SMART Backend Services auth.",
    why:
      "The mock follows NOM-004 and NOM-024 in its tables, but its own data model lists what it does not do: no DGIS certification (NOM-024 section 7), no RENAPO validation of the CURP (stored as given and flagged unvalidated; a system must never generate one, 6.5), no firma electrónica avanzada, CIE-10 diagnoses out of scope. Its auth is OAuth2 client credentials without the signed client assertion, named as a production gap in its README.",
    fix:
      "Replace the mock with the clinic's certified EHR behind the existing EhrAdapter and FHIR R4 calls, add the signed client assertion (SMART Backend Services), and map identity to the vendor's CURP handling.",
    effort: "Depends on the vendor: 2 to 6 weeks for one integration.",
    evidence: [
      { label: "apps/mock-ehr/docs/data-model.md (what the mock does not do)", href: "apps/mock-ehr/docs/data-model.md" },
      { label: "apps/mock-ehr/README.md (Auth flow)", href: "apps/mock-ehr/README.md" },
      { label: "NOM-024-SSA3-2012 (DOF)", href: NOM_024 },
    ],
    related: [{ label: "FHIR at the edge", href: "/decisions#fhir-edge" }],
  },
  {
    id: "operator-questionnaires",
    group: "integration",
    title: "Operators own the questionnaire, per specialty and use case",
    severity: "before scale",
    summary: "The questionnaire is seeded read-only and the flows are code, so a new specialty or use case needs an engineer.",
    presentWhy: "Each new specialty and use case is another agent and more minutes: this is how the account grows.",
    presentFix: "An operator console that versions questionnaires per specialty; the agent already loads the questionnaire at call time.",
    why:
      "The agent already fetches its questions at call time: get_questionnaire reads the FHIR Questionnaire from the EHR, so the coverage is data, not prompt. But that Questionnaire is seeded on boot and read-only, the client console only displays it, and the prompts are written for rheumatology. Operators cannot add a specialty, and the other use cases a clinic asks for next (appointment management, follow-up calls, clinical history updates) need new nodes in code.",
    fix:
      "Make the operator console write versioned Questionnaires per specialty (with the clinical sign-off above), pick the questionnaire by specialty in get_questionnaire, and package the next use cases as templates the operator switches on: reschedule and cancel (tools exist), follow-up calls, history updates.",
    effort: "About 2 to 3 weeks for the editor, versioning and a second specialty.",
    evidence: [
      { label: "get_questionnaire route", href: "apps/web/src/app/api/tools/get_questionnaire/route.ts" },
      { label: "apps/mock-ehr/README.md (Questionnaire is read-only)", href: "apps/mock-ehr/README.md" },
    ],
    related: [{ label: "Tools", href: "/tools" }],
  },
  {
    id: "phone-otp",
    group: "integration",
    title: "Phone channel with SMS OTP on top of the date of birth",
    severity: "before scale",
    summary: "Patients call from a browser today, and a date of birth is weak proof against someone close to the patient.",
    presentWhy: "Patients phone a clinic, and a returning caller hears appointment details only after a stronger check.",
    presentFix: "A Twilio number on the agent, and Twilio Verify SMS OTP tools before anything is read back.",
    why:
      "The demo uses the browser (WebSocket). The identity decision records that a date of birth is weak proof and that a real deployment would add an OTP to the phone. ElevenLabs documents both the Twilio integration and SMS OTP verification as webhook tools. Twilio numbers route through the US region by default unless regional routing is set.",
    fix: "Import a Twilio number, add send and check OTP tools to Identification, and set regional routing to match the residency decision.",
    effort: "About 3 to 5 days.",
    evidence: [
      { label: "ElevenLabs: SMS OTP verification", href: `${EL_DOCS}eleven-agents/phone-numbers/twilio-integration/sms-otp-verification` },
      { label: "ElevenLabs: Twilio regional routing", href: `${EL_DOCS}eleven-agents/phone-numbers/twilio-integration/regional-routing` },
    ],
    related: [{ label: "Identity decision", href: "/decisions#identity-by-birth-date" }],
  },
  {
    id: "practitioner-scheduling",
    group: "integration",
    title: "Practitioner-level scheduling rules",
    severity: "before scale",
    summary: "Booking reads one calendar per branch; real clinics book per doctor, visit type and visit length.",
    presentWhy: "A first visit and a follow-up take different slots and different doctors.",
    presentFix: "Schedule from the EHR's practitioner roles and the clinic's own scheduling system, not a demo calendar.",
    why:
      "The demo books on one Google Calendar per branch, shared with a service account and re-checked before booking. The EHR already models where each practitioner works (PractitionerRole), but booking does not use it.",
    fix: "Read availability per practitioner and visit type from the clinic's scheduling system, keyed on PractitionerRole.",
    effort: "About 1 to 2 weeks, depending on the scheduling system.",
    evidence: [
      { label: "apps/web/src/env.ts (calendar per branch)", href: "apps/web/src/env.ts" },
      { label: "apps/mock-ehr/README.md (PractitionerRole)", href: "apps/mock-ehr/README.md" },
    ],
    related: [{ label: "Calendar booking decision", href: "/decisions#calendar-booking" }],
  },

  // ---- Agent reliability ----
  {
    id: "llm-edges",
    group: "agent",
    title: "LLM-judged edges are a source of bugs",
    severity: "hardening",
    summary: "Stage transitions are LLM judgments; Gemini once ended a returning call mid-scheduling.",
    presentWhy: "A misjudged edge ends a live call; prompt wording fixed it, the mechanism is still there.",
    presentFix: "Keep Scheduling on Claude Sonnet 5, add tests per edge, and move fixed sequences to structured procedures.",
    why:
      "On Gemini 3.5 Flash the end edge sometimes fired during scheduling for returning callers, before check_availability, and a stricter prompt made it worse. Moving Scheduling to Claude Sonnet 5 fixed it (4 of 4 returning runs), and the goodbye condition now says a filler is not a goodbye.",
    fix: "A platform test per edge condition, run on every agent push, and structured procedures for steps that must happen the same way every call.",
    effort: "About 2 days.",
    evidence: [
      { label: "agent/src/workflow.ts", href: "agent/src/workflow.ts" },
      { label: "ElevenLabs: Structured procedures", href: `${EL_DOCS}eleven-agents/customization/procedures/structured-procedures` },
    ],
    related: [
      { label: "Per-node LLMs", href: "/decisions#per-node-llm" },
      { label: "Edges decision", href: "/decisions#edges-goodbye" },
    ],
  },
  {
    id: "reasoning-leak",
    group: "agent",
    title: "Tool messages can make the model reason aloud",
    severity: "hardening",
    summary: "A tool message that said \"in Spanish\" made Gemini reason aloud in an English call.",
    presentWhy: "Server copy is effectively prompt copy, and nothing caught it before a caller heard it.",
    presentFix: "Review tool copy like prompts, and add an evaluation that fails any call with spoken reasoning.",
    why: "The CALM suffix on good-news tool results first said \"in Spanish\"; in English calls the model spoke its reasoning about which language to use. The suffix is now language-neutral.",
    fix: "A data collection or evaluation criterion that flags spoken meta-reasoning, plus English runs of every scripted scenario on each push.",
    effort: "About 1 day.",
    evidence: [{ label: "apps/web/src/tools/handler.ts (CALM)", href: "apps/web/src/tools/handler.ts" }],
    related: [{ label: "Calm tone decision", href: "/decisions#calm-tone" }],
  },
  {
    id: "pronunciation",
    group: "agent",
    title: "Pronunciation dictionary for drugs and places",
    severity: "hardening",
    summary: "Drug names, branch names and addresses rely on the voice's default pronunciation.",
    presentWhy: "A mispronounced medication or street makes a calm agent sound untrustworthy.",
    presentFix: "An ElevenLabs pronunciation dictionary with the clinic's drug list, branches and street names.",
    why: "The agent reads back branches, addresses on request and the patient's own medication names; none of them have pronunciation rules today.",
    fix: "Attach a pronunciation dictionary to the agent's voice, built from the same keyterm list the transcription boosts.",
    effort: "Half a day, plus listening tests.",
    evidence: [{ label: "ElevenLabs: Pronunciation dictionaries", href: `${EL_DOCS}eleven-agents/customization/voice/pronunciation-dictionary` }],
  },

  // ---- Operations & scale ----
  {
    id: "observability",
    group: "operations",
    title: "Observability and alerting",
    severity: "before scale",
    summary: "Failures show up in logs and the call review, but nobody is paged.",
    presentWhy: "A failing tool or EHR outage should reach someone before the next patient calls.",
    presentFix: "Alerts on tool errors, outbox backlog, failed evaluations and red-flag escalations.",
    why: "Tools log outcomes, the outbox retries when the EHR is down, and evaluations run on every call, but none of it alerts a person.",
    fix: "Route tool errors, outbox age, evaluation failures and escalations to an on-call channel, with a daily summary for the clinic.",
    effort: "About 2 to 3 days.",
    evidence: [{ label: "docs/deploy.md (outbox drain cron)", href: "docs/deploy.md" }],
    related: [{ label: "Outbox decision", href: "/decisions#outbox" }],
  },
  {
    id: "load-and-concurrency",
    group: "operations",
    title: "Load and concurrency testing",
    severity: "before scale",
    summary: "Tested one call at a time on free tiers that spin down.",
    presentWhy: "Monday mornings at a clinic network are bursts, not single calls.",
    presentFix: "Load-test the tools and EHR, set concurrency, and use call queueing or burst pricing for peaks.",
    why: "The EHR runs on a free Render instance that sleeps after 15 minutes; the tools have never seen concurrent calls.",
    fix: "Paid instances, a load test of the tool routes, and ElevenLabs call queueing or burst concurrency for peaks.",
    effort: "About 2 to 3 days.",
    evidence: [
      { label: "docs/deploy.md (Cost and free-tier limits)", href: "docs/deploy.md" },
      { label: "ElevenLabs: Call queueing", href: `${EL_DOCS}eleven-agents/guides/call-queueing` },
    ],
  },
  {
    id: "cost-per-call",
    group: "operations",
    title: "Cost per call",
    severity: "before scale",
    summary: "No measured cost per completed intake yet.",
    presentWhy: "The buyer compares it with front-desk time per patient.",
    presentFix: "Measure agent minutes and LLM cost per call by node, and tune models where it pays.",
    why: "Two nodes run on Claude Sonnet 5 for reliability; that trade has a price nobody has measured per call.",
    fix: "Report cost per completed intake from the conversation data, and revisit per-node models with tests as the guard.",
    effort: "About 1 day.",
    evidence: [{ label: "ElevenLabs: Optimizing LLM costs", href: `${EL_DOCS}eleven-agents/customization/llm/optimizing-costs` }],
  },
  {
    id: "no-show-reminders",
    group: "operations",
    title: "No-show reminders",
    severity: "hardening",
    summary: "Nothing reminds the patient the day before the visit.",
    presentWhy: "No-shows are one of the buyer's three metrics.",
    presentFix: "Outbound batch calls the day before, on the same agent and tools.",
    why: "Booking and rescheduling tools exist, but there is no outbound channel yet.",
    fix: "After the phone channel: a daily batch call to confirm, reschedule or cancel (see the roadmap).",
    effort: "About 2 to 3 days after the phone channel.",
    evidence: [{ label: "ElevenLabs: Batch calling", href: `${EL_DOCS}eleven-agents/phone-numbers/batch-calls` }],
    related: [{ label: "Roadmap: outbound reminders", href: "/decisions#outbound-reminders" }],
  },
  {
    id: "security-review",
    group: "operations",
    title: "Security review and pen test",
    severity: "blocks launch",
    summary: "No external security review of the tool endpoints, the EHR console or the post-call webhook.",
    presentWhy: "Every tool route touches health data, and the demo console uses Basic auth.",
    presentFix: "A pen test of the tool routes, webhook and console, and SSO for the clinic console.",
    why: "Tools carry a workspace secret, the webhook is HMAC-verified and the console is read-only behind Basic auth: sound for a demo, unreviewed for production.",
    fix: "An external pen test before launch, SSO and roles for the console, and secret rotation on a schedule.",
    effort: "About 1 to 2 weeks with a vendor.",
    evidence: [
      { label: "docs/security/elevenlabs-api-keys.md", href: "docs/security/elevenlabs-api-keys.md" },
      { label: "docs/deploy.md (webhook signature)", href: "docs/deploy.md" },
    ],
    related: [{ label: "Client console decision", href: "/decisions#client-console" }],
  },
];

export const SEVERITY_ORDER: Severity[] = ["blocks launch", "before scale", "hardening"];

/** Most severe first, then data order: the index and the cards within a group. */
export const bySeverity = (list: Gap[]) => [...list].sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity));
