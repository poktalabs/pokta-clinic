import type { ToolSpec, WebhookTool } from "../types.ts";
import { bookAppointment } from "./book-appointment.ts";
import { checkAvailability } from "./check-availability.ts";
import { escalate } from "./escalate.ts";
import { findPatient } from "./find-patient.ts";
import { getQuestionnaire } from "./get-questionnaire.ts";
import { recordConsent } from "./record-consent.ts";
import { saveHistory } from "./save-history.ts";
import { requestCallback } from "./request-callback.ts";
import { rescheduleAppointment } from "./reschedule-appointment.ts";
import { savePatient } from "./save-patient.ts";

export const TOOL_SPECS = {
  recordConsent,
  findPatient,
  savePatient,
  getQuestionnaire,
  saveHistory,
  checkAvailability,
  bookAppointment,
  rescheduleAppointment,
  requestCallback,
  escalate,
} as const;
export const SECRET_HEADER = "x-pokta-tool-secret";

export interface ToolEnv {
  baseUrl: string;
  secretId: string;
  timeoutSecs: number;
}

// Each tool is a POST to <base>/api/tools/<name> with the shared secret in a header.
export function toWebhookTool(spec: ToolSpec, env: ToolEnv): WebhookTool {
  return {
    type: "webhook",
    name: spec.name,
    description: spec.description,
    response_timeout_secs: env.timeoutSecs,
    ...spec.delivery,
    api_schema: {
      url: `${env.baseUrl}/api/tools/${spec.name}`,
      method: "POST",
      request_headers: { [SECRET_HEADER]: { secret_id: env.secretId } },
      request_body_schema: { type: "object", required: spec.required, properties: spec.properties },
    },
  };
}
