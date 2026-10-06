import { CONVERSATION_SYSTEM, EXT, SYSTEM, consentResource, type Consent, type Patient } from "@pokta-clinic/fhir";
import type { ConsentRecord, EhrAdapter, NewPatient, PatientSummary } from "./adapter";
import { fhir } from "./fhir-client";

type Bundle<T> = { entry?: { resource: T }[] };

function summary(resource: Patient): PatientSummary {
  return {
    id: resource.id!,
    folio: resource.identifier?.find((i) => i.system === SYSTEM.folio)?.value ?? null,
    givenName: resource.name[0]?.given.join(" ") ?? "",
  };
}

function consentRecord(resource: Consent): ConsentRecord {
  return {
    id: resource.id!,
    granted: resource.provision.type === "permit",
    patientId: resource.patient?.reference.slice("Patient/".length) ?? null,
  };
}

function patientResource(input: NewPatient): Patient {
  const family: { url: string; valueString: string }[] = [{ url: EXT.fathersFamily, valueString: input.primerApellido }];
  if (input.segundoApellido) family.push({ url: EXT.mothersFamily, valueString: input.segundoApellido });
  return {
    resourceType: "Patient",
    name: [
      {
        use: "official",
        given: [input.nombre],
        family: [input.primerApellido, input.segundoApellido].filter(Boolean).join(" "),
        _family: { extension: family },
      },
    ],
    telecom: [{ system: "phone", value: input.telefono }],
    birthDate: input.fechaNacimiento,
    gender: input.sexo === "H" ? "male" : input.sexo === "M" ? "female" : undefined,
    extension: input.sexo ? [{ url: EXT.sexoRenapo, valueString: input.sexo }] : undefined,
  };
}

// FHIR R4 over HTTP with OAuth2 client credentials: the Expediente Demo, or any EHR with the same
// Patient and Consent interactions.
export const fhirEhrAdapter: EhrAdapter = {
  async findPatientsByPhone(phone) {
    const { data } = await fhir<Bundle<Patient>>("GET", `/Patient?phone=${encodeURIComponent(phone)}`);
    return (data.entry ?? []).map((e) => summary(e.resource));
  },

  async createPatient(input) {
    const { status, data } = await fhir<Patient>("POST", "/Patient", patientResource(input));
    return { patient: summary(data), created: status === 201 };
  },

  async recordConsent(conversationId, granted) {
    const { data } = await fhir<Consent>("POST", "/Consent", consentResource({ conversationId, granted }));
    return consentRecord(data);
  },

  async latestConsent(conversationId) {
    const identifier = encodeURIComponent(`${CONVERSATION_SYSTEM}|${conversationId}`);
    const { data } = await fhir<Bundle<Consent>>("GET", `/Consent?identifier=${identifier}`);
    const first = data.entry?.[0]?.resource;
    return first ? consentRecord(first) : null;
  },

  async linkConsent(consent, conversationId, patientId) {
    await fhir("PUT", `/Consent/${consent.id}`, consentResource({ id: consent.id, conversationId, granted: consent.granted, patientId }));
  },
};
