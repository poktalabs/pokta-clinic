import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { bundle, operationOutcome, practitionerResource } from "@pokta-clinic/fhir";
import type { AuthVars } from "../auth.js";
import { audit } from "../audit.js";
import { db } from "../db/client.js";
import { practitioner } from "../db/schema.js";
import { isUuid } from "../fhir/refs.js";

export const toFhir = (row: typeof practitioner.$inferSelect) => practitionerResource(row);

export const practitionerRoutes = new Hono<AuthVars>();

// Read-only: a client lists the Practitioner once and caches the reference.
practitionerRoutes.get("/", async (c) => {
  const rows = await db.select().from(practitioner).orderBy(practitioner.createdAt);
  await audit(c.get("clientId"), "search", "Practitioner", null, { hits: rows.length });
  return c.json(bundle(rows.map(toFhir)));
});

practitionerRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const [row] = isUuid(id) ? await db.select().from(practitioner).where(eq(practitioner.id, id)) : [];
  if (!row) return c.json(operationOutcome("not-found", "Practitioner not found"), 404);
  await audit(c.get("clientId"), "read", "Practitioner", row.id);
  return c.json(toFhir(row));
});
