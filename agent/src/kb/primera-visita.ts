import { BRANCHES, type Branch, type BranchCode } from "../../../apps/web/src/scheduling/branches.ts";

// "GMA, guía para su primera consulta". What to bring and what to expect follow the Arthritis
// Foundation's Spanish page on a first appointment with a rheumatologist
// (https://espanol.arthritis.org/health-wellness/treatment/treatment-plan/you-your-doctor/first-appointment-with-a-rheumatologist).
// Branch addresses and hours come from BRANCHES, the same source the booking rules use, so the guide
// cannot drift from the calendar. Parking is fictional, like the network.

const PARKING: Record<BranchCode, string> = {
  "del-valle": "Hay servicio de valet parking en la entrada del edificio, con un costo de 60 pesos por visita.",
  polanco: "No hay estacionamiento propio. Hay un estacionamiento público a media cuadra, sobre la misma avenida; GMA no tiene convenio con él.",
  satelite: "El consultorio está dentro de una plaza con estacionamiento gratuito.",
};

const DAY = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const NUMBER = ["doce", "una", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez", "once", "doce"];

// 9 -> "nueve de la mañana", 14 -> "dos de la tarde", 19 -> "siete de la noche".
function spokenHour(h: number): string {
  const word = NUMBER[h % 12];
  if (h < 12) return `${word} de la mañana`;
  if (h === 12) return "doce del día";
  return `${word} de la ${h < 19 ? "tarde" : "noche"}`;
}

// Bookable start hours [9, 10, 11, 12, 13, 16, 17, 18] -> "de nueve de la mañana a dos de la tarde y
// de cuatro de la tarde a siete de la noche". A consultation lasts an hour, so a range ends one hour
// after its last start.
function spokenRanges(starts: readonly number[]): string {
  const ranges: [number, number][] = [];
  for (const h of starts) {
    const last = ranges.at(-1);
    if (last && last[1] === h) last[1] = h + 1;
    else ranges.push([h, h + 1]);
  }
  return ranges.map(([from, to]) => `de ${spokenHour(from)} a ${spokenHour(to)}`).join(" y ");
}

// Groups consecutive weekdays with the same hours: "de lunes a viernes, de ...; los sábados, de ...".
export function spokenSchedule(branch: Branch): string {
  const groups: { first: number; last: number; hours: string }[] = [];
  for (let day = 1; day <= 7; day++) {
    const starts = branch.schedule[day % 7];
    if (!starts?.length) continue;
    const hours = spokenRanges(starts);
    const prev = groups.at(-1);
    if (prev && prev.hours === hours && prev.last === day - 1) prev.last = day;
    else groups.push({ first: day, last: day, hours });
  }
  const days = (g: { first: number; last: number }) => {
    const first = DAY[g.first % 7] ?? "";
    if (g.first === g.last) return first === "sábado" || first === "domingo" ? `los ${first}s` : `los ${first}`;
    return `de ${first} a ${DAY[g.last % 7]}`;
  };
  return groups.map((g) => `${days(g)}, ${g.hours}`).join("; ");
}

function branchSection(branch: Branch): string {
  return [
    `## Sucursal ${branch.name}`,
    `Dirección: ${branch.address}.`,
    `Horario de consultas: ${spokenSchedule(branch)}.`,
    `Estacionamiento: ${PARKING[branch.code]}`,
    "El edificio tiene elevador.",
  ].join("\n\n");
}

export function renderPrimeraVisita(): string {
  return [
    "# GMA, guía para su primera consulta",
    "Documento ficticio para una demostración. Grupo Médico Articular no existe.",
    "## Cuándo llegar y cuánto dura",
    "Llegue quince minutos antes de su cita para el registro. La primera consulta dura alrededor de una hora.",
    "## Qué llevar",
    "Una identificación oficial, como su INE o su pasaporte.",
    "La lista completa de los medicamentos que toma, con la dosis de cada uno. Incluya los que compra sin receta, las vitaminas y los suplementos.",
    "Sus estudios previos, de laboratorio y de imagen, como radiografías o resonancias, con sus reportes.",
    "Las notas o resúmenes de otros médicos que le hayan atendido por el mismo problema.",
    "Su póliza de seguro de gastos médicos, si va a pedir un reembolso.",
    "Una lista corta de sus síntomas, desde cuándo los tiene, y de las preguntas que quiera hacer.",
    "## Acompañante y ropa",
    "Puede venir con un acompañante. Use ropa cómoda, fácil de quitar o de arremangar, porque el o la especialista revisará sus articulaciones.",
    "## Qué esperar en la consulta",
    "El o la especialista le hará preguntas sobre sus molestias y sus antecedentes, y revisará sus articulaciones. Puede pedirle análisis de sangre o estudios de imagen. Es posible que el diagnóstico no se dé el mismo día, sino cuando estén los resultados.",
    "## Medicamentos antes de la consulta",
    "Si tiene dudas sobre sus medicamentos antes de la consulta, por ejemplo si debe seguir tomándolos, pregúntelo al médico que se los recetó.",
    ...Object.values(BRANCHES).map(branchSection),
  ].join("\n\n");
}
