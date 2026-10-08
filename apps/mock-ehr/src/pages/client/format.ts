// Shared formatting for the client console. Every date shows in the clinic's zone (America/Mexico_City), es-MX.
import type { Horario } from "../../db/schema.js";

export const TIME_ZONE = "America/Mexico_City";

const fmt = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("es-MX", { timeZone: TIME_ZONE, ...options });
const dateTimeFmt = fmt({ day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
const dateFmt = fmt({ day: "numeric", month: "short", year: "numeric" });
const longDateFmt = fmt({ weekday: "long", day: "numeric", month: "long", year: "numeric" });
const timeFmt = fmt({ hour: "2-digit", minute: "2-digit", hour12: false });
const keyFmt = fmt({ year: "numeric", month: "2-digit", day: "2-digit" });

/** "7 oct 2026, 14:00" */
export const dateTime = (d: Date) => dateTimeFmt.format(d);
/** "7 oct 2026" */
export const dateOnly = (d: Date) => dateFmt.format(d);
/** "miércoles, 7 de octubre de 2026" */
export const longDate = (d: Date) => longDateFmt.format(d);
/** "14:00" */
export const time = (d: Date) => timeFmt.format(d);
/** "2026-10-07": the calendar day in Mexico City, for grouping and `?dia=` filters. */
export function dayKey(d: Date): string {
  const parts = Object.fromEntries(keyFmt.formatToParts(d).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
/** "1988-03-14" (a SQL date) to "14 mar 1988", without a timezone shift. */
export const birthDate = (iso: string) => dateFmt.format(new Date(`${iso}T12:00:00Z`));

/** Years since a SQL date ("1988-03-14"), or null. */
export function ageFrom(iso: string | null | undefined, now = new Date()): number | null {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  const today = { y: Number(dayKey(now).slice(0, 4)), m: Number(dayKey(now).slice(5, 7)), d: Number(dayKey(now).slice(8, 10)) };
  return today.y - y - (today.m < m || (today.m === m && today.d < d) ? 1 : 0);
}

/** Phones are sensitive: only the last 4 digits are ever shown. */
export const maskPhone = (phone: string | null | undefined) => (phone ? `•••• ${phone.slice(-4)}` : "");

export const fullName = (p: { nombre: string; primerApellido: string | null; segundoApellido?: string | null }) =>
  [p.nombre, p.primerApellido, p.segundoApellido].filter(Boolean).join(" ");

/** Short conversation reference for display: the first 8 characters of the ElevenLabs conversation id. */
export const shortRef = (id: string | null | undefined) => (id ? id.replace(/^conv_/, "").slice(0, 8) : "");

// Status vocabularies, es-MX. `tone` maps to the Pill component.
export type Tone = "ok" | "attn" | "spot" | "neutral" | "brand";

export const VALIDATION: Record<"pending_validation" | "validated" | "rejected", { label: string; tone: Tone }> = {
  pending_validation: { label: "Pendiente de revisión médica", tone: "attn" },
  validated: { label: "Validado por el médico", tone: "ok" },
  rejected: { label: "Rechazado por el médico", tone: "neutral" },
};

export const COMPLETION: Record<"in_progress" | "completed", { label: string; tone: Tone }> = {
  in_progress: { label: "Incompleto", tone: "attn" },
  completed: { label: "Completo", tone: "ok" },
};

export const APPOINTMENT_STATUS: Record<"booked" | "cancelled", { label: string; tone: Tone }> = {
  booked: { label: "Agendada", tone: "ok" },
  cancelled: { label: "Cancelada", tone: "neutral" },
};

export const CALLBACK_STATUS: Record<"requested" | "completed" | "cancelled", { label: string; tone: Tone }> = {
  requested: { label: "Por llamar", tone: "attn" },
  completed: { label: "Atendida", tone: "ok" },
  cancelled: { label: "Cancelada", tone: "neutral" },
};

export const SEVERITY: Record<"emergencia" | "urgencia", { label: string; tone: Tone; meaning: string }> = {
  emergencia: { label: "Emergencia", tone: "spot", meaning: "Se indicó llamar al 911 de inmediato" },
  urgencia: { label: "Urgencia", tone: "attn", meaning: "Se indicó acudir a urgencias el mismo día" },
};

// Callback reasons are stored as codes by the agent, or as free text by older calls.
const CALLBACK_REASON: Record<string, string> = {
  no_suitable_slot: "No encontró un horario que le acomodara",
  caller_prefers: "Prefiere que la clínica le llame",
};
export const callbackReason = (reason: string) => CALLBACK_REASON[reason] ?? reason;

export const SEXO: Record<"H" | "M", string> = { H: "Hombre", M: "Mujer" };

export const CONSENT_TIPO: Record<string, string> = { privacidad: "Aviso de privacidad (datos sensibles)" };
export const CONSENT_METHOD: Record<string, string> = { voice: "De viva voz, durante la llamada" };

const DAY = { mon: "Lun", tue: "Mar", wed: "Mié", thu: "Jue", fri: "Vie", sat: "Sáb", sun: "Dom" } as const;
const ORDER = Object.keys(DAY);

/** "Lun a Vie, 09:00 a 14:00" */
export function horario(h: Horario): string {
  const days = [...h.daysOfWeek].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
  const run = days.length > 1 && ORDER.indexOf(days[days.length - 1]) - ORDER.indexOf(days[0]) === days.length - 1;
  const label = run ? `${DAY[days[0]]} a ${DAY[days[days.length - 1]]}` : days.map((d) => DAY[d]).join(", ");
  return `${label}, ${h.openingTime.slice(0, 5)} a ${h.closingTime.slice(0, 5)}`;
}
