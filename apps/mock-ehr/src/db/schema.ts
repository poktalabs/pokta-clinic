// Tables follow NOM-004-SSA3-2012 and NOM-024-SSA3-2012; see apps/mock-ehr/docs/data-model.md for the section
// behind each column. FHIR mapping lives in src/fhir/, never here.
import { boolean, date, jsonb, pgEnum, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().defaultRandom();
const now = (name: string) => timestamp(name, { withTimezone: true }).notNull().defaultNow();
const createdAt = () => now("created_at");

// NOM-024 Table 1 uses RENAPO's H/M.
export const sexoEnum = pgEnum("sexo", ["H", "M"]);

// The clinic network that owns the branches: FHIR `Organization`. Not a NOM establishment (it has no CLUES).
export const organization = pgTable("organization", {
  id: id(),
  nombre: text("nombre").notNull(),
  razonSocial: text("razon_social").notNull().unique(),
  createdAt: createdAt(),
});

// One opening interval of a branch, in FHIR R4 `hoursOfOperation` terms. Times are local (America/Mexico_City).
export type Horario = { daysOfWeek: ("mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun")[]; openingTime: string; closingTime: string };

// A branch: NOM-004 5.2.1, 5.2.2; CLUES from the DGIS catalog (NOM-024 Apendice A). FHIR `Location`.
export const establishment = pgTable("establishment", {
  id: id(),
  // Nullable so the migration is additive; the seed links every branch to the network.
  organizationId: uuid("organization_id").references(() => organization.id),
  // Stable branch code (`del-valle`, `polanco`, `satelite`): how a client resolves a Location by identifier.
  codigo: text("codigo").unique(),
  horarios: jsonb("horarios").$type<Horario[]>(),
  clues: text("clues").notNull().unique(),
  tipo: text("tipo").notNull(),
  nombre: text("nombre").notNull(),
  razonSocial: text("razon_social"),
  domicilio: text("domicilio").notNull(),
  createdAt: createdAt(),
});

// NOM-004 5.10: every note names its author; the cedula profesional identifies a physician.
export const practitioner = pgTable("practitioner", {
  id: id(),
  establishmentId: uuid("establishment_id").notNull().references(() => establishment.id),
  nombre: text("nombre").notNull(),
  primerApellido: text("primer_apellido").notNull(),
  segundoApellido: text("segundo_apellido"),
  cedulaProfesional: text("cedula_profesional").notNull().unique(),
  especialidad: text("especialidad").notNull(),
  createdAt: createdAt(),
});

// A Practitioner works at one or more branches: FHIR `PractitionerRole`.
export const practitionerRole = pgTable(
  "practitioner_role",
  {
    id: id(),
    practitionerId: uuid("practitioner_id").notNull().references(() => practitioner.id),
    establishmentId: uuid("establishment_id").notNull().references(() => establishment.id),
    createdAt: createdAt(),
  },
  (t) => [unique().on(t.practitionerId, t.establishmentId)],
);

// NOM-024 6.5 and Table 1; NOM-004 5.2.3. CURP is never generated (6.5.2) and stays unvalidated
// until checked against RENAPO, which the demo does not do.
export const patient = pgTable("patient", {
  id: id(),
  establishmentId: uuid("establishment_id").notNull().references(() => establishment.id),
  folio: text("folio").notNull().unique(),
  curp: text("curp").unique(),
  curpValidada: boolean("curp_validada").notNull().default(false),
  nombre: text("nombre").notNull(),
  primerApellido: text("primer_apellido").notNull(),
  segundoApellido: text("segundo_apellido"),
  fechaNacimiento: date("fecha_nacimiento"),
  sexo: sexoEnum("sexo"),
  telefono: text("telefono").notNull(),
  domicilio: text("domicilio"),
  codigoPostal: text("codigo_postal"),
  // Administrative data the patient completes later through the patient link.
  email: text("email"),
  contactoEmergenciaNombre: text("contacto_emergencia_nombre"),
  contactoEmergenciaTelefono: text("contacto_emergencia_telefono"),
  aseguradora: text("aseguradora"),
  poliza: text("poliza"),
  createdAt: createdAt(),
  // NOM-004 5.4: kept at least 5 years from the last medical act; soft delete only.
  retainUntil: date("retain_until"),
});

export const questionnaire = pgTable("questionnaire", {
  id: id(),
  establishmentId: uuid("establishment_id").notNull().references(() => establishment.id),
  // Canonical url: how a client finds the definition (`GET /fhir/Questionnaire?url=`).
  url: text("url").notNull().unique(),
  version: text("version").notNull(),
  title: text("title").notNull(),
  status: text("status").notNull().default("active"),
  items: jsonb("items").notNull(),
  createdAt: createdAt(),
});

// NOM-004 5.18: a complementary, patient-reported document. The agent is not health personnel
// (4.4) and cannot sign (5.10), so it stays pending until the Practitioner's Validation.
export const intakeStatusEnum = pgEnum("intake_status", ["pending_validation", "validated", "rejected"]);
export const intakeCompletionEnum = pgEnum("intake_completion", ["in_progress", "completed"]);
export const intake = pgTable("intake", {
  id: id(),
  patientId: uuid("patient_id").notNull().references(() => patient.id),
  questionnaireId: uuid("questionnaire_id").notNull().references(() => questionnaire.id),
  // One response per Conversation; later answers replace it.
  conversationId: text("conversation_id").notNull().unique(),
  items: jsonb("items").notNull(),
  // Whether the call finished the Questionnaire. Separate from `status`, which is the Practitioner's Validation.
  completion: intakeCompletionEnum("completion").notNull().default("in_progress"),
  status: intakeStatusEnum("status").notNull().default("pending_validation"),
  authorDevice: text("author_device").notNull(),
  validatedBy: uuid("validated_by").references(() => practitioner.id),
  validatedAt: timestamp("validated_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: now("updated_at"),
});

// LFPDPPP express consent for sensitive data; NOM-024 6.6.6 gives the patient control over consents.
export const consent = pgTable("consent", {
  id: id(),
  patientId: uuid("patient_id").references(() => patient.id),
  tipo: text("tipo").notNull().default("privacidad"),
  granted: boolean("granted").notNull(),
  method: text("method").notNull().default("voice"),
  conversationId: text("conversation_id").notNull(),
  recordedAt: now("recorded_at"),
});

export const appointmentStatusEnum = pgEnum("appointment_status", ["booked", "cancelled"]);
export const appointment = pgTable("appointment", {
  id: id(),
  patientId: uuid("patient_id").notNull().references(() => patient.id),
  practitionerId: uuid("practitioner_id").notNull().references(() => practitioner.id),
  // The branch where the Patient is seen; the Practitioner must hold a practitioner_role there.
  establishmentId: uuid("establishment_id").notNull().references(() => establishment.id),
  start: timestamp("start", { withTimezone: true }).notNull(),
  end: timestamp("end", { withTimezone: true }).notNull(),
  status: appointmentStatusEnum("status").notNull().default("booked"),
  calendarEventId: text("calendar_event_id"),
  conversationId: text("conversation_id"),
  description: text("description"),
  createdAt: createdAt(),
});

// An Escalation for a Red flag: the Practitioner is notified, the exact words are kept as said.
export const redFlagSeverityEnum = pgEnum("red_flag_severity", ["emergencia", "urgencia"]);
export const communication = pgTable("communication", {
  id: id(),
  // Null when the Escalation happens before the caller is identified.
  patientId: uuid("patient_id").references(() => patient.id),
  practitionerId: uuid("practitioner_id").notNull().references(() => practitioner.id),
  severity: redFlagSeverityEnum("severity").notNull(),
  conversationId: text("conversation_id").notNull(),
  patientWords: text("patient_words").notNull(),
  instruction: text("instruction"),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: createdAt(),
});

// A callback request (FHIR Task): the caller did not book and the branch's front desk calls them back.
export const callbackStatusEnum = pgEnum("callback_status", ["requested", "completed", "cancelled"]);
export const callbackTask = pgTable("callback_task", {
  id: id(),
  // Null when the caller asks for a callback before being identified.
  patientId: uuid("patient_id").references(() => patient.id),
  // The branch that owns the callback; null when the caller had no preference.
  establishmentId: uuid("establishment_id").references(() => establishment.id),
  conversationId: text("conversation_id").notNull().unique(),
  status: callbackStatusEnum("status").notNull().default("requested"),
  availability: text("availability").notNull(),
  reason: text("reason").notNull(),
  description: text("description"),
  calendarEventId: text("calendar_event_id"),
  authoredAt: timestamp("authored_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: createdAt(),
});

// NOM-024 3.42 and 6.6.1: an append-only log able to rebuild earlier states.
export const auditEvent = pgTable("audit_event", {
  id: id(),
  at: now("at"),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  resourceType: text("resource_type").notNull(),
  resourceId: text("resource_id"),
  detail: jsonb("detail"),
});
