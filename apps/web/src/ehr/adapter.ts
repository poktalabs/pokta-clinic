import type { BranchCode } from "@pokta-clinic/fhir";

// The only contract the tools know. A different EHR means a different implementation of this
// interface; the tools and the agent stay the same.

export type PatientSummary = {
  id: string;
  folio: string | null;
  givenName: string;
};

export type NewPatient = {
  nombre: string;
  primerApellido: string;
  segundoApellido?: string;
  telefono: string;
  fechaNacimiento?: string;
  sexo?: "H" | "M";
};

export type ConsentRecord = {
  id: string;
  granted: boolean;
  patientId: string | null;
};

export type PatientDetail = PatientSummary & { primerApellido: string };

export type QuestionnaireItemDef = {
  linkId: string;
  text: string;
  type: "string" | "integer" | "boolean";
  required: boolean;
};

export type HistoryAnswer = { linkId: string; value: string | number | boolean };

// The QuestionnaireResponse of one Conversation, as the tools see it.
export type HistoryRecord = {
  id: string;
  patientId: string;
  status: "in-progress" | "completed";
  answers: HistoryAnswer[];
};

export type AppointmentRecord = {
  id: string;
  patientId: string;
  start: string;
  end: string;
  // Null when the Appointment's Location is not one of the known branches.
  branch: BranchCode | null;
};

// A branch (Location) with the Practitioner who works there (PractitionerRole), as the EHR holds them.
export type BranchRecord = {
  locationId: string;
  name: string;
  address: string;
  practitionerId: string;
  practitionerName: string;
};

export type Severity = "emergencia" | "urgencia";

export type CommunicationRecord = { id: string; severity: Severity; patientWords: string };

export interface EhrAdapter {
  findPatientsByPhone(phone: string): Promise<PatientSummary[]>;
  createPatient(input: NewPatient): Promise<{ patient: PatientSummary; created: boolean }>;
  recordConsent(conversationId: string, granted: boolean): Promise<ConsentRecord>;
  latestConsent(conversationId: string): Promise<ConsentRecord | null>;
  linkConsent(consent: ConsentRecord, conversationId: string, patientId: string): Promise<void>;
  getPatient(id: string): Promise<PatientDetail | null>;
  getQuestionnaire(): Promise<QuestionnaireItemDef[]>;
  findQuestionnaireResponse(conversationId: string): Promise<HistoryRecord | null>;
  // Creates the response of this Conversation, or replaces it when `existing` is given.
  saveQuestionnaireResponse(input: {
    conversationId: string;
    patientId: string;
    status: HistoryRecord["status"];
    answers: HistoryAnswer[];
    existing: HistoryRecord | null;
  }): Promise<HistoryRecord>;
  findAppointmentByConversation(conversationId: string): Promise<AppointmentRecord | null>;
  // The Location of a branch code and its Practitioner, cached per server instance. Rejects with
  // EhrRejectedError(404) when the EHR has no such Location or nobody works there.
  getBranch(branch: BranchCode): Promise<BranchRecord>;
  // Books at the branch with the Practitioner who has a role there. Rejects with EhrRejectedError(409)
  // when that Practitioner already has an Appointment in the interval.
  createAppointment(input: {
    conversationId: string;
    branch: BranchCode;
    patientId: string;
    start: string;
    end: string;
    calendarEventId: string;
    description: string;
  }): Promise<AppointmentRecord>;
  // Notifies a Practitioner of a Red flag: the one at `branch` when it is given, else the EHR's default.
  createCommunication(input: {
    branch?: BranchCode;
    conversationId: string;
    severity: Severity;
    patientWords: string;
    instruction: string;
    patientId?: string;
    // When the Red flag happened, if the write is replayed later from the outbox.
    sent?: string;
  }): Promise<void>;
  // The Communications of a Conversation; the outbox drain uses it to avoid writing one twice.
  findCommunicationsByConversation(conversationId: string): Promise<CommunicationRecord[]>;
}

// The EHR did not answer or failed; tools tell the agent to apologise instead of guessing.
export class EhrUnavailableError extends Error {
  constructor(detail: string) {
    super(`EHR unavailable: ${detail}`);
    this.name = "EhrUnavailableError";
  }
}

// The EHR answered and refused the request (validation, conflict).
export class EhrRejectedError extends Error {
  constructor(
    readonly status: number,
    detail: string,
  ) {
    super(detail);
    this.name = "EhrRejectedError";
  }
}
