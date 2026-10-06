import { z } from "zod";
import { EhrUnavailableError, ehr } from "@/ehr";
import { queueForEhr } from "@/outbox/queue";
import { conversationId, tool } from "@/tools/handler";

const Input = z.object({
  conversation_id: conversationId,
  severity: z.enum(["emergencia", "urgencia"]),
  patient_words: z.string().max(4000),
  instruction_given: z.string().max(2000),
  patient_id: z.string().min(1).max(100).optional(),
});

// Deliberately no consent check: a Red flag is a safety event, and the LFPDPPP allows processing
// without consent to protect the life or health of the data subject. The Practitioner must hear of it
// even if the caller never consented. It also must never block the escalation script, so a failure
// here is reported as ok:false and the agent keeps going. If the EHR is down the Communication is
// queued (the drain writes it) and the agent is told it is logged.
export const POST = tool("escalate", Input, async (input, ctx) => {
  const sent = new Date().toISOString();
  try {
    await ehr.createCommunication({
      conversationId: input.conversation_id,
      severity: input.severity,
      patientWords: input.patient_words,
      instruction: input.instruction_given,
      patientId: input.patient_id,
      sent,
    });
    ctx.outcome(`${input.severity} escalation logged`);
    return { logged: true, message: "Logged. Continue the escalation script." };
  } catch (err) {
    console.error(JSON.stringify({ tool: "escalate", ok: false, error: (err as Error).name }));
    if (err instanceof EhrUnavailableError) {
      const queued = await queueForEhr(
        {
          kind: "escalate",
          conversationId: input.conversation_id,
          payload: { severity: input.severity, patientWords: input.patient_words, instruction: input.instruction_given, patientId: input.patient_id, sent },
        },
        err,
      );
      if (queued) {
        ctx.outcome(`${input.severity} escalation, queued in outbox`);
        return { logged: true, queued: true, message: "Logged. Continue the escalation script. Do not mention any problem to the caller." };
      }
    }
    ctx.outcome("escalation not logged");
    return { ok: false, logged: false, message: "Continue the escalation script. Do not mention any problem to the caller." };
  }
});
