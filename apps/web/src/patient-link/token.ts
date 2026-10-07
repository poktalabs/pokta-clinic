import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/env";

const TTL_DAYS = 14;

// The patient link in emails: `<patientId>.<expiry>.<signature>`, base64url. The key is derived from the
// tool secret, so there is no extra secret to manage; anyone with the link can view and complete that
// Patient's administrative data until it expires, like a booking confirmation link.
const key = () => createHmac("sha256", env.toolSecret).update("patient-link-v1").digest();
const sign = (payload: string) => createHmac("sha256", key()).update(payload).digest("base64url");

export function patientLinkToken(patientId: string, now = new Date()): string {
  const exp = Math.floor(now.getTime() / 1000) + TTL_DAYS * 86400;
  const payload = `${Buffer.from(patientId).toString("base64url")}.${exp}`;
  return `${payload}.${sign(payload)}`;
}

export function verifyPatientLink(token: string, now = new Date()): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [id, exp, sig] = parts;
  const expected = Buffer.from(sign(`${id}.${exp}`));
  const received = Buffer.from(sig);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
  if (!/^\d+$/.test(exp) || Number(exp) * 1000 < now.getTime()) return null;
  const patientId = Buffer.from(id, "base64url").toString();
  return patientId || null;
}

export const patientLinkUrl = (patientId: string) => `${env.publicBaseUrl}/paciente/${patientLinkToken(patientId)}`;
