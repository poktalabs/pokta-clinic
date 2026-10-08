import { asc, desc, eq, inArray, or } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { db } from "../../db/client.js";
import { appointment, callbackTask, communication, consent, establishment, intake, patient, practitioner, questionnaire } from "../../db/schema.js";
import { ClinicalSummary, PreConsultaPill } from "./clinical-summary.js";
import {
  APPOINTMENT_STATUS,
  CALLBACK_STATUS,
  CONSENT_METHOD,
  CONSENT_TIPO,
  COMPLETION,
  SEVERITY,
  SEXO,
  VALIDATION,
  ageFrom,
  birthDate,
  callbackReason,
  dateOnly,
  dateTime,
  fullName,
  maskPhone,
  shortRef,
} from "./format.js";
import { Breadcrumbs, Card, Cell, ClientLayout, DataTable, Empty, KeyValue, PageHeader, Pill, Section } from "./ui.js";

// Returns null when the Patient does not exist. `intake` is the latest QuestionnaireResponse (or null).
export async function loadPatient(id: string) {
  const [found] = await db
    .select({ p: patient, branch: establishment.nombre })
    .from(patient)
    .innerJoin(establishment, eq(establishment.id, patient.establishmentId))
    .where(eq(patient.id, id));
  if (!found) return null;

  const intakes = await db
    .select({ i: intake, validatorNombre: practitioner.nombre, validatorApellido: practitioner.primerApellido, validatorApellido2: practitioner.segundoApellido })
    .from(intake)
    .leftJoin(practitioner, eq(practitioner.id, intake.validatedBy))
    .where(eq(intake.patientId, id))
    .orderBy(desc(intake.createdAt));
  const intakeRows = intakes.map(({ i, validatorNombre, validatorApellido, validatorApellido2 }) => ({
    ...i,
    validatorName: validatorNombre ? `${fullName({ nombre: validatorNombre, primerApellido: validatorApellido, segundoApellido: validatorApellido2 })}` : null,
  }));
  const latest = intakeRows[0] ?? null;
  const definition = latest ? ((await db.select({ items: questionnaire.items }).from(questionnaire).where(eq(questionnaire.id, latest.questionnaireId)))[0]?.items ?? null) : null;

  const appointments = await db
    .select({ a: appointment, branch: establishment.nombre, pNombre: practitioner.nombre, pApellido: practitioner.primerApellido, pApellido2: practitioner.segundoApellido })
    .from(appointment)
    .innerJoin(establishment, eq(establishment.id, appointment.establishmentId))
    .innerJoin(practitioner, eq(practitioner.id, appointment.practitionerId))
    .where(eq(appointment.patientId, id))
    .orderBy(desc(appointment.start));
  const callbacks = await db
    .select({ t: callbackTask, branch: establishment.nombre })
    .from(callbackTask)
    .leftJoin(establishment, eq(establishment.id, callbackTask.establishmentId))
    .where(eq(callbackTask.patientId, id))
    .orderBy(desc(callbackTask.authoredAt));

  // Consents and red flags can be recorded before the caller is identified (patientId null), so they also
  // belong to the patient through the conversations that patient had.
  const conversationIds = [
    ...new Set([
      ...intakeRows.map((i) => i.conversationId),
      ...appointments.flatMap((a) => (a.a.conversationId ? [a.a.conversationId] : [])),
      ...callbacks.map((c) => c.t.conversationId),
    ]),
  ];
  const sameOwner = (patientCol: AnyPgColumn, conversationCol: AnyPgColumn) =>
    conversationIds.length ? or(eq(patientCol, id), inArray(conversationCol, conversationIds)) : eq(patientCol, id);

  const alerts = await db
    .select({ c: communication, pNombre: practitioner.nombre, pApellido: practitioner.primerApellido, pApellido2: practitioner.segundoApellido })
    .from(communication)
    .innerJoin(practitioner, eq(practitioner.id, communication.practitionerId))
    .where(sameOwner(communication.patientId, communication.conversationId))
    .orderBy(desc(communication.sentAt));
  const consents = await db.select().from(consent).where(sameOwner(consent.patientId, consent.conversationId)).orderBy(desc(consent.recordedAt));

  const doctor = (n: { pNombre: string; pApellido: string; pApellido2: string | null }) =>
    `${fullName({ nombre: n.pNombre, primerApellido: n.pApellido, segundoApellido: n.pApellido2 })}`;
  const now = Date.now();
  const appointmentRows = appointments.map((r) => ({ ...r.a, branch: r.branch, practitionerName: doctor(r) }));
  const nextAppointment = [...appointmentRows].reverse().find((a) => a.status === "booked" && a.start.getTime() >= now) ?? null;

  return {
    patient: found.p,
    branch: found.branch,
    intake: latest,
    definition,
    intakes: intakeRows,
    appointments: appointmentRows,
    nextAppointment,
    callbacks: callbacks.map((r) => ({ ...r.t, branch: r.branch })),
    consents,
    alerts: alerts.map((r) => ({ ...r.c, practitionerName: doctor(r) })),
  };
}

type Data = NonNullable<Awaited<ReturnType<typeof loadPatient>>>;

/** Pills for the page header: pre-consulta status and, when present, the strongest red flag. */
export function patientMeta(data: Data) {
  const emergencia = data.alerts.some((a) => a.severity === "emergencia");
  return (
    <>
      <PreConsultaPill intake={data.intake} />
      {data.alerts.length ? (
        <Pill tone={emergencia ? "spot" : "attn"}>{data.alerts.length === 1 ? "1 alerta clínica" : `${data.alerts.length} alertas clínicas`}</Pill>
      ) : null}
    </>
  );
}

export function PatientPage(props: Data) {
  const { patient: p, branch, intake: latest, intakes, appointments, callbacks, consents, alerts } = props;
  const name = fullName(p);
  const age = ageFrom(p.fechaNacimiento);
  return (
    <ClientLayout title={name} active="pacientes">
      <Breadcrumbs items={[{ label: "Pacientes", href: "/pacientes" }, { label: name }]} />
      <PageHeader kicker={`Expediente ${p.folio}`} title={name} lede={`Paciente de ${branch} desde ${dateOnly(p.createdAt)}`} meta={patientMeta(props)} />

      <Section
        id="preconsulta"
        title="Resumen de pre-consulta"
        description="Lo que el paciente refirió al asistente de voz en el cuestionario de primera vez."
        aside={latest ? <a href={`/pacientes/${p.id}/consulta`}>Abrir vista de consulta</a> : undefined}
      >
        {latest ? <ClinicalSummary intake={latest} definition={props.definition} /> : <Empty>El paciente aún no responde el cuestionario de primera vez.</Empty>}
        {intakes.length > 1 ? (
          <DataTable
            caption="Todos los cuestionarios del paciente. El resumen de arriba corresponde al más reciente."
            head={["Fecha", "Llenado", "Revisión médica"]}
            empty=""
            rows={intakes.map((i) => [
              dateTime(i.createdAt),
              <Pill tone={COMPLETION[i.completion].tone}>{COMPLETION[i.completion].label}</Pill>,
              <Pill tone={VALIDATION[i.status].tone}>{VALIDATION[i.status].label}</Pill>,
            ])}
          />
        ) : null}
      </Section>

      <Section id="datos" title="Datos del paciente">
        <Card>
          <KeyValue
            items={[
              ["Folio", <span class="mono">{p.folio}</span>],
              ["Fecha de nacimiento", p.fechaNacimiento ? `${birthDate(p.fechaNacimiento)}${age !== null ? ` (${age} años)` : ""}` : null],
              ["Sexo", p.sexo ? SEXO[p.sexo] : null],
              ["Teléfono", <span class="mono">{maskPhone(p.telefono)}</span>],
              ["Correo electrónico", p.email],
              ["Domicilio", p.domicilio ? `${p.domicilio}${p.codigoPostal ? `, C.P. ${p.codigoPostal}` : ""}` : null],
              ["Contacto de emergencia", p.contactoEmergenciaNombre ? `${p.contactoEmergenciaNombre}${p.contactoEmergenciaTelefono ? `, ${maskPhone(p.contactoEmergenciaTelefono)}` : ""}` : null],
              ["Aseguradora y póliza", p.aseguradora ? `${p.aseguradora}${p.poliza ? `, póliza ${p.poliza}` : ""}` : null],
              // The CURP value itself is never printed.
              ["CURP", p.curp ? (p.curpValidada ? "Registrada y validada" : "Registrada, sin validar ante RENAPO") : null],
              ["Sucursal", branch],
              ["Fecha de registro", dateTime(p.createdAt)],
              ["Conservación del expediente hasta", p.retainUntil ? birthDate(p.retainUntil) : null],
            ]}
          />
        </Card>
      </Section>

      <Section
        id="consentimientos"
        title="Consentimientos"
        description="El asistente registra el consentimiento de viva voz, conforme a la LFPDPPP, antes de recabar datos sensibles."
      >
        <DataTable
          caption="Consentimientos del paciente, del más reciente al más antiguo."
          head={["Tipo", "Decisión", "Medio", "Registrado", "Conversación"]}
          empty="El paciente no tiene consentimientos registrados."
          rows={consents.map((c) => [
            CONSENT_TIPO[c.tipo] ?? c.tipo,
            c.granted ? <Pill tone="ok">Otorgado</Pill> : <Pill tone="neutral">No otorgado</Pill>,
            CONSENT_METHOD[c.method] ?? c.method,
            <Cell primary={dateTime(c.recordedAt)} sub={c.recordedAt.toLocaleTimeString("es-MX", { timeZone: "America/Mexico_City", hour12: false })} />,
            <span class="mono">{shortRef(c.conversationId)}</span>,
          ])}
        />
      </Section>

      <Section id="alertas" title="Alertas clínicas" description="Señales de alarma que el paciente mencionó en una llamada y que se escalaron a un médico.">
        {alerts.length ? (
          <div class="stack">
            {alerts.map((a) => (
              <Card>
                <div class="stack">
                  <div class="row">
                    <Pill tone={SEVERITY[a.severity].tone}>{SEVERITY[a.severity].label}</Pill>
                    <span class="small muted">{dateTime(a.sentAt)}</span>
                  </div>
                  <blockquote class="words">{a.patientWords}</blockquote>
                  <KeyValue items={[["Indicación al paciente", a.instruction ?? SEVERITY[a.severity].meaning], ["Médico notificado", a.practitionerName]]} />
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Empty>El paciente no ha registrado alertas clínicas.</Empty>
        )}
      </Section>

      <Section id="citas" title="Citas">
        <DataTable
          caption="Citas del paciente, de la más reciente a la más antigua."
          head={["Fecha y hora", "Sucursal", "Médico", "Estado", "Motivo"]}
          empty="El paciente no tiene citas registradas."
          rows={appointments.map((a) => [
            dateTime(a.start),
            a.branch,
            a.practitionerName,
            <Pill tone={APPOINTMENT_STATUS[a.status].tone}>{APPOINTMENT_STATUS[a.status].label}</Pill>,
            a.description ?? <span class="muted">Sin descripción</span>,
          ])}
        />
      </Section>

      <Section id="llamadas" title="Llamadas pendientes" description="Solicitudes de devolución de llamada cuando el paciente no agendó.">
        <DataTable
          caption="Solicitudes de llamada del paciente, de la más reciente a la más antigua."
          head={["Estado", "Disponibilidad", "Motivo", "Sucursal", "Solicitada"]}
          empty="El paciente no tiene solicitudes de llamada."
          rows={callbacks.map((c) => [
            <Pill tone={CALLBACK_STATUS[c.status].tone}>{CALLBACK_STATUS[c.status].label}</Pill>,
            c.availability,
            callbackReason(c.reason),
            c.branch ?? "Cualquier sucursal",
            dateTime(c.authoredAt),
          ])}
        />
      </Section>
    </ClientLayout>
  );
}
