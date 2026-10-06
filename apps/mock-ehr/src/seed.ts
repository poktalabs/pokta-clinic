// Seeds the demo practice. All data is fictional.
import { db, sql } from "./db/client.js";
import { establishment, practitioner } from "./db/schema.js";

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

if (org) {
  await db.insert(practitioner).values({
    establishmentId: org.id,
    nombre: "Elena",
    primerApellido: "Ruiz",
    segundoApellido: "Castellanos",
    cedulaProfesional: "00000000",
    especialidad: "Reumatologia",
  });
  console.log("seeded establishment", org.id);
} else {
  console.log("already seeded");
}
await sql.end();
