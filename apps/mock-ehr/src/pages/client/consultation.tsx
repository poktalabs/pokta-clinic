import { SEXO, SEVERITY, ageFrom, dateTime, fullName } from "./format.js";
import { ClinicalSummary, confirmPrompts, parseIntakeItems } from "./clinical-summary.js";
import { patientMeta } from "./patient.js";
import type { loadPatient } from "./patient.js";
import { Breadcrumbs, Card, ClientLayout, Empty, KeyValue, Notice, PageHeader, Pill, Section } from "./ui.js";

type Data = NonNullable<Awaited<ReturnType<typeof loadPatient>>>;

// A read-only mock: it shows how the clinician would open the first visit from the pre-consultation summary.
export function ConsultationPage(props: Data) {
  const { patient: p, branch, intake, definition, alerts, nextAppointment } = props;
  const name = fullName(p);
  const age = ageFrom(p.fechaNacimiento);
  const lede = [
    age !== null ? `${age} años` : null,
    p.sexo ? SEXO[p.sexo] : null,
    branch,
    nextAppointment ? `Cita: ${dateTime(nextAppointment.start)} con ${nextAppointment.practitionerName}` : "Sin cita próxima",
  ]
    .filter(Boolean)
    .join(", ");
  const prompts = intake ? confirmPrompts(parseIntakeItems(intake.items), alerts.length) : [];
  return (
    <ClientLayout title={`Consulta de ${name}`} active="pacientes">
      <Breadcrumbs items={[{ label: "Pacientes", href: "/pacientes" }, { label: name, href: `/pacientes/${p.id}` }, { label: "Consulta" }]} />
      <Notice tone="brand" title="Vista de demostración.">
        Esta maqueta muestra cómo el médico iniciaría la primera consulta a partir del resumen de pre-consulta. No registra notas ni modifica el expediente.
      </Notice>
      <PageHeader kicker="Consulta de primera vez" title={name} lede={lede} meta={patientMeta(props)} />

      {intake ? (
        <div class="grid-2">
          <Section id="resumen" title="Resumen de pre-consulta" description="Referido por el paciente al asistente de voz.">
            <ClinicalSummary intake={intake} definition={definition} />
          </Section>
          <div class="stack">
            <Section id="confirmar" title="Puntos a confirmar en consulta">
              <Card>
                {prompts.length ? (
                  <ul>
                    {prompts.map((t) => (
                      <li>{t}</li>
                    ))}
                  </ul>
                ) : (
                  <Empty>Las respuestas no generan puntos adicionales a confirmar.</Empty>
                )}
              </Card>
            </Section>
            <Section id="alertas" title="Alertas de la llamada">
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
                        <p class="small muted">Médico notificado: {a.practitionerName}</p>
                      </div>
                    </Card>
                  ))}
                </div>
              ) : (
                <Empty>No se registraron alertas durante las llamadas del paciente.</Empty>
              )}
            </Section>
            <Section id="nota" title="Nota clínica">
              <div class="panel">
                <p>
                  La nota clínica la redacta y firma el médico en su propio expediente (NOM-004, numeral 5.10). PoktaClinic no genera ni almacena notas médicas.
                </p>
              </div>
            </Section>
          </div>
        </div>
      ) : (
        <Section id="sin-cuestionario" title="Resumen de pre-consulta">
          <Empty>El paciente aún no responde el cuestionario de primera vez.</Empty>
          <Card>
            <KeyValue
              items={[
                ["Folio", <span class="mono">{p.folio}</span>],
                ["Edad y sexo", [age !== null ? `${age} años` : null, p.sexo ? SEXO[p.sexo] : null].filter(Boolean).join(", ") || null],
                ["Sucursal", branch],
                ["Próxima cita", nextAppointment ? `${dateTime(nextAppointment.start)} con ${nextAppointment.practitionerName}` : null],
              ]}
            />
          </Card>
          <a href={`/pacientes/${p.id}`}>Volver al expediente</a>
        </Section>
      )}
    </ClientLayout>
  );
}
