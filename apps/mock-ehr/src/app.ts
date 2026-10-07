import { Hono } from "hono";
import { operationOutcome } from "@pokta-clinic/fhir";
import { requireToken, tokenEndpoint, type AuthVars } from "./auth.js";
import { capabilityStatement } from "./capability.js";
import { RootPage } from "./pages/root.js";
import { appointmentRoutes } from "./routes/appointment.js";
import { communicationRoutes } from "./routes/communication.js";
import { consoleRoutes } from "./routes/console.js";
import { consentRoutes } from "./routes/consent.js";
import { locationRoutes } from "./routes/location.js";
import { organizationRoutes } from "./routes/organization.js";
import { patientRoutes } from "./routes/patient.js";
import { practitionerRoleRoutes } from "./routes/practitioner-role.js";
import { practitionerRoutes } from "./routes/practitioner.js";
import { questionnaireResponseRoutes } from "./routes/questionnaire-response.js";
import { questionnaireRoutes } from "./routes/questionnaire.js";
import { taskRoutes } from "./routes/task.js";

// "Expediente Demo": a mock third-party EHR. pokta-clinic reaches it only over FHIR R4.
export const app = new Hono<AuthVars>();

app.get("/healthz", (c) => c.json({ ok: true }));
app.post("/oauth/token", tokenEndpoint);

app.get("/", async (c) => c.html(`<!DOCTYPE html>${await RootPage()}`));
app.get("/fhir/metadata", (c) => c.json(capabilityStatement()));
app.route("/console", consoleRoutes);

app.use("/fhir/*", requireToken);
app.route("/fhir/Patient", patientRoutes);
app.route("/fhir/Organization", organizationRoutes);
app.route("/fhir/Location", locationRoutes);
app.route("/fhir/Practitioner", practitionerRoutes);
app.route("/fhir/PractitionerRole", practitionerRoleRoutes);
app.route("/fhir/Questionnaire", questionnaireRoutes);
app.route("/fhir/QuestionnaireResponse", questionnaireResponseRoutes);
app.route("/fhir/Consent", consentRoutes);
app.route("/fhir/Appointment", appointmentRoutes);
app.route("/fhir/Communication", communicationRoutes);
app.route("/fhir/Task", taskRoutes);

app.notFound((c) => c.json(operationOutcome("not-found", `No route for ${c.req.method} ${c.req.path}`), 404));
app.onError((err, c) => {
  console.error("unhandled", err.name);
  return c.json(operationOutcome("exception", "Internal error"), 500);
});
