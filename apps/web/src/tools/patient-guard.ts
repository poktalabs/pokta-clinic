import type { ConsentRecord } from "@/ehr";
import type { ToolResult } from "@/tools/handler";

// patient_id is written by the LLM. Once the Consent is linked to a Patient (a new registration), any
// other id is refused. Gap: for a found existing Patient the Consent stays unlinked, so that id is not
// bound to this Conversation server-side (see apps/web/README.md).
export function patientMismatch(consent: ConsentRecord, patientId: string): ToolResult | null {
  if (!consent.patientId || consent.patientId === patientId) return null;
  return {
    patient_mismatch: true,
    message: "That patient_id does not belong to this conversation. Use the patient_id returned by find_patient or save_patient earlier in this conversation.",
  };
}
