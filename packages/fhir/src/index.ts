// The FHIR R4 contract shared by pokta-clinic and the mock EHR. Resource schemas land here once the
// NOM-004/NOM-024 data model is written (apps/mock-ehr/docs/data-model.md).
import { z } from "zod";

export const FHIR_VERSION = "4.0.1";

export const OperationOutcome = z.object({
  resourceType: z.literal("OperationOutcome"),
  issue: z
    .array(
      z.object({
        severity: z.enum(["fatal", "error", "warning", "information"]),
        code: z.string(),
        diagnostics: z.string().optional(),
      }),
    )
    .min(1),
});
export type OperationOutcome = z.infer<typeof OperationOutcome>;

export function operationOutcome(
  code: string,
  diagnostics: string,
  severity: OperationOutcome["issue"][number]["severity"] = "error",
): OperationOutcome {
  return { resourceType: "OperationOutcome", issue: [{ severity, code, diagnostics }] };
}

export * from "./patient.js";
