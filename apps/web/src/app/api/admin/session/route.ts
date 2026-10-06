import { isAdmin } from "@/admin/session";

export async function GET() {
  return Response.json({ admin: await isAdmin() }, { headers: { "Cache-Control": "no-store" } });
}
