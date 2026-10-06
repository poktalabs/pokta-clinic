import { desc, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { appointment, auditEvent, communication, consent, establishment, intake, patient } from "../db/schema.js";
import { Layout } from "./layout.js";
import { Network, loadNetwork } from "./network.js";

const VALIDATION = { pending_validation: "pending", validated: "validated", rejected: "rejected" } as const;
const mexicoCity = new Intl.DateTimeFormat("es-MX", { timeZone: "America/Mexico_City", dateStyle: "short", timeStyle: "short" });
const when = (d: Date) => mexicoCity.format(d);
// Phones are masked to the last 4 digits even here.
const maskPhone = (phone: string) => `******${phone.slice(-4)}`;

const Table = (props: { title: string; head: string[]; rows: unknown[][]; empty?: string }) => (
  <>
    <h2>{props.title}</h2>
    <table>
      <thead>
        <tr>{props.head.map((h) => <th>{h}</th>)}</tr>
      </thead>
      <tbody>
        {props.rows.length ? props.rows.map((r) => <tr>{r.map((cell) => <td>{cell}</td>)}</tr>) : <tr><td colspan={props.head.length}>None yet</td></tr>}
      </tbody>
    </table>
  </>
);

// Read-only: the latest rows of each resource and the audit trail.
export async function loadConsole() {
  const [network, patients, consents, responses, appointments, communications, audits] = await Promise.all([
    loadNetwork(),
    db.select().from(patient).orderBy(desc(patient.createdAt)).limit(20),
    db.select({ c: consent, folio: patient.folio }).from(consent).leftJoin(patient, eq(consent.patientId, patient.id)).orderBy(desc(consent.recordedAt)).limit(20),
    db.select({ r: intake, folio: patient.folio }).from(intake).innerJoin(patient, eq(intake.patientId, patient.id)).orderBy(desc(intake.createdAt)).limit(20),
    db
      .select({ a: appointment, folio: patient.folio, branch: establishment.nombre })
      .from(appointment)
      .innerJoin(patient, eq(appointment.patientId, patient.id))
      .innerJoin(establishment, eq(appointment.establishmentId, establishment.id))
      .orderBy(desc(appointment.start))
      .limit(20),
    db.select().from(communication).orderBy(desc(communication.sentAt)).limit(20),
    db.select().from(auditEvent).orderBy(desc(auditEvent.at)).limit(30),
  ]);
  return { network, patients, consents, responses, appointments, communications, audits };
}

export function ConsolePage(d: Awaited<ReturnType<typeof loadConsole>>) {
  return (
    <Layout title="Expediente Demo: console" wide>
      <h1>Expediente Demo console</h1>
      <p class="sub">Read-only. Fictional data. Latest 20 of each, latest 30 audit events.</p>

      <h2>Network</h2>
      <Network data={d.network} />

      <Table
        title="Patients"
        head={["Folio", "Name", "Phone", "Created"]}
        rows={d.patients.map((p) => [p.folio, [p.nombre, p.primerApellido, p.segundoApellido].filter(Boolean).join(" "), maskPhone(p.telefono), when(p.createdAt)])}
      />
      <Table
        title="Consents"
        head={["Conversation", "Granted", "Patient (folio)", "Recorded"]}
        rows={d.consents.map(({ c, folio }) => [c.conversationId, c.granted ? "yes" : "no", folio ?? "not linked", when(c.recordedAt)])}
      />
      <Table
        title="QuestionnaireResponses"
        head={["Patient (folio)", "Status", "Validation", "Answers", "Raw JSON"]}
        rows={d.responses.map(({ r, folio }) => [
          folio,
          r.completion === "completed" ? "completed" : "in-progress",
          VALIDATION[r.status],
          Array.isArray(r.items) ? r.items.length : 0,
          <a href={`/console/questionnaire-response/${r.id}`}>json</a>,
        ])}
      />
      <Table
        title="Appointments"
        head={["Patient (folio)", "Branch", "Start (America/Mexico_City)", "Calendar event"]}
        rows={d.appointments.map(({ a, folio, branch }) => [folio, branch, when(a.start), a.calendarEventId ?? ""])}
      />
      <Table
        title="Communications (Red flag Escalations)"
        head={["Severity", "Exact words", "Sent"]}
        rows={d.communications.map((m) => [m.severity, m.patientWords, when(m.sentAt)])}
      />
      <Table
        title="Audit events"
        head={["At", "Actor", "Action", "Resource", "Id", "Detail"]}
        rows={d.audits.map((e) => [when(e.at), e.actor, e.action, e.resourceType, e.resourceId, e.detail ? JSON.stringify(e.detail) : ""])}
      />
    </Layout>
  );
}
