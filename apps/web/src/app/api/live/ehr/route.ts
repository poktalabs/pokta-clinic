import { isAdmin } from "@/admin/session";
import { ehrStatus } from "@/ehr-control/status";

// Public: on, off or waking from the EHR's /healthz. Admins also get the flags Render reports.
export async function GET() {
  const admin = await isAdmin();
  const status = await ehrStatus({ withRender: admin });
  return Response.json({ ...status, admin }, { headers: { "Cache-Control": "no-store" } });
}
