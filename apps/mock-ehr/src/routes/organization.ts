import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { bundle, operationOutcome, organizationResource } from "@pokta-clinic/fhir";
import type { AuthVars } from "../auth.js";
import { audit } from "../audit.js";
import { db } from "../db/client.js";
import { organization } from "../db/schema.js";
import { isUuid } from "../fhir/refs.js";

export const toFhir = (row: typeof organization.$inferSelect) => organizationResource(row);

export const organizationRoutes = new Hono<AuthVars>();

// Read-only: the clinic network. A client lists it once and caches the reference.
organizationRoutes.get("/", async (c) => {
  const rows = await db.select().from(organization).orderBy(organization.createdAt);
  await audit(c.get("clientId"), "search", "Organization", null, { hits: rows.length });
  return c.json(bundle(rows.map(toFhir)));
});

organizationRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const [row] = isUuid(id) ? await db.select().from(organization).where(eq(organization.id, id)) : [];
  if (!row) return c.json(operationOutcome("not-found", "Organization not found"), 404);
  await audit(c.get("clientId"), "read", "Organization", row.id);
  return c.json(toFhir(row));
});
