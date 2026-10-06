import {
  CONVERSATION_SYSTEM,
  EXT,
  QUESTIONNAIRE_URL,
  RED_FLAG_SEVERITY_EXT,
  SYSTEM,
  appointmentResource,
  communicationResource,
  consentResource,
  questionnaireResponseResource,
  type Appointment,
  type Communication,
  type Consent,
  type Patient,
  type Practitioner,
  type Questionnaire,
  type QuestionnaireResponse,
  type QuestionnaireResponseItem,
} from "@pokta-clinic/fhir";
import {
  EhrRejectedError,
  type AppointmentRecord,
  type CommunicationRecord,
  type ConsentRecord,
  type EhrAdapter,
  type HistoryAnswer,
  type HistoryRecord,
  type NewPatient,
  type PatientDetail,
  type PatientSummary,
} from "./adapter";
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

function historyRecord(resource: QuestionnaireResponse): HistoryRecord {
  const answers: HistoryAnswer[] = [];
  for (const item of resource.item) {
    const a = item.answer[0];
    if (!a) continue;
    const value = "valueString" in a ? a.valueString : "valueInteger" in a ? a.valueInteger : a.valueBoolean;
    answers.push({ linkId: item.linkId, value });
  }
  return { id: resource.id!, patientId: resource.subject.reference.slice("Patient/".length), status: resource.status, answers };
}

function answerItem(a: HistoryAnswer): QuestionnaireResponseItem {
  const answer =
    typeof a.value === "number" ? { valueInteger: a.value } : typeof a.value === "boolean" ? { valueBoolean: a.value } : { valueString: a.value };
  return { linkId: a.linkId, answer: [answer] };
}

function appointmentRecord(resource: Appointment): AppointmentRecord {
  const actor = resource.participant.map((p) => p.actor.reference).find((r) => r.startsWith("Patient/"));
  return { id: resource.id!, patientId: actor?.slice("Patient/".length) ?? "", start: resource.start, end: resource.end };
}

const conversationQuery = (conversationId: string) => encodeURIComponent(`${CONVERSATION_SYSTEM}|${conversationId}`);

// The Questionnaire is static and the Practitioner does not change within a deploy: fetch each once per
// server instance. A failed fetch is not cached.
function memoize<T>(load: () => Promise<T>): () => Promise<T> {
  let slot: Promise<T> | null = null;
  return () => {
    slot ??= load().catch((err) => {
      slot = null;
      throw err;
    });
    return slot;
  };
}

async function loadQuestionnaire(): Promise<Questionnaire["item"]> {
  const { data } = await fhir<Bundle<Questionnaire>>("GET", `/Questionnaire?url=${encodeURIComponent(QUESTIONNAIRE_URL)}`);
  const found = data.entry?.[0]?.resource;
  if (!found) throw new EhrRejectedError(404, `Questionnaire ${QUESTIONNAIRE_URL} not found`);
  return found.item;
}

async function loadPractitionerId(): Promise<string> {
  const { data } = await fhir<Bundle<Practitioner>>("GET", "/Practitioner");
  const id = data.entry?.[0]?.resource.id;
  if (!id) throw new EhrRejectedError(404, "No Practitioner in the EHR");
  return id;
}

const questionnaireItems = memoize(loadQuestionnaire);
const practitioner = memoize(loadPractitionerId);

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

  async getPatient(id) {
    try {
      const { data } = await fhir<Patient>("GET", `/Patient/${encodeURIComponent(id)}`);
      const family = data.name[0]?._family?.extension?.find((e) => e.url === EXT.fathersFamily)?.valueString;
      return { ...summary(data), primerApellido: family ?? data.name[0]?.family?.split(" ")[0] ?? "" } satisfies PatientDetail;
    } catch (err) {
      if (err instanceof EhrRejectedError && err.status === 404) return null;
      throw err;
    }
  },

  async getQuestionnaire() {
    const items = await questionnaireItems();
    return items.map((i) => ({ linkId: i.linkId, text: i.text, type: i.type, required: i.required === true }));
  },

  async findQuestionnaireResponse(conversationId) {
    const { data } = await fhir<Bundle<QuestionnaireResponse>>("GET", `/QuestionnaireResponse?identifier=${conversationQuery(conversationId)}`);
    const first = data.entry?.[0]?.resource;
    return first ? historyRecord(first) : null;
  },

  async saveQuestionnaireResponse({ conversationId, patientId, status, answers, existing }) {
    const body = (id?: string) =>
      questionnaireResponseResource({ id, questionnaire: QUESTIONNAIRE_URL, status, patientId, conversationId, items: answers.map(answerItem) });
    if (existing) {
      const { data } = await fhir<QuestionnaireResponse>("PUT", `/QuestionnaireResponse/${existing.id}`, body(existing.id));
      return historyRecord(data);
    }
    try {
      const { data } = await fhir<QuestionnaireResponse>("POST", "/QuestionnaireResponse", body());
      return historyRecord(data);
    } catch (err) {
      // Two calls for one Conversation raced: the other one created it first, so replace its answers.
      if (!(err instanceof EhrRejectedError) || err.status !== 409) throw err;
      const raced = await this.findQuestionnaireResponse(conversationId);
      if (!raced) throw err;
      const { data } = await fhir<QuestionnaireResponse>("PUT", `/QuestionnaireResponse/${raced.id}`, body(raced.id));
      return historyRecord(data);
    }
  },

  async findAppointmentByConversation(conversationId) {
    const { data } = await fhir<Bundle<Appointment>>("GET", `/Appointment?identifier=${conversationQuery(conversationId)}`);
    const first = data.entry?.[0]?.resource;
    return first ? appointmentRecord(first) : null;
  },

  async createAppointment(input) {
    const practitionerId = await practitioner();
    const { data } = await fhir<Appointment>(
      "POST",
      "/Appointment",
      appointmentResource({
        patientId: input.patientId,
        practitionerId,
        start: input.start,
        end: input.end,
        calendarEventId: input.calendarEventId,
        conversationId: input.conversationId,
        description: input.description,
      }),
    );
    return appointmentRecord(data);
  },

  async createCommunication(input) {
    const practitionerId = await practitioner();
    const send = (patientId?: string) =>
      fhir<Communication>(
        "POST",
        "/Communication",
        communicationResource({
          conversationId: input.conversationId,
          severity: input.severity,
          patientId,
          practitionerId,
          sent: input.sent ?? new Date().toISOString(),
          patientWords: input.patientWords,
          instruction: input.instruction,
        }),
      );
    try {
      await send(input.patientId);
    } catch (err) {
      // The patient_id comes from the LLM; an unknown one must not cost the Practitioner the notification.
      if (input.patientId && err instanceof EhrRejectedError && err.status === 404) await send();
      else throw err;
    }
  },

  async findCommunicationsByConversation(conversationId) {
    const { data } = await fhir<Bundle<Communication>>("GET", `/Communication?identifier=${conversationQuery(conversationId)}`);
    return (data.entry ?? []).map(({ resource }) => ({
      id: resource.id!,
      severity: resource.extension?.find((e) => e.url === RED_FLAG_SEVERITY_EXT)?.valueString as CommunicationRecord["severity"],
      patientWords: resource.payload[0]?.contentString ?? "",
    }));
  },
};
