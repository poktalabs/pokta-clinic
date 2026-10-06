import { z } from "zod";
import { SYSTEM, Identifier } from "./patient.ts";

export const Practitioner = z.object({
  resourceType: z.literal("Practitioner"),
  id: z.string().optional(),
  identifier: z.array(Identifier).optional(),
  name: z.array(z.object({ use: z.literal("official").optional(), family: z.string().optional(), given: z.array(z.string()).min(1) })).min(1),
  qualification: z.array(z.object({ code: z.object({ text: z.string() }) })).optional(),
});
export type Practitioner = z.infer<typeof Practitioner>;

// Read-only: clients resolve the Practitioner once and cache the reference.
export function practitionerResource(input: {
  id: string;
  nombre: string;
  primerApellido: string;
  segundoApellido?: string | null;
  cedulaProfesional: string;
  especialidad: string;
}): Practitioner {
  return {
    resourceType: "Practitioner",
    id: input.id,
    identifier: [{ system: SYSTEM.cedula, value: input.cedulaProfesional }],
    name: [{ use: "official", given: [input.nombre], family: [input.primerApellido, input.segundoApellido].filter(Boolean).join(" ") }],
    qualification: [{ code: { text: input.especialidad } }],
  };
}
