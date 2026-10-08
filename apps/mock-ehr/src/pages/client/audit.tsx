import { and, count, desc, eq, sql } from "drizzle-orm";
import { db } from "../../db/client.js";
import { auditEvent } from "../../db/schema.js";
import { dateTime } from "./format.js";
import { ClientLayout, DataTable, Filters, PageHeader, Pill, Section } from "./ui.js";

const ACTORS: Record<string, string> = { "pokta-clinic": "Asistente de voz", console: "Consola de la clínica", "local-web": "Web local" };
const ACTIONS: Record<string, string> = { create: "Creación", read: "Consulta", search: "Búsqueda", update: "Actualización" };
const RESOURCES: Record<string, string> = {
  Patient: "Paciente",
  Appointment: "Cita",
  Consent: "Consentimiento",
  QuestionnaireResponse: "Respuestas de cuestionario",
  Questionnaire: "Cuestionario",
  Communication: "Alerta clínica",
  Task: "Solicitud de llamada",
  Location: "Sucursal",
  Organization: "Organización",
  Practitioner: "Médico",
  PractitionerRole: "Rol del médico",
  Console: "Consola",
  Overview: "Resumen",
  AuditEvent: "Bitácora",
};
const LIMIT = 200;
const actorLabel = (a: string) => ACTORS[a] ?? a;

// A compact "key: value" rendering of the jsonb detail; never the raw document.
function summarize(detail: unknown): string {
  if (detail === null || detail === undefined) return "";
  const text =
    typeof detail === "object"
      ? Object.entries(detail as Record<string, unknown>)
          .map(([k, v]) => `${k}: ${v !== null && typeof v === "object" ? JSON.stringify(v) : String(v)}`)
          .join(", ")
      : String(detail);
  return text.length > 100 ? `${text.slice(0, 100)}...` : text;
}

export async function loadAudit(query: Record<string, string | undefined>) {
  const actor = query.actor?.trim() || null;
  const accion = query.accion && query.accion in ACTIONS ? query.accion : null;
  const where = and(actor ? eq(auditEvent.actor, actor) : undefined, accion ? eq(auditEvent.action, accion) : undefined);

  const [rows, [total], actors] = await Promise.all([
    db.select().from(auditEvent).where(where).orderBy(desc(auditEvent.at)).limit(LIMIT),
    db.select({ n: count() }).from(auditEvent).where(where),
    db.select({ actor: auditEvent.actor, n: sql<number>`count(*)::int` }).from(auditEvent).groupBy(auditEvent.actor).orderBy(auditEvent.actor),
  ]);

  // Known actors first, in a stable order, then any others found in the table.
  const found = new Set(actors.map((a) => a.actor));
  if (actor) found.add(actor);
  const known = Object.keys(ACTORS).filter((a) => found.has(a));
  const actorList = [...known, ...[...found].filter((a) => !(a in ACTORS)).sort()];

  return {
    actor,
    accion,
    actorList,
    total: total.n,
    rows: rows.map((r) => ({
      id: r.id,
      at: r.at,
      actor: r.actor,
      action: r.action,
      resourceType: r.resourceType,
      resourceId: r.resourceId,
      detail: summarize(r.detail),
    })),
  };
}

export function AuditPage(props: Awaited<ReturnType<typeof loadAudit>>) {
  const { actor, accion, actorList, total, rows } = props;
  // Each chip keeps the other filter.
  const href = (a: string | null, ac: string | null) => {
    const params = new URLSearchParams();
    if (a) params.set("actor", a);
    if (ac) params.set("accion", ac);
    const qs = params.toString();
    return qs ? `/auditoria?${qs}` : "/auditoria";
  };
  return (
    <ClientLayout title="Bitácora de auditoría" active="auditoria">
      <PageHeader
        kicker="Cumplimiento"
        title="Bitácora de auditoría"
        lede="Cada acceso y cada cambio al expediente queda registrado y nunca se edita (NOM-024-SSA3-2012, 6.6.1)."
        meta={<Pill tone="brand" plain>{total} {total === 1 ? "evento" : "eventos"}</Pill>}
      />

      <Section id="eventos" title="Eventos registrados">
        <Filters
          label="Actor"
          options={[{ label: "Todos", href: href(null, accion), current: !actor }, ...actorList.map((a) => ({ label: actorLabel(a), href: href(a, accion), current: actor === a }))]}
        />
        <Filters
          label="Acción"
          options={[{ label: "Todas", href: href(actor, null), current: !accion }, ...Object.entries(ACTIONS).map(([k, label]) => ({ label, href: href(actor, k), current: accion === k }))]}
        />
        <DataTable
          caption={`${total > rows.length ? `Los ${LIMIT} eventos más recientes de ${total} que coinciden` : "Eventos que coinciden, del más reciente al más antiguo"}. Fechas y horas en America/Mexico_City.`}
          head={["Fecha y hora", "Actor", "Acción", "Recurso", "Identificador", "Detalle"]}
          empty="No hay eventos con estos filtros."
          rows={rows.map((r) => [
            dateTime(r.at),
            actorLabel(r.actor),
            <Pill tone="neutral" plain>{ACTIONS[r.action] ?? r.action}</Pill>,
            RESOURCES[r.resourceType] ?? r.resourceType,
            r.resourceId ? <span class="mono">{r.resourceId.slice(0, 8)}</span> : <span class="muted">General</span>,
            r.detail ? <span class="muted small">{r.detail}</span> : <span class="muted small">Sin detalle</span>,
          ])}
        />
      </Section>
    </ClientLayout>
  );
}
