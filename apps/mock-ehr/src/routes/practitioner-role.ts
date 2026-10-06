import { Hono } from "hono";
import { and, eq, type SQL } from "drizzle-orm";
import { bundle, operationOutcome, practitionerRoleResource } from "@pokta-clinic/fhir";
import type { AuthVars } from "../auth.js";
import { audit } from "../audit.js";
import { db } from "../db/client.js";
import { establishment, practitioner, practitionerRole } from "../db/schema.js";
import { idFromReference, isUuid } from "../fhir/refs.js";

const NO_MATCH = "00000000-0000-0000-0000-000000000000";

const select = () =>
  db
    .select({ r: practitionerRole, especialidad: practitioner.especialidad, organizationId: establishment.organizationId })
    .from(practitionerRole)
    .innerJoin(practitioner, eq(practitionerRole.practitionerId, practitioner.id))
    .innerJoin(establishment, eq(practitionerRole.establishmentId, establishment.id));

type Found = Awaited<ReturnType<typeof select>>[number];

export const toFhir = ({ r, especialidad, organizationId }: Found) =>
  practitionerRoleResource({
    id: r.id,
    practitionerId: r.practitionerId,
    locationId: r.establishmentId,
    organizationId: organizationId!,
    especialidad,
  });

export const practitionerRoleRoutes = new Hono<AuthVars>();

// Read-only. `?location=Location/<id>` and/or `?practitioner=Practitioner/<id>`; no parameter lists every role.
practitionerRoleRoutes.get("/", async (c) => {
  const location = c.req.query("location");
  const practitionerParam = c.req.query("practitioner");
  const conditions: SQL[] = [];
  if (location) {
    const id = idFromReference(location, "Location");
    conditions.push(eq(practitionerRole.establishmentId, id && isUuid(id) ? id : NO_MATCH));
  }
  if (practitionerParam) {
    const id = idFromReference(practitionerParam, "Practitioner");
    conditions.push(eq(practitionerRole.practitionerId, id && isUuid(id) ? id : NO_MATCH));
  }
  const rows = await select().where(and(...conditions)).orderBy(practitionerRole.createdAt);
  await audit(c.get("clientId"), "search", "PractitionerRole", null, { hits: rows.length });
  return c.json(bundle(rows.map(toFhir)));
});

practitionerRoleRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const [row] = isUuid(id) ? await select().where(eq(practitionerRole.id, id)) : [];
  if (!row) return c.json(operationOutcome("not-found", "PractitionerRole not found"), 404);
  await audit(c.get("clientId"), "read", "PractitionerRole", row.r.id);
  return c.json(toFhir(row));
});
