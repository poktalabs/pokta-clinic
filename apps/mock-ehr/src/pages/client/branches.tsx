import { asc, eq, isNotNull } from "drizzle-orm";
import { db } from "../../db/client.js";
import { appointment, callbackTask, establishment, organization, patient, practitioner, practitionerRole, type Horario } from "../../db/schema.js";
import { TIME_ZONE, fullName, horario } from "./format.js";
import { Card, ClientLayout, Empty, KeyValue, Notice, PageHeader, Pill, Section } from "./ui.js";

const weekdayFmt = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const DAY_KEY: Record<string, Horario["daysOfWeek"][number]> = { Mon: "mon", Tue: "tue", Wed: "wed", Thu: "thu", Fri: "fri", Sat: "sat", Sun: "sun" };

// Open now = today's weekday and the current HH:MM (both in Mexico City) fall inside any opening interval.
function isOpenNow(horarios: Horario[] | null, at: Date): boolean {
  if (!horarios?.length) return false;
  const parts = Object.fromEntries(weekdayFmt.formatToParts(at).map((p) => [p.type, p.value]));
  const day = DAY_KEY[parts.weekday];
  const hhmm = `${parts.hour}:${parts.minute}`;
  return horarios.some((h) => h.daysOfWeek.includes(day) && hhmm >= h.openingTime.slice(0, 5) && hhmm < h.closingTime.slice(0, 5));
}

export async function loadBranches() {
  const now = new Date();
  const [orgs, branches, roles, patients, appts, tasks] = await Promise.all([
    db.select().from(organization).orderBy(asc(organization.createdAt)),
    db.select().from(establishment).where(isNotNull(establishment.codigo)).orderBy(asc(establishment.createdAt)),
    db
      .select({ establishmentId: practitionerRole.establishmentId, nombre: practitioner.nombre, primerApellido: practitioner.primerApellido, segundoApellido: practitioner.segundoApellido, especialidad: practitioner.especialidad })
      .from(practitionerRole)
      .innerJoin(practitioner, eq(practitionerRole.practitionerId, practitioner.id)),
    db.select({ establishmentId: patient.establishmentId }).from(patient),
    db.select({ establishmentId: appointment.establishmentId, start: appointment.start }).from(appointment).where(eq(appointment.status, "booked")),
    db.select({ establishmentId: callbackTask.establishmentId }).from(callbackTask).where(eq(callbackTask.status, "requested")),
  ]);
  return {
    organization: orgs[0] ?? null,
    branches: branches.map((b) => ({
      id: b.id,
      codigo: b.codigo as string,
      nombre: b.nombre,
      domicilio: b.domicilio,
      clues: b.clues,
      tipo: b.tipo,
      horarios: b.horarios ?? [],
      openNow: isOpenNow(b.horarios, now),
      practitioners: roles.filter((r) => r.establishmentId === b.id).map((r) => ({ name: fullName(r), especialidad: r.especialidad })),
      patients: patients.filter((p) => p.establishmentId === b.id).length,
      upcoming: appts.filter((a) => a.establishmentId === b.id && a.start >= now).length,
      callbacks: tasks.filter((t) => t.establishmentId === b.id).length,
    })),
  };
}

export function BranchesPage(props: Awaited<ReturnType<typeof loadBranches>>) {
  const { organization: org, branches } = props;
  return (
    <ClientLayout title="Sucursales" active="sucursales">
      <PageHeader
        kicker="Red de clínicas"
        title="Sucursales"
        lede={
          org ? (
            <>
              Las sucursales de {org.nombre} ({org.razonSocial}) donde PoktaClinic agenda citas y recibe llamadas, con su horario, su equipo médico y la actividad pendiente de cada una.
            </>
          ) : (
            "Las sucursales de la red donde PoktaClinic agenda citas y recibe llamadas."
          )
        }
        meta={<Pill tone="brand">{branches.length} {branches.length === 1 ? "sucursal" : "sucursales"}</Pill>}
      />
      <Notice tone="brand" title="Datos de demostración.">
        Los horarios y el estado "abierta" o "cerrada" corresponden a la hora local de la Ciudad de México. Todos los datos de esta consola son ficticios.
      </Notice>
      <Section id="red" title="Directorio de sucursales">
        {branches.length === 0 ? (
          <Empty>Todavía no hay sucursales registradas en la red.</Empty>
        ) : (
          <div class="stack">
            {branches.map((b) => (
              <Card>
                <div class="stack">
                  <div class="row">
                    <h3>{b.nombre}</h3>
                    <Pill tone={b.openNow ? "ok" : "neutral"}>{b.openNow ? "Abierta ahora" : "Cerrada ahora"}</Pill>
                  </div>
                  <KeyValue
                    items={[
                      ["Dirección", b.domicilio],
                      [
                        "Horario",
                        b.horarios.length ? (
                          <>
                            {b.horarios.map((h) => (
                              <div>{horario(h)}</div>
                            ))}
                          </>
                        ) : null,
                      ],
                      ["CLUES", <span class="mono">{b.clues}</span>],
                      ["Código de sucursal", <span class="mono">{b.codigo}</span>],
                      ["Tipo de establecimiento", b.tipo],
                      [
                        "Médicos",
                        b.practitioners.length ? (
                          <>
                            {b.practitioners.map((p) => (
                              <div>
                                {p.name} <span class="muted">({p.especialidad})</span>
                              </div>
                            ))}
                          </>
                        ) : null,
                      ],
                    ]}
                  />
                  <h4 class="kicker">Actividad de la sucursal</h4>
                  <KeyValue
                    items={[
                      ["Pacientes registrados", String(b.patients)],
                      ["Citas próximas", String(b.upcoming)],
                      ["Llamadas por devolver", String(b.callbacks)],
                    ]}
                  />
                  <div class="row small">
                    <a href={`/citas?sucursal=${encodeURIComponent(b.codigo)}`}>Ver citas de {b.nombre}</a>
                    <a href={`/llamadas?sucursal=${encodeURIComponent(b.codigo)}`}>Ver llamadas de {b.nombre}</a>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </Section>
    </ClientLayout>
  );
}
