import { isAdmin, unauthorized } from "@/admin/session";
import { store } from "@/store";

// Admin only: the full post-call record of one Conversation (transcript, analysis, duration, status).
export async function GET(_request: Request, ctx: RouteContext<"/api/live/conversations/[id]">) {
  if (!(await isAdmin())) return unauthorized();
  const { id } = await ctx.params;
  const record = await store.getConversation(id);
  if (!record) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(record);
}
