// The server-side half of the /tools page: what each route in src/app/api/tools does once the agent
// calls it. Hand-written from the route handlers (they are code, not data); details.test.ts checks that
// every quoted `message` still appears in the route source, so a reworded reply fails the test.
// The agent-side half (parameters, node, delivery) is generated into catalog.json.

export type System = "ehr" | "calendar" | "store" | "email";
export const SYSTEMS: Record<System, string> = {
  ehr: "EHR (FHIR R4)",
  calendar: "Google Calendar",
  store: "Upstash Redis",
  email: "Resend email",
};

export type Downstream = { system: System; calls: string[] };
// `{...}` marks a value filled at runtime. `composed` replies are assembled from several strings in the
// route, so the test checks only their first sentence.
export type Reply = { when: string; message: string; composed?: true };

export type ToolDetail = {
  purpose: string;
  sideEffects: boolean;
  /** checked: refuses to run without a granted Consent. sets: records it. exempt: runs without it. */
  consentGate: "checked" | "sets" | "exempt";
  downstream: Downstream[];
  guardrails: string[];
  /** Fields the route returns besides `ok` and `message`. */
  fields: string[];
  replies: Reply[];
  /** Extra files the route delegates to, relative to the repo root. */
  related?: string[];
};

// Every route also appends a timeline event (tool, status, latency, a public outcome label) to the store.
const TIMELINE = "Timeline event (tool, status, ms, outcome label; no patient data)";

export const DETAILS: Record<string, ToolDetail> = {
  record_consent: {
    purpose: "Records the caller's yes or no to the aviso de privacidad, before any personal data moves.",
    sideEffects: true,
    consentGate: "sets",
    downstream: [
      { system: "ehr", calls: ["POST /Consent (identifier = conversation_id)"] },
      { system: "store", calls: ["Consent decision cache (so the gate survives an EHR outage)", "Lead email typed on the page, if any", TIMELINE] },
    ],
    guardrails: [
      "It is the gate: every other data tool asks the store, then the EHR, for a granted Consent of this conversation",
      "EHR down: the decision is queued in the outbox and cached, the call goes on",
    ],
    fields: ["granted", "consent_id"],
    replies: [
      { when: "granted", message: "Consent recorded. Thank them in one short sentence and continue with identification." },
      {
        when: "refused",
        message:
          "Refusal recorded. Do not collect any personal or health data. Explain kindly that without consent the voice pre-consultation cannot continue, say they can contact the branch of their choice directly, and say goodbye.",
      },
    ],
    related: ["apps/web/src/tools/handler.ts"],
  },
  find_patient: {
    purpose: "Looks the caller up by 10-digit phone and returns only the given name to confirm, plus what a returning patient has pending.",
    sideEffects: false,
    consentGate: "checked",
    downstream: [
      {
        system: "ehr",
        calls: [
          "GET /Patient?phone=",
          "GET /Appointment (upcoming, booked)",
          "GET /Task?status=requested (pending callback)",
          "GET /QuestionnaireResponse?subject= (history done)",
        ],
      },
      { system: "store", calls: [TIMELINE] },
    ],
    guardrails: [
      "Consent gate",
      "Phone normalized to 10 digits (+52, spaces, dashes stripped); anything else is refused",
      "Returns the given name only: a phone is not proof of identity, the agent confirms the name first",
    ],
    fields: ["found", "patient_id", "given_name", "upcoming_appointment", "pending_callback", "history_completed"],
    replies: [
      { when: "no record", message: "No record for this phone. Treat the caller as a new patient and collect the registration data." },
      { when: "found", message: "A record exists. Ask the caller to confirm they are {given_name} before you continue. Once they confirm, {next step}" },
      { when: "bad phone", message: "The phone number does not have 10 digits. Ask the patient to say it again, digit by digit." },
    ],
    related: ["apps/web/src/tools/phone.ts"],
  },
  save_patient: {
    purpose: "Registers a new patient with the NOM-024 fields a call can collect (no CURP).",
    sideEffects: true,
    consentGate: "checked",
    downstream: [
      { system: "ehr", calls: ["POST /Patient (returns the existing one if the phone is taken)", "PUT /Consent (links the new patient to this conversation's Consent)", "PUT /Patient (page email, after the response)"] },
      { system: "store", calls: [TIMELINE] },
    ],
    guardrails: [
      "Consent gate",
      "Phone normalized to 10 digits",
      "Idempotent by phone: a second call returns the existing record and asks the agent to confirm the name",
      "Binds the Consent to the new patient, so later tools refuse any other patient_id",
    ],
    fields: ["patient_id", "folio", "given_name", "already_registered"],
    replies: [
      { when: "created", message: "Patient registered. Say in one plain sentence that their record is ready, then follow the instructions of your current stage." },
      { when: "phone already registered", message: "This phone already belongs to {given_name}. Confirm the name with the caller before you continue." },
    ],
  },
  get_questionnaire: {
    purpose: "Loads the required items of the first-visit rheumatology Questionnaire (link_id plus Spanish text).",
    sideEffects: false,
    consentGate: "checked",
    downstream: [
      { system: "ehr", calls: ["GET /Questionnaire?url= (first-visit rheumatology)"] },
      { system: "store", calls: [TIMELINE] },
    ],
    guardrails: ["Consent gate", "Only required items reach the LLM; the order and follow-ups are the agent's, the coverage is the Questionnaire's"],
    fields: ["items[] (link_id, text)"],
    replies: [
      {
        when: "always",
        message:
          "Cover every item in your own order, with natural follow-ups. Keep the link_id values: save_history needs them. Then call save_history with the answers so far.",
      },
    ],
  },
  save_history: {
    purpose: "Saves the answers as one QuestionnaireResponse per conversation, pending clinician review.",
    sideEffects: true,
    consentGate: "checked",
    downstream: [
      {
        system: "ehr",
        calls: ["GET /Questionnaire", "GET /QuestionnaireResponse?identifier= (this conversation)", "POST or PUT /QuestionnaireResponse (merge, never marked validated)"],
      },
      { system: "store", calls: ["Outbox entry if the EHR is down", TIMELINE] },
    ],
    guardrails: [
      "Consent gate and patient_id check",
      "status completed is refused while a required item is unanswered: the reply lists the missing link_ids",
      "Merges over what is stored, so a retry with only new answers erases nothing; idempotent per conversation",
      "Answers stay in the patient's words; the record waits for the practitioner's Validation",
      "EHR down: queued in the outbox, replayed by the drain",
    ],
    fields: ["saved", "status", "missing", "queued"],
    replies: [
      { when: "completed", message: "History saved. Continue with your current stage." },
      {
        when: "items missing",
        message: "Not saved as completed: these items still have no answer. Ask the patient about them ({link_id: text; ...}), then call save_history again with all the answers.",
      },
      {
        when: "EHR down",
        message:
          "Saved. The clinic record system is temporarily offline; the data is stored safely and will sync automatically. Do not mention a problem to the caller and continue with your current stage.",
      },
    ],
    related: ["apps/web/src/tools/save-history.ts", "apps/web/src/outbox/queue.ts"],
  },
  check_availability: {
    purpose: "Returns up to 3 free 60-minute first-consultation slots from the live branch calendars.",
    sideEffects: false,
    consentGate: "checked",
    downstream: [
      { system: "calendar", calls: ["freeBusy on each branch calendar (one, or all three for any)"] },
      { system: "ehr", calls: ["GET /Location, /PractitionerRole, /Practitioner (branch and doctor names, cached; config fallback)"] },
      { system: "store", calls: [TIMELINE] },
    ],
    guardrails: [
      "Consent gate",
      "Slots come from branch rules (hours, 24 h to 14 days ahead, America/Mexico_City) minus live busy time; the LLM never builds a time",
      "A branch whose calendar fails is skipped while another answers",
    ],
    fields: ["slots[] (branch, branch_name, practitioner_name, start, label)"],
    replies: [
      {
        when: "slots found",
        message:
          "Offer these options by reading each label aloud, with the branch name when the options are at different branches. When the caller chooses one, call book_appointment with its branch and start exactly as given.",
      },
      {
        when: "no slots",
        message:
          "No free slots for exactly that request. Say so and ask for a different day, time or branch, then call check_availability again. Do not claim anything about times you did not search for.",
      },
    ],
    related: ["apps/web/src/scheduling/slots.ts", "apps/web/src/scheduling/branches.ts"],
  },
  book_appointment: {
    purpose: "Books the chosen slot: a calendar event, then the FHIR Appointment, then a confirmation email.",
    sideEffects: true,
    consentGate: "checked",
    downstream: [
      { system: "calendar", calls: ["freeBusy (re-check the slot)", "events.insert (no clinical data in the event)", "events.delete (compensation if the EHR write fails)"] },
      { system: "ehr", calls: ["GET /Appointment?identifier= (already booked?)", "GET /Patient/{id}", "POST /Appointment", "PUT /Task completed (closes a pending callback, after the response)"] },
      { system: "store", calls: ["Booking record per conversation", "Outbox entry if the EHR is down", TIMELINE] },
      { system: "email", calls: ["Confirmation with the patient link (only if the caller typed an email on the page)"] },
    ],
    guardrails: [
      "Consent gate and patient_id check",
      "Idempotent per conversation: a retry returns the same booking (store first, EHR second)",
      "Never trusts the start the LLM sends: re-checks branch rules and live busy time",
      "No calendar event without an Appointment: a failed EHR write deletes the event; 409 means slot taken",
      "EHR down: the event stays, the Appointment write is queued in the outbox",
      "The reply says whether an email was sent, so the agent never promises one that was not",
      "Delivery: caller speech does not interrupt the call while it runs",
    ],
    fields: ["booked", "appointment_id", "queued", "branch", "branch_name", "address", "practitioner_name", "start", "label", "emailed"],
    replies: [
      {
        when: "booked",
        message:
          "Booked. Read back the day, date and time ({label}), the branch name ({branch_name}) and the practitioner ({practitioner_name}) to the caller and say the address once. Then follow the instructions of your current stage.",
        composed: true,
      },
      { when: "slot taken", message: "That slot is no longer available. Apologise briefly and call check_availability to offer other options." },
      {
        when: "EHR down",
        message:
          "Booked in the calendar. The clinic record system is offline and will sync the Appointment by itself. Read back {read-back} to the caller, say the address once, do not mention any problem, and follow the instructions of your current stage.",
        composed: true,
      },
    ],
    related: ["apps/web/src/tools/close-callbacks.ts", "apps/web/src/outbox/queue.ts"],
  },
  reschedule_appointment: {
    purpose: "Moves a returning patient's upcoming first consultation: books the new slot first, then cancels the old one.",
    sideEffects: true,
    consentGate: "checked",
    downstream: [
      { system: "calendar", calls: ["freeBusy (re-check)", "events.insert (new)", "events.delete (old, or the new one on failure)"] },
      { system: "ehr", calls: ["GET /Appointment (upcoming, must own appointment_id)", "GET /Patient/{id}", "POST /Appointment", "PUT /Appointment status cancelled (old)"] },
      { system: "store", calls: ["Booking record per conversation", TIMELINE] },
      { system: "email", calls: ["Change confirmation with the patient link (if an email was typed)"] },
    ],
    guardrails: [
      "Consent gate and patient_id check",
      "appointment_id must be an upcoming appointment of this patient",
      "Book first, cancel second: a failure never leaves the patient with no appointment",
      "Re-checks the slot; idempotent per conversation",
      "Delivery: caller speech does not interrupt the call while it runs",
    ],
    fields: ["rescheduled", "appointment_id", "old_label", "branch", "branch_name", "address", "practitioner_name", "start", "label", "emailed"],
    replies: [
      {
        when: "rescheduled",
        message:
          "Rescheduled. Tell the caller their appointment of {old_label} is cancelled and read back the new one: {label} at {branch_name} with {practitioner_name}. Say the address once{email note}. Then follow the instructions of your current stage.",
      },
      { when: "slot taken", message: "That slot is no longer available. Apologise briefly and call check_availability to offer other options." },
      {
        when: "unknown appointment",
        message: "That appointment_id is not an upcoming appointment of this patient. Use the upcoming_appointment returned by find_patient.",
      },
    ],
  },
  request_callback: {
    purpose: "Turns 'call me back' into front-desk work: a FHIR Task, a calendar reminder and emails.",
    sideEffects: true,
    consentGate: "checked",
    downstream: [
      { system: "ehr", calls: ["GET /Patient/{id} (name, folio, phone for the front desk)", "POST /Task (callback, status requested)"] },
      { system: "calendar", calls: ["events.insert (reminder next business morning, transparent so it never blocks a slot)"] },
      { system: "email", calls: ["Front desk: callback request", "Caller: we will call you, with the patient link (if an email was typed)"] },
      { system: "store", calls: [TIMELINE] },
    ],
    guardrails: [
      "Consent gate and patient_id check (when a patient_id is sent)",
      "Only the EHR write can fail it; the calendar and email are best effort, so the request is never lost",
      "The reply says whether the caller was emailed",
    ],
    fields: ["requested", "branch", "branch_name", "availability", "emailed_caller", "emails_sent"],
    replies: [
      {
        when: "requested",
        message:
          "Callback requested. Tell the caller the {branch_name} team will call them {availability}{email note}. Then thank them and say goodbye.",
      },
    ],
    related: ["apps/web/src/scheduling/callback.ts", "apps/web/src/email/templates.ts"],
  },
  escalate: {
    purpose: "Logs a red flag for the clinical team while the agent delivers the 911 or emergency-room script.",
    sideEffects: true,
    consentGate: "exempt",
    downstream: [
      { system: "ehr", calls: ["POST /Communication (priority stat for emergencia, urgent for urgencia; to the branch practitioner when known)"] },
      { system: "store", calls: ["Booking lookup (branch)", "Outbox entry if the EHR is down", TIMELINE] },
    ],
    guardrails: [
      "No consent gate, by design: a red flag is a safety event (LFPDPPP allows processing to protect life or health)",
      "Never blocks the script: a failure returns ok:false and the agent keeps going",
      "EHR down: queued in the outbox",
      "patient_words are stored verbatim, never interpreted",
    ],
    fields: ["logged", "severity", "queued"],
    replies: [
      { when: "logged", message: "Logged. Continue the escalation script." },
      { when: "failed", message: "Continue the escalation script. Do not mention any problem to the caller." },
    ],
  },
};

// Replies shared by every gated tool, from src/tools/handler.ts and src/tools/patient-guard.ts.
export const SHARED_REPLIES: (Reply & { status: number; source: string })[] = [
  { when: "no consent recorded", status: 200, message: "No consent is recorded for this conversation. Ask for consent first and call record_consent.", source: "apps/web/src/tools/handler.ts" },
  {
    when: "patient_id of another conversation",
    status: 200,
    message: "That patient_id does not belong to this conversation. Use the patient_id returned by find_patient or save_patient earlier in this conversation.",
    source: "apps/web/src/tools/patient-guard.ts",
  },
  { when: "EHR unavailable", status: 503, message: "The clinic record system is not responding. Apologise, say the clinic will call back, and do not retry now.", source: "apps/web/src/tools/handler.ts" },
  {
    when: "calendar unavailable",
    status: 503,
    message: "The clinic calendar is not responding. Apologise, say the clinic will call back to schedule, and do not retry now.",
    source: "apps/web/src/tools/handler.ts",
  },
  { when: "missing or wrong secret header", status: 401, message: "(no message: body is { error: \"unauthorized\" })", source: "apps/web/src/tools/handler.ts" },
];
