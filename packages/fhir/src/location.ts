import { z } from "zod";
import { SYSTEM, Identifier } from "./patient.ts";
import { ref, reference } from "./reference.ts";

// The stable branch codes: how a client resolves a Location (`identifier=urn:pokta-clinic:branch|<code>`),
// because Location ids are generated when the EHR is seeded.
export const BRANCH_CODE = { delValle: "del-valle", polanco: "polanco", satelite: "satelite" } as const;
export type BranchCode = (typeof BRANCH_CODE)[keyof typeof BRANCH_CODE];
export const BRANCH_CODES = Object.values(BRANCH_CODE);

export const DAYS_OF_WEEK = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type DayOfWeek = (typeof DAYS_OF_WEEK)[number];

// FHIR R4 `hoursOfOperation`: local time (America/Mexico_City); a split shift is two entries.
const HoursOfOperation = z.object({
  daysOfWeek: z.array(z.enum(DAYS_OF_WEEK)).min(1),
  openingTime: z.string(),
  closingTime: z.string(),
});
export type HoursOfOperation = z.infer<typeof HoursOfOperation>;

export const Location = z.object({
  resourceType: z.literal("Location"),
  id: z.string().optional(),
  identifier: z.array(Identifier).min(1),
  status: z.literal("active"),
  name: z.string(),
  mode: z.literal("instance"),
  address: z.object({ text: z.string(), country: z.string().optional() }),
  managingOrganization: reference("Organization"),
  hoursOfOperation: z.array(HoursOfOperation),
});
export type Location = z.infer<typeof Location>;

// Read-only: a branch of the Organization where the Patient is seen. Identified by branch code and CLUES.
export function locationResource(input: {
  id: string;
  codigo: string;
  clues: string;
  nombre: string;
  domicilio: string;
  organizationId: string;
  horarios: HoursOfOperation[];
}): Location {
  return {
    resourceType: "Location",
    id: input.id,
    identifier: [
      { system: SYSTEM.branch, value: input.codigo },
      { system: SYSTEM.clues, value: input.clues },
    ],
    status: "active",
    name: input.nombre,
    mode: "instance",
    address: { text: input.domicilio, country: "MX" },
    managingOrganization: ref("Organization", input.organizationId),
    hoursOfOperation: input.horarios,
  };
}
