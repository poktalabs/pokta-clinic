// The demo practice. All data is fictional. Safe to run on every boot: an existing CLUES is left alone.
import { db } from "./client.js";
import { establishment, practitioner } from "./schema.js";

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
