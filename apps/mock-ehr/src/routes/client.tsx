import { Hono } from "hono";
import type { Context, MiddlewareHandler } from "hono";
import type { Child } from "hono/jsx";
import { audit } from "../audit.js";
import { consoleAuth } from "../console-auth.js";
import { env } from "../env.js";
import { isUuid } from "../fhir/refs.js";
import { AlertsPage, loadAlerts } from "../pages/client/alerts.js";
import { AppointmentsPage, loadAppointments } from "../pages/client/appointments.js";
import { AuditPage, loadAudit } from "../pages/client/audit.js";
import { BranchesPage, loadBranches } from "../pages/client/branches.js";
import { CallbacksPage, loadCallbacks } from "../pages/client/callbacks.js";
import { ConsultationPage } from "../pages/client/consultation.js";
import { OverviewPage, loadOverview } from "../pages/client/overview.js";
import { PatientPage, loadPatient } from "../pages/client/patient.js";
import { PatientsPage, loadPatients } from "../pages/client/patients.js";
import { QuestionnairePage, loadQuestionnaire } from "../pages/client/questionnaire.js";
import { StaffPage, loadStaff } from "../pages/client/staff.js";
import { NotFoundPage } from "../pages/client/ui.js";

// The client console: read-only GET pages for a clinic administrator. Every route carries the console's HTTP Basic
// guard (patient data is never public) and writes an audit event for the read (NOM-024 6.6.1). Routes are declared
// one by one, never with `use("*")`, because this app is mounted at "/" next to /fhir and /oauth.
export const clientRoutes = new Hono();

// "/" is the client console when the console is enabled; otherwise it falls back to the public developer page.
const rootFallback: MiddlewareHandler = async (c, next) => (env.consolePassword ? next() : c.redirect("/developer", 302));

const html = (c: Context, node: Child, status: 200 | 404 = 200) => c.html(`<!DOCTYPE html>${node}`, status);
const query = (c: Context) => c.req.query() as Record<string, string | undefined>;
const read = (c: Context, resourceType: string, id: string | null = null) => audit("console", "read", resourceType, id, { view: c.req.path });

clientRoutes.get("/", rootFallback, consoleAuth, async (c) => {
  const data = await loadOverview();
  await read(c, "Overview");
  return html(c, <OverviewPage {...data} />);
});

clientRoutes.get("/pacientes", consoleAuth, async (c) => {
  const data = await loadPatients(query(c));
  await read(c, "Patient");
  return html(c, <PatientsPage {...data} />);
});

const patientNotFound = <NotFoundPage what="Paciente" back={{ label: "Volver a pacientes", href: "/pacientes" }} />;

clientRoutes.get("/pacientes/:id", consoleAuth, async (c) => {
  const id = c.req.param("id");
  const data = isUuid(id) ? await loadPatient(id) : null;
  if (!data) return html(c, patientNotFound, 404);
  await read(c, "Patient", id);
  return html(c, <PatientPage {...data} />);
});

clientRoutes.get("/pacientes/:id/consulta", consoleAuth, async (c) => {
  const id = c.req.param("id");
  const data = isUuid(id) ? await loadPatient(id) : null;
  if (!data) return html(c, patientNotFound, 404);
  await read(c, "QuestionnaireResponse", data.intake?.id ?? null);
  return html(c, <ConsultationPage {...data} />);
});

clientRoutes.get("/citas", consoleAuth, async (c) => {
  const data = await loadAppointments(query(c));
  await read(c, "Appointment");
  return html(c, <AppointmentsPage {...data} />);
});

clientRoutes.get("/llamadas", consoleAuth, async (c) => {
  const data = await loadCallbacks(query(c));
  await read(c, "Task");
  return html(c, <CallbacksPage {...data} />);
});

clientRoutes.get("/alertas", consoleAuth, async (c) => {
  const data = await loadAlerts(query(c));
  await read(c, "Communication");
  return html(c, <AlertsPage {...data} />);
});

clientRoutes.get("/sucursales", consoleAuth, async (c) => {
  const data = await loadBranches();
  await read(c, "Location");
  return html(c, <BranchesPage {...data} />);
});

clientRoutes.get("/equipo-medico", consoleAuth, async (c) => {
  const data = await loadStaff();
  await read(c, "PractitionerRole");
  return html(c, <StaffPage {...data} />);
});

clientRoutes.get("/cuestionario", consoleAuth, async (c) => {
  const data = await loadQuestionnaire();
  await read(c, "Questionnaire");
  return html(c, <QuestionnairePage {...data} />);
});

clientRoutes.get("/auditoria", consoleAuth, async (c) => {
  const data = await loadAudit(query(c));
  await read(c, "AuditEvent");
  return html(c, <AuditPage {...data} />);
});
