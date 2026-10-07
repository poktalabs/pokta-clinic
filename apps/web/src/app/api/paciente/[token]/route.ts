import { z } from "zod";
import { EhrRejectedError, EhrUnavailableError, ehr } from "@/ehr";
import { verifyPatientLink } from "@/patient-link/token";

const optional = (max: number) => z.string().trim().max(max).optional().transform((v) => (v ? v : undefined));

const Patch = z.object({
  email: z.email().max(254).optional().or(z.literal("").transform(() => undefined)),
  address: optional(300),
  postalCode: z.string().trim().regex(/^\d{5}$/).optional().or(z.literal("").transform(() => undefined)),
  emergencyContactName: optional(150),
  emergencyContactPhone: z.string().trim().regex(/^\d{10}$/).optional().or(z.literal("").transform(() => undefined)),
  insurer: optional(150),
  policyNumber: optional(80),
});

// The patient link form: completes the administrative fields of the Patient the signed link names.
// Identity fields (name, phone, birth date) are not editable here; the front desk changes those.
export async function POST(request: Request, ctx: RouteContext<"/api/paciente/[token]">) {
  const { token } = await ctx.params;
  const patientId = verifyPatientLink(token);
  if (!patientId) return Response.json({ error: "El enlace no es válido o ya venció." }, { status: 401 });
  const parsed = Patch.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Revise los datos: el código postal lleva 5 dígitos y el teléfono 10." }, { status: 400 });
  const patch = Object.fromEntries(Object.entries(parsed.data).filter(([, v]) => v !== undefined));
  if (!Object.keys(patch).length) return Response.json({ error: "No hay datos nuevos para guardar." }, { status: 400 });
  try {
    const profile = await ehr.updatePatientProfile(patientId, patch);
    return Response.json({ ok: true, profile });
  } catch (err) {
    if (err instanceof EhrUnavailableError) return Response.json({ error: "El expediente no responde en este momento. Intente más tarde." }, { status: 503 });
    if (err instanceof EhrRejectedError) return Response.json({ error: "El expediente rechazó los datos." }, { status: 422 });
    throw err;
  }
}
