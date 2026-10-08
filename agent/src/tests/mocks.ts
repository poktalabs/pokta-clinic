// Mock responses for every webhook tool, used by the simulation tests. They mirror the shape of the
// web app's tool responses (apps/web/src/app/api/tools/*/route.ts), message field included, with
// fictional data. Every simulation mocks ALL tools and raises an error when no mock matches, so a test
// never reaches the web app, the EHR, the calendar or the mailer.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CLI_DIR } from "../config.ts";

export type ToolName =
  | "record_consent"
  | "find_patient"
  | "save_patient"
  | "get_questionnaire"
  | "save_history"
  | "check_availability"
  | "book_appointment"
  | "reschedule_appointment"
  | "request_callback"
  | "escalate";

// Tool IDs come from the CLI registry (agent/cli/tools.json), keyed by the config file name.
const registry = JSON.parse(readFileSync(join(CLI_DIR, "tools.json"), "utf8")) as { tools: { config: string; id: string }[] };
export function toolId(name: ToolName): string {
  const entry = registry.tools.find((t) => t.config === `tool_configs/${name}.json`);
  if (!entry) throw new Error(`${name} is not in agent/cli/tools.json`);
  return entry.id;
}

export const TEST_PATIENT_ID = "pat-test-0001";
const CALM = " Say it in one calm, neutral sentence in the language of the conversation: no exclamation marks, no celebration.";

interface Mock {
  parameter_conditions: { path: string; eval: { type: "regex"; pattern: string } }[];
  mock_result: string;
  is_error?: boolean;
}
const always = (result: unknown): Mock => ({ parameter_conditions: [], mock_result: JSON.stringify(result) });
const when = (path: string, pattern: string, result: unknown): Mock => ({
  parameter_conditions: [{ path, eval: { type: "regex", pattern } }],
  mock_result: JSON.stringify(result),
});

const QUESTIONNAIRE = [
  ["chief-complaint", "Motivo principal de la consulta, con sus propias palabras"],
  ["onset-duration", "Desde cuándo tiene las molestias y si empezaron de golpe o poco a poco"],
  ["joints-involved", "Articulaciones afectadas y si duelen de ambos lados o de uno solo"],
  ["morning-stiffness-min", "Minutos de rigidez al levantarse en la mañana (0 si no hay)"],
  ["joint-swelling", "Hinchazón en alguna articulación"],
  ["systemic-symptoms", "Fiebre, pérdida de peso sin buscarla o cansancio fuera de lo normal"],
  ["extra-articular", "Síntomas de piel, ojos, boca seca o dedos que cambian de color con el frío"],
  ["current-medications", "Medicamentos actuales, incluidos analgésicos, cortisona y remedios naturales"],
  ["allergies", "Alergias a medicamentos, alimentos u otras cosas"],
  ["prior-dx-tests", "Diagnósticos previos, estudios de laboratorio y de imagen"],
  ["family-history", "Familiares con artritis, lupus, psoriasis u otra enfermedad reumática o autoinmune"],
].map(([link_id, text]) => ({ link_id, text }));

const MOCKS: Record<ToolName, Mock[]> = {
  record_consent: [
    when("granted", "^(true|True)$", { consent_id: "consent-test", granted: true, message: `Consent recorded. Thank them in one short sentence and continue with identification.${CALM}` }),
    when("granted", "^(false|False)$", {
      granted: false,
      message: "Refusal recorded. Do not collect any personal or health data. Explain kindly that without consent the voice pre-consultation cannot continue, say they can contact the branch of their choice directly, and say goodbye.",
    }),
  ],
  find_patient: [always({ found: false, message: "No record for this phone. Treat the caller as a new patient and collect the registration data." })],
  save_patient: [
    always({ patient_id: TEST_PATIENT_ID, folio: "GMA-TEST-0001", already_registered: false, message: `Patient registered. Say in one plain sentence that their record is ready, then follow the instructions of your current stage.${CALM}` }),
  ],
  get_questionnaire: [
    always({ items: QUESTIONNAIRE, message: "Cover every item in your own order, with natural follow-ups. Keep the link_id values: save_history needs them. Then call save_history with the answers so far." }),
  ],
  save_history: [always({ saved: true, message: "Saved. Follow the instructions of your current stage." })],
  check_availability: [
    always({
      slots: [
        { branch: "del-valle", branch_name: "GMA Del Valle", start: "2026-10-13T09:00:00-06:00", label: "martes 13 de octubre a las nueve de la mañana" },
        { branch: "del-valle", branch_name: "GMA Del Valle", start: "2026-10-13T17:00:00-06:00", label: "martes 13 de octubre a las cinco de la tarde" },
      ],
      message: "Offer these options by reading each label aloud, with the branch name when the options are at different branches. When the caller chooses one, call book_appointment with its branch and start exactly as given.",
    }),
  ],
  book_appointment: [
    always({
      booked: true,
      appointment_id: "appt-test-0001",
      label: "martes 13 de octubre a las nueve de la mañana",
      branch_name: "GMA Del Valle",
      address: "Avenida Insurgentes Sur, colonia del Valle, Ciudad de México",
      practitioner: "doctora Elena Ruiz Castellanos",
      emailed: false,
      message: "Booked. Read back the day, date, time, branch, practitioner and address. No email was sent, so do not mention any email.",
    }),
  ],
  reschedule_appointment: [always({ rescheduled: true, appointment_id: "appt-test-0002", message: "Rescheduled. Say the previous appointment was cancelled and read back the new one." })],
  request_callback: [always({ requested: true, message: "Callback requested. Tell the caller the branch team will call them in the time they gave; no email was sent, so do not mention any email. Then thank them and say goodbye." })],
  escalate: [
    when("severity", "^emergencia$", { logged: true, severity: "emergencia", message: "Logged. Continue the escalation script." }),
    when("severity", "^urgencia$", { logged: true, severity: "urgencia", message: "Logged. Continue the escalation script." }),
  ],
};

/** The mock block every simulation test carries: all tools mocked, no fallback to the real tool. */
export function mockAllTools() {
  return {
    tool_mock_config: { mocking_strategy: "all" as const, fallback_strategy: "raise_error" as const, mocked_tool_ids: [] as string[] },
    tool_mock_overrides: Object.fromEntries((Object.keys(MOCKS) as ToolName[]).map((name) => [toolId(name), MOCKS[name]])),
  };
}
