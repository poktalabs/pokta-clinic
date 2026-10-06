import { z } from "zod";

// No official Mexican FHIR implementation guide exists (see apps/mock-ehr/docs/data-model.md), so
// identifier systems are local URNs and the two surnames use the core R4 name extensions.
export const SYSTEM = {
  curp: "urn:mx:renapo:curp",
  folio: "urn:pokta-clinic:expediente-demo:folio",
  clues: "urn:mx:dgis:clues",
  cedula: "urn:mx:sep:cedula-profesional",
} as const;

export const EXT = {
  fathersFamily: "http://hl7.org/fhir/StructureDefinition/humanname-fathers-family",
  mothersFamily: "http://hl7.org/fhir/StructureDefinition/humanname-mothers-family",
  sexoRenapo: "urn:pokta-clinic:extension:sexo-renapo",
  curpValidada: "urn:pokta-clinic:extension:curp-validada",
} as const;

const Extension = z.object({
  url: z.string(),
  valueString: z.string().optional(),
  valueBoolean: z.boolean().optional(),
});

export const Identifier = z.object({ system: z.string(), value: z.string() });

export const HumanName = z.object({
  use: z.literal("official").optional(),
  family: z.string().optional(),
  given: z.array(z.string()).min(1),
  _family: z.object({ extension: z.array(Extension) }).optional(),
});

export const Patient = z.object({
  resourceType: z.literal("Patient"),
  id: z.string().optional(),
  identifier: z.array(Identifier).optional(),
  name: z.array(HumanName).min(1),
  telecom: z.array(z.object({ system: z.enum(["phone", "email"]), value: z.string() })).min(1),
  gender: z.enum(["male", "female", "other", "unknown"]).optional(),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  address: z.array(z.object({ text: z.string().optional(), postalCode: z.string().optional() })).optional(),
  extension: z.array(Extension).optional(),
});
export type Patient = z.infer<typeof Patient>;

export function bundle<T>(resources: T[]) {
  return {
    resourceType: "Bundle" as const,
    type: "searchset" as const,
    total: resources.length,
    entry: resources.map((resource) => ({ resource })),
  };
}
