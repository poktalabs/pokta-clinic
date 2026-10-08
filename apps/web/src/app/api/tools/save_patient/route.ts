import { z } from "zod";
import { after } from "next/server";
import { ehr } from "@/ehr";
import { callerEmail, resolveCallerEmail } from "@/tools/caller-email";
import { CALM, NO_CONSENT, cacheConsent, conversationId, grantedConsent, tool } from "@/tools/handler";
import { INVALID_PHONE, normalizePhone } from "@/tools/phone";

// NOM-024 Table 1 fields the call can collect. CURP is not asked: the patient brings it to the visit.
const Input = z.object({
  conversation_id: conversationId,
  nombre: z.string().trim().min(1).max(100),
  primer_apellido: z.string().trim().min(1).max(100),
  segundo_apellido: z.string().trim().max(100).optional(),
  telefono: z.string().min(1).max(30),
  fecha_nacimiento: z.iso.date().optional(),
  sexo: z.enum(["H", "M"]).optional(),
  caller_email: callerEmail,
});

export const POST = tool("save_patient", Input, async (input, ctx) => {
  const consent = await grantedConsent(input.conversation_id);
  if (!consent) return NO_CONSENT;
  const telefono = normalizePhone(input.telefono);
  if (telefono.length !== 10) return INVALID_PHONE;

  const { patient, created } = await ehr.createPatient({
    nombre: input.nombre,
    primerApellido: input.primer_apellido,
    segundoApellido: input.segundo_apellido || undefined,
    telefono,
    fechaNacimiento: input.fecha_nacimiento,
    sexo: input.sexo,
  });
  // Link only a record this call created; an existing record is reached only through the identity check.
  if (created && !consent.patientId) {
    await ehr.linkConsent(consent, input.conversation_id, patient.id);
    await cacheConsent(input.conversation_id, { ...consent, patientId: patient.id });
  }
  ctx.outcome(created ? "patient registered" : "existing patient");
  // The page's email goes on the new record, after the response so the call does not wait for it.
  const email = created ? await resolveCallerEmail(input.conversation_id, input.caller_email) : null;
  if (email) {
    after(() =>
      ehr.updatePatientProfile(patient.id, { email }).catch((err) => console.error(JSON.stringify({ patient_email: "write_failed", error: (err as Error).name }))),
    );
  }

  // A phone that already has a record says nothing about it unless this Conversation verified or registered
  // it: the identity check (find_patient with the date of birth) is the only way into an existing record.
  if (!created && consent.patientId !== patient.id) {
    return {
      already_registered: true,
      message:
        "This phone already has a record, so do not register it again. If you have not checked the caller's date of birth with find_patient yet, do that now; otherwise say that for their security you cannot continue with this record by phone, that they can contact any GMA branch directly, and say goodbye.",
    };
  }
  return {
    patient_id: patient.id,
    folio: patient.folio,
    given_name: patient.givenName,
    already_registered: !created,
    message: created
      ? `Patient registered. Say in one plain sentence that their record is ready, then follow the instructions of your current stage.${CALM}`
      : "This phone's record is the one already identified in this conversation. Continue with your current stage.",
  };
});
