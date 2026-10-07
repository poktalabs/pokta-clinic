import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { CALENDAR_EVENT_SYSTEM, CONVERSATION_SYSTEM, TASK_STATUS, Task, bundle, isCallbackTask, operationOutcome, taskResource } from "@pokta-clinic/fhir";
import type { AuthVars } from "../auth.js";
import { audit } from "../audit.js";
import { db } from "../db/client.js";
import { callbackTask, establishment, patient } from "../db/schema.js";
import { idFromReference, isUuid, parseToken } from "../fhir/refs.js";

type Row = typeof callbackTask.$inferSelect;

export const toFhir = (row: Row) =>
  taskResource({
    id: row.id,
    conversationId: row.conversationId,
    patientId: row.patientId,
    locationId: row.establishmentId,
    status: row.status,
    authoredOn: row.authoredAt.toISOString(),
    availability: row.availability,
    reason: row.reason,
    description: row.description,
    calendarEventId: row.calendarEventId,
  });

const NO_MATCH = "00000000-0000-0000-0000-000000000000";

export const taskRoutes = new Hono<AuthVars>();

// Search by Patient (`?patient=Patient/<id>`, optionally `&status=requested`) or by Conversation
// (`?identifier=urn:elevenlabs:conversation|<id>`), newest first. Only callback Tasks exist here.
taskRoutes.get("/", async (c) => {
  const patientParam = c.req.query("patient");
  const token = parseToken(c.req.query("identifier"));
  const status = c.req.query("status");
  const filters = [];
  if (patientParam) {
    const id = idFromReference(patientParam, "Patient");
    filters.push(eq(callbackTask.patientId, id && isUuid(id) ? id : NO_MATCH));
  } else if (token) {
    if (token.system !== CONVERSATION_SYSTEM) return c.json(operationOutcome("invalid", `identifier system must be ${CONVERSATION_SYSTEM}`), 400);
    filters.push(eq(callbackTask.conversationId, token.value));
  } else {
    return c.json(operationOutcome("required", `Search needs patient=Patient/<id> or identifier=${CONVERSATION_SYSTEM}|<id>`), 400);
  }
  if (status) {
    if (!TASK_STATUS.some((s) => s === status)) return c.json(operationOutcome("invalid", `status must be one of ${TASK_STATUS.join(", ")}`), 400);
    filters.push(eq(callbackTask.status, status as (typeof TASK_STATUS)[number]));
  }
  const rows = await db.select().from(callbackTask).where(and(...filters)).orderBy(desc(callbackTask.authoredAt));
  await audit(c.get("clientId"), "search", "Task", null, { hits: rows.length });
  return c.json(bundle(rows.map(toFhir)));
});

taskRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const [row] = isUuid(id) ? await db.select().from(callbackTask).where(eq(callbackTask.id, id)) : [];
  if (!row) return c.json(operationOutcome("not-found", "Task not found"), 404);
  await audit(c.get("clientId"), "read", "Task", row.id);
  return c.json(toFhir(row));
});

// A callback request. Conditional create: a second request for the same Conversation returns the first (200).
taskRoutes.post("/", async (c) => {
  const parsed = Task.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(operationOutcome("invalid", parsed.error.message), 400);
  const { data } = parsed;
  if (!isCallbackTask(data)) return c.json(operationOutcome("not-supported", "Only callback Tasks (urn:pokta-clinic:task|callback) are supported"), 422);
  const conversationId = data.identifier.find((i) => i.system === CONVERSATION_SYSTEM)?.value;
  if (!conversationId) return c.json(operationOutcome("required", `Task needs an identifier with system ${CONVERSATION_SYSTEM}`), 400);

  const [existing] = await db.select().from(callbackTask).where(eq(callbackTask.conversationId, conversationId));
  if (existing) return c.json(toFhir(existing), 200);

  let patientId: string | null = null;
  if (data.for) {
    patientId = idFromReference(data.for.reference, "Patient")!;
    const [found] = isUuid(patientId) ? await db.select({ id: patient.id }).from(patient).where(eq(patient.id, patientId)) : [];
    if (!found) return c.json(operationOutcome("not-found", "Patient not found"), 404);
  }
  let establishmentId: string | null = null;
  if (data.owner) {
    establishmentId = idFromReference(data.owner.reference, "Location")!;
    const [found] = isUuid(establishmentId) ? await db.select({ id: establishment.id }).from(establishment).where(eq(establishment.id, establishmentId)) : [];
    if (!found) return c.json(operationOutcome("not-found", "Location not found"), 404);
  }

  const [row] = await db
    .insert(callbackTask)
    .values({
      patientId,
      establishmentId,
      conversationId,
      status: data.status,
      availability: data.note[0].text,
      reason: data.reasonCode.text,
      description: data.description ?? null,
      calendarEventId: data.identifier.find((i) => i.system === CALENDAR_EVENT_SYSTEM)?.value ?? null,
      ...(data.authoredOn ? { authoredAt: new Date(data.authoredOn) } : {}),
    })
    .onConflictDoNothing({ target: callbackTask.conversationId })
    .returning();
  if (!row) {
    // A concurrent request for the same Conversation won the insert.
    const [raced] = await db.select().from(callbackTask).where(eq(callbackTask.conversationId, conversationId));
    return c.json(toFhir(raced), 200);
  }
  await audit(c.get("clientId"), "create", "Task", row.id, { identified: Boolean(patientId), branch: Boolean(establishmentId) });
  c.header("Location", `/fhir/Task/${row.id}`);
  return c.json(toFhir(row), 201);
});

// Changes the status (the front desk completes or cancels the callback). Other fields are kept as they are.
taskRoutes.put("/:id", async (c) => {
  const id = c.req.param("id");
  const parsed = Task.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(operationOutcome("invalid", parsed.error.message), 400);
  if (parsed.data.id && parsed.data.id !== id) return c.json(operationOutcome("invalid", "Task.id does not match the URL"), 400);
  const [row] = isUuid(id) ? await db.update(callbackTask).set({ status: parsed.data.status }).where(eq(callbackTask.id, id)).returning() : [];
  if (!row) return c.json(operationOutcome("not-found", "Task not found"), 404);
  await audit(c.get("clientId"), "update", "Task", row.id, { status: row.status });
  return c.json(toFhir(row));
});
