import { count, desc, eq, isNull } from "drizzle-orm";
import { db } from "../../db/client.js";
import { communication, patient, practitioner } from "../../db/schema.js";
import { ClientLayout, Card, Empty, Filters, KeyValue, PageHeader, Pill, Section, Stat, Stats } from "./ui.js";
import { dateTime, fullName, SEVERITY, shortRef } from "./format.js";

type Gravedad = "emergencia" | "urgencia";

export async function loadAlerts(query: Record<string, string | undefined>) {
  const gravedad: Gravedad | null = query.gravedad === "emergencia" || query.gravedad === "urgencia" ? query.gravedad : null;

  const [rows, bySeverity] = await Promise.all([
    db
      .select({
        id: communication.id,
        severity: communication.severity,
        sentAt: communication.sentAt,
        words: communication.patientWords,
        instruction: communication.instruction,
        conversationId: communication.conversationId,
        patientId: communication.patientId,
        folio: patient.folio,
        pNombre: patient.nombre,
        pPrimer: patient.primerApellido,
        pSegundo: patient.segundoApellido,
        docNombre: practitioner.nombre,
        docPrimer: practitioner.primerApellido,
        docSegundo: practitioner.segundoApellido,
      })
      .from(communication)
      .innerJoin(practitioner, eq(communication.practitionerId, practitioner.id))
      .leftJoin(patient, eq(communication.patientId, patient.id))
      .where(gravedad ? eq(communication.severity, gravedad) : undefined)
      .orderBy(desc(communication.sentAt)),
    db.select({ severity: communication.severity, n: count() }).from(communication).groupBy(communication.severity),
  ]);

  const n = (s: Gravedad) => bySeverity.find((r) => r.severity === s)?.n ?? 0;
  const [{ n: unidentified }] = await db.select({ n: count() }).from(communication).where(isNull(communication.patientId));
  return {
    gravedad,
    totals: { unidentified, all: n("emergencia") + n("urgencia"), emergencia: n("emergencia"), urgencia: n("urgencia") },
    rows: rows.map((r) => ({
      id: r.id,
      severity: r.severity,
      sentAt: r.sentAt,
      words: r.words,
      instruction: r.instruction,
      conversationId: r.conversationId,
      doctor: fullName({ nombre: r.docNombre, primerApellido: r.docPrimer, segundoApellido: r.docSegundo }),
      patient: r.patientId ? { id: r.patientId, folio: r.folio, name: fullName({ nombre: r.pNombre ?? "", primerApellido: r.pPrimer, segundoApellido: r.pSegundo }) } : null,
    })),
  };
}

export function AlertsPage(props: Awaited<ReturnType<typeof loadAlerts>>) {
  const { gravedad, totals, rows } = props;
  const option = (label: string, value: Gravedad | null) => ({ label, href: value ? `/alertas?gravedad=${value}` : "/alertas", current: gravedad === value });
  return (
    <ClientLayout title="Alertas clínicas" active="alertas">
      <PageHeader
        kicker="Seguridad del paciente"
        title="Alertas clínicas"
        lede="Cuando quien llama describe una señal de alarma, el asistente no diagnostica: le indica qué hacer (llamar al 911 o acudir a urgencias) y avisa al médico de la sucursal. Las palabras exactas se conservan tal como se dijeron."
      />

      <Stats>
        <Stat label="Total de alertas" value={totals.all} />
        <Stat label="Emergencias" value={totals.emergencia} hint="Llamar al 911" tone="spot" />
        <Stat label="Urgencias" value={totals.urgencia} hint="Acudir a urgencias" tone="attn" />
        <Stat label="Sin paciente identificado" value={totals.unidentified} hint="Antes de identificar a quien llama" />
      </Stats>

      <Section id="lista" title="Historial de alertas">
        <Filters label="Gravedad" options={[option("Todas", null), option("Emergencias", "emergencia"), option("Urgencias", "urgencia")]} />
        {rows.length === 0 ? (
          <Empty>No hay alertas clínicas con este filtro.</Empty>
        ) : (
          <div class="stack">
            {rows.map((r) => (
              <Card>
                  <div class="stack">
                    <div class="row">
                      <Pill tone={SEVERITY[r.severity].tone}>{SEVERITY[r.severity].label}</Pill>
                      <span class="muted small">{SEVERITY[r.severity].meaning}</span>
                      <span class="soft small">{dateTime(r.sentAt)}</span>
                    </div>
                    <div>
                      <h3 class="kicker">Palabras del paciente</h3>
                      <blockquote class="words">{r.words}</blockquote>
                    </div>
                    <KeyValue
                      items={[
                        ["Indicación dada", r.instruction],
                        ["Médico notificado", r.doctor],
                        [
                          "Paciente",
                          r.patient ? (
                            <a href={`/pacientes/${r.patient.id}`}>
                              {r.patient.name} <span class="mono muted">({r.patient.folio})</span>
                            </a>
                          ) : (
                            <span class="muted">Sin identificar (la alerta ocurrió antes de identificar a quien llama)</span>
                          ),
                        ],
                        ["Conversación", <span class="mono">{shortRef(r.conversationId)}</span>],
                      ]}
                    />
                  </div>
                </Card>
            ))}
          </div>
        )}
      </Section>
    </ClientLayout>
  );
}
