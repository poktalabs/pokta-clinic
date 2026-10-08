import { asc, eq, isNotNull } from "drizzle-orm";
import { db } from "../../db/client.js";
import { appointment, establishment, patient, practitioner } from "../../db/schema.js";
import { APPOINTMENT_STATUS, TIME_ZONE, dayKey, fullName, longDate, time } from "./format.js";
import { Breadcrumbs, ClientLayout, Cell, DataTable, Empty, Filters, PageHeader, Pill, Section, Stat, Stats } from "./ui.js";

const ESTADOS = { agendada: "booked", cancelada: "cancelled" } as const;
type Estado = keyof typeof ESTADOS;

const shortDayFmt = new Intl.DateTimeFormat("es-MX", { timeZone: TIME_ZONE, weekday: "short", day: "numeric", month: "short" });
// "jue 9 oct": the day key is a Mexico City calendar day, so noon UTC lands on the same date in every zone we care about.
const shortDay = (key: string) => shortDayFmt.format(new Date(`${key}T18:00:00Z`)).replace(/\./g, "").replace(",", "").replace(" de ", " ");
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

type Params = { sucursal?: string; estado?: string; dia?: string };
// Filters keep each other's values, so every href is rebuilt from the full set of active params.
const href = (p: Params) => {
  const qs = Object.entries(p)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`)
    .join("&");
  return qs ? `/citas?${qs}` : "/citas";
};

export async function loadAppointments(query: Record<string, string | undefined>) {
  const now = new Date();
  const [branches, rows] = await Promise.all([
    db.select({ codigo: establishment.codigo, nombre: establishment.nombre }).from(establishment).where(isNotNull(establishment.codigo)).orderBy(asc(establishment.nombre)),
    db
      .select({
        a: appointment,
        patientId: patient.id,
        folio: patient.folio,
        nombre: patient.nombre,
        primerApellido: patient.primerApellido,
        segundoApellido: patient.segundoApellido,
        branchCodigo: establishment.codigo,
        branch: establishment.nombre,
        mNombre: practitioner.nombre,
        mPrimerApellido: practitioner.primerApellido,
        mSegundoApellido: practitioner.segundoApellido,
      })
      .from(appointment)
      .innerJoin(patient, eq(appointment.patientId, patient.id))
      .innerJoin(establishment, eq(appointment.establishmentId, establishment.id))
      .innerJoin(practitioner, eq(appointment.practitionerId, practitioner.id))
      .orderBy(asc(appointment.start)),
  ]);

  // Unknown query values mean "no filter".
  const sucursal = branches.some((b) => b.codigo === query.sucursal) ? query.sucursal : undefined;
  const estado = query.estado && query.estado in ESTADOS ? (query.estado as Estado) : undefined;
  const requestedDia = query.dia && /^\d{4}-\d{2}-\d{2}$/.test(query.dia) ? query.dia : undefined;

  const items = rows.map((r) => ({
    id: r.a.id,
    start: r.a.start,
    end: r.a.end,
    day: dayKey(r.a.start),
    status: r.a.status,
    description: r.a.description,
    inCalendar: !!r.a.calendarEventId,
    patientId: r.patientId,
    folio: r.folio,
    patientName: fullName({ nombre: r.nombre, primerApellido: r.primerApellido, segundoApellido: r.segundoApellido }),
    branchCodigo: r.branchCodigo,
    branch: r.branch,
    practitioner: fullName({ nombre: r.mNombre, primerApellido: r.mPrimerApellido, segundoApellido: r.mSegundoApellido }),
  }));

  const today = dayKey(now);
  const booked = items.filter((i) => i.status === "booked");
  const stats = {
    upcoming: booked.filter((i) => i.start >= now).length,
    today: booked.filter((i) => i.day === today).length,
    cancelled: items.length - booked.length,
    branchesWithAgenda: new Set(booked.map((i) => i.branchCodigo)).size,
  };

  const byBranchAndStatus = items.filter((i) => (!sucursal || i.branchCodigo === sucursal) && (!estado || i.status === ESTADOS[estado]));
  const days = [...new Set(byBranchAndStatus.map((i) => i.day))].sort();
  // A day with no appointments under the other filters is not offered, so a stale ?dia= is ignored.
  const dia = requestedDia && days.includes(requestedDia) ? requestedDia : undefined;
  const shown = dia ? byBranchAndStatus.filter((i) => i.day === dia) : byBranchAndStatus;

  const groups = new Map<string, typeof shown>();
  for (const i of shown) groups.set(i.day, [...(groups.get(i.day) ?? []), i]);
  const upcomingDays = [...groups.keys()].filter((d) => d >= today).sort();
  const pastDays = [...groups.keys()].filter((d) => d < today).sort().reverse();
  const toGroup = (d: string) => ({ day: d, label: capitalize(longDate(groups.get(d)![0].start)), items: groups.get(d)! });

  return {
    stats,
    branches: branches.map((b) => ({ codigo: b.codigo as string, nombre: b.nombre })),
    filters: { sucursal, estado, dia },
    dayOptions: days.map((d) => ({ key: d, label: shortDay(d) })),
    shownCount: shown.length,
    upcoming: upcomingDays.map(toGroup),
    past: pastDays.map(toGroup),
  };
}

type Data = Awaited<ReturnType<typeof loadAppointments>>;

const DayTables = (props: { groups: Data["upcoming"] }) => (
  <div class="stack">
    {props.groups.map((g) => (
      <div class="stack">
        <h3>{g.label}</h3>
        <DataTable
          caption={`Citas del ${g.label.toLowerCase()}`}
          head={["Hora", "Paciente", "Sucursal", "Médico", "Estado", "Origen"]}
          empty="Sin citas este día."
          rows={g.items.map((i) => [
            <span class="mono">{`${time(i.start)} a ${time(i.end)}`}</span>,
            <Cell primary={i.patientName} sub={<span class="mono">{i.folio}</span>} href={`/pacientes/${i.patientId}`} />,
            i.branch,
            i.practitioner,
            <Pill tone={APPOINTMENT_STATUS[i.status].tone}>{APPOINTMENT_STATUS[i.status].label}</Pill>,
            <Cell primary={i.description ?? <span class="muted">Sin descripción</span>} sub={i.inCalendar ? "En calendario de la sucursal" : undefined} />,
          ])}
        />
      </div>
    ))}
  </div>
);

export function AppointmentsPage(props: Data) {
  const { sucursal, estado, dia } = props.filters;
  const cur: Params = { sucursal, estado, dia };
  const filtered = !!(sucursal || estado || dia);
  return (
    <ClientLayout title="Citas" active="citas">
      <Breadcrumbs items={[{ label: "Inicio", href: "/" }, { label: "Citas" }]} />
      <PageHeader
        kicker="Agenda"
        title="Citas"
        lede="Citas de primera vez que el asistente de voz agendó, reprogramó o canceló, sincronizadas con el calendario de cada sucursal."
        meta={<Pill tone="brand" plain>{`${props.shownCount} ${props.shownCount === 1 ? "cita mostrada" : "citas mostradas"}`}</Pill>}
      />

      <Section id="resumen" title="Resumen">
        <Stats>
          <Stat label="Próximas" value={props.stats.upcoming} hint="Agendadas a partir de ahora" />
          <Stat label="Hoy" value={props.stats.today} hint="Agendadas para el día de hoy" />
          <Stat label="Canceladas" value={props.stats.cancelled} hint="En todo el historial" />
          <Stat label="Sucursales con agenda" value={props.stats.branchesWithAgenda} hint="Con al menos una cita agendada" />
        </Stats>
      </Section>

      <Filters
        label="Sucursal"
        options={[
          { label: "Todas", href: href({ ...cur, sucursal: undefined }), current: !sucursal },
          ...props.branches.map((b) => ({ label: b.nombre, href: href({ ...cur, sucursal: b.codigo }), current: sucursal === b.codigo })),
        ]}
      />
      <Filters
        label="Estado"
        options={[
          { label: "Todas", href: href({ ...cur, estado: undefined }), current: !estado },
          { label: "Agendadas", href: href({ ...cur, estado: "agendada" }), current: estado === "agendada" },
          { label: "Canceladas", href: href({ ...cur, estado: "cancelada" }), current: estado === "cancelada" },
        ]}
      />
      <Filters
        label="Día"
        options={[
          { label: "Todos los días", href: href({ ...cur, dia: undefined }), current: !dia },
          ...props.dayOptions.map((d) => ({ label: d.label, href: href({ ...cur, dia: d.key }), current: dia === d.key })),
        ]}
      />

      <Section id="proximas" title="Próximas" description="Hoy y los días siguientes, en orden cronológico.">
        {props.upcoming.length ? <DayTables groups={props.upcoming} /> : <Empty>{filtered ? "No hay citas próximas con estos filtros." : "Aún no hay citas próximas en la agenda."}</Empty>}
      </Section>

      <Section id="historial" title="Historial" description="Días anteriores, del más reciente al más antiguo.">
        {props.past.length ? <DayTables groups={props.past} /> : <Empty>{filtered ? "No hay citas anteriores con estos filtros." : "Aún no hay citas en el historial."}</Empty>}
      </Section>
    </ClientLayout>
  );
}
