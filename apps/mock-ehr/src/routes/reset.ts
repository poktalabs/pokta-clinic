import { Hono } from "hono";
import { sql } from "drizzle-orm";
import { operationOutcome } from "@pokta-clinic/fhir";
import { consoleAuth } from "../console-auth.js";
import { db } from "../db/client.js";
import { auditEvent } from "../db/schema.js";

// Wipes the fictional, patient-generated demo data; keeps the network, Practitioners and the Questionnaire (the seed).
// Deliberately POST-only, behind the console password, with a typed confirmation, and linked from nowhere in the UI.
const CONFIRM = "borrar datos de demostración";
const KEPT = ["organization", "establishment", "practitioner", "practitioner_role", "questionnaire"];
// Children of patient first (FK order); audit_event last.
const WIPED = ["intake", "consent", "appointment", "communication", "callback_task", "patient", "audit_event"];

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
async function counts(tx: Tx) {
  const out: Record<string, number> = {};
  for (const t of [...KEPT, ...WIPED]) {
    const [row] = await tx.execute<{ n: number }>(sql`select count(*)::int as n from ${sql.identifier(t)}`);
    out[t] = row.n;
  }
  return out;
}

export const resetRoutes = new Hono();

resetRoutes.post("/", consoleAuth, async (c) => {
  const body = await c.req.json().catch(() => null);
  if (body?.confirm !== CONFIRM) return c.json(operationOutcome("invalid", `Body must be {"confirm": "${CONFIRM}"}`), 400);

  const result = await db.transaction(async (tx) => {
    const before = await counts(tx);
    for (const t of WIPED.slice(0, -1)) await tx.execute(sql`delete from ${sql.identifier(t)}`);
    // audit_event is append-only through a BEFORE UPDATE OR DELETE row trigger; TRUNCATE fires no row triggers,
    // so the trigger stays in place. The seed writes no audit rows, so nothing is lost but the demo trail.
    await tx.execute(sql`truncate audit_event`);
    // The new trail starts by recording the reset itself.
    await tx.insert(auditEvent).values({ actor: "console", action: "reset", resourceType: "DemoData", resourceId: null, detail: { before } });
    return { before, after: await counts(tx) };
  });
  return c.json(result);
});
