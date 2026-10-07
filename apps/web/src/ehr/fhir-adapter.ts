import {
  BRANCH_CODES,
  CALENDAR_EVENT_SYSTEM,
  CONVERSATION_SYSTEM,
  EMERGENCY_CONTACT,
  EXT,
  QUESTIONNAIRE_URL,
  RED_FLAG_SEVERITY_EXT,
  SYSTEM,
  appointmentResource,
  communicationResource,
  consentResource,
  questionnaireResponseResource,
  taskResource,
  type Appointment,
  type Communication,
  type BranchCode,
  type Consent,
  type Location as FhirLocation,
  type Patient,
  type Practitioner,
  type PractitionerRole,
  type Questionnaire,
  type QuestionnaireResponse,
  type QuestionnaireResponseItem,
  type Task,
} from "@pokta-clinic/fhir";
import {
  EhrRejectedError,
  type AppointmentRecord,
  type BranchRecord,
  type CallbackRecord,
  type CommunicationRecord,
  type ConsentRecord,
  type EhrAdapter,
  type HistoryAnswer,
  type HistoryRecord,
  type NewPatient,
  type PatientDetail,
  type PatientProfile,
  type PatientProfilePatch,
  type PatientSummary,
  type UpcomingAppointment,
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

const extValue = (resource: Patient, url: string) => resource.extension?.find((e) => e.url === url)?.valueString ?? null;
const emergencyContact = (resource: Patient) =>
  resource.contact?.find((c) => c.relationship?.some((r) => r.text === EMERGENCY_CONTACT)) ?? resource.contact?.[0];

function profile(resource: Patient): PatientProfile {
  const familyExt = resource.name[0]?._family?.extension;
  const [fallbackPrimer, ...fallbackRest] = (resource.name[0]?.family ?? "").split(" ").filter(Boolean);
  const contact = emergencyContact(resource);
  return {
    ...summary(resource),
    primerApellido: familyExt?.find((e) => e.url === EXT.fathersFamily)?.valueString ?? fallbackPrimer ?? "",
    segundoApellido: familyExt?.find((e) => e.url === EXT.mothersFamily)?.valueString ?? (fallbackRest.join(" ") || null),
    phone: resource.telecom.find((t) => t.system === "phone")?.value ?? "",
    birthDate: resource.birthDate ?? null,
    email: resource.telecom.find((t) => t.system === "email")?.value ?? null,
    address: resource.address?.[0]?.text ?? null,
    postalCode: resource.address?.[0]?.postalCode ?? null,
    emergencyContactName: contact?.name?.text ?? null,
    emergencyContactPhone: contact?.telecom?.[0]?.value ?? null,
    insurer: extValue(resource, EXT.aseguradora),
    policyNumber: extValue(resource, EXT.poliza),
  };
}

// The Patient resource with the patch applied to its contact and administrative fields; identity stays as read.
function withProfilePatch(resource: Patient, current: PatientProfile, patch: PatientProfilePatch): Patient {
  const next = { ...current, ...patch };
  const telecom: Patient["telecom"] = resource.telecom.filter((t) => t.system !== "email");
  if (next.email) telecom.push({ system: "email", value: next.email });
  const extension = (resource.extension ?? []).filter((e) => e.url !== EXT.aseguradora && e.url !== EXT.poliza);
  if (next.insurer) extension.push({ url: EXT.aseguradora, valueString: next.insurer });
  if (next.policyNumber) extension.push({ url: EXT.poliza, valueString: next.policyNumber });
  const hasContact = next.emergencyContactName || next.emergencyContactPhone;
  return {
    ...resource,
    telecom,
    address: next.address || next.postalCode ? [{ text: next.address ?? undefined, postalCode: next.postalCode ?? undefined }] : undefined,
    contact: hasContact
      ? [
          {
            relationship: [{ text: EMERGENCY_CONTACT }],
            name: next.emergencyContactName ? { text: next.emergencyContactName } : undefined,
            telecom: next.emergencyContactPhone ? [{ system: "phone", value: next.emergencyContactPhone }] : undefined,
          },
        ]
      : undefined,
    extension: extension.length ? extension : undefined,
  };
}

async function callbackRecord(resource: Task): Promise<CallbackRecord> {
  const locationId = resource.owner?.reference.slice("Location/".length);
  return {
    id: resource.id!,
    conversationId: resource.identifier.find((i) => i.system === CONVERSATION_SYSTEM)?.value ?? "",
    patientId: resource.for?.reference.slice("Patient/".length) ?? null,
    branch: locationId ? await branchOfLocation(locationId) : null,
    availability: resource.note[0]?.text ?? "",
    reason: resource.reasonCode.text,
    status: resource.status,
    authoredOn: resource.authoredOn ?? "",
    calendarEventId: resource.identifier.find((i) => i.system === CALENDAR_EVENT_SYSTEM)?.value ?? null,
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

// The branch an Appointment is at, from its Location participant.
async function appointmentRecord(resource: Appointment, branch?: BranchCode): Promise<AppointmentRecord> {
  const refs = resource.participant.map((p) => p.actor.reference);
  const patient = refs.find((r) => r.startsWith("Patient/"));
  const locationId = refs.find((r) => r.startsWith("Location/"))?.slice("Location/".length);
  return {
    id: resource.id!,
    patientId: patient?.slice("Patient/".length) ?? "",
    start: resource.start,
    end: resource.end,
    branch: branch ?? (locationId ? await branchOfLocation(locationId) : null),
  };
}

const conversationQuery = (conversationId: string) => encodeURIComponent(`${CONVERSATION_SYSTEM}|${conversationId}`);

// The Questionnaire is static and the branches and their Practitioners do not change within a deploy: fetch each once per
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

// Location by branch code, then the PractitionerRole at it, then the Practitioner's name.
async function loadBranch(branch: BranchCode): Promise<BranchRecord> {
  const identifier = encodeURIComponent(`${SYSTEM.branch}|${branch}`);
  const { data: locations } = await fhir<Bundle<FhirLocation>>("GET", `/Location?identifier=${identifier}`);
  const location = locations.entry?.[0]?.resource;
  if (!location?.id) throw new EhrRejectedError(404, `No Location for branch ${branch}`);
  const { data: roles } = await fhir<Bundle<PractitionerRole>>("GET", `/PractitionerRole?location=${encodeURIComponent(`Location/${location.id}`)}`);
  const practitionerId = roles.entry?.[0]?.resource.practitioner.reference.slice("Practitioner/".length);
  if (!practitionerId) throw new EhrRejectedError(404, `No PractitionerRole at branch ${branch}`);
  const { data: person } = await fhir<Practitioner>("GET", `/Practitioner/${encodeURIComponent(practitionerId)}`);
  const name = person.name[0];
  return {
    locationId: location.id,
    name: location.name,
    address: location.address.text,
    practitionerId,
    practitionerName: [...(name?.given ?? []), name?.family].filter(Boolean).join(" "),
  };
}

const questionnaireItems = memoize(loadQuestionnaire);
const branchLoaders = new Map<BranchCode, () => Promise<BranchRecord>>();
function branchRecord(branch: BranchCode): Promise<BranchRecord> {
  let load = branchLoaders.get(branch);
  if (!load) branchLoaders.set(branch, (load = memoize(() => loadBranch(branch))));
  return load();
}

// Best effort: an Appointment found without the branch it was made for. Unreachable branches are skipped.
async function branchOfLocation(locationId: string): Promise<BranchCode | null> {
  for (const code of BRANCH_CODES) {
    const found = await branchRecord(code).catch(() => null);
    if (found?.locationId === locationId) return code;
  }
  return null;
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

  async getPatientProfile(id) {
    try {
      const { data } = await fhir<Patient>("GET", `/Patient/${encodeURIComponent(id)}`);
      return profile(data);
    } catch (err) {
      if (err instanceof EhrRejectedError && err.status === 404) return null;
      throw err;
    }
  },

  async updatePatientProfile(id, patch) {
    const { data: current } = await fhir<Patient>("GET", `/Patient/${encodeURIComponent(id)}`);
    const { data } = await fhir<Patient>("PUT", `/Patient/${encodeURIComponent(id)}`, withProfilePatch(current, profile(current), patch));
    return profile(data);
  },

  async upcomingAppointments(patientId, after) {
    const query = `patient=${encodeURIComponent(`Patient/${patientId}`)}&status=booked&date=${encodeURIComponent(`ge${after.toISOString()}`)}`;
    const { data } = await fhir<Bundle<Appointment>>("GET", `/Appointment?${query}`);
    return Promise.all(
      (data.entry ?? []).map(async ({ resource }): Promise<UpcomingAppointment> => ({
        ...(await appointmentRecord(resource)),
        calendarEventId: resource.identifier.find((i) => i.system === CALENDAR_EVENT_SYSTEM)?.value ?? null,
        practitionerId: resource.participant.map((p) => p.actor.reference).find((r) => r.startsWith("Practitioner/"))?.slice("Practitioner/".length) ?? "",
      })),
    );
  },

  async cancelAppointment(appointmentId) {
    const { data } = await fhir<Appointment>("GET", `/Appointment/${encodeURIComponent(appointmentId)}`);
    if (data.status === "cancelled") return;
    await fhir("PUT", `/Appointment/${encodeURIComponent(appointmentId)}`, { ...data, status: "cancelled" });
  },

  async createCallback(input) {
    // The owner is optional: without a branch (or when it cannot be resolved) the callback belongs to the network.
    let locationId: string | null = null;
    if (input.branch) {
      try {
        locationId = (await branchRecord(input.branch)).locationId;
      } catch (err) {
        if (!(err instanceof EhrRejectedError)) throw err;
      }
    }
    const send = (patientId: string | null) =>
      fhir<Task>(
        "POST",
        "/Task",
        taskResource({
          conversationId: input.conversationId,
          patientId,
          locationId,
          status: "requested",
          authoredOn: new Date().toISOString(),
          availability: input.availability,
          reason: input.reason,
          calendarEventId: input.calendarEventId,
        }),
      );
    try {
      const { data } = await send(input.patientId);
      return callbackRecord(data);
    } catch (err) {
      // The patient_id comes from the LLM; an unknown one must not lose the callback.
      if (!(input.patientId && err instanceof EhrRejectedError && err.status === 404)) throw err;
      const { data } = await send(null);
      return callbackRecord(data);
    }
  },

  async pendingCallbacks(patientId) {
    const { data } = await fhir<Bundle<Task>>("GET", `/Task?patient=${encodeURIComponent(`Patient/${patientId}`)}&status=requested`);
    return Promise.all((data.entry ?? []).map(({ resource }) => callbackRecord(resource)));
  },

  async hasCompletedHistory(patientId) {
    const { data } = await fhir<Bundle<QuestionnaireResponse>>("GET", `/QuestionnaireResponse?subject=${encodeURIComponent(`Patient/${patientId}`)}`);
    return (data.entry ?? []).some(({ resource }) => resource.status === "completed");
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

  getBranch: branchRecord,

  async createAppointment(input) {
    const { locationId, practitionerId } = await branchRecord(input.branch);
    const { data } = await fhir<Appointment>(
      "POST",
      "/Appointment",
      appointmentResource({
        patientId: input.patientId,
        practitionerId,
        locationId,
        start: input.start,
        end: input.end,
        calendarEventId: input.calendarEventId,
        conversationId: input.conversationId,
        description: input.description,
      }),
    );
    return appointmentRecord(data, input.branch);
  },

  async createCommunication(input) {
    // The recipient is optional in FHIR: without a known branch (or when its Practitioner cannot be
    // resolved) it is left out and the EHR notifies its default Practitioner.
    let practitionerId: string | undefined;
    if (input.branch) {
      try {
        practitionerId = (await branchRecord(input.branch)).practitionerId;
      } catch (err) {
        if (!(err instanceof EhrRejectedError)) throw err;
      }
    }
    const send = (patientId?: string) => {
      const resource = communicationResource({
        conversationId: input.conversationId,
        severity: input.severity,
        patientId,
        practitionerId: practitionerId ?? "",
        sent: input.sent ?? new Date().toISOString(),
        patientWords: input.patientWords,
        instruction: input.instruction,
      });
      return fhir<Communication>("POST", "/Communication", practitionerId ? resource : { ...resource, recipient: undefined });
    };
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
