import { timingSafeEqual } from "node:crypto";
import type { Context, MiddlewareHandler } from "hono";
import { sign, verify } from "hono/jwt";
import { operationOutcome } from "@pokta-clinic/fhir";
import { env } from "./env.js";

// OAuth2 client credentials, the shape of SMART Backend Services without the signed-JWT client
// assertion (a named production gap). Tokens are short-lived HS256 JWTs.
const TOKEN_TTL_SECONDS = 3600;
export const SCOPE = "system/Patient.rw system/Practitioner.r system/Questionnaire.r system/QuestionnaireResponse.rw system/Consent.rw system/Appointment.rw system/Communication.rw";

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function clientFromRequest(c: Context, form: Record<string, string | File>): { id?: string; secret?: string } {
  const basic = c.req.header("Authorization");
  if (basic?.startsWith("Basic ")) {
    const [id, secret] = Buffer.from(basic.slice(6), "base64").toString().split(":");
    return { id, secret };
  }
  return { id: String(form.client_id ?? ""), secret: String(form.client_secret ?? "") };
}

export async function tokenEndpoint(c: Context) {
  const form = await c.req.parseBody();
  if (form.grant_type !== "client_credentials") {
    return c.json({ error: "unsupported_grant_type" }, 400);
  }
  const client = clientFromRequest(c, form);
  if (!client.id || !client.secret || !safeEqual(client.id, env.clientId) || !safeEqual(client.secret, env.clientSecret)) {
    return c.json({ error: "invalid_client" }, 401);
  }
  const now = Math.floor(Date.now() / 1000);
  const accessToken = await sign({ sub: client.id, scope: SCOPE, iat: now, exp: now + TOKEN_TTL_SECONDS }, env.jwtSecret, "HS256");
  return c.json({ access_token: accessToken, token_type: "Bearer", expires_in: TOKEN_TTL_SECONDS, scope: SCOPE });
}

export type AuthVars = { Variables: { clientId: string } };

export const requireToken: MiddlewareHandler<AuthVars> = async (c, next) => {
  const header = c.req.header("Authorization");
  if (!header?.startsWith("Bearer ")) {
    return c.json(operationOutcome("login", "Missing bearer token"), 401);
  }
  try {
    const payload = await verify(header.slice(7), env.jwtSecret, "HS256");
    c.set("clientId", String(payload.sub));
  } catch {
    return c.json(operationOutcome("login", "Invalid or expired token"), 401);
  }
  await next();
};
