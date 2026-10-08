import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { env } from "@/env";
import { CalendarUnavailableError } from "@/calendar";
import { EhrRejectedError, EhrUnavailableError, ehr, type ConsentRecord } from "@/ehr";
import { store } from "@/store";
import { recordEvent } from "@/timeline/record";

export { patientMismatch } from "@/tools/patient-guard";

// Every ElevenLabs server tool posts JSON here. The agent sends the shared secret from a workspace
// Secret (`secret__tool_secret`) in this header; it never reaches the LLM.
export const SECRET_HEADER = "x-pokta-tool-secret";

// Each tool body carries the Conversation ID from the `system__conversation_id` dynamic variable.
export const conversationId = z.string().min(1).max(200);

function secretMatches(received: string | null): boolean {
  if (!received) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(env.toolSecret);
  return a.length === b.length && timingSafeEqual(a, b);
}

// The body is what the LLM reads: a short result plus a `message` that tells the agent what to do next.
export type ToolResult = Record<string, unknown> & { message: string };

// Lets a tool label what happened for the live timeline ("slot booked 2026-10-13 09:00"). Labels are
// public: never put patient answers, names or phones in one.
export type ToolContext = { outcome(label: string): void };

// Fallback label when a tool did not set one, from the flags the refusals carry.
function inferOutcome(result: ToolResult): string {
  if (result.consent_required) return "consent required";
  if (result.patient_mismatch) return "patient mismatch";
  if (result.invalid_phone) return "invalid phone";
  return "ok";
}

export function tool<S extends z.ZodType<{ conversation_id: string }>>(
  name: string,
  schema: S,
  run: (input: z.infer<S>, ctx: ToolContext) => Promise<ToolResult>,
) {
  return async function POST(request: Request): Promise<Response> {
    if (!secretMatches(request.headers.get(SECRET_HEADER))) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return Response.json({ ok: false, message: `Invalid input: ${z.prettifyError(parsed.error)}` }, { status: 400 });
    }
    const started = Date.now();
    let label: string | null = null;
    const ctx: ToolContext = { outcome: (value) => (label = value) };
    const finish = (response: Response, ok: boolean, outcome: string) => {
      recordEvent({ conversationId: parsed.data.conversation_id, tool: name, ok, status: response.status, ms: Date.now() - started, outcome });
      return response;
    };
    try {
      const result = await run(parsed.data, ctx);
      console.info(JSON.stringify({ tool: name, ok: true, ms: Date.now() - started }));
      // A tool can answer 200 with ok:false (escalate does when the EHR fails); the timeline shows that as an error.
      return finish(Response.json({ ok: true, ...result }), result.ok !== false, label ?? inferOutcome(result));
    } catch (err) {
      console.error(JSON.stringify({ tool: name, ok: false, ms: Date.now() - started, error: (err as Error).name }));
      if (err instanceof EhrUnavailableError) {
        return finish(
          Response.json(
            { ok: false, message: "The clinic record system is not responding. Apologise, say the clinic will call back, and do not retry now." },
            { status: 503 },
          ),
          false,
          "EHR unavailable",
        );
      }
      if (err instanceof CalendarUnavailableError) {
        return finish(
          Response.json(
            { ok: false, message: "The clinic calendar is not responding. Apologise, say the clinic will call back to schedule, and do not retry now." },
            { status: 503 },
          ),
          false,
          "calendar unavailable",
        );
      }
      if (err instanceof EhrRejectedError) {
        return finish(Response.json({ ok: false, message: `The clinic record system rejected the data: ${err.message}` }, { status: 422 }), false, "rejected by EHR");
      }
      recordEvent({ conversationId: parsed.data.conversation_id, tool: name, ok: false, status: 500, ms: Date.now() - started, outcome: "server error" });
      throw err;
    }
  };
}

// No Patient data moves before the patient says yes (LFPDPPP express consent). Enforced here, not
// only in the prompt, so a model that skips the Consent node still cannot read or write.
// The store is asked first, the EHR second: record_consent writes both, so the gate keeps working
// while the EHR is down. The EHR stays the system of record; a store miss falls through to it, and
// a store failure is logged and treated as a miss (never as a grant).
export async function grantedConsent(id: string): Promise<ConsentRecord | null> {
  try {
    const cached = await store.getConsent(id);
    if (cached) return cached.granted ? { id: cached.consentId ?? "", granted: true, patientId: cached.patientId } : null;
  } catch (err) {
    console.error(JSON.stringify({ consent_cache: "read_failed", error: (err as Error).name }));
  }
  const consent = await ehr.latestConsent(id);
  if (!consent) return null;
  await cacheConsent(id, consent);
  return consent.granted ? consent : null;
}

// Best effort: the EHR already has the decision, the store only has to survive an outage of it.
export async function cacheConsent(id: string, consent: ConsentRecord): Promise<void> {
  try {
    await store.putConsent(id, { granted: consent.granted, consentId: consent.id || null, patientId: consent.patientId, at: Date.now() });
  } catch (err) {
    console.error(JSON.stringify({ consent_cache: "write_failed", error: (err as Error).name }));
  }
}

// Appended to the messages of tools that end in good news (a booking, a registration), where models
// tend to celebrate. The agent's tone stays even from start to end.
export const CALM = " Say it in one calm, neutral sentence in Spanish: no exclamation marks, no celebration.";

export const NO_CONSENT: ToolResult = {
  consent_required: true,
  message: "No consent is recorded for this conversation. Ask for consent first and call record_consent.",
};
