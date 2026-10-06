import type { EhrAdapter } from "./adapter";
import { fhirEhrAdapter } from "./fhir-adapter";

// Swap point for another EHR.
export const ehr: EhrAdapter = fhirEhrAdapter;

export * from "./adapter";
