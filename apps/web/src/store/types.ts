// What pokta-clinic persists itself, independent of the EHR, so the demo keeps working while the EHR
// is suspended. Operational data only (7-day TTL): the EHR stays the system of record.

import type { BranchCode } from "@pokta-clinic/fhir";

export const TTL_SECONDS = 7 * 24 * 60 * 60;

// One tool call. Never holds patient answers, names or phones: only what the timeline shows.
export type ToolEvent = {
  id: string;
  conversationId: string;
  tool: string;
  ok: boolean;
  status: number;
  ms: number;
  at: number; // epoch ms
  outcome: string;
};

// The Consent decision of a Conversation, cached so the gate works while the EHR is down.
export type ConsentDecision = { granted: boolean; consentId: string | null; patientId: string | null; at: number };

// The booking of a Conversation: makes book_appointment idempotent when the EHR cannot be asked.
export type BookingRecord = { appointmentId: string | null; branch: BranchCode; patientId: string; start: string; end: string; calendarEventId: string };

export type OutboxKind = "consent" | "save_history" | "appointment" | "escalate";

// Payloads are what the drain needs to replay the write. They can hold patient data, so they expire
// like everything else here and the public outbox view never shows them.
export type OutboxPayloads = {
  consent: { granted: boolean };
  save_history: { patientId: string; status: "in-progress" | "completed"; answers: { link_id: string; answer: string }[]; chiefComplaint: string };
  appointment: { patientId: string; branch: BranchCode; start: string; end: string; calendarEventId: string; description: string };
  escalate: { severity: "emergencia" | "urgencia"; patientWords: string; instruction: string; patientId?: string; branch?: BranchCode; sent: string };
};

export type OutboxItem<K extends OutboxKind = OutboxKind> = {
  [P in K]: {
    id: string;
    kind: P;
    conversationId: string;
    createdAt: number;
    attempts: number;
    lastError: string | null;
    payload: OutboxPayloads[P];
  };
}[K];

export type NewOutboxItem = { [P in OutboxKind]: { kind: P; conversationId: string; payload: OutboxPayloads[P] } }[OutboxKind];

// "resume" is set by the toggle; drainPending stays true until the outbox is drained after the EHR is healthy.
export type EhrIntent = { action: "resume" | "suspend"; at: number; drainPending: boolean };

export type TranscriptTurn = {
  role: string;
  text: string;
  nodeId: string | null;
  toolCalls: { name: string; params: string }[];
  atSecs: number | null;
};

// Post-call webhook record. Fictional data only in the demo; admin-only to read.
export type ConversationRecord = {
  id: string;
  agentId: string | null;
  status: string;
  receivedAt: number;
  startedAt: number | null;
  durationSecs: number | null;
  summary: string | null;
  callSuccessful: string | null;
  transcript: TranscriptTurn[];
  dataCollection: Record<string, { value: unknown; rationale: string | null }>;
  evaluation: Record<string, { result: string; rationale: string | null }>;
};

export interface Store {
  addEvent(event: ToolEvent): Promise<void>;
  // Newest last.
  recentEvents(limit: number): Promise<ToolEvent[]>;

  getConsent(conversationId: string): Promise<ConsentDecision | null>;
  putConsent(conversationId: string, decision: ConsentDecision): Promise<void>;

  getBooking(conversationId: string): Promise<BookingRecord | null>;
  putBooking(conversationId: string, booking: BookingRecord): Promise<void>;

  enqueue(item: NewOutboxItem): Promise<OutboxItem>;
  // In enqueue order.
  outbox(): Promise<OutboxItem[]>;
  updateOutboxItem(item: OutboxItem): Promise<void>;
  removeOutboxItem(id: string): Promise<void>;

  getEhrIntent(): Promise<EhrIntent | null>;
  putEhrIntent(intent: EhrIntent | null): Promise<void>;

  putConversation(record: ConversationRecord): Promise<void>;
  getConversation(id: string): Promise<ConversationRecord | null>;
  // Newest first.
  listConversations(limit: number): Promise<ConversationRecord[]>;

  // Returns a release function, or null when someone else holds the lock.
  lock(name: string, ttlSeconds: number): Promise<(() => Promise<void>) | null>;
}
