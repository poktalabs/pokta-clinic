import { EXT, SYSTEM, type Patient } from "@pokta-clinic/fhir";
import type { patient } from "../db/schema.js";

type PatientRow = typeof patient.$inferSelect;
export type PatientInput = Omit<typeof patient.$inferInsert, "id" | "establishmentId" | "folio" | "createdAt">;

const GENDER = { H: "male", M: "female" } as const;

export function toFhir(row: PatientRow): Patient {
  const familyParts = [row.primerApellido, row.segundoApellido].filter(Boolean) as string[];
  const familyExt: { url: string; valueString: string }[] = [{ url: EXT.fathersFamily, valueString: row.primerApellido }];
  if (row.segundoApellido) familyExt.push({ url: EXT.mothersFamily, valueString: row.segundoApellido });

  const identifier: { system: string; value: string }[] = [{ system: SYSTEM.folio, value: row.folio }];
  if (row.curp) identifier.push({ system: SYSTEM.curp, value: row.curp });

  const extension: NonNullable<Patient["extension"]> = [];
  if (row.sexo) extension.push({ url: EXT.sexoRenapo, valueString: row.sexo });
  if (row.curp) extension.push({ url: EXT.curpValidada, valueBoolean: row.curpValidada });

  return {
    resourceType: "Patient",
    id: row.id,
    identifier,
    name: [{ use: "official", given: [row.nombre], family: familyParts.join(" "), _family: { extension: familyExt } }],
    telecom: [{ system: "phone", value: row.telefono }],
    gender: row.sexo ? GENDER[row.sexo] : undefined,
    birthDate: row.fechaNacimiento ?? undefined,
    address: row.domicilio || row.codigoPostal ? [{ text: row.domicilio ?? undefined, postalCode: row.codigoPostal ?? undefined }] : undefined,
    extension: extension.length ? extension : undefined,
  };
}

function ext(list: { url: string; valueString?: string }[] | undefined, url: string) {
  return list?.find((e) => e.url === url)?.valueString;
}

export function fromFhir(resource: Patient): PatientInput {
  const name = resource.name[0];
  const familyExt = name._family?.extension;
  const [fallbackPrimer, ...fallbackRest] = (name.family ?? "").split(" ").filter(Boolean);
  const primerApellido = ext(familyExt, EXT.fathersFamily) ?? fallbackPrimer;
  if (!primerApellido) throw new Error("Patient.name needs a primer apellido (NOM-024 Table 1)");
  const sexo = (ext(resource.extension, EXT.sexoRenapo) ??
    (resource.gender === "male" ? "H" : resource.gender === "female" ? "M" : undefined)) as "H" | "M" | undefined;
  return {
    nombre: name.given.join(" "),
    primerApellido,
    segundoApellido: ext(familyExt, EXT.mothersFamily) ?? (fallbackRest.join(" ") || null),
    curp: resource.identifier?.find((i) => i.system === SYSTEM.curp)?.value.toUpperCase() ?? null,
    telefono: normalizePhone(resource.telecom.find((t) => t.system === "phone")?.value ?? ""),
    fechaNacimiento: resource.birthDate ?? null,
    sexo: sexo ?? null,
    domicilio: resource.address?.[0]?.text ?? null,
    codigoPostal: resource.address?.[0]?.postalCode ?? null,
  };
}

// Mexican numbers are 10 digits; callers often add +52 or spaces.
export function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}
