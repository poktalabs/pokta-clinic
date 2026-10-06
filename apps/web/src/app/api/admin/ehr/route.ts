import { z } from "zod";
import { isAdmin, unauthorized } from "@/admin/session";
import { ehrStatus } from "@/ehr-control/status";
import { RenderApiError, RenderNotConfiguredError, resumeEhr, suspendEhr } from "@/ehr-control/render";
import { store } from "@/store";

const Body = z.object({ action: z.enum(["on", "off"]) });

// Admin only. "on" resumes the database then the service; "off" suspends the service then the database.
// Resuming returns at once (Render answers 202 and the EHR takes a minute or more to boot): the outbox is
// drained later, when /api/live/ehr first sees the EHR healthy, and by the cron.
export async function POST(request: Request) {
  if (!(await isAdmin())) return unauthorized();
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: 'body must be {"action":"on"|"off"}' }, { status: 400 });
  try {
    if (body.data.action === "on") {
      await resumeEhr();
      await store.putEhrIntent({ action: "resume", at: Date.now(), drainPending: true });
    } else {
      await suspendEhr();
      await store.putEhrIntent({ action: "suspend", at: Date.now(), drainPending: false });
    }
  } catch (err) {
    if (err instanceof RenderNotConfiguredError) return Response.json({ error: err.message }, { status: 501 });
    if (err instanceof RenderApiError) return Response.json({ error: `Render refused the request (${err.status})` }, { status: 502 });
    console.error(JSON.stringify({ admin: "ehr_toggle_failed", error: (err as Error).name }));
    return Response.json({ error: "could not reach Render" }, { status: 502 });
  }
  console.info(JSON.stringify({ admin: "ehr_toggle", action: body.data.action }));
  return Response.json({ ok: true, ...(await ehrStatus({ withRender: true })) }, { status: 202 });
}
