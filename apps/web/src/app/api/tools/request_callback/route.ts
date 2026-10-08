import { z } from "zod";
import { BRANCH_CODES } from "@pokta-clinic/fhir";
import { calendar } from "@/calendar";
import { callbackReceived, frontDeskCallback } from "@/email/templates";
import { env } from "@/env";
import { EhrUnavailableError, ehr, type PatientProfile } from "@/ehr";
import { patientLinkUrl } from "@/patient-link/token";
import type { BranchCode } from "@/scheduling/branches";
import { nextCallbackSlot } from "@/scheduling/callback";
import { branchDetails } from "@/tools/branch-details";
import { callerEmail, resolveCallerEmail } from "@/tools/caller-email";
import { CALM, NO_CONSENT, conversationId, grantedConsent, patientMismatch, tool } from "@/tools/handler";
import { sendLater } from "@/tools/notify";

const REASONS = {
  no_suitable_slot: "No encontró un horario que le acomodara",
  caller_prefers: "Prefiere que la clínica le llame",
  tools_failed: "El sistema de agenda no respondió durante la llamada",
} as const;

const Input = z.object({
  conversation_id: conversationId,
  patient_id: z.string().min(1).max(100).optional(),
  branch: z.enum(BRANCH_CODES).optional(),
  availability: z.string().trim().min(1).max(200),
  reason: z.enum(Object.keys(REASONS) as [keyof typeof REASONS, ...(keyof typeof REASONS)[]]),
  caller_email: callerEmail,
});

// The caller could not or would not book: the request becomes work for the front desk in three places.
// The EHR gets a Task (the system of record), the branch calendar a non-blocking reminder for the next
// business morning, and the front desk an email; the caller gets an email with the patient link.
// Only the EHR write can fail the call; the calendar and emails are best effort.
export const POST = tool("request_callback", Input, async (input, ctx) => {
  const consent = await grantedConsent(input.conversation_id);
  if (!consent) return NO_CONSENT;
  if (input.patient_id) {
    const mismatch = patientMismatch(consent, input.patient_id);
    if (mismatch) return mismatch;
  }
  const branch: BranchCode = input.branch ?? "del-valle";
  const reason = REASONS[input.reason];
  const { name: branchName } = await branchDetails(branch);

  let profile: PatientProfile | null = null;
  if (input.patient_id) profile = await ehr.getPatientProfile(input.patient_id).catch(() => null);
  const fullName = profile ? [profile.givenName, profile.primerApellido].filter(Boolean).join(" ") : null;

  // A reminder in the branch calendar, transparent so it never takes a bookable slot.
  let calendarEventId: string | null = null;
  try {
    const slot = nextCallbackSlot(new Date(), branch);
    const event = await calendar.createEvent({
      branch,
      start: slot.start,
      end: slot.end,
      summary: `Devolver llamada: ${fullName ?? "paciente"}`,
      description: `Horario para llamar: ${input.availability}\nMotivo: ${reason}\nFolio: ${profile?.folio ?? "n/a"}\nPatient ID: ${input.patient_id ?? "n/a"}\nConversation ID: ${input.conversation_id}`,
      transparent: true,
    });
    calendarEventId = event.id;
  } catch (err) {
    console.error(JSON.stringify({ callback_calendar: "failed", error: (err as Error).name }));
  }

  let saved = true;
  try {
    await ehr.createCallback({
      conversationId: input.conversation_id,
      patientId: input.patient_id ?? null,
      branch,
      availability: input.availability,
      reason,
      calendarEventId,
    });
  } catch (err) {
    if (!(err instanceof EhrUnavailableError)) throw err;
    // The calendar reminder and the front-desk email still carry the request.
    saved = false;
  }

  const to = await resolveCallerEmail(input.conversation_id, input.caller_email);
  const emailed = sendLater(
    frontDeskCallback({
      to: env.clinicNotifyEmail,
      name: fullName,
      folio: profile?.folio ?? null,
      phone: profile?.phone ?? null,
      branchName,
      availability: input.availability,
      reason,
      conversationId: input.conversation_id,
    }),
    to ? callbackReceived({ to, name: profile?.givenName ?? null, availability: input.availability, branchName, link: input.patient_id ? patientLinkUrl(input.patient_id) : null }) : null,
  );
  ctx.outcome(`callback requested ${branch}${saved ? "" : ", EHR offline"}`);
  return {
    requested: true,
    branch,
    branch_name: branchName,
    availability: input.availability,
    emailed_caller: Boolean(to),
    emails_sent: emailed,
    message: `Callback requested. Tell the caller the ${branchName} team will call them ${input.availability}${to ? ", and that they will receive an email with the details and a link to complete their data" : "; no email was sent to them, so do not mention any email"}. Then thank them and say goodbye.${CALM}`,
  };
});
