import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { operationOutcome } from "@pokta-clinic/fhir";
import { audit } from "../audit.js";
import { consoleAuth } from "../console-auth.js";
import { db } from "../db/client.js";
import { intake, questionnaire } from "../db/schema.js";
import { isUuid } from "../fhir/refs.js";
import { ConsolePage, loadConsole } from "../pages/console.js";
import { toFhir } from "./questionnaire-response.js";

export const consoleRoutes = new Hono();
consoleRoutes.use("*", consoleAuth);

consoleRoutes.get("/", async (c) => {
  const data = await loadConsole();
  await audit("console", "read", "Console", null);
  return c.html(`<!DOCTYPE html>${(<ConsolePage {...data} />)}`);
});

// Raw JSON of one QuestionnaireResponse for the console (the /fhir route needs a bearer token).
consoleRoutes.get("/questionnaire-response/:id", async (c) => {
  const id = c.req.param("id");
  const [found] = isUuid(id)
    ? await db.select({ r: intake, url: questionnaire.url }).from(intake).innerJoin(questionnaire, eq(intake.questionnaireId, questionnaire.id)).where(eq(intake.id, id))
    : [];
  if (!found) return c.json(operationOutcome("not-found", "QuestionnaireResponse not found"), 404);
  await audit("console", "read", "QuestionnaireResponse", found.r.id);
  return c.json(toFhir(found.r, found.url));
});
