import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { QuestionnaireItem, bundle, operationOutcome, questionnaireResource } from "@pokta-clinic/fhir";
import { z } from "zod";
import type { AuthVars } from "../auth.js";
import { audit } from "../audit.js";
import { db } from "../db/client.js";
import { questionnaire } from "../db/schema.js";
import { isUuid } from "../fhir/refs.js";

export const toFhir = (row: typeof questionnaire.$inferSelect) =>
  questionnaireResource({
    id: row.id,
    url: row.url,
    version: row.version,
    title: row.title,
    status: row.status as "draft" | "active" | "retired",
    items: z.array(QuestionnaireItem).parse(row.items),
  });

export const questionnaireRoutes = new Hono<AuthVars>();

// Read-only and seeded on boot. Clients find it by canonical url (`?url=urn:pokta-clinic:questionnaire:rheum-first-visit`).
questionnaireRoutes.get("/", async (c) => {
  const url = c.req.query("url");
  if (!url) return c.json(operationOutcome("required", "Search needs url"), 400);
  const rows = await db.select().from(questionnaire).where(eq(questionnaire.url, url));
  await audit(c.get("clientId"), "search", "Questionnaire", null, { hits: rows.length });
  return c.json(bundle(rows.map(toFhir)));
});

questionnaireRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const [row] = isUuid(id) ? await db.select().from(questionnaire).where(eq(questionnaire.id, id)) : [];
  if (!row) return c.json(operationOutcome("not-found", "Questionnaire not found"), 404);
  await audit(c.get("clientId"), "read", "Questionnaire", row.id);
  return c.json(toFhir(row));
});
