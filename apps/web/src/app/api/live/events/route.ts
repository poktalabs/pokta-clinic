import { store } from "@/store";

const LIMIT = 50;

// Public: the tool timeline holds no patient data. `since` (epoch ms) returns only newer events; the
// page polls with the newest `at` it has. Newest last.
export async function GET(request: Request) {
  const since = Number(new URL(request.url).searchParams.get("since") ?? 0) || 0;
  try {
    const events = (await store.recentEvents(LIMIT)).filter((e) => e.at > since);
    return Response.json({ events }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error(JSON.stringify({ live: "events_failed", error: (err as Error).name }));
    return Response.json({ events: [], error: "store unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
