import { Hono } from "hono";
import { desc, eq } from "drizzle-orm";
import { CONVERSATION_SYSTEM, Communication, PRIORITY_BY_SEVERITY, RED_FLAG_SEVERITY, RED_FLAG_SEVERITY_EXT, bundle, communicationResource, operationOutcome } from "@pokta-clinic/fhir";
import type { AuthVars } from "../auth.js";
import { audit } from "../audit.js";
import { db } from "../db/client.js";
import { communication, patient, practitioner } from "../db/schema.js";
import { idFromReference, isUuid, parseToken } from "../fhir/refs.js";

export const toFhir = (row: typeof communication.$inferSelect) =>
  communicationResource({
    id: row.id,
    conversationId: row.conversationId,
    severity: row.severity,
    patientId: row.patientId,
    practitionerId: row.practitionerId,
    sent: row.sentAt.toISOString(),
    patientWords: row.patientWords,
    instruction: row.instruction,
  });

export const communicationRoutes = new Hono<AuthVars>();

// Search by Conversation (`?identifier=urn:elevenlabs:conversation|<id>`), newest first.
communicationRoutes.get("/", async (c) => {
  const token = parseToken(c.req.query("identifier"));
  if (token?.system !== CONVERSATION_SYSTEM) return c.json(operationOutcome("required", `Search needs identifier=${CONVERSATION_SYSTEM}|<id>`), 400);
  const rows = await db.select().from(communication).where(eq(communication.conversationId, token.value)).orderBy(desc(communication.sentAt));
  await audit(c.get("clientId"), "search", "Communication", null, { hits: rows.length });
  return c.json(bundle(rows.map(toFhir)));
});

// The Escalation record for a Red flag. The subject is optional: the caller may not be identified yet.
communicationRoutes.post("/", async (c) => {
  const parsed = Communication.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(operationOutcome("invalid", parsed.error.message), 400);
  const { data } = parsed;
  const conversationId = data.identifier.find((i) => i.system === CONVERSATION_SYSTEM)?.value;
  if (!conversationId) return c.json(operationOutcome("required", `Communication needs an identifier with system ${CONVERSATION_SYSTEM}`), 400);

  // Severity comes from the extension; priority must agree with it (Emergencia is stat, Urgencia is urgent).
  const severity = data.extension?.find((e) => e.url === RED_FLAG_SEVERITY_EXT)?.valueString;
  if (!RED_FLAG_SEVERITY.some((s) => s === severity)) return c.json(operationOutcome("required", `Communication needs extension ${RED_FLAG_SEVERITY_EXT} (emergencia or urgencia)`), 400);
  const level = severity as (typeof RED_FLAG_SEVERITY)[number];
  if (PRIORITY_BY_SEVERITY[level] !== data.priority) return c.json(operationOutcome("business-rule", `priority ${data.priority} does not match severity ${level}`), 422);

  // The client may name the Practitioner to notify; otherwise the network's first Practitioner (oldest row) is told.
  const named = data.recipient?.[0] && idFromReference(data.recipient[0].reference, "Practitioner")!;
  const [foundPractitioner] = named
    ? isUuid(named) ? await db.select({ id: practitioner.id }).from(practitioner).where(eq(practitioner.id, named)) : []
    : await db.select({ id: practitioner.id }).from(practitioner).orderBy(practitioner.createdAt).limit(1);
  if (!foundPractitioner) return c.json(operationOutcome("not-found", "Practitioner not found"), 404);
  const practitionerId = foundPractitioner.id;

  let patientId: string | null = null;
  if (data.subject) {
    patientId = idFromReference(data.subject.reference, "Patient")!;
    const [foundPatient] = isUuid(patientId) ? await db.select({ id: patient.id }).from(patient).where(eq(patient.id, patientId)) : [];
    if (!foundPatient) return c.json(operationOutcome("not-found", "Patient not found"), 404);
  }

  const [row] = await db
    .insert(communication)
    .values({
      patientId,
      practitionerId,
      severity: level,
      conversationId,
      patientWords: data.payload[0].contentString,
      instruction: data.payload[1]?.contentString ?? null,
      ...(data.sent ? { sentAt: new Date(data.sent) } : {}),
    })
    .returning();
  await audit(c.get("clientId"), "create", "Communication", row.id, { severity: level, identified: Boolean(patientId) });
  c.header("Location", `/fhir/Communication/${row.id}`);
  return c.json(toFhir(row), 201);
});
