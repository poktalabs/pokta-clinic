import { describe, expect, it } from "vitest";
import type { ConsentRecord, PatientMatch } from "@/ehr";
import { createMemoryStore } from "@/store/memory";
import { findPatient, parseBirthDate, type FindPatientDeps } from "./find-patient";

const LUCIA: PatientMatch = { id: "p-1", folio: "EXP-1", givenName: "Lucía", birthDate: "1988-03-14" };
const CONSENT: ConsentRecord = { id: "consent-1", granted: true, patientId: null };

function setup(patient: PatientMatch | null = LUCIA) {
  const store = createMemoryStore();
  const links: string[] = [];
  const deps: FindPatientDeps = {
    store,
    now: new Date("2026-10-08T15:00:00Z"),
    branchName: async () => "GMA Del Valle",
    ehr: {
      findPatientsByPhone: async () => (patient ? [patient] : []),
      upcomingAppointments: async () => [
        { id: "a-1", patientId: "p-1", start: "2026-10-09T22:00:00Z", end: "2026-10-09T23:00:00Z", branch: "del-valle", calendarEventId: null, practitionerId: "pr-1" },
      ],
      pendingCallbacks: async () => [],
      historySummary: async () => ({ completed: true, chiefComplaint: "Me duelen las manos de los dos lados" }),
      linkConsent: async (_c, _conv, patientId) => void links.push(patientId),
    },
  };
  const call = (birthDate?: string, consent = CONSENT) => findPatient(deps, { conversationId: "conv-1", phone: "5512345678", birthDate, consent });
  return { deps, store, links, call };
}

// Fields that would tell an unverified caller something about the record.
const DETAIL_KEYS = ["patient_id", "given_name", "upcoming_appointment", "chief_complaint", "pending_callback", "history_completed"];
const revealsNothing = (result: Record<string, unknown>) => {
  for (const key of DETAIL_KEYS) expect(result).not.toHaveProperty(key);
  expect(String(result.message)).not.toContain("Lucía");
};

describe("find_patient identity check", () => {
  it("an unknown phone goes to registration as before", async () => {
    const { call } = setup(null);
    expect((await call()).result).toMatchObject({ found: false });
  });

  it("a known phone alone reveals nothing and asks for the date of birth", async () => {
    const { result } = await setup().call();
    expect(result).toMatchObject({ found: true, verification_required: true });
    revealsNothing(result);
  });

  it("the right date of birth returns the appointment and the reason, and binds the Consent", async () => {
    const { call, links, store } = setup();
    const { result } = await call("1988-03-14");
    expect(result).toMatchObject({
      verified: true,
      patient_id: "p-1",
      given_name: "Lucía",
      chief_complaint: "Me duelen las manos de los dos lados",
      upcoming_appointment: { appointment_id: "a-1", branch_name: "GMA Del Valle" },
    });
    expect(links).toEqual(["p-1"]);
    expect((await store.getConsent("conv-1"))?.patientId).toBe("p-1");
  });

  it("one wrong date allows one retry; a second locks the record, even to the right date", async () => {
    const { call } = setup();
    const first = (await call("1988-03-15")).result;
    expect(first).toMatchObject({ verified: false, attempts_left: 1 });
    revealsNothing(first);
    const second = (await call("1987-03-14")).result;
    expect(second).toMatchObject({ verified: false, attempts_left: 0 });
    revealsNothing(second);
    const after = (await call("1988-03-14")).result;
    expect(after).toMatchObject({ verified: false, attempts_left: 0 });
    revealsNothing(after);
  });

  it("an unreadable date is not counted as a try", async () => {
    const { call } = setup();
    expect((await call("14 de marzo")).result).toMatchObject({ verified: false });
    expect((await call("1988-02-30")).result).not.toHaveProperty("attempts_left", 0);
    expect((await call("1988-03-14")).result).toMatchObject({ verified: true });
  });

  it("a record without a date of birth cannot be verified by phone", async () => {
    const { call } = setup({ ...LUCIA, birthDate: null });
    const { result } = await call("1988-03-14");
    expect(result).toMatchObject({ verified: false, attempts_left: 0 });
    revealsNothing(result);
  });

  it("a record this Conversation already verified or registered needs no second check", async () => {
    const { result } = await setup().call(undefined, { ...CONSENT, patientId: "p-1" });
    expect(result).toMatchObject({ verified: true, patient_id: "p-1" });
  });

  it("parses only real calendar dates", () => {
    expect(parseBirthDate("1988-03-14")).toBe("1988-03-14");
    expect(parseBirthDate("1988-02-30")).toBeNull();
    expect(parseBirthDate("14/03/1988")).toBeNull();
  });
});
