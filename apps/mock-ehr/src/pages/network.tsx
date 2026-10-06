import { asc, eq, isNotNull } from "drizzle-orm";
import { db } from "../db/client.js";
import { establishment, organization, practitioner, practitionerRole, type Horario } from "../db/schema.js";

const DAY_LABEL = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" } as const;
const ORDER = Object.keys(DAY_LABEL);

// "Mon-Fri 09:00-14:00" or "Sat 09:00-13:00". Days are consecutive runs in the seed; a gap falls back to a comma list.
export function formatHorario(h: Horario): string {
  const days = [...h.daysOfWeek].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
  const run = days.length > 1 && ORDER.indexOf(days[days.length - 1]) - ORDER.indexOf(days[0]) === days.length - 1;
  const label = run ? `${DAY_LABEL[days[0]]}-${DAY_LABEL[days[days.length - 1]]}` : days.map((d) => DAY_LABEL[d]).join(", ");
  return `${label} ${h.openingTime.slice(0, 5)}-${h.closingTime.slice(0, 5)}`;
}

// The network and its branches with the Practitioner(s) at each: no patient data.
export async function loadNetwork() {
  const [orgs, branches, roles] = await Promise.all([
    db.select().from(organization).orderBy(asc(organization.createdAt)),
    db.select().from(establishment).where(isNotNull(establishment.codigo)).orderBy(asc(establishment.createdAt)),
    db
      .select({ establishmentId: practitionerRole.establishmentId, nombre: practitioner.nombre, primerApellido: practitioner.primerApellido, segundoApellido: practitioner.segundoApellido, especialidad: practitioner.especialidad })
      .from(practitionerRole)
      .innerJoin(practitioner, eq(practitionerRole.practitionerId, practitioner.id)),
  ]);
  return {
    organization: orgs[0],
    branches: branches.map((b) => ({
      ...b,
      practitioners: roles
        .filter((r) => r.establishmentId === b.id)
        .map((r) => `${[r.nombre, r.primerApellido, r.segundoApellido].filter(Boolean).join(" ")} (${r.especialidad})`),
    })),
  };
}

export function Network(props: { data: Awaited<ReturnType<typeof loadNetwork>> }) {
  const { organization: org, branches } = props.data;
  if (!org) return <p>No network seeded yet.</p>;
  return (
    <>
      <p>
        <b>{org.nombre}</b> <span class="note">({org.razonSocial})</span>
      </p>
      <table>
        <thead>
          <tr>
            <th>Branch</th>
            <th>Name</th>
            <th>CLUES</th>
            <th>Address</th>
            <th>Hours (America/Mexico_City)</th>
            <th>Practitioner</th>
          </tr>
        </thead>
        <tbody>
          {branches.map((b) => (
            <tr>
              <td><code>{b.codigo}</code></td>
              <td>{b.nombre}</td>
              <td>{b.clues}</td>
              <td>{b.domicilio}</td>
              <td>{(b.horarios ?? []).map((h) => <div>{formatHorario(h)}</div>)}</td>
              <td>{b.practitioners.map((p) => <div>{p}</div>)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
