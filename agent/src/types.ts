// Minimal typed subset of the ElevenLabs agent create/update body. The CLI validates the full body
// against its embedded OpenAPI schema (`pnpm agent:validate`), so these types only cover what we emit.

export type JsonObject = { [key: string]: JsonValue };
export type JsonValue = string | number | boolean | null | JsonValue[] | JsonObject;

// One property of a tool body schema. Exactly one value source is set: the LLM fills it from
// `description`, or the platform fills it from a dynamic variable.
export type ToolProperty =
  | { type: "string" | "boolean" | "integer" | "number"; description: string; enum?: string[] }
  | { type: "string"; dynamic_variable: string }
  // Nested shapes are accepted by the API (ArrayJsonSchemaProperty, ObjectJsonSchemaProperty).
  | { type: "array"; description: string; items: ToolProperty }
  | { type: "object"; description: string; required: string[]; properties: Record<string, ToolProperty> };

export type SecretHeader = { secret_id: string };

export interface WebhookTool {
  type: "webhook";
  name: string;
  description: string;
  response_timeout_secs: number;
  api_schema: {
    url: string;
    method: "POST";
    request_headers: Record<string, string | SecretHeader>;
    request_body_schema: {
      type: "object";
      required: string[];
      properties: Record<string, ToolProperty>;
    };
  };
}

// What a tool module exports: the definition minus the parts that depend on the environment.
export interface ToolSpec {
  name: string;
  description: string;
  required: string[];
  properties: Record<string, ToolProperty>;
}

export type EdgeCondition = { type: "unconditional" } | { type: "llm"; condition: string };

export interface WorkflowNode {
  type: "start" | "end" | "override_agent";
  label?: string;
  additional_prompt?: string;
  additional_tool_ids?: string[];
  /** Per-node override of the agent's conversation config; we only use it to swap the LLM. */
  conversation_config?: JsonObject;
  edge_order?: string[];
}

export interface WorkflowEdge {
  source: string;
  target: string;
  forward_condition: EdgeCondition;
}

export interface Workflow {
  nodes: Record<string, WorkflowNode>;
  edges: Record<string, WorkflowEdge>;
}
