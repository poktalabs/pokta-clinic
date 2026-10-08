// How a rheumatologist reads the first-visit history: complaint and course, then the joint pattern (is it
// inflammatory?), then systemic and extra-articular clues (connective tissue disease?), then what matters before
// prescribing, then background. This also keeps the Questionnaire's own item order (1 to 11).
// Shared by the patient summary, the consultation mock and the Questionnaire page.
import { LINK_ID } from "@pokta-clinic/fhir";

export const CLINICAL_SECTIONS: { id: string; title: string; why: string; linkIds: string[] }[] = [
  {
    id: "motivo",
    title: "Motivo de consulta y evolución",
    why: "Qué trae al paciente y cómo empezó.",
    linkIds: [LINK_ID.chiefComplaint, LINK_ID.onsetDuration],
  },
  {
    id: "articular",
    title: "Patrón articular",
    why: "Distribución, rigidez matutina e hinchazón: orientan a un patrón inflamatorio o mecánico.",
    linkIds: [LINK_ID.jointsInvolved, LINK_ID.morningStiffnessMin, LINK_ID.jointSwelling],
  },
  {
    id: "sistemico",
    title: "Manifestaciones sistémicas y extraarticulares",
    why: "Síntomas generales y de piel, ojos, boca o dedos que sugieren enfermedad del tejido conectivo.",
    linkIds: [LINK_ID.systemicSymptoms, LINK_ID.extraArticular],
  },
  {
    id: "tratamiento",
    title: "Medicamentos y alergias",
    why: "Lo que debe confirmarse antes de prescribir.",
    linkIds: [LINK_ID.currentMedications, LINK_ID.allergies],
  },
  {
    id: "antecedentes",
    title: "Antecedentes",
    why: "Diagnósticos y estudios previos, e historia familiar autoinmune.",
    linkIds: [LINK_ID.priorDxTests, LINK_ID.familyHistory],
  },
];

// Short clinical labels for each item (the Questionnaire text is the patient-facing question).
export const ITEM_LABEL: Record<string, string> = {
  [LINK_ID.chiefComplaint]: "Motivo principal",
  [LINK_ID.onsetDuration]: "Inicio y evolución",
  [LINK_ID.jointsInvolved]: "Articulaciones afectadas",
  [LINK_ID.morningStiffnessMin]: "Rigidez matutina",
  [LINK_ID.jointSwelling]: "Hinchazón articular",
  [LINK_ID.systemicSymptoms]: "Síntomas sistémicos",
  [LINK_ID.extraArticular]: "Síntomas extraarticulares",
  [LINK_ID.currentMedications]: "Medicamentos actuales",
  [LINK_ID.allergies]: "Alergias",
  [LINK_ID.priorDxTests]: "Diagnósticos y estudios previos",
  [LINK_ID.familyHistory]: "Antecedentes familiares",
};

// Morning stiffness of 30 minutes or more is the usual threshold that points to inflammatory arthritis. Shown as a
// fact to review, never as a diagnosis.
export const STIFFNESS_ATTENTION_MIN = 30;
