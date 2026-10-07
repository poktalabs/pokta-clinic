import { z } from "zod";
import { ehr, type CallbackRecord, type UpcomingAppointment } from "@/ehr";
import { describeStart } from "@/scheduling/slots";
import { branchDetails } from "@/tools/branch-details";
import { NO_CONSENT, conversationId, grantedConsent, tool } from "@/tools/handler";
import { INVALID_PHONE, normalizePhone } from "@/tools/phone";

const Input = z.object({
  conversation_id: conversationId,
  phone: z.string().min(1).max(30),
});

// Context about a returning Patient is optional: a failed lookup never blocks identification.
const orNull = <T>(p: Promise<T>) => p.catch(() => null);

// Returns the given name only: a phone number alone does not prove identity, so the agent confirms
// the name with the caller before it uses the record. For a returning Patient it adds what the agent
// needs to pick up where they left off: an upcoming first consultation, a pending callback, a saved history.
export const POST = tool("find_patient", Input, async ({ conversation_id, phone }, ctx) => {
  if (!(await grantedConsent(conversation_id))) return NO_CONSENT;
  const normalized = normalizePhone(phone);
  if (normalized.length !== 10) return INVALID_PHONE;
  const [match] = await ehr.findPatientsByPhone(normalized);
  if (!match) {
    ctx.outcome("new patient");
    return { found: false, message: "No record for this phone. Treat the caller as a new patient and collect the registration data." };
  }

  const [appointments, callbacks, historyDone] = await Promise.all([
    orNull<UpcomingAppointment[]>(ehr.upcomingAppointments(match.id, new Date())),
    orNull<CallbackRecord[]>(ehr.pendingCallbacks(match.id)),
    orNull<boolean>(ehr.hasCompletedHistory(match.id)),
  ]);
  const next = appointments?.[0];
  const callback = callbacks?.[0];
  const branch = next?.branch ? await branchDetails(next.branch) : null;
  const upcoming = next ? { appointment_id: next.id, branch: next.branch, branch_name: branch?.name ?? null, label: describeStart(next.start).label } : null;

  let then: string;
  if (upcoming) {
    then = `tell them they already have their first consultation on ${upcoming.label}${upcoming.branch_name ? ` at ${upcoming.branch_name}` : ""}, and ask whether they want to keep it or change it.`;
  } else if (callback) {
    then = `tell them the clinic already has their request to be called back (${callback.availability}), and ask whether they would rather schedule now.`;
  } else if (historyDone) {
    then = "tell them their pre-consultation questions are already saved, so you will go straight to choosing a day and time.";
  } else {
    then = "continue with your current stage.";
  }
  ctx.outcome(upcoming ? "patient found, has appointment" : callback ? "patient found, callback pending" : "patient found");
  return {
    found: true,
    patient_id: match.id,
    given_name: match.givenName,
    upcoming_appointment: upcoming,
    pending_callback: callback ? { availability: callback.availability } : null,
    history_completed: historyDone === true,
    message: `A record exists. Ask the caller to confirm they are ${match.givenName} before you continue. Once they confirm, ${then}`,
  };
});
