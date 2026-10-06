import { Hono } from "hono";
import { desc, eq } from "drizzle-orm";
import {
  CONVERSATION_SYSTEM,
  QuestionnaireItem,
  QuestionnaireResponse,
  QuestionnaireResponseItem,
  bundle,
  operationOutcome,
  questionnaireResponseResource,
  requiredLinkIds,
} from "@pokta-clinic/fhir";
import { z } from "zod";
import type { AuthVars } from "../auth.js";
import { audit } from "../audit.js";
import { db } from "../db/client.js";
import { intake, patient, questionnaire } from "../db/schema.js";
import { idFromReference, isUuid, parseToken } from "../fhir/refs.js";

type IntakeRow = typeof intake.$inferSelect;

const VALIDATION = { pending_validation: "pending", validated: "validated", rejected: "rejected" } as const;
const AGENT = "pokta-clinic voice agent";

export const toFhir = (row: IntakeRow, questionnaireUrl: string) =>
  questionnaireResponseResource({
    id: row.id,
    questionnaire: questionnaireUrl,
    status: row.completion === "completed" ? "completed" : "in-progress",
    patientId: row.patientId,
    conversationId: row.conversationId,
    authored: row.createdAt.toISOString(),
    items: z.array(QuestionnaireResponseItem).parse(row.items),
    validationStatus: VALIDATION[row.status],
  });

async function urlOf(row: IntakeRow): Promise<string> {
  const [q] = await db.select({ url: questionnaire.url }).from(questionnaire).where(eq(questionnaire.id, row.questionnaireId));
  return q.url;
}

// A blank string is not an answer; "no sabe" is.
const answered = (item: QuestionnaireResponseItem) => item.answer.some((a) => !("valueString" in a) || a.valueString.trim() !== "");

function missingRequired(definition: unknown, items: QuestionnaireResponseItem[]): string[] {
  const have = new Set(items.filter(answered).map((i) => i.linkId));
  return requiredLinkIds(z.array(QuestionnaireItem).parse(definition)).filter((id) => !have.has(id));
}

export const questionnaireResponseRoutes = new Hono<AuthVars>();

// Search by Conversation (`?identifier=urn:elevenlabs:conversation|<id>`) or Patient (`?subject=Patient/<id>`).
questionnaireResponseRoutes.get("/", async (c) => {
  const token = parseToken(c.req.query("identifier"));
  const subject = c.req.query("subject");
  let where;
  if (token) {
    if (token.system !== CONVERSATION_SYSTEM) return c.json(operationOutcome("invalid", `identifier system must be ${CONVERSATION_SYSTEM}`), 400);
    where = eq(intake.conversationId, token.value);
  } else if (subject) {
    const patientId = idFromReference(subject, "Patient");
    where = eq(intake.patientId, patientId && isUuid(patientId) ? patientId : "00000000-0000-0000-0000-000000000000");
  } else {
    return c.json(operationOutcome("required", `Search needs identifier=${CONVERSATION_SYSTEM}|<id> or subject=Patient/<id>`), 400);
  }
  const rows = await db.select({ row: intake, url: questionnaire.url }).from(intake).innerJoin(questionnaire, eq(intake.questionnaireId, questionnaire.id)).where(where).orderBy(desc(intake.createdAt));
  await audit(c.get("clientId"), "search", "QuestionnaireResponse", null, { hits: rows.length });
  return c.json(bundle(rows.map((r) => toFhir(r.row, r.url))));
});

questionnaireResponseRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const [row] = isUuid(id) ? await db.select().from(intake).where(eq(intake.id, id)) : [];
  if (!row) return c.json(operationOutcome("not-found", "QuestionnaireResponse not found"), 404);
  await audit(c.get("clientId"), "read", "QuestionnaireResponse", row.id);
  return c.json(toFhir(row, await urlOf(row)));
});

// Shared by POST and PUT: the Patient and the Questionnaire must exist, and a completed response must answer every required item.
async function check(resource: QuestionnaireResponse) {
  const patientId = idFromReference(resource.subject.reference, "Patient")!;
  const [found] = isUuid(patientId) ? await db.select({ id: patient.id }).from(patient).where(eq(patient.id, patientId)) : [];
  if (!found) return { error: operationOutcome("not-found", "Patient not found"), status: 404 as const };
  const [q] = await db.select().from(questionnaire).where(eq(questionnaire.url, resource.questionnaire));
  if (!q) return { error: operationOutcome("not-found", `Questionnaire ${resource.questionnaire} not found`), status: 404 as const };
  if (resource.status === "completed") {
    const missing = missingRequired(q.items, resource.item);
    if (missing.length) return { error: operationOutcome("business-rule", missing.join(",")), status: 422 as const };
  }
  return { patientId, questionnaireId: q.id };
}

const conversationOf = (resource: QuestionnaireResponse) =>
  resource.identifier.system === CONVERSATION_SYSTEM ? resource.identifier.value : undefined;

questionnaireResponseRoutes.post("/", async (c) => {
  const parsed = QuestionnaireResponse.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(operationOutcome("invalid", parsed.error.message), 400);
  const conversationId = conversationOf(parsed.data);
  if (!conversationId) return c.json(operationOutcome("required", `QuestionnaireResponse needs identifier with system ${CONVERSATION_SYSTEM}`), 400);
  const checked = await check(parsed.data);
  if ("error" in checked) return c.json(checked.error, checked.status);
  try {
    const [row] = await db
      .insert(intake)
      .values({
        patientId: checked.patientId,
        questionnaireId: checked.questionnaireId,
        conversationId,
        items: parsed.data.item,
        completion: parsed.data.status === "completed" ? "completed" : "in_progress",
        authorDevice: AGENT,
      })
      .returning();
    await audit(c.get("clientId"), "create", "QuestionnaireResponse", row.id, { status: parsed.data.status, items: parsed.data.item.length });
    c.header("Location", `/fhir/QuestionnaireResponse/${row.id}`);
    return c.json(toFhir(row, parsed.data.questionnaire), 201);
  } catch (err) {
    // drizzle wraps the driver error, so the Postgres code sits on `cause`.
    const e = err as { code?: string; cause?: { code?: string } };
    if ((e.code ?? e.cause?.code) === "23505") {
      return c.json(operationOutcome("conflict", "This Conversation already has a QuestionnaireResponse; use PUT to replace its answers"), 409);
    }
    throw err;
  }
});

// Replaces the answers and status of the same Conversation's response. Subject and identifier never change.
questionnaireResponseRoutes.put("/:id", async (c) => {
  const parsed = QuestionnaireResponse.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(operationOutcome("invalid", parsed.error.message), 400);
  const id = c.req.param("id");
  const [row] = isUuid(id) ? await db.select().from(intake).where(eq(intake.id, id)) : [];
  if (!row) return c.json(operationOutcome("not-found", "QuestionnaireResponse not found"), 404);
  if (row.status !== "pending_validation") {
    return c.json(operationOutcome("business-rule", "A QuestionnaireResponse that has gone through Validation can no longer change"), 422);
  }
  if (idFromReference(parsed.data.subject.reference, "Patient") !== row.patientId || conversationOf(parsed.data) !== row.conversationId) {
    return c.json(operationOutcome("business-rule", "subject and identifier of a QuestionnaireResponse cannot change"), 422);
  }
  const checked = await check(parsed.data);
  if ("error" in checked) return c.json(checked.error, checked.status);
  if (checked.questionnaireId !== row.questionnaireId) {
    return c.json(operationOutcome("business-rule", "questionnaire of a QuestionnaireResponse cannot change"), 422);
  }
  const [updated] = await db
    .update(intake)
    .set({ items: parsed.data.item, completion: parsed.data.status === "completed" ? "completed" : "in_progress", updatedAt: new Date() })
    .where(eq(intake.id, row.id))
    .returning();
  await audit(c.get("clientId"), "update", "QuestionnaireResponse", row.id, { status: parsed.data.status, items: parsed.data.item.length });
  return c.json(toFhir(updated, parsed.data.questionnaire));
});
