import type { Stage } from "./model";

// A shortened replay of a real golden-path text run (fictional patient Lucía Mendoza, GMA Del Valle),
// so the explainer can be shown without a live call. Results are the shapes the tools return.
export type SampleStep =
  | { at: number; say: "agent" | "user"; text: string }
  | { at: number; tool: string; ms: number; status: number; result: Record<string, unknown> }
  | { at: number; stage: Stage };

const s = (sec: number) => sec * 1000;

export const SAMPLE: SampleStep[] = [
  { at: s(0), stage: "consent" },
  { at: s(0.2), say: "agent", text: "Hola, le habla el asistente virtual, con inteligencia artificial, de Grupo Médico Articular. Le ayudo a preparar su primera consulta. ¿Tiene unos minutos para platicar?" },
  { at: s(3), say: "user", text: "Sí, claro." },
  { at: s(4), say: "agent", text: "Antes de empezar: Grupo Médico Articular usará sus datos personales y de salud, que son datos sensibles, solo para preparar su consulta y agendar su cita. ¿Me autoriza a usar sus datos con este fin?" },
  { at: s(8), say: "user", text: "Sí, acepto." },
  { at: s(9), tool: "record_consent", ms: 212, status: 200, result: { ok: true, granted: true } },
  { at: s(10.5), stage: "identification" },
  { at: s(11), say: "agent", text: "Gracias. ¿Me dice su número de teléfono a diez dígitos?" },
  { at: s(13), say: "user", text: "Cinco cinco, siete nueve siete dos, nueve uno nueve cinco." },
  { at: s(15), tool: "find_patient", ms: 188, status: 200, result: { ok: true, found: false } },
  { at: s(16.5), say: "agent", text: "No encontré un registro con ese número; le registro como paciente nueva. ¿Su nombre?" },
  { at: s(18.5), say: "user", text: "Lucía Mendoza Ríos, nací el 14 de marzo de 1988." },
  { at: s(21), tool: "save_patient", ms: 241, status: 201, result: { ok: true, folio: "EXP-MUXHC32I", given_name: "Lucía", already_registered: false } },
  { at: s(22.5), stage: "history" },
  { at: s(23), tool: "get_questionnaire", ms: 96, status: 200, result: { ok: true } },
  { at: s(24), say: "agent", text: "Gracias, Lucía. ¿Cuál es el motivo principal por el que quiere ver a un especialista?" },
  { at: s(26.5), say: "user", text: "Me duelen las manos de los dos lados desde hace unos tres meses." },
  { at: s(29), say: "agent", text: "¿Siente rigidez al levantarse? ¿Cuántos minutos le dura?" },
  { at: s(31), say: "user", text: "Como una hora de rigidez en la mañana." },
  { at: s(33), say: "agent", text: "¿Algún familiar con artritis, lupus u otra enfermedad reumática?" },
  { at: s(35), say: "user", text: "Mi mamá tiene artritis reumatoide." },
  { at: s(37), tool: "save_history", ms: 318, status: 200, result: { ok: true, saved: true, status: "completed", missing: [] } },
  { at: s(38.5), stage: "scheduling" },
  { at: s(39), say: "agent", text: "Listo. Tenemos sucursales en Del Valle, Polanco y Satélite. ¿Cuál le queda mejor?" },
  { at: s(41.5), say: "user", text: "Del Valle, por favor, de once a dos." },
  {
    at: s(43.5),
    tool: "check_availability",
    ms: 402,
    status: 200,
    result: { ok: true, slots: [{ label: "jueves 8 de octubre a las 11:00 de la mañana" }, { label: "viernes 9 de octubre a las 12:00 del día" }, { label: "lunes 12 de octubre a las 11:00 de la mañana" }] },
  },
  { at: s(45), say: "agent", text: "Tengo el jueves 8 de octubre a las 11 de la mañana, el viernes 9 a las 12 del día, o el lunes 12 a las 11. ¿Cuál le acomoda?" },
  { at: s(48.5), say: "user", text: "El jueves." },
  {
    at: s(50),
    tool: "book_appointment",
    ms: 655,
    status: 200,
    result: {
      ok: true,
      booked: true,
      label: "jueves 8 de octubre a las 11:00 de la mañana",
      branch_name: "GMA Del Valle",
      practitioner_name: "Dra. Elena Ruiz Castellanos",
      address: "Av. Insurgentes Sur 1234, Col. del Valle",
      emailed: true,
    },
  },
  { at: s(51.5), say: "agent", text: "Su cita quedó el jueves 8 de octubre a las 11 de la mañana en GMA Del Valle, con la Dra. Elena Ruiz Castellanos. Que tenga un excelente día." },
  { at: s(56), stage: "end" },
];
