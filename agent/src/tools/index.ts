import type { ToolSpec, WebhookTool } from "../types.ts";
import { findPatient } from "./find-patient.ts";
import { recordConsent } from "./record-consent.ts";
import { savePatient } from "./save-patient.ts";

export const TOOL_SPECS = { recordConsent, findPatient, savePatient } as const;
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
    api_schema: {
      url: `${env.baseUrl}/api/tools/${spec.name}`,
      method: "POST",
      request_headers: { [SECRET_HEADER]: { secret_id: env.secretId } },
      request_body_schema: { type: "object", required: spec.required, properties: spec.properties },
    },
  };
}
