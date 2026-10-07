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

// The full record, including the contact and administrative data the patient completes through the patient link.
export type PatientProfile = PatientDetail & {
  segundoApellido: string | null;
  phone: string;
  birthDate: string | null;
  email: string | null;
  address: string | null;
  postalCode: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  insurer: string | null;
  policyNumber: string | null;
};

// What the patient may change. A field left out keeps its value; null clears it.
export type PatientProfilePatch = Partial<
  Pick<PatientProfile, "email" | "address" | "postalCode" | "emergencyContactName" | "emergencyContactPhone" | "insurer" | "policyNumber">
>;

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

export type UpcomingAppointment = AppointmentRecord & { calendarEventId: string | null; practitionerId: string };

export type CallbackStatus = "requested" | "completed" | "cancelled";

// A callback request (FHIR Task): the branch's front desk calls the caller back.
export type CallbackRecord = {
  id: string;
  conversationId: string;
  patientId: string | null;
  // Null when the caller had no preferred branch.
  branch: BranchCode | null;
  availability: string;
  reason: string;
  status: CallbackStatus;
  authoredOn: string;
  calendarEventId: string | null;
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
  getPatientProfile(id: string): Promise<PatientProfile | null>;
  // Rejects with EhrRejectedError(404) when the Patient does not exist.
  updatePatientProfile(id: string, patch: PatientProfilePatch): Promise<PatientProfile>;
  // Booked Appointments of a Patient starting after `after`, earliest first.
  upcomingAppointments(patientId: string, after: Date): Promise<UpcomingAppointment[]>;
  // Cancelling an already cancelled Appointment is a no-op. The calendar event is the caller's to remove.
  cancelAppointment(appointmentId: string): Promise<void>;
  // Conditional create: returns the existing callback of the Conversation if there is one.
  createCallback(input: {
    conversationId: string;
    patientId: string | null;
    branch: BranchCode | null;
    availability: string;
    reason: string;
    calendarEventId: string | null;
  }): Promise<CallbackRecord>;
  // Requested (not yet completed or cancelled) callbacks of a Patient, newest first.
  pendingCallbacks(patientId: string): Promise<CallbackRecord[]>;
  // Marks a callback as done (the patient booked, so the front desk no longer needs to call).
  completeCallback(callbackId: string): Promise<void>;
  // Whether any Conversation finished the Questionnaire for this Patient.
  hasCompletedHistory(patientId: string): Promise<boolean>;
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
