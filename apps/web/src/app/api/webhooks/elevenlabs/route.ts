import { env } from "@/env";
import { store } from "@/store";
import { SIGNATURE_HEADER, parseWebhook, verifySignature } from "@/webhooks/elevenlabs";

// ElevenLabs post-call webhook. The signature is checked on the raw body before anything is parsed.
// 401 on a bad signature; 200 for anything verified (ElevenLabs retries and eventually disables a
// webhook that keeps answering non-2xx, so unknown event types are acknowledged, not rejected).
export async function POST(request: Request) {
  const raw = await request.text();
  let secret: string;
  try {
    secret = env.webhookSecret;
  } catch {
    return Response.json({ error: "webhook is not configured" }, { status: 503 });
  }
  if (!verifySignature(raw, request.headers.get(SIGNATURE_HEADER), secret)) {
    return Response.json({ error: "invalid signature" }, { status: 401 });
  }
  let body: unknown = null;
  try {
    body = JSON.parse(raw);
  } catch {
    // Signed but not JSON: acknowledged and ignored below.
  }
  const parsed = parseWebhook(body);
  if (!parsed) return Response.json({ ok: true, ignored: "unrecognized payload" });
  if (parsed.record) await store.putConversation(parsed.record);
  console.info(JSON.stringify({ webhook: "elevenlabs", type: parsed.type, stored: !!parsed.record }));
  return Response.json({ ok: true, stored: !!parsed.record });
}
