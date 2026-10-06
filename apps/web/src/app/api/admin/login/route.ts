import { cookies } from "next/headers";
import { z } from "zod";
import { COOKIE_NAME, adminConfigured, cookieOptions, issueToken, passwordMatches } from "@/admin/session";

const Body = z.object({ password: z.string().min(1).max(200) });

// Slows online guessing a little. There is no per-IP limit: the password must be long and random.
const FAILURE_DELAY_MS = 750;

export async function POST(request: Request) {
  if (!adminConfigured()) return Response.json({ error: "admin login is not configured" }, { status: 503 });
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success || !passwordMatches(body.data.password)) {
    await new Promise((resolve) => setTimeout(resolve, FAILURE_DELAY_MS));
    return Response.json({ error: "wrong password" }, { status: 401 });
  }
  (await cookies()).set(COOKIE_NAME, issueToken(), cookieOptions());
  return Response.json({ ok: true });
}
