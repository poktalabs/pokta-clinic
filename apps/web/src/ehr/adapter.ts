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

export interface EhrAdapter {
  findPatientsByPhone(phone: string): Promise<PatientSummary[]>;
  createPatient(input: NewPatient): Promise<{ patient: PatientSummary; created: boolean }>;
  recordConsent(conversationId: string, granted: boolean): Promise<ConsentRecord>;
  latestConsent(conversationId: string): Promise<ConsentRecord | null>;
  linkConsent(consent: ConsentRecord, conversationId: string, patientId: string): Promise<void>;
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
