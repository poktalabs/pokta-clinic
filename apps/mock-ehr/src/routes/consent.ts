import { Hono } from "hono";
import { desc, eq } from "drizzle-orm";
import { CONVERSATION_SYSTEM, Consent, bundle, consentResource, operationOutcome } from "@pokta-clinic/fhir";
import type { AuthVars } from "../auth.js";
import { audit } from "../audit.js";
import { db } from "../db/client.js";
import { consent, patient } from "../db/schema.js";

type ConsentRow = typeof consent.$inferSelect;

const toFhir = (row: ConsentRow) =>
  consentResource({ id: row.id, conversationId: row.conversationId, granted: row.granted, patientId: row.patientId, dateTime: row.recordedAt.toISOString() });

const patientIdFrom = (reference?: string) => reference?.slice("Patient/".length);

export const consentRoutes = new Hono<AuthVars>();

// Search by Conversation (`?identifier=urn:elevenlabs:conversation|<id>`), newest first.
consentRoutes.get("/", async (c) => {
  const identifier = c.req.query("identifier");
  if (!identifier?.startsWith(`${CONVERSATION_SYSTEM}|`)) {
    return c.json(operationOutcome("required", `Search needs identifier=${CONVERSATION_SYSTEM}|<id>`), 400);
  }
  const conversationId = identifier.slice(CONVERSATION_SYSTEM.length + 1);
  const rows = await db.select().from(consent).where(eq(consent.conversationId, conversationId)).orderBy(desc(consent.recordedAt));
  await audit(c.get("clientId"), "search", "Consent", null, { hits: rows.length });
  return c.json(bundle(rows.map(toFhir)));
});

// A new answer is a new Consent; earlier answers stay as history.
consentRoutes.post("/", async (c) => {
  const parsed = Consent.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(operationOutcome("invalid", parsed.error.message), 400);
  const conversationId = parsed.data.identifier.find((i) => i.system === CONVERSATION_SYSTEM)?.value;
  if (!conversationId) return c.json(operationOutcome("required", `Consent needs an identifier with system ${CONVERSATION_SYSTEM}`), 400);
  const [row] = await db
    .insert(consent)
    .values({ conversationId, granted: parsed.data.provision.type === "permit", patientId: patientIdFrom(parsed.data.patient?.reference) ?? null })
    .returning();
  await audit(c.get("clientId"), "create", "Consent", row.id, { granted: row.granted });
  c.header("Location", `/fhir/Consent/${row.id}`);
  return c.json(toFhir(row), 201);
});

// Update only links the Consent to its Patient once the Patient is identified. The answer itself never changes.
consentRoutes.put("/:id", async (c) => {
  const parsed = Consent.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(operationOutcome("invalid", parsed.error.message), 400);
  const [row] = await db.select().from(consent).where(eq(consent.id, c.req.param("id")));
  if (!row) return c.json(operationOutcome("not-found", "Consent not found"), 404);
  if ((parsed.data.provision.type === "permit") !== row.granted) {
    return c.json(operationOutcome("business-rule", "A Consent answer cannot change; create a new Consent"), 422);
  }
  const patientId = patientIdFrom(parsed.data.patient?.reference);
  if (!patientId) return c.json(operationOutcome("required", "Update needs patient.reference"), 400);
  const [linked] = await db.select({ id: patient.id }).from(patient).where(eq(patient.id, patientId));
  if (!linked) return c.json(operationOutcome("not-found", "Patient not found"), 404);
  const [updated] = await db.update(consent).set({ patientId }).where(eq(consent.id, row.id)).returning();
  await audit(c.get("clientId"), "update", "Consent", row.id, { patientId });
  return c.json(toFhir(updated));
});
