import { z } from "zod";

// Canonical identity of the first-visit intake. Source of the items: docs/questionnaire-rheum-first-visit.md.
export const QUESTIONNAIRE_URL = "urn:pokta-clinic:questionnaire:rheum-first-visit";
export const QUESTIONNAIRE_VERSION = "0.1.0";
export const QUESTIONNAIRE_TITLE = "Primera consulta de reumatología: historia previa a la visita";

export const QuestionnaireItem = z.object({
  linkId: z.string(),
  text: z.string(),
  type: z.enum(["string", "integer", "boolean"]),
  required: z.boolean().optional(),
  repeats: z.boolean().optional(),
});
export type QuestionnaireItem = z.infer<typeof QuestionnaireItem>;

export const Questionnaire = z.object({
  resourceType: z.literal("Questionnaire"),
  id: z.string().optional(),
  url: z.string(),
  version: z.string(),
  title: z.string(),
  status: z.enum(["draft", "active", "retired"]),
  item: z.array(QuestionnaireItem).min(1),
});
export type Questionnaire = z.infer<typeof Questionnaire>;

// Stable linkIds, so the agent and the EHR agree on what each answer is.
export const LINK_ID = {
  chiefComplaint: "chief-complaint",
  onsetDuration: "onset-duration",
  jointsInvolved: "joints-involved",
  morningStiffnessMin: "morning-stiffness-min",
  jointSwelling: "joint-swelling",
  systemicSymptoms: "systemic-symptoms",
  extraArticular: "extra-articular",
  currentMedications: "current-medications",
  allergies: "allergies",
  priorDxTests: "prior-dx-tests",
  familyHistory: "family-history",
} as const;

// All 11 are required: the agent must attempt each and record an answer ("no sabe" counts).
export const RHEUM_FIRST_VISIT_ITEMS: QuestionnaireItem[] = [
  { linkId: LINK_ID.chiefComplaint, text: "Motivo principal de la consulta, con sus propias palabras", type: "string", required: true },
  { linkId: LINK_ID.onsetDuration, text: "Desde cuándo tiene las molestias y si empezaron de golpe o poco a poco", type: "string", required: true },
  { linkId: LINK_ID.jointsInvolved, text: "Articulaciones afectadas y si duelen de ambos lados o de uno solo", type: "string", required: true, repeats: true },
  { linkId: LINK_ID.morningStiffnessMin, text: "Minutos de rigidez al levantarse en la mañana (0 si no hay)", type: "integer", required: true },
  { linkId: LINK_ID.jointSwelling, text: "Hinchazón en alguna articulación", type: "boolean", required: true },
  { linkId: LINK_ID.systemicSymptoms, text: "Fiebre, pérdida de peso sin buscarla o cansancio fuera de lo normal", type: "string", required: true, repeats: true },
  { linkId: LINK_ID.extraArticular, text: "Síntomas de piel, ojos, boca seca o dedos que cambian de color con el frío", type: "string", required: true, repeats: true },
  { linkId: LINK_ID.currentMedications, text: "Medicamentos actuales, incluidos analgésicos, cortisona y remedios naturales", type: "string", required: true, repeats: true },
  { linkId: LINK_ID.allergies, text: "Alergias a medicamentos, alimentos u otras cosas", type: "string", required: true, repeats: true },
  { linkId: LINK_ID.priorDxTests, text: "Diagnósticos previos, estudios de laboratorio y de imagen", type: "string", required: true },
  { linkId: LINK_ID.familyHistory, text: "Familiares con artritis, lupus, psoriasis u otra enfermedad reumática o autoinmune", type: "string", required: true, repeats: true },
];

export const requiredLinkIds = (items: { linkId: string; required?: boolean }[]) => items.filter((i) => i.required).map((i) => i.linkId);

export function questionnaireResource(input: { id?: string; url: string; version: string; title: string; status?: Questionnaire["status"]; items: QuestionnaireItem[] }): Questionnaire {
  return { resourceType: "Questionnaire", id: input.id, url: input.url, version: input.version, title: input.title, status: input.status ?? "active", item: input.items };
}
