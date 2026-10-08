import { and, asc, count, desc, eq, gte, isNotNull, ne, inArray } from "drizzle-orm";
import { db } from "../../db/client.js";
import { appointment, auditEvent, callbackTask, communication, establishment, intake, patient, practitioner, practitionerRole } from "../../db/schema.js";
import { callbackReason, dateTime, fullName, horario, longDate, SEVERITY, time, dayKey, type Tone } from "./format.js";
import { Card, Cell, DataTable, Empty, KeyValue, PageHeader, Pill, Section, Stat, Stats, ClientLayout } from "./ui.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const ATTENTION_CAP = 8;
// Emergencies lead the list but never crowd out the rest; the full list is one click away on /alertas.
const EMERGENCY_CAP = 3;
const INTAKE_CAP = 3;

// What the voice assistant did, in the administrator's words. Keys are "action:ResourceType".
const ACTIVITY: Record<string, string> = {
  "create:Patient": "Registró un paciente",
  "update:Patient": "Actualizó los datos de un paciente",
  "create:Appointment": "Agendó una cita",
  "update:Appointment": "Actualizó una cita",
  "create:Consent": "Registró un consentimiento",
  "update:Consent": "Actualizó un consentimiento",
  "create:QuestionnaireResponse": "Guardó respuestas de pre-consulta",
  "update:QuestionnaireResponse": "Guardó respuestas de pre-consulta",
  "create:Communication": "Escaló una alerta clínica",
  "create:Task": "Registró una solicitud de llamada",
  "update:Task": "Actualizó una solicitud de llamada",
};
const activityLabel = (action: string, resourceType: string) =>
  ACTIVITY[`${action}:${resourceType}`] ?? `${action === "create" ? "Creó" : "Actualizó"} un registro (${resourceType})`;

type AttentionItem = { at: Date; pill: { tone: Tone; label: string }; text: string; link: { label: string; href: string } };

export async function loadOverview() {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * DAY_MS);
  const upcoming = and(eq(appointment.status, "booked"), gte(appointment.start, now));
  const pendingIntake = and(eq(intake.completion, "completed"), eq(intake.status, "pending_validation"));
  const openCallbacks = eq(callbackTask.status, "requested");

  const [
    [patients],
    [upcomingCount],
    [intakeCount],
    [callbackCount],
    [alertCount],
    emergencies,
    nextAppointments,
    pendingIntakes,
    openCallbackRows,
    branches,
    roles,
    upcomingByBranch,
    callbacksByBranch,
    activity,
  ] = await Promise.all([
    db.select({ n: count() }).from(patient),
    db.select({ n: count() }).from(appointment).where(upcoming),
    db.select({ n: count() }).from(intake).where(pendingIntake),
    db.select({ n: count() }).from(callbackTask).where(openCallbacks),
    db.select({ n: count() }).from(communication),
    db
      .select({ id: communication.id, sentAt: communication.sentAt, words: communication.patientWords, patientId: communication.patientId, severity: communication.severity })
      .from(communication)
      .where(and(eq(communication.severity, "emergencia"), gte(communication.sentAt, weekAgo)))
      .orderBy(desc(communication.sentAt)),
    db
      .select({ id: appointment.id, start: appointment.start, patientId: patient.id, nombre: patient.nombre, primerApellido: patient.primerApellido, segundoApellido: patient.segundoApellido, branch: establishment.nombre, pNombre: practitioner.nombre, pApellido: practitioner.primerApellido })
      .from(appointment)
      .innerJoin(patient, eq(appointment.patientId, patient.id))
      .innerJoin(establishment, eq(appointment.establishmentId, establishment.id))
      .innerJoin(practitioner, eq(appointment.practitionerId, practitioner.id))
      .where(upcoming)
      .orderBy(asc(appointment.start))
      .limit(6),
    db
      .select({ updatedAt: intake.updatedAt, patientId: patient.id, nombre: patient.nombre, primerApellido: patient.primerApellido, segundoApellido: patient.segundoApellido })
      .from(intake)
      .innerJoin(patient, eq(intake.patientId, patient.id))
      .where(pendingIntake)
      .orderBy(desc(intake.updatedAt))
      .limit(INTAKE_CAP),
    db
      .select({ authoredAt: callbackTask.authoredAt, reason: callbackTask.reason, patientId: patient.id, nombre: patient.nombre, primerApellido: patient.primerApellido, segundoApellido: patient.segundoApellido })
      .from(callbackTask)
      .leftJoin(patient, eq(callbackTask.patientId, patient.id))
      .where(openCallbacks)
      .orderBy(desc(callbackTask.authoredAt))
      .limit(ATTENTION_CAP),
    db.select().from(establishment).where(isNotNull(establishment.codigo)).orderBy(asc(establishment.createdAt)),
    db
      .select({ establishmentId: practitionerRole.establishmentId, nombre: practitioner.nombre, primerApellido: practitioner.primerApellido, segundoApellido: practitioner.segundoApellido, especialidad: practitioner.especialidad })
      .from(practitionerRole)
      .innerJoin(practitioner, eq(practitionerRole.practitionerId, practitioner.id)),
    db.select({ id: appointment.establishmentId, n: count() }).from(appointment).where(upcoming).groupBy(appointment.establishmentId),
    db.select({ id: callbackTask.establishmentId, n: count() }).from(callbackTask).where(openCallbacks).groupBy(callbackTask.establishmentId),
    db
      .select({ id: auditEvent.id, at: auditEvent.at, actor: auditEvent.actor, action: auditEvent.action, resourceType: auditEvent.resourceType })
      .from(auditEvent)
      .where(and(inArray(auditEvent.action, ["create", "update"]), ne(auditEvent.actor, "console")))
      .orderBy(desc(auditEvent.at))
      .limit(8),
  ]);

  // Emergencies first, then intakes, then callbacks; each group newest first.
  const attention: AttentionItem[] = [
    ...emergencies.slice(0, EMERGENCY_CAP).map((e): AttentionItem => ({
      at: e.sentAt,
      pill: { tone: "spot", label: SEVERITY.emergencia.label },
      text: `Alerta clínica: "${e.words.length > 90 ? `${e.words.slice(0, 90)}...` : e.words}"`,
      link: { label: "Ver alertas", href: "/alertas?gravedad=emergencia" },
    })),
    ...pendingIntakes.map((i): AttentionItem => ({
      at: i.updatedAt,
      pill: { tone: "attn", label: "Pre-consulta" },
      text: `${fullName(i)} completó su pre-consulta y espera revisión médica.`,
      link: { label: `Revisar a ${i.nombre}`, href: `/pacientes/${i.patientId}` },
    })),
    ...openCallbackRows.map((c): AttentionItem => ({
      at: c.authoredAt,
      pill: { tone: "attn", label: "Llamada" },
      text: `${c.patientId ? fullName(c as { nombre: string; primerApellido: string }) : "Persona sin identificar"} pidió que la clínica le llame: ${callbackReason(c.reason)}.`,
      link: c.patientId ? { label: `Ver paciente ${c.nombre}`, href: `/pacientes/${c.patientId}` } : { label: "Ver llamadas", href: "/llamadas" },
    })),
  ].slice(0, ATTENTION_CAP);

  const countOf = (rows: { id: string | null; n: number }[], id: string) => rows.find((r) => r.id === id)?.n ?? 0;

  return {
    now,
    totals: {
      patients: patients.n,
      upcoming: upcomingCount.n,
      intakes: intakeCount.n,
      callbacks: callbackCount.n,
      alerts: alertCount.n,
      emergencies: emergencies.length,
    },
    nextAppointments: nextAppointments.map((a) => ({ ...a, patient: fullName(a), practitioner: `${a.pNombre} ${a.pApellido}` })),
    attention,
    branches: branches.map((b) => ({
      id: b.id,
      nombre: b.nombre,
      domicilio: b.domicilio,
      horarios: (b.horarios ?? []).map(horario),
      practitioners: roles.filter((r) => r.establishmentId === b.id).map((r) => `${fullName(r)} (${r.especialidad})`),
      upcoming: countOf(upcomingByBranch, b.id),
      callbacks: countOf(callbacksByBranch, b.id),
    })),
    activity: activity.map((a) => ({ id: a.id, at: a.at, text: activityLabel(a.action, a.resourceType) })),
  };
}

export function OverviewPage(props: Awaited<ReturnType<typeof loadOverview>>) {
  const { now, totals, nextAppointments, attention, branches, activity } = props;
  const today = dayKey(now);
  return (
    <ClientLayout title="Resumen de la red" active="inicio">
      <PageHeader
        kicker="Grupo Médico Articular"
        title="Resumen de la red"
        lede={`${longDate(now)}. El asistente de voz atiende las llamadas de las tres sucursales: registra pacientes, agenda citas, reúne la pre-consulta y avisa al médico cuando detecta una señal de alarma.`}
      />

      <Section id="indicadores" title="Indicadores">
        <Stats>
          <Stat label="Pacientes registrados" value={totals.patients} href="/pacientes" />
          <Stat label="Citas próximas" value={totals.upcoming} href="/citas" />
          <Stat label="Pre-consultas por revisar" value={totals.intakes} hint="Esperan revisión médica" href="/pacientes?revision=pendiente" tone={totals.intakes > 0 ? "attn" : undefined} />
          <Stat label="Llamadas por devolver" value={totals.callbacks} hint="Solicitudes abiertas" href="/llamadas" tone={totals.callbacks > 0 ? "attn" : undefined} />
          <Stat
            label="Alertas clínicas"
            value={totals.alerts}
            hint={totals.emergencies > 0 ? `${totals.emergencies} ${totals.emergencies === 1 ? "emergencia" : "emergencias"} en 7 días` : "Sin emergencias en 7 días"}
            href="/alertas"
            tone={totals.emergencies > 0 ? "spot" : undefined}
          />
        </Stats>
      </Section>

      <div class="grid-2">
        <Section id="proximas-citas" title="Próximas citas" aside={<a href="/citas">Ver todas las citas</a>}>
          <DataTable
            caption="Las seis citas agendadas más cercanas. Horarios en America/Mexico_City."
            head={["Cuándo", "Paciente", "Sucursal y médico"]}
            empty="No hay citas próximas agendadas."
            rows={nextAppointments.map((a) => [
              <Cell primary={dayKey(a.start) === today ? "Hoy" : dateTime(a.start).split(",")[0]} sub={time(a.start)} />,
              <Cell primary={a.patient} href={`/pacientes/${a.patientId}`} />,
              <Cell primary={a.branch} sub={a.practitioner} />,
            ])}
          />
        </Section>

        <Section id="atencion" title="Requiere atención" description="Emergencias recientes, pre-consultas y llamadas pendientes.">
          {attention.length === 0 ? (
            <Empty>Nada pendiente por ahora. Todo está al día.</Empty>
          ) : (
            <DataTable
              caption="Elementos ordenados por prioridad: emergencias, pre-consultas y llamadas."
              head={["Tipo", "Detalle", "Enlace"]}
              empty=""
              rows={attention.map((i) => [
                <Pill tone={i.pill.tone}>{i.pill.label}</Pill>,
                <Cell primary={i.text} sub={dateTime(i.at)} />,
                <a href={i.link.href}>{i.link.label}</a>,
              ])}
            />
          )}
        </Section>
      </div>

      <Section id="sucursales" title="Sucursales" aside={<a href="/sucursales">Ver sucursales</a>}>
        <div class="grid-3">
          {branches.map((b) => (
            <Card>
              <div class="stack">
                <div>
                  <h3>{b.nombre}</h3>
                  <p class="muted small">{b.domicilio}</p>
                </div>
                <KeyValue
                  items={[
                    ["Horario", b.horarios.length ? b.horarios.map((h) => <div>{h}</div>) : null],
                    ["Médico", b.practitioners.length ? b.practitioners.map((p) => <div>{p}</div>) : null],
                    ["Citas próximas", b.upcoming],
                    ["Llamadas por devolver", b.callbacks],
                  ]}
                />
              </div>
            </Card>
          ))}
        </div>
      </Section>

      <Section id="actividad" title="Actividad reciente del asistente de voz" aside={<a href="/auditoria">Ver bitácora completa</a>}>
        <DataTable
          caption="Últimos cambios hechos por el asistente de voz. Horarios en America/Mexico_City."
          head={["Fecha y hora", "Qué hizo"]}
          empty="El asistente de voz aún no ha registrado actividad."
          rows={activity.map((a) => [dateTime(a.at), a.text])}
        />
      </Section>
    </ClientLayout>
  );
}
