import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { env } from "@/env";
import { CalendarUnavailableError } from "@/calendar";
import { EhrRejectedError, EhrUnavailableError, ehr, type ConsentRecord } from "@/ehr";

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

export function tool<S extends z.ZodType>(name: string, schema: S, run: (input: z.infer<S>) => Promise<ToolResult>) {
  return async function POST(request: Request): Promise<Response> {
    if (!secretMatches(request.headers.get(SECRET_HEADER))) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return Response.json({ ok: false, message: `Invalid input: ${z.prettifyError(parsed.error)}` }, { status: 400 });
    }
    const started = Date.now();
    try {
      const result = await run(parsed.data);
      console.info(JSON.stringify({ tool: name, ok: true, ms: Date.now() - started }));
      return Response.json({ ok: true, ...result });
    } catch (err) {
      console.error(JSON.stringify({ tool: name, ok: false, ms: Date.now() - started, error: (err as Error).name }));
      if (err instanceof EhrUnavailableError) {
        return Response.json(
          { ok: false, message: "The clinic record system is not responding. Apologise, say the clinic will call back, and do not retry now." },
          { status: 503 },
        );
      }
      if (err instanceof CalendarUnavailableError) {
        return Response.json(
          { ok: false, message: "The clinic calendar is not responding. Apologise, say the clinic will call back to schedule, and do not retry now." },
          { status: 503 },
        );
      }
      if (err instanceof EhrRejectedError) {
        return Response.json({ ok: false, message: `The clinic record system rejected the data: ${err.message}` }, { status: 422 });
      }
      throw err;
    }
  };
}

// No Patient data moves before the patient says yes (LFPDPPP express consent). Enforced here, not
// only in the prompt, so a model that skips the Consent node still cannot read or write.
export async function grantedConsent(id: string) {
  const consent = await ehr.latestConsent(id);
  return consent?.granted ? consent : null;
}

export const NO_CONSENT: ToolResult = {
  consent_required: true,
  message: "No consent is recorded for this conversation. Ask for consent first and call record_consent.",
};

// patient_id is written by the LLM. Once the Consent is linked to a Patient (a new registration), any
// other id is refused. Gap: for a found existing Patient the Consent stays unlinked, so that id is not
// bound to this Conversation server-side (see apps/web/README.md).
export function patientMismatch(consent: ConsentRecord, patientId: string): ToolResult | null {
  if (!consent.patientId || consent.patientId === patientId) return null;
  return {
    patient_mismatch: true,
    message: "That patient_id does not belong to this conversation. Use the patient_id returned by find_patient or save_patient earlier in this conversation.",
  };
}
