import type { BranchCode } from "@pokta-clinic/fhir";
import type { CallbackRecord, ConsentRecord, EhrAdapter, HistorySummary, PatientMatch, UpcomingAppointment } from "@/ehr";
import { describeStart } from "@/scheduling/slots";
import type { Store } from "@/store";
import type { ToolResult } from "@/tools/handler";

// A phone number alone does not prove who is calling. find_patient says nothing about a record (not even
// the name) until the caller's date of birth matches Patient.birthDate. Two tries per Conversation; after
// the second miss the record stays closed for the rest of the call, even to a right date.
export const BIRTH_DATE_TRIES = 2;

export type FindPatientDeps = {
  ehr: Pick<EhrAdapter, "findPatientsByPhone" | "upcomingAppointments" | "pendingCallbacks" | "historySummary" | "linkConsent">;
  store: Pick<Store, "getConsent" | "putConsent">;
  branchName: (code: BranchCode) => Promise<string | null>;
  now: Date;
};

export type FindPatientInput = { conversationId: string; phone: string; birthDate?: string; consent: ConsentRecord };

export type FindPatientOutcome = { result: ToolResult; outcome: string };

const NO_RECORD: ToolResult = {
  found: false,
  message: "No record for this phone. Treat the caller as a new patient and collect the registration data.",
};

const ASK_BIRTH_DATE: ToolResult = {
  found: true,
  verification_required: true,
  message:
    "A record exists for this phone. Do not say any name or detail of it yet. Ask the caller for their date of birth (day, month and year), then call find_patient again with the same phone and birth_date.",
};

const RETRY: ToolResult = {
  found: true,
  verified: false,
  attempts_left: 1,
  message:
    "The date of birth does not match. Do not say anything about the record. Ask the caller to say their date of birth once more (day, month and year), then call find_patient again with the same phone and the new birth_date.",
};

const NOT_VERIFIED: ToolResult = {
  found: true,
  verified: false,
  attempts_left: 0,
  message:
    "Identity not verified. Do not reveal anything about the record and do not register the caller as a new patient. Say that for their security you cannot continue with this record by phone, that they can contact any GMA branch directly, and say goodbye.",
};

const BAD_DATE: ToolResult = {
  found: true,
  verified: false,
  message: "birth_date must be a full date as YYYY-MM-DD. Ask the caller for the day, month and year of birth and call find_patient again.",
};

// YYYY-MM-DD that is a real calendar date, or null.
export function parseBirthDate(said: string): string | null {
  const m = said.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d ? m[0] : null;
}

// Failed tries live on the Conversation's cached Consent decision (same TTL). A store failure is logged and
// the try is not carried over; the prompt still allows one retry only.
async function failedTries(store: FindPatientDeps["store"], conversationId: string): Promise<number> {
  const decision = await store.getConsent(conversationId).catch(() => null);
  return decision?.verifyFailures ?? 0;
}

async function setFailedTries(deps: FindPatientDeps, input: FindPatientInput, next: (failed: number) => number): Promise<number> {
  try {
    const cached = await deps.store.getConsent(input.conversationId);
    const failures = next(cached?.verifyFailures ?? 0);
    await deps.store.putConsent(input.conversationId, {
      granted: true,
      consentId: cached?.consentId ?? (input.consent.id || null),
      patientId: cached?.patientId ?? input.consent.patientId,
      at: cached?.at ?? deps.now.getTime(),
      verifyFailures: failures,
    });
    return failures;
  } catch (err) {
    console.error(JSON.stringify({ identity_tries: "write_failed", error: (err as Error).name }));
    return next(0);
  }
}

// Binds the Consent to the verified Patient, so later tools refuse any other patient_id. Best effort.
async function bindConsent(deps: FindPatientDeps, input: FindPatientInput, patientId: string): Promise<void> {
  if (input.consent.patientId) return;
  try {
    if (input.consent.id) await deps.ehr.linkConsent(input.consent, input.conversationId, patientId);
    const cached = await deps.store.getConsent(input.conversationId);
    await deps.store.putConsent(input.conversationId, {
      granted: true,
      consentId: cached?.consentId ?? (input.consent.id || null),
      patientId,
      at: cached?.at ?? deps.now.getTime(),
    });
  } catch (err) {
    console.error(JSON.stringify({ identity_link: "failed", error: (err as Error).name }));
  }
}

// Context about a returning Patient is optional: a failed lookup never blocks identification.
const orNull = <T>(p: Promise<T>) => p.catch(() => null);

async function verifiedResult(deps: FindPatientDeps, match: PatientMatch): Promise<FindPatientOutcome> {
  const [appointments, callbacks, history] = await Promise.all([
    orNull<UpcomingAppointment[]>(deps.ehr.upcomingAppointments(match.id, deps.now)),
    orNull<CallbackRecord[]>(deps.ehr.pendingCallbacks(match.id)),
    orNull<HistorySummary>(deps.ehr.historySummary(match.id)),
  ]);
  const next = appointments?.[0];
  const callback = callbacks?.[0];
  const branchName = next?.branch ? await deps.branchName(next.branch) : null;
  const upcoming = next ? { appointment_id: next.id, branch: next.branch, branch_name: branchName, label: describeStart(next.start).label } : null;
  const complaint = history?.chiefComplaint ?? null;

  let then: string;
  if (upcoming) {
    const reason = complaint ? ", and the reason for it (chief_complaint) in a few of their own words, with no medical interpretation" : "";
    then = `tell them in one or two short sentences that they have their first consultation on ${upcoming.label}${upcoming.branch_name ? ` at ${upcoming.branch_name}` : ""}${reason}, and ask whether they want to keep it or change it.`;
  } else if (callback) {
    then = `tell them the clinic already has their request to be called back (${callback.availability}), and ask whether they would rather schedule now.`;
  } else if (history?.completed) {
    then = "tell them their pre-consultation questions are already saved, so you will go straight to choosing a day and time.";
  } else {
    then = "continue with your current stage.";
  }
  return {
    outcome: upcoming ? "patient verified, has appointment" : callback ? "patient verified, callback pending" : "patient verified",
    result: {
      found: true,
      verified: true,
      patient_id: match.id,
      given_name: match.givenName,
      upcoming_appointment: upcoming,
      chief_complaint: complaint,
      pending_callback: callback ? { availability: callback.availability } : null,
      history_completed: history?.completed === true,
      message: `Identity verified: this is ${match.givenName}. Thank them by name and ${then}`,
    },
  };
}

// find_patient for a normalized 10-digit phone, after the consent gate.
export async function findPatient(deps: FindPatientDeps, input: FindPatientInput): Promise<FindPatientOutcome> {
  const [match] = await deps.ehr.findPatientsByPhone(input.phone);
  if (!match) return { result: NO_RECORD, outcome: "new patient" };

  // A record this Conversation already verified or registered needs no second check.
  if (input.consent.patientId === match.id) return verifiedResult(deps, match);
  if ((await failedTries(deps.store, input.conversationId)) >= BIRTH_DATE_TRIES) return { result: NOT_VERIFIED, outcome: "identity not verified" };

  const said = input.birthDate?.trim();
  if (!said) return { result: ASK_BIRTH_DATE, outcome: "patient found, verifying" };
  const birthDate = parseBirthDate(said);
  if (!birthDate) return { result: BAD_DATE, outcome: "birth date unreadable" };

  // A record without a date of birth cannot be verified by phone.
  if (!match.birthDate) {
    await setFailedTries(deps, input, () => BIRTH_DATE_TRIES);
    return { result: NOT_VERIFIED, outcome: "identity not verified" };
  }
  if (match.birthDate !== birthDate) {
    const failures = await setFailedTries(deps, input, (n) => n + 1);
    return failures >= BIRTH_DATE_TRIES ? { result: NOT_VERIFIED, outcome: "identity not verified" } : { result: RETRY, outcome: "birth date mismatch" };
  }

  await bindConsent(deps, input, match.id);
  return verifiedResult(deps, match);
}
