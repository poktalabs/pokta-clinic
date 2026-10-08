import { desc, eq, isNotNull } from "drizzle-orm";
import { db } from "../../db/client.js";
import { callbackTask, establishment, patient } from "../../db/schema.js";
import { CALLBACK_STATUS, callbackReason, dateTime, fullName, maskPhone } from "./format.js";
import { Breadcrumbs, Cell, ClientLayout, DataTable, Filters, Notice, PageHeader, Pill, Section, Stat, Stats } from "./ui.js";

const ESTADOS = { "por-llamar": "requested", atendida: "completed", cancelada: "cancelled" } as const;
type Estado = keyof typeof ESTADOS;
const SIN_PREFERENCIA = "sin-preferencia";

type Params = { estado?: string; sucursal?: string };
// Filters keep each other's values, so every href is rebuilt from the full set of active params.
const href = (p: Params) => {
  const qs = Object.entries(p)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`)
    .join("&");
  return qs ? `/llamadas?${qs}` : "/llamadas";
};

export async function loadCallbacks(query: Record<string, string | undefined>) {
  const [branches, rows] = await Promise.all([
    db.select({ codigo: establishment.codigo, nombre: establishment.nombre }).from(establishment).where(isNotNull(establishment.codigo)).orderBy(establishment.nombre),
    db
      .select({
        t: callbackTask,
        patientId: patient.id,
        folio: patient.folio,
        nombre: patient.nombre,
        primerApellido: patient.primerApellido,
        segundoApellido: patient.segundoApellido,
        telefono: patient.telefono,
        branchCodigo: establishment.codigo,
        branch: establishment.nombre,
      })
      .from(callbackTask)
      .leftJoin(patient, eq(callbackTask.patientId, patient.id))
      .leftJoin(establishment, eq(callbackTask.establishmentId, establishment.id))
      .orderBy(desc(callbackTask.authoredAt)),
  ]);

  // Unknown query values mean "no filter".
  const estado = query.estado && query.estado in ESTADOS ? (query.estado as Estado) : undefined;
  const sucursal = query.sucursal === SIN_PREFERENCIA || branches.some((b) => b.codigo === query.sucursal) ? query.sucursal : undefined;

  const items = rows.map((r) => ({
    id: r.t.id,
    status: r.t.status,
    availability: r.t.availability,
    reason: callbackReason(r.t.reason),
    description: r.t.description,
    authoredAt: r.t.authoredAt,
    branchId: r.t.establishmentId,
    branchCodigo: r.branchCodigo,
    branch: r.branch,
    patient: r.patientId
      ? {
          id: r.patientId,
          folio: r.folio as string,
          name: fullName({ nombre: r.nombre as string, primerApellido: r.primerApellido, segundoApellido: r.segundoApellido }),
          phone: maskPhone(r.telefono),
        }
      : null,
  }));

  const stats = {
    pending: items.filter((i) => i.status === "requested").length,
    completed: items.filter((i) => i.status === "completed").length,
    cancelled: items.filter((i) => i.status === "cancelled").length,
    unassigned: items.filter((i) => !i.branchId).length,
  };

  // Requested first, then the most recent request first (the query is already authoredAt desc and the sort is stable).
  const shown = items
    .filter((i) => (!estado || i.status === ESTADOS[estado]) && (!sucursal || (sucursal === SIN_PREFERENCIA ? !i.branchId : i.branchCodigo === sucursal)))
    .sort((a, b) => Number(b.status === "requested") - Number(a.status === "requested"));

  return {
    stats,
    branches: branches.map((b) => ({ codigo: b.codigo as string, nombre: b.nombre })),
    filters: { estado, sucursal },
    shown,
  };
}

type Data = Awaited<ReturnType<typeof loadCallbacks>>;

export function CallbacksPage(props: Data) {
  const { estado, sucursal } = props.filters;
  const cur: Params = { estado, sucursal };
  const filtered = !!(estado || sucursal);
  return (
    <ClientLayout title="Llamadas pendientes" active="llamadas">
      <Breadcrumbs items={[{ label: "Inicio", href: "/" }, { label: "Llamadas pendientes" }]} />
      <PageHeader
        kicker="Recepción"
        title="Llamadas pendientes"
        lede="Cuando quien llama no agenda una cita, el asistente registra cuándo se le puede localizar y por qué, y la recepción de la sucursal le devuelve la llamada."
        meta={<Pill tone="brand" plain>{`${props.shown.length} ${props.shown.length === 1 ? "solicitud mostrada" : "solicitudes mostradas"}`}</Pill>}
      />

      <Notice tone="brand" title="La recepción de cada sucursal da seguimiento.">
        Esta consola es de solo lectura: el estado de cada solicitud se actualiza en el flujo de trabajo de la clínica, no aquí.
      </Notice>

      <Section id="resumen" title="Resumen">
        <Stats>
          <Stat label="Por llamar" value={props.stats.pending} hint="Esperan una llamada de la recepción" tone={props.stats.pending ? "attn" : undefined} />
          <Stat label="Atendidas" value={props.stats.completed} hint="La recepción ya llamó" />
          <Stat label="Canceladas" value={props.stats.cancelled} hint="Ya no requieren llamada" />
          <Stat label="Sin sucursal asignada" value={props.stats.unassigned} hint="La persona no indicó preferencia" />
        </Stats>
      </Section>

      <Filters
        label="Estado"
        options={[
          { label: "Todas", href: href({ ...cur, estado: undefined }), current: !estado },
          { label: "Por llamar", href: href({ ...cur, estado: "por-llamar" }), current: estado === "por-llamar" },
          { label: "Atendidas", href: href({ ...cur, estado: "atendida" }), current: estado === "atendida" },
          { label: "Canceladas", href: href({ ...cur, estado: "cancelada" }), current: estado === "cancelada" },
        ]}
      />
      <Filters
        label="Sucursal"
        options={[
          { label: "Todas", href: href({ ...cur, sucursal: undefined }), current: !sucursal },
          ...props.branches.map((b) => ({ label: b.nombre, href: href({ ...cur, sucursal: b.codigo }), current: sucursal === b.codigo })),
          { label: "Sin preferencia", href: href({ ...cur, sucursal: SIN_PREFERENCIA }), current: sucursal === SIN_PREFERENCIA },
        ]}
      />

      <Section id="solicitudes" title="Solicitudes de llamada" description="Primero las pendientes; después, las más recientes.">
        <DataTable
          caption="Solicitudes de llamada registradas por el asistente de voz"
          head={["Paciente", "Teléfono", "Sucursal", "Disponibilidad", "Motivo", "Estado", "Solicitada"]}
          empty={filtered ? "No hay solicitudes con estos filtros." : "Aún no hay solicitudes de llamada."}
          rows={props.shown.map((i) => [
            i.patient ? <Cell primary={i.patient.name} sub={<span class="mono">{i.patient.folio}</span>} href={`/pacientes/${i.patient.id}`} /> : <span class="muted">Sin identificar</span>,
            i.patient ? <span class="mono">{i.patient.phone}</span> : <span class="muted">No disponible</span>,
            i.branch ?? <span class="muted">Cualquier sucursal</span>,
            i.availability,
            <Cell primary={i.reason} sub={i.description ?? undefined} />,
            <Pill tone={CALLBACK_STATUS[i.status].tone}>{CALLBACK_STATUS[i.status].label}</Pill>,
            dateTime(i.authoredAt),
          ])}
        />
      </Section>
    </ClientLayout>
  );
}
