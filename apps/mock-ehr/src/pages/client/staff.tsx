import { asc, eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { appointment, communication, establishment, intake, practitioner, practitionerRole } from "../../db/schema.js";
import { fullName } from "./format.js";
import { Card, Cell, ClientLayout, DataTable, KeyValue, Notice, PageHeader, Pill, Section } from "./ui.js";

export async function loadStaff() {
  const now = new Date();
  const [doctors, branches, roles, appts, intakes, alerts] = await Promise.all([
    db.select().from(practitioner).orderBy(asc(practitioner.primerApellido), asc(practitioner.nombre)),
    db.select({ id: establishment.id, nombre: establishment.nombre }).from(establishment),
    db.select({ practitionerId: practitionerRole.practitionerId, establishmentId: practitionerRole.establishmentId }).from(practitionerRole),
    db.select({ practitionerId: appointment.practitionerId, start: appointment.start }).from(appointment).where(eq(appointment.status, "booked")),
    db.select({ validatedBy: intake.validatedBy }).from(intake),
    db.select({ practitionerId: communication.practitionerId }).from(communication),
  ]);
  const branchName = new Map(branches.map((b) => [b.id, b.nombre]));
  return {
    doctors: doctors.map((d) => ({
      id: d.id,
      name: fullName(d),
      especialidad: d.especialidad,
      cedula: d.cedulaProfesional,
      home: branchName.get(d.establishmentId) ?? null,
      serves: roles.filter((r) => r.practitionerId === d.id).map((r) => branchName.get(r.establishmentId)).filter((n): n is string => !!n),
      upcoming: appts.filter((a) => a.practitionerId === d.id && a.start >= now).length,
      validated: intakes.filter((i) => i.validatedBy === d.id).length,
      alerts: alerts.filter((a) => a.practitionerId === d.id).length,
    })),
  };
}

export function StaffPage(props: Awaited<ReturnType<typeof loadStaff>>) {
  const { doctors } = props;
  return (
    <ClientLayout title="Equipo médico" active="equipo">
      <PageHeader
        kicker="Directorio"
        title="Equipo médico"
        lede="Los médicos de la red, las sucursales donde atienden y su carga reciente: citas próximas, pre-consultas que han validado y alertas clínicas que recibieron."
        meta={<Pill tone="brand">{doctors.length} {doctors.length === 1 ? "médico" : "médicos"}</Pill>}
      />
      <Section id="directorio" title="Directorio médico">
        <DataTable
          caption="Médicos de la red con su cédula profesional (ficticia, solo para la demostración), sucursal base y actividad."
          head={["Médico", "Cédula profesional", "Sucursal base", "Atiende en", { label: "Citas próximas", num: true }, { label: "Pre-consultas validadas", num: true }, { label: "Alertas recibidas", num: true }]}
          empty="Todavía no hay médicos registrados en la red."
          rows={doctors.map((d) => [
            <Cell primary={d.name} sub={d.especialidad} />,
            <span class="mono">{d.cedula}</span>,
            d.home ?? <span class="muted">Sin sucursal base</span>,
            d.serves.length ? d.serves.join(", ") : <span class="muted">Sin sucursal asignada</span>,
            String(d.upcoming),
            String(d.validated),
            String(d.alerts),
          ])}
        />
      </Section>
      <Section id="roles" title="Cómo se asignan los médicos a las sucursales" description="Cada médico tiene uno o más roles, uno por sucursal donde atiende.">
        <Card>
          <div class="stack">
            <p>
              Un médico solo puede agendarse en una sucursal donde tiene un rol (PractitionerRole). El asistente de voz usa esta relación para decidir a quién y dónde ofrecer una cita: si el médico no atiende en la sucursal que pide el paciente, no le propone ese horario.
            </p>
            <KeyValue
              items={[
                ["Sucursal base", "Donde el médico está dado de alta en la red."],
                ["Atiende en", "Todas las sucursales donde tiene un rol y, por lo tanto, puede recibir citas."],
              ]}
            />
          </div>
        </Card>
        <Notice tone="brand" title="Datos de demostración.">
          Las cédulas profesionales son ficticias y no corresponden a médicos reales.
        </Notice>
      </Section>
    </ClientLayout>
  );
}
