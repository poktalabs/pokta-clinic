import type { BranchCode } from "@pokta-clinic/fhir";
import { describe, expect, it } from "vitest";
import { EhrRejectedError, EhrUnavailableError, type AppointmentRecord, type CommunicationRecord, type ConsentRecord, type EhrAdapter, type HistoryRecord } from "@/ehr";
import { createMemoryStore } from "@/store/memory";
import type { NewOutboxItem } from "@/store";
import { drainOutbox } from "./drain";

// An in-memory EHR that records every write, can be switched off, and can reject one kind of write.
function fakeEhr() {
  const calls: string[] = [];
  const state = {
    down: false,
    rejectAppointments: false,
    consents: [] as ConsentRecord[],
    responses: new Map<string, HistoryRecord>(),
    appointments: new Map<string, AppointmentRecord>(),
    communications: [] as (CommunicationRecord & { conversationId: string })[],
  };
  const guard = () => {
    if (state.down) throw new EhrUnavailableError("test");
  };
  const ehr = {
    async latestConsent(c: string) {
      guard();
      return state.consents.at(-1) && c ? state.consents.at(-1)! : null;
    },
    async recordConsent(c: string, granted: boolean) {
      guard();
      calls.push(`consent:${c}`);
      const record = { id: `consent-${state.consents.length}`, granted, patientId: null };
      state.consents.push(record);
      return record;
    },
    async getQuestionnaire() {
      guard();
      return [
        { linkId: "chief-complaint", text: "Motivo", type: "string" as const, required: true },
        { linkId: "allergies", text: "Alergias", type: "string" as const, required: false },
      ];
    },
    async findQuestionnaireResponse(c: string) {
      guard();
      return state.responses.get(c) ?? null;
    },
    async saveQuestionnaireResponse(input: { conversationId: string; patientId: string; status: HistoryRecord["status"]; answers: HistoryRecord["answers"]; existing: HistoryRecord | null }) {
      guard();
      calls.push(`history:${input.conversationId}:${input.status}`);
      const record = { id: input.existing?.id ?? `qr-${state.responses.size}`, patientId: input.patientId, status: input.status, answers: input.answers };
      state.responses.set(input.conversationId, record);
      return record;
    },
    async findAppointmentByConversation(c: string) {
      guard();
      return state.appointments.get(c) ?? null;
    },
    async createAppointment(input: { conversationId: string; branch: BranchCode; patientId: string; start: string; end: string }) {
      guard();
      if (state.rejectAppointments) throw new EhrRejectedError(409, "conflict");
      calls.push(`appointment:${input.conversationId}`);
      const record = { id: `appt-${state.appointments.size}`, patientId: input.patientId, start: input.start, end: input.end, branch: input.branch };
      state.appointments.set(input.conversationId, record);
      return record;
    },
    async findCommunicationsByConversation(c: string) {
      guard();
      return state.communications.filter((x) => x.conversationId === c);
    },
    async createCommunication(input: { conversationId: string; severity: "emergencia" | "urgencia"; patientWords: string }) {
      guard();
      calls.push(`escalate:${input.conversationId}`);
      state.communications.push({ id: `c-${state.communications.length}`, conversationId: input.conversationId, severity: input.severity, patientWords: input.patientWords });
    },
  };
  return { ehr: ehr as unknown as EhrAdapter, state, calls };
}

const history = (conversationId: string): NewOutboxItem => ({
  kind: "save_history",
  conversationId,
  payload: { patientId: "p1", status: "completed", answers: [{ link_id: "allergies", answer: "ninguna" }], chiefComplaint: "dolor" },
});
const appointment = (conversationId: string): NewOutboxItem => ({
  kind: "appointment",
  conversationId,
  payload: { patientId: "p1", branch: "polanco", start: "2026-10-13T09:00:00-06:00", end: "2026-10-13T10:00:00-06:00", calendarEventId: "ev1", description: "d" },
});
const escalate = (conversationId: string): NewOutboxItem => ({
  kind: "escalate",
  conversationId,
  payload: { severity: "emergencia", patientWords: "dolor de pecho", instruction: "911", sent: "2026-10-06T12:00:00Z" },
});
const consent = (conversationId: string): NewOutboxItem => ({ kind: "consent", conversationId, payload: { granted: true } });

describe("drainOutbox", () => {
  it("replays in enqueue order and removes successes", async () => {
    const store = createMemoryStore();
    const { ehr, calls } = fakeEhr();
    for (const item of [consent("c1"), history("c1"), appointment("c1"), escalate("c2")]) await store.enqueue(item);
    const result = await drainOutbox({ store, ehr });
    expect(calls).toEqual(["consent:c1", "history:c1:completed", "appointment:c1", "escalate:c2"]);
    expect(result).toMatchObject({ attempted: 4, succeeded: 4, failed: 0, remaining: 0, ehrDown: false });
    expect(await store.outbox()).toEqual([]);
  });

  it("is idempotent: a second drain, or items the EHR already holds, create nothing new", async () => {
    const store = createMemoryStore();
    const { ehr, state, calls } = fakeEhr();
    state.appointments.set("c1", { id: "appt-existing", patientId: "p1", start: "s", end: "e", branch: "polanco" });
    state.communications.push({ id: "c-existing", conversationId: "c2", severity: "emergencia", patientWords: "dolor de pecho" });
    for (const item of [appointment("c1"), escalate("c2"), history("c3")]) await store.enqueue(item);
    await drainOutbox({ store, ehr });
    // Re-queue the same writes (a retry that was queued twice) and drain again.
    for (const item of [appointment("c1"), escalate("c2"), history("c3")]) await store.enqueue(item);
    await drainOutbox({ store, ehr });
    expect(calls.filter((c) => c.startsWith("appointment"))).toEqual([]);
    expect(calls.filter((c) => c.startsWith("escalate"))).toEqual([]);
    expect(state.responses.size).toBe(1);
    expect(state.appointments.size).toBe(1);
    expect(state.communications).toHaveLength(1);
  });

  it("stops at the first outage, keeps order and counts the attempt", async () => {
    const store = createMemoryStore();
    const { ehr, state, calls } = fakeEhr();
    state.down = true;
    for (const item of [history("c1"), appointment("c1"), escalate("c1")]) await store.enqueue(item);
    const down = await drainOutbox({ store, ehr });
    expect(down).toMatchObject({ attempted: 1, succeeded: 0, failed: 1, remaining: 3, ehrDown: true });
    const queued = await store.outbox();
    expect(queued.map((i) => i.kind)).toEqual(["save_history", "appointment", "escalate"]);
    expect(queued.map((i) => i.attempts)).toEqual([1, 0, 0]);
    expect(queued[0].lastError).toBe("EhrUnavailableError");

    state.down = false;
    const up = await drainOutbox({ store, ehr });
    expect(up).toMatchObject({ succeeded: 3, remaining: 0 });
    expect(calls).toEqual(["history:c1:completed", "appointment:c1", "escalate:c1"]);
  });

  it("keeps a rejected item queued and still drains the items behind it", async () => {
    const store = createMemoryStore();
    const { ehr, state, calls } = fakeEhr();
    state.rejectAppointments = true;
    for (const item of [appointment("c1"), escalate("c1")]) await store.enqueue(item);
    const result = await drainOutbox({ store, ehr });
    expect(result).toMatchObject({ succeeded: 1, failed: 1, remaining: 1, ehrDown: false });
    expect(calls).toEqual(["escalate:c1"]);
    const [left] = await store.outbox();
    expect(left).toMatchObject({ kind: "appointment", attempts: 1, lastError: "EhrRejectedError" });
  });

  it("saves a queued completed history as in-progress when required items are missing", async () => {
    const store = createMemoryStore();
    const { ehr, state } = fakeEhr();
    // No chief complaint anywhere: the EHR-side check cannot complete it.
    await store.enqueue({ kind: "save_history", conversationId: "c1", payload: { patientId: "p1", status: "completed", answers: [{ link_id: "allergies", answer: "ninguna" }], chiefComplaint: "" } });
    await drainOutbox({ store, ehr });
    expect(state.responses.get("c1")?.status).toBe("in-progress");
    expect(await store.outbox()).toEqual([]);
  });

  it("does not run twice at once", async () => {
    const store = createMemoryStore();
    const { ehr } = fakeEhr();
    await store.enqueue(consent("c1"));
    const release = await store.lock("outbox-drain", 30);
    const result = await drainOutbox({ store, ehr });
    expect(result).toMatchObject({ skipped: true, attempted: 0, remaining: 1 });
    await release!();
  });
});
