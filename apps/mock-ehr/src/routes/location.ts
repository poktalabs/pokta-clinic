import { Hono } from "hono";
import { and, eq, isNotNull } from "drizzle-orm";
import { SYSTEM, bundle, locationResource, operationOutcome } from "@pokta-clinic/fhir";
import type { AuthVars } from "../auth.js";
import { audit } from "../audit.js";
import { db } from "../db/client.js";
import { establishment } from "../db/schema.js";
import { isUuid, parseToken } from "../fhir/refs.js";

type Row = typeof establishment.$inferSelect;

// A branch row is a Location only once the seed has linked it to the network and given it a code.
export const toFhir = (row: Row) =>
  locationResource({
    id: row.id,
    codigo: row.codigo!,
    clues: row.clues,
    nombre: row.nombre,
    domicilio: row.domicilio,
    organizationId: row.organizationId!,
    horarios: row.horarios ?? [],
  });

const isBranch = and(isNotNull(establishment.codigo), isNotNull(establishment.organizationId));

export const locationRoutes = new Hono<AuthVars>();

// Read-only. `?identifier=urn:pokta-clinic:branch|<code>` or `urn:mx:dgis:clues|<CLUES>`; no parameter lists every branch.
locationRoutes.get("/", async (c) => {
  const raw = c.req.query("identifier");
  let where = isBranch;
  if (raw !== undefined) {
    const token = parseToken(raw);
    if (token?.system === SYSTEM.branch) where = and(isBranch, eq(establishment.codigo, token.value));
    else if (token?.system === SYSTEM.clues) where = and(isBranch, eq(establishment.clues, token.value));
    else return c.json(operationOutcome("invalid", `identifier must be ${SYSTEM.branch}|<code> or ${SYSTEM.clues}|<CLUES>`), 400);
  }
  const rows = await db.select().from(establishment).where(where).orderBy(establishment.createdAt);
  await audit(c.get("clientId"), "search", "Location", null, { hits: rows.length });
  return c.json(bundle(rows.map(toFhir)));
});

locationRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const [row] = isUuid(id) ? await db.select().from(establishment).where(and(isBranch, eq(establishment.id, id))) : [];
  if (!row) return c.json(operationOutcome("not-found", "Location not found"), 404);
  await audit(c.get("clientId"), "read", "Location", row.id);
  return c.json(toFhir(row));
});
