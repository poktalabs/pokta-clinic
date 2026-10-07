import { z } from "zod";
import { store } from "@/store";

const Input = z.object({
  conversation_id: z.string().regex(/^conv_[a-z0-9]{10,60}$/),
  email: z.email().max(254),
});

// The explainer page registers the email the caller typed as soon as the call connects. Tools find it
// by conversation id, so the agent never carries it. The first email for a conversation wins.
export async function POST(request: Request) {
  const parsed = Input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid" }, { status: 400 });
  const { conversation_id, email } = parsed.data;
  if (await store.getLead(conversation_id)) return Response.json({ ok: true });
  await store.putLead({ email: email.trim().toLowerCase(), conversationId: conversation_id, at: Date.now() });
  return Response.json({ ok: true });
}
