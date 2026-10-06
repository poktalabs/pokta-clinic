// The demo practice. All data is fictional. Safe to run on every boot: an existing CLUES is left alone.
import { QUESTIONNAIRE_TITLE, QUESTIONNAIRE_URL, QUESTIONNAIRE_VERSION, RHEUM_FIRST_VISIT_ITEMS } from "@pokta-clinic/fhir";
import { db } from "./client.js";
import { establishment, practitioner, questionnaire } from "./schema.js";

export async function seedDemoPractice(): Promise<boolean> {
  const [org] = await db
    .insert(establishment)
    .values({
      clues: "DFSMP000001",
      tipo: "Consultorio de medicina especializada (privado)",
      nombre: "Consultorio de Reumatologia Dra. Elena Ruiz",
      razonSocial: "Reumatologia Ruiz S.C.",
      domicilio: "Av. Insurgentes Sur 1234, Consultorio 502, Col. del Valle, Benito Juarez, 03100, Ciudad de Mexico",
    })
    .onConflictDoNothing()
    .returning();
  if (!org) return false;
  await db.insert(practitioner).values({
    establishmentId: org.id,
    nombre: "Elena",
    primerApellido: "Ruiz",
    segundoApellido: "Castellanos",
    cedulaProfesional: "00000000",
    especialidad: "Reumatologia",
  });
  return true;
}

// The first-visit Questionnaire definition (items as JSONB). Idempotent: an existing canonical url is left alone.
export async function seedQuestionnaire(): Promise<boolean> {
  const [org] = await db.select({ id: establishment.id }).from(establishment).limit(1);
  if (!org) return false;
  const rows = await db
    .insert(questionnaire)
    .values({ establishmentId: org.id, url: QUESTIONNAIRE_URL, version: QUESTIONNAIRE_VERSION, title: QUESTIONNAIRE_TITLE, items: RHEUM_FIRST_VISIT_ITEMS })
    .onConflictDoNothing()
    .returning({ id: questionnaire.id });
  return rows.length > 0;
}
