import { timingSafeEqual } from "node:crypto";
import { isAdmin, unauthorized } from "@/admin/session";
import { ehr } from "@/ehr";
import { env } from "@/env";
import { drainOutbox } from "@/outbox/drain";
import { store } from "@/store";

function cronAuthorized(request: Request): boolean {
  try {
    const expected = Buffer.from(`Bearer ${env.cronSecret}`);
    const received = Buffer.from(request.headers.get("authorization") ?? "");
    return received.length === expected.length && timingSafeEqual(received, expected);
  } catch {
    return false; // CRON_SECRET unset: fail closed
  }
}

async function run() {
  const result = await drainOutbox({ store, ehr });
  return Response.json(result, { status: result.ehrDown ? 503 : 200 });
}

// Vercel Cron calls GET with `Authorization: Bearer $CRON_SECRET` (see vercel.json).
export async function GET(request: Request) {
  if (!cronAuthorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  return run();
}

// Manual drain from the page: admin cookie required.
export async function POST(request: Request) {
  if (!(await isAdmin()) && !cronAuthorized(request)) return unauthorized();
  return run();
}
