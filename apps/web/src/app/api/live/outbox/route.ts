import { summarizeOutbox } from "@/outbox/summary";
import { store } from "@/store";

// Public: counts, kinds and ages only, never payloads or Conversation ids.
export async function GET() {
  try {
    return Response.json(summarizeOutbox(await store.outbox()), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error(JSON.stringify({ live: "outbox_failed", error: (err as Error).name }));
    return Response.json({ count: null, items: [], error: "store unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
