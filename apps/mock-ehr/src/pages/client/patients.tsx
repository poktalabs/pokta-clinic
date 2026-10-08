import { and, asc, desc, eq, gte, isNotNull } from "drizzle-orm";
import { db } from "../../db/client.js";
import { appointment, establishment, intake, patient } from "../../db/schema.js";
import { PreConsultaPill } from "./clinical-summary.js";
import { ageFrom, dateOnly, dateTime, fullName, maskPhone, SEXO } from "./format.js";
import { Cell, ClientLayout, DataTable, Filters, PageHeader } from "./ui.js";

export async function loadPatients(query: Record<string, string | undefined>) {
  const branches = await db
    .select({ codigo: establishment.codigo, nombre: establishment.nombre })
    .from(establishment)
    .where(isNotNull(establishment.codigo))
    .orderBy(asc(establishment.nombre));
  const sucursal = branches.find((b) => b.codigo === query.sucursal)?.codigo ?? null;
  const pendientes = query.revision === "pendiente";

  const patients = await db
    .select({ p: patient, branch: establishment.nombre })
    .from(patient)
    .innerJoin(establishment, eq(establishment.id, patient.establishmentId))
    .where(sucursal ? eq(establishment.codigo, sucursal) : undefined)
    .orderBy(desc(patient.createdAt));

  // Two flat queries for all patients (newest first), folded in memory: no query per patient.
  const intakes = await db
    .select({ patientId: intake.patientId, completion: intake.completion, status: intake.status })
    .from(intake)
    .orderBy(desc(intake.createdAt));
  const latest = new Map<string, (typeof intakes)[number]>();
  const hasPending = new Set<string>();
  for (const i of intakes) {
    if (!latest.has(i.patientId)) latest.set(i.patientId, i);
    if (i.completion === "completed" && i.status === "pending_validation") hasPending.add(i.patientId);
  }

  const upcoming = await db
    .select({ patientId: appointment.patientId, start: appointment.start, branch: establishment.nombre })
    .from(appointment)
    .innerJoin(establishment, eq(establishment.id, appointment.establishmentId))
    .where(and(eq(appointment.status, "booked"), gte(appointment.start, new Date())))
    .orderBy(asc(appointment.start));
  const next = new Map<string, (typeof upcoming)[number]>();
  for (const a of upcoming) if (!next.has(a.patientId)) next.set(a.patientId, a);

  const rows = patients
    .filter(({ p }) => !pendientes || hasPending.has(p.id))
    .map(({ p, branch }) => ({ ...p, branch, intake: latest.get(p.id) ?? null, next: next.get(p.id) ?? null }));

  return { rows, branches, sucursal, pendientes };
}

export function PatientsPage(props: Awaited<ReturnType<typeof loadPatients>>) {
  const { rows, branches, sucursal, pendientes } = props;
  // Chip hrefs keep the other filter.
  const href = (s: string | null, r: boolean) => {
    const params = new URLSearchParams();
    if (s) params.set("sucursal", s);
    if (r) params.set("revision", "pendiente");
    const qs = params.toString();
    return qs ? `/pacientes?${qs}` : "/pacientes";
  };
  return (
    <ClientLayout title="Pacientes" active="pacientes">
      <PageHeader
        kicker="Expediente"
        title="Pacientes"
        lede="Pacientes registrados por el asistente de voz de PoktaClinic en las tres sucursales de Grupo Médico Articular. Cada expediente reúne sus datos, consentimientos, citas y el resumen de pre-consulta."
        meta={<span class="muted">{rows.length === 1 ? "1 paciente" : `${rows.length} pacientes`}</span>}
      />
      <div class="stack">
        <Filters
          label="Sucursal"
          options={[
            { label: "Todas", href: href(null, pendientes), current: !sucursal },
            ...branches.map((b) => ({ label: b.nombre, href: href(b.codigo, pendientes), current: sucursal === b.codigo })),
          ]}
        />
        <Filters
          label="Pre-consulta"
          options={[
            { label: "Todas", href: href(sucursal, false), current: !pendientes },
            { label: "Pendiente de revisión", href: href(sucursal, true), current: pendientes },
          ]}
        />
        <DataTable
          caption="Pacientes registrados, del más reciente al más antiguo. Los teléfonos muestran solo los últimos cuatro dígitos."
          head={["Paciente", "Sucursal", "Edad y sexo", "Teléfono", "Pre-consulta", "Próxima cita", "Registro"]}
          empty="Ningún paciente coincide con los filtros seleccionados."
          rows={rows.map((r) => {
            const age = ageFrom(r.fechaNacimiento);
            const demo = [age !== null ? `${age} años` : null, r.sexo ? SEXO[r.sexo] : null].filter(Boolean).join(", ");
            return [
              <Cell primary={fullName(r)} href={`/pacientes/${r.id}`} sub={<span class="mono">{r.folio}</span>} />,
              r.branch,
              demo || <span class="muted">Sin registrar</span>,
              <span class="mono">{maskPhone(r.telefono)}</span>,
              <PreConsultaPill intake={r.intake} />,
              r.next ? <Cell primary={dateTime(r.next.start)} sub={r.next.branch} /> : <span class="muted">Sin cita próxima</span>,
              dateOnly(r.createdAt),
            ];
          })}
        />
      </div>
    </ClientLayout>
  );
}
