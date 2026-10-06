import { BRANCH_CODE, BRANCH_CODES, type BranchCode } from "@pokta-clinic/fhir";

// The branches of Grupo Médico Articular (GMA) as the booking rules see them. This module is the single
// source of truth for WHEN a first consultation may be booked: the EHR Location also carries
// hoursOfOperation, but booking must work while the EHR is switched off and resolveSlot needs the hours
// synchronously, so the web config is authoritative and must match the seeded Location hours
// (apps/mock-ehr/src/db/seed-data.ts). Names and addresses here are only the fallback for when the
// EHR cannot be asked; the EHR Location and Practitioner win when they answer.

// Start hours (local, America/Mexico_City) of 60-minute first consultations, per weekday (0 = Sunday).
type Schedule = Record<number, readonly number[]>;

const hoursRange = (from: number, to: number) => Array.from({ length: to - from }, (_, i) => from + i);
const weekdays = (hours: readonly number[]): Schedule => ({ 1: hours, 2: hours, 3: hours, 4: hours, 5: hours });

export type Branch = {
  code: BranchCode;
  name: string;
  address: string;
  practitionerName: string;
  schedule: Schedule;
};

export const BRANCHES: Record<BranchCode, Branch> = {
  [BRANCH_CODE.delValle]: {
    code: BRANCH_CODE.delValle,
    name: "GMA Del Valle",
    address: "Av. Insurgentes Sur 1234, Consultorio 502, Col. del Valle, Benito Juárez, 03100, Ciudad de México",
    practitionerName: "Elena Ruiz Castellanos",
    // Mon-Fri 9:00-14:00 and 16:00-19:00.
    schedule: weekdays([...hoursRange(9, 14), ...hoursRange(16, 19)]),
  },
  [BRANCH_CODE.polanco]: {
    code: BRANCH_CODE.polanco,
    name: "GMA Polanco",
    address: "Av. Presidente Masaryk 450, Piso 3, Polanco V Sección, Miguel Hidalgo, 11560, Ciudad de México",
    practitionerName: "Andrés Villaseñor Mora",
    // Mon-Fri 10:00-18:00.
    schedule: weekdays(hoursRange(10, 18)),
  },
  [BRANCH_CODE.satelite]: {
    code: BRANCH_CODE.satelite,
    name: "GMA Satélite",
    address: "Circuito Centro Comercial 2251, Ciudad Satélite, Naucalpan de Juárez, 53100, Estado de México",
    practitionerName: "Mariana Ochoa Treviño",
    // Mon-Fri 9:00-14:00, Sat 9:00-13:00.
    schedule: { ...weekdays(hoursRange(9, 14)), 6: hoursRange(9, 13) },
  },
};

export { BRANCH_CODES };
export type { BranchCode };
