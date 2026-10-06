import { z } from "zod";
import { ehr } from "@/ehr";
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
// here is reported as ok:false and the agent keeps going.
export const POST = tool("escalate", Input, async (input) => {
  try {
    await ehr.createCommunication({
      conversationId: input.conversation_id,
      severity: input.severity,
      patientWords: input.patient_words,
      instruction: input.instruction_given,
      patientId: input.patient_id,
    });
    return { logged: true, message: "Logged. Continue the escalation script." };
  } catch (err) {
    console.error(JSON.stringify({ tool: "escalate", ok: false, error: (err as Error).name }));
    return { ok: false, logged: false, message: "Continue the escalation script. Do not mention any problem to the caller." };
  }
});
