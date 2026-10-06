import { createHash, timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import { eq } from "drizzle-orm";
import { operationOutcome } from "@pokta-clinic/fhir";
import { audit } from "../audit.js";
import { db } from "../db/client.js";
import { intake, questionnaire } from "../db/schema.js";
import { env } from "../env.js";
import { isUuid } from "../fhir/refs.js";
import { ConsolePage, loadConsole } from "../pages/console.js";
import { toFhir } from "./questionnaire-response.js";

// Hash first so the comparison is constant-time and does not leak the password length.
const digest = (value: string) => createHash("sha256").update(value).digest();
const safeEqual = (a: string, b: string) => timingSafeEqual(digest(a), digest(b));

// Disabled (404) unless EHR_CONSOLE_PASSWORD is set; then HTTP Basic with user `admin`.
const basicAuth: MiddlewareHandler = async (c, next) => {
  if (!env.consolePassword) return c.notFound();
  const header = c.req.header("Authorization");
  if (header?.startsWith("Basic ")) {
    const decoded = Buffer.from(header.slice(6), "base64").toString();
    const at = decoded.indexOf(":");
    const userOk = safeEqual(decoded.slice(0, at), "admin");
    const passOk = safeEqual(decoded.slice(at + 1), env.consolePassword);
    if (at >= 0 && userOk && passOk) return next();
  }
  return c.text("Authentication required", 401, { "WWW-Authenticate": 'Basic realm="Expediente Demo console", charset="UTF-8"' });
};

export const consoleRoutes = new Hono();
consoleRoutes.use("*", basicAuth);

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
