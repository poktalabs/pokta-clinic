import { isAdmin, unauthorized } from "@/admin/session";
import { store } from "@/store";

// Admin only: post-call records hold transcripts. Newest first, without the transcript body.
export async function GET() {
  if (!(await isAdmin())) return unauthorized();
  const records = await store.listConversations(50);
  return Response.json({
    conversations: records.map(({ transcript, ...rest }) => ({ ...rest, turns: transcript.length })),
  });
}
