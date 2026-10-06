// Tables follow NOM-004-SSA3-2012 and NOM-024-SSA3-2012; see apps/mock-ehr/docs/data-model.md for the section
// behind each column. FHIR mapping lives in src/fhir/, never here.
import { boolean, date, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().defaultRandom();
const now = (name: string) => timestamp(name, { withTimezone: true }).notNull().defaultNow();
const createdAt = () => now("created_at");

// NOM-024 Table 1 uses RENAPO's H/M.
export const sexoEnum = pgEnum("sexo", ["H", "M"]);

// NOM-004 5.2.1, 5.2.2; CLUES from the DGIS catalog (NOM-024 Apendice A).
export const establishment = pgTable("establishment", {
  id: id(),
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
  createdAt: createdAt(),
  // NOM-004 5.4: kept at least 5 years from the last medical act; soft delete only.
  retainUntil: date("retain_until"),
});

export const questionnaire = pgTable("questionnaire", {
  id: id(),
  establishmentId: uuid("establishment_id").notNull().references(() => establishment.id),
  version: text("version").notNull(),
  title: text("title").notNull(),
  items: jsonb("items").notNull(),
  createdAt: createdAt(),
});

// NOM-004 5.18: a complementary, patient-reported document. The agent is not health personnel
// (4.4) and cannot sign (5.10), so it stays pending until the Practitioner's Validation.
export const intakeStatusEnum = pgEnum("intake_status", ["pending_validation", "validated", "rejected"]);
export const intake = pgTable("intake", {
  id: id(),
  patientId: uuid("patient_id").notNull().references(() => patient.id),
  questionnaireId: uuid("questionnaire_id").notNull().references(() => questionnaire.id),
  conversationId: text("conversation_id").notNull(),
  items: jsonb("items").notNull(),
  status: intakeStatusEnum("status").notNull().default("pending_validation"),
  authorDevice: text("author_device").notNull(),
  validatedBy: uuid("validated_by").references(() => practitioner.id),
  validatedAt: timestamp("validated_at", { withTimezone: true }),
  createdAt: createdAt(),
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
  start: timestamp("start", { withTimezone: true }).notNull(),
  end: timestamp("end", { withTimezone: true }).notNull(),
  status: appointmentStatusEnum("status").notNull().default("booked"),
  calendarEventId: text("calendar_event_id"),
  conversationId: text("conversation_id"),
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
