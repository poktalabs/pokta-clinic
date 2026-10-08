import { createHash, timingSafeEqual } from "node:crypto";
import type { MiddlewareHandler } from "hono";
import { env } from "./env.js";
import { UnauthorizedPage } from "./pages/client/ui.js";

// Hash first so the comparison is constant-time and does not leak the password length.
const digest = (value: string) => createHash("sha256").update(value).digest();
const safeEqual = (a: string, b: string) => timingSafeEqual(digest(a), digest(b));

// Guards every page that shows patient data (the developer /console and the client console).
// Disabled (404) unless EHR_CONSOLE_PASSWORD is set; then HTTP Basic with user `admin`.
export const consoleAuth: MiddlewareHandler = async (c, next) => {
  if (!env.consolePassword) return c.notFound();
  const header = c.req.header("Authorization");
  if (header?.startsWith("Basic ")) {
    const decoded = Buffer.from(header.slice(6), "base64").toString();
    const at = decoded.indexOf(":");
    const userOk = safeEqual(decoded.slice(0, at), "admin");
    const passOk = safeEqual(decoded.slice(at + 1), env.consolePassword);
    if (at >= 0 && userOk && passOk) return next();
  }
  return c.html(`<!DOCTYPE html>${UnauthorizedPage()}`, 401, { "WWW-Authenticate": 'Basic realm="Expediente Demo console", charset="UTF-8"' });
};
