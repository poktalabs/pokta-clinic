import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { Patient, SYSTEM, bundle, operationOutcome } from "@pokta-clinic/fhir";
import type { AuthVars } from "../auth.js";
import { audit } from "../audit.js";
import { db } from "../db/client.js";
import { establishment, patient } from "../db/schema.js";
import { fromFhir, normalizePhone, toFhir } from "../fhir/patient.js";

export const patientRoutes = new Hono<AuthVars>();

// Search by phone (`?phone=`) or by identifier (`?identifier=urn:mx:renapo:curp|CURP`).
patientRoutes.get("/", async (c) => {
  const phone = c.req.query("phone");
  const identifier = c.req.query("identifier");
  let rows: (typeof patient.$inferSelect)[] = [];
  if (phone) {
    rows = await db.select().from(patient).where(eq(patient.telefono, normalizePhone(phone)));
  } else if (identifier) {
    const [system, value] = identifier.includes("|") ? identifier.split("|") : [SYSTEM.curp, identifier];
    const column = system === SYSTEM.folio ? patient.folio : patient.curp;
    rows = await db.select().from(patient).where(eq(column, value.toUpperCase()));
  } else {
    return c.json(operationOutcome("required", "Search needs phone or identifier"), 400);
  }
  await audit(c.get("clientId"), "search", "Patient", null, { phone: Boolean(phone), identifier: Boolean(identifier), hits: rows.length });
  return c.json(bundle(rows.map(toFhir)));
});

patientRoutes.get("/:id", async (c) => {
  const [row] = await db.select().from(patient).where(eq(patient.id, c.req.param("id")));
  if (!row) return c.json(operationOutcome("not-found", "Patient not found"), 404);
  await audit(c.get("clientId"), "read", "Patient", row.id);
  return c.json(toFhir(row));
});

patientRoutes.post("/", async (c) => {
  const parsed = Patient.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(operationOutcome("invalid", parsed.error.message), 400);
  let input;
  try {
    input = fromFhir(parsed.data);
  } catch (err) {
    return c.json(operationOutcome("invalid", (err as Error).message), 400);
  }
  if (input.telefono.length !== 10) return c.json(operationOutcome("invalid", "Phone must have 10 digits"), 400);

  // Conditional create: a known phone returns the existing Patient instead of a duplicate.
  const [existing] = await db.select().from(patient).where(eq(patient.telefono, input.telefono));
  if (existing) return c.json(toFhir(existing), 200);

  const [org] = await db.select().from(establishment).limit(1);
  if (!org) return c.json(operationOutcome("exception", "No establishment seeded"), 500);
  const folio = `EXP-${Date.now().toString(36).toUpperCase()}`;
  try {
    const [row] = await db.insert(patient).values({ ...input, establishmentId: org.id, folio }).returning();
    await audit(c.get("clientId"), "create", "Patient", row.id);
    c.header("Location", `/fhir/Patient/${row.id}`);
    return c.json(toFhir(row), 201);
  } catch (err) {
    // drizzle wraps the driver error, so the Postgres code sits on `cause`.
    const e = err as { code?: string; cause?: { code?: string } };
    if ((e.code ?? e.cause?.code) === "23505") return c.json(operationOutcome("duplicate", "CURP already registered"), 409);
    throw err;
  }
});
