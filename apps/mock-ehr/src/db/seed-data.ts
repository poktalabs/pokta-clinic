// The demo clinic network: one Organization, three branches (Locations), one Practitioner per branch. All data is fictional.
// Safe to run on every boot and on a database seeded by the old single-practice version: rows are matched by their natural
// key (razon social, CLUES, cedula) and updated in place, so ids and everything pointing at them are kept.
import { BRANCH_CODE, QUESTIONNAIRE_TITLE, QUESTIONNAIRE_URL, QUESTIONNAIRE_VERSION, RHEUM_FIRST_VISIT_ITEMS } from "@pokta-clinic/fhir";
import { eq, sql } from "drizzle-orm";
import { db } from "./client.js";
import { establishment, organization, practitioner, practitionerRole, questionnaire, type Horario } from "./schema.js";

const TIPO = "Consultorio de medicina especializada (privado)";
const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri"] as const;
const hours = (days: Horario["daysOfWeek"], openingTime: string, closingTime: string): Horario => ({ daysOfWeek: days, openingTime, closingTime });

const NETWORK = { nombre: "Grupo Médico Articular", razonSocial: "Grupo Médico Articular S.C." };

// The first branch keeps the CLUES (and so the row and id) of the old solo practice.
export const BRANCHES = [
  {
    codigo: BRANCH_CODE.delValle,
    clues: "DFSMP000001",
    nombre: "GMA Del Valle",
    domicilio: "Av. Insurgentes Sur 1234, Consultorio 502, Col. del Valle, Benito Juárez, 03100, Ciudad de México",
    horarios: [hours([...WEEKDAYS], "09:00:00", "14:00:00"), hours([...WEEKDAYS], "16:00:00", "19:00:00")],
    practitioner: { nombre: "Elena", primerApellido: "Ruiz", segundoApellido: "Castellanos", cedulaProfesional: "00000000" },
  },
  {
    codigo: BRANCH_CODE.polanco,
    clues: "DFSMP000002",
    nombre: "GMA Polanco",
    domicilio: "Av. Presidente Masaryk 450, Piso 3, Polanco V Sección, Miguel Hidalgo, 11560, Ciudad de México",
    horarios: [hours([...WEEKDAYS], "10:00:00", "18:00:00")],
    practitioner: { nombre: "Andrés", primerApellido: "Villaseñor", segundoApellido: "Mora", cedulaProfesional: "00000001" },
  },
  {
    codigo: BRANCH_CODE.satelite,
    clues: "MCSMP000003",
    nombre: "GMA Satélite",
    domicilio: "Circuito Centro Comercial 2251, Ciudad Satélite, Naucalpan de Juárez, 53100, Estado de México",
    horarios: [hours([...WEEKDAYS], "09:00:00", "14:00:00"), hours(["sat"], "09:00:00", "13:00:00")],
    practitioner: { nombre: "Mariana", primerApellido: "Ochoa", segundoApellido: "Treviño", cedulaProfesional: "00000002" },
  },
];

// Returns true when anything was inserted (a branch or a Practitioner that was missing).
export async function seedDemoNetwork(): Promise<boolean> {
  let inserted = false;
  let [org] = await db.insert(organization).values(NETWORK).onConflictDoNothing().returning();
  if (org) inserted = true;
  else [org] = await db.select().from(organization).where(eq(organization.razonSocial, NETWORK.razonSocial));
  // Keep the display name current without touching the id.
  await db.update(organization).set({ nombre: NETWORK.nombre }).where(eq(organization.id, org.id));

  for (const b of BRANCHES) {
    const fields = { organizationId: org.id, codigo: b.codigo, tipo: TIPO, nombre: b.nombre, razonSocial: NETWORK.razonSocial, domicilio: b.domicilio, horarios: b.horarios };
    const [branch] = await db
      .insert(establishment)
      .values({ clues: b.clues, ...fields })
      .onConflictDoUpdate({ target: establishment.clues, set: fields })
      .returning({ id: establishment.id, created: sql<boolean>`xmax = 0` });
    if (branch.created) inserted = true;

    const pract = { establishmentId: branch.id, especialidad: "Reumatología", ...b.practitioner };
    const [doc] = await db
      .insert(practitioner)
      .values(pract)
      .onConflictDoUpdate({ target: practitioner.cedulaProfesional, set: pract })
      .returning({ id: practitioner.id, created: sql<boolean>`xmax = 0` });
    if (doc.created) inserted = true;

    await db.insert(practitionerRole).values({ practitionerId: doc.id, establishmentId: branch.id }).onConflictDoNothing();
  }
  return inserted;
}

// The first-visit Questionnaire definition (items as JSONB). Idempotent: an existing canonical url is left alone.
export async function seedQuestionnaire(): Promise<boolean> {
  const [org] = await db.select({ id: establishment.id }).from(establishment).orderBy(establishment.createdAt).limit(1);
  if (!org) return false;
  const rows = await db
    .insert(questionnaire)
    .values({ establishmentId: org.id, url: QUESTIONNAIRE_URL, version: QUESTIONNAIRE_VERSION, title: QUESTIONNAIRE_TITLE, items: RHEUM_FIRST_VISIT_ITEMS })
    .onConflictDoNothing()
    .returning({ id: questionnaire.id });
  return rows.length > 0;
}
