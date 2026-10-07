import { Hono } from "hono";
import { and, asc, desc, eq, gt, gte, lt, sql, type SQL } from "drizzle-orm";
import { APPOINTMENT_STATUS, Appointment, CALENDAR_EVENT_SYSTEM, CONVERSATION_SYSTEM, appointmentResource, bundle, operationOutcome } from "@pokta-clinic/fhir";
import type { AuthVars } from "../auth.js";
import { audit } from "../audit.js";
import { db } from "../db/client.js";
import { appointment, establishment, patient, practitioner, practitionerRole } from "../db/schema.js";
import { idFromReference, isUuid, parseToken } from "../fhir/refs.js";

type Row = typeof appointment.$inferSelect;

export const toFhir = (row: Row) =>
  appointmentResource({
    id: row.id,
    patientId: row.patientId,
    practitionerId: row.practitionerId,
    locationId: row.establishmentId,
    start: row.start.toISOString(),
    end: row.end.toISOString(),
    calendarEventId: row.calendarEventId ?? "",
    conversationId: row.conversationId,
    description: row.description,
    status: row.status,
  });

export const appointmentRoutes = new Hono<AuthVars>();

// Search by Patient (`?patient=Patient/<id>`), Location (`?location=Location/<id>`) or by identifier (`?identifier=urn:google:calendar:event|<id>`).
// Optional filters: `status=booked|cancelled` and `date=ge<ISO instant>` (start at or after). With `date`, results are earliest first.
appointmentRoutes.get("/", async (c) => {
  const patientParam = c.req.query("patient");
  const token = parseToken(c.req.query("identifier"));
  const locationParam = c.req.query("location");
  let where: SQL | undefined;
  if (patientParam) {
    const id = idFromReference(patientParam, "Patient");
    where = eq(appointment.patientId, id && isUuid(id) ? id : "00000000-0000-0000-0000-000000000000");
  } else if (locationParam) {
    const id = idFromReference(locationParam, "Location");
    where = eq(appointment.establishmentId, id && isUuid(id) ? id : "00000000-0000-0000-0000-000000000000");
  } else if (token) {
    if (token.system === CALENDAR_EVENT_SYSTEM) where = eq(appointment.calendarEventId, token.value);
    else if (token.system === CONVERSATION_SYSTEM) where = eq(appointment.conversationId, token.value);
    else return c.json(operationOutcome("invalid", `identifier system must be ${CALENDAR_EVENT_SYSTEM} or ${CONVERSATION_SYSTEM}`), 400);
  } else {
    return c.json(operationOutcome("required", "Search needs patient=Patient/<id>, location=Location/<id> or identifier=<system>|<value>"), 400);
  }
  const filters: SQL[] = [where!];
  const status = c.req.query("status");
  if (status) {
    if (!APPOINTMENT_STATUS.some((s) => s === status)) return c.json(operationOutcome("invalid", `status must be ${APPOINTMENT_STATUS.join(" or ")}`), 400);
    filters.push(eq(appointment.status, status as (typeof APPOINTMENT_STATUS)[number]));
  }
  const date = c.req.query("date");
  if (date) {
    const from = date.startsWith("ge") ? new Date(date.slice(2)) : null;
    if (!from || Number.isNaN(from.getTime())) return c.json(operationOutcome("invalid", "date must be ge<ISO instant>"), 400);
    filters.push(gte(appointment.start, from));
  }
  const rows = await db
    .select()
    .from(appointment)
    .where(and(...filters))
    .orderBy(date ? asc(appointment.start) : desc(appointment.start));
  await audit(c.get("clientId"), "search", "Appointment", null, { hits: rows.length });
  return c.json(bundle(rows.map(toFhir)));
});

appointmentRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const [row] = isUuid(id) ? await db.select().from(appointment).where(eq(appointment.id, id)) : [];
  if (!row) return c.json(operationOutcome("not-found", "Appointment not found"), 404);
  await audit(c.get("clientId"), "read", "Appointment", row.id);
  return c.json(toFhir(row));
});

// Google Calendar owns availability; the EHR only refuses to double-book its Practitioner (across Locations).
appointmentRoutes.post("/", async (c) => {
  const parsed = Appointment.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(operationOutcome("invalid", parsed.error.message), 400);
  const { data } = parsed;
  const start = new Date(data.start);
  const end = new Date(data.end);
  if (end <= start) return c.json(operationOutcome("invalid", "end must be after start"), 400);
  const calendarEventId = data.identifier.find((i) => i.system === CALENDAR_EVENT_SYSTEM)?.value;
  if (!calendarEventId) return c.json(operationOutcome("required", `Appointment needs an identifier with system ${CALENDAR_EVENT_SYSTEM}`), 400);
  const conversationId = data.identifier.find((i) => i.system === CONVERSATION_SYSTEM)?.value ?? null;
  const actorId = (type: string) => data.participant.map((p) => p.actor.reference).find((r) => r.startsWith(`${type}/`))?.slice(type.length + 1);
  const patientId = actorId("Patient");
  const practitionerId = actorId("Practitioner");
  const locationId = actorId("Location");
  if (!patientId || !practitionerId || !locationId) return c.json(operationOutcome("required", "Appointment needs a Patient, a Practitioner and a Location participant"), 400);

  const [foundPatient] = isUuid(patientId) ? await db.select({ id: patient.id }).from(patient).where(eq(patient.id, patientId)) : [];
  if (!foundPatient) return c.json(operationOutcome("not-found", "Patient not found"), 404);
  const [foundPractitioner] = isUuid(practitionerId) ? await db.select({ id: practitioner.id }).from(practitioner).where(eq(practitioner.id, practitionerId)) : [];
  if (!foundPractitioner) return c.json(operationOutcome("not-found", "Practitioner not found"), 404);

  const [foundLocation] = isUuid(locationId) ? await db.select({ id: establishment.id }).from(establishment).where(eq(establishment.id, locationId)) : [];
  if (!foundLocation) return c.json(operationOutcome("not-found", "Location not found"), 404);
  // The Practitioner must work at the Location (a PractitionerRole).
  const [role] = await db
    .select({ id: practitionerRole.id })
    .from(practitionerRole)
    .where(and(eq(practitionerRole.practitionerId, practitionerId), eq(practitionerRole.establishmentId, locationId)));
  if (!role) return c.json(operationOutcome("business-rule", "The Practitioner has no PractitionerRole at that Location"), 422);

  // Lock per Practitioner so two concurrent bookings cannot both pass the overlap check.
  const row = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${practitionerId}))`);
    const [clash] = await tx
      .select({ id: appointment.id })
      .from(appointment)
      .where(and(eq(appointment.practitionerId, practitionerId), eq(appointment.status, "booked"), lt(appointment.start, end), gt(appointment.end, start)))
      .limit(1);
    if (clash) return null;
    const [created] = await tx
      .insert(appointment)
      .values({ patientId, practitionerId, establishmentId: locationId, start, end, calendarEventId, conversationId, description: data.description ?? null })
      .returning();
    return created;
  });
  if (!row) return c.json(operationOutcome("conflict", "The Practitioner already has a booked Appointment in that interval"), 409);
  await audit(c.get("clientId"), "create", "Appointment", row.id, { start: data.start });
  c.header("Location", `/fhir/Appointment/${row.id}`);
  return c.json(toFhir(row), 201);
});

// Only a cancellation is supported: the resource must say status cancelled. The calendar event is the client's to remove.
appointmentRoutes.put("/:id", async (c) => {
  const id = c.req.param("id");
  const parsed = Appointment.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(operationOutcome("invalid", parsed.error.message), 400);
  if (parsed.data.id && parsed.data.id !== id) return c.json(operationOutcome("invalid", "Appointment.id does not match the URL"), 400);
  if (parsed.data.status !== "cancelled") return c.json(operationOutcome("business-rule", "Only a change of status to cancelled is supported"), 422);
  const [existing] = isUuid(id) ? await db.select().from(appointment).where(eq(appointment.id, id)) : [];
  if (!existing) return c.json(operationOutcome("not-found", "Appointment not found"), 404);
  if (existing.status === "cancelled") return c.json(toFhir(existing));
  const [row] = await db.update(appointment).set({ status: "cancelled" }).where(eq(appointment.id, id)).returning();
  await audit(c.get("clientId"), "update", "Appointment", row.id, { status: "cancelled" });
  return c.json(toFhir(row));
});
