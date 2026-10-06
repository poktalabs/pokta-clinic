import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { env } from "@/env";

// Admin auth: one shared password, exchanged for a signed, expiring, httpOnly cookie. Nothing is stored
// server-side, so a session cannot be revoked before it expires except by changing the signing secret.
export const COOKIE_NAME = "pc_admin";
export const SESSION_SECONDS = 12 * 60 * 60;

// ADMIN_SESSION_SECRET when set; otherwise a key derived from the password, so changing the password
// also invalidates every session.
function key(): Buffer {
  const secret = env.adminSessionSecret;
  if (secret) return Buffer.from(secret);
  return createHmac("sha256", "pokta-clinic-admin-session-v1").update(env.adminPassword).digest();
}

const sign = (payload: string) => createHmac("sha256", key()).update(payload).digest("hex");

export function issueToken(now = Date.now()): string {
  const expires = Math.floor(now / 1000) + SESSION_SECONDS;
  return `${expires}.${sign(`v1.${expires}`)}`;
}

export function tokenValid(token: string | undefined, now = Date.now()): boolean {
  if (!token) return false;
  const [expires, signature, extra] = token.split(".");
  if (!expires || !signature || extra !== undefined || !/^\d+$/.test(expires)) return false;
  if (Number(expires) * 1000 < now) return false;
  return safeEqual(signature, sign(`v1.${expires}`));
}

// Hash first so the compare is constant-time whatever the lengths are.
function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function passwordMatches(candidate: string): boolean {
  return safeEqual(candidate, env.adminPassword);
}

export function adminConfigured(): boolean {
  return !!process.env.ADMIN_PASSWORD;
}

// Fails closed: with ADMIN_PASSWORD unset nobody is an admin.
export async function isAdmin(): Promise<boolean> {
  if (!adminConfigured()) return false;
  try {
    return tokenValid((await cookies()).get(COOKIE_NAME)?.value);
  } catch {
    return false;
  }
}

export const unauthorized = () => Response.json({ error: "admin only" }, { status: 401 });

// Secure cookies are skipped only for local http development.
export const cookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production" || !!process.env.VERCEL,
  sameSite: "strict" as const,
  path: "/",
  maxAge: SESSION_SECONDS,
});
