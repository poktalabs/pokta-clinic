// Emits apps/web/src/tools-catalog/catalog.json, the agent-side half of the /tools reference page:
// every webhook tool's definition (agent/src/tools), the workflow node it is attached to
// (agent/src/workflow.ts) and the system tools the agent body declares (agent/src/agent.ts). The web
// app cannot import agent/src at build time, so it reads this file instead.
// Usage: pnpm exec tsx scripts/build-tools-catalog.ts            (writes the file)
//        pnpm exec tsx scripts/build-tools-catalog.ts --check    (fails if the file is stale)
// No network, no secrets: the agent body is built with a placeholder origin and no tool IDs.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildAgent } from "../agent/src/agent.ts";
import { loadConfig, readBuildEnv } from "../agent/src/config.ts";
import { SECRET_HEADER, TOOL_SPECS } from "../agent/src/tools/index.ts";
import type { ToolProperty } from "../agent/src/types.ts";
import { buildWorkflow, type WorkflowToolIds } from "../agent/src/workflow.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "apps/web/src/tools-catalog/catalog.json");

// System tools the platform offers that this agent could declare. Listed as "not used" only when the
// built agent body really lacks them.
const KNOWN_SYSTEM_TOOLS = [
  "end_call",
  "language_detection",
  "transfer_to_agent",
  "transfer_to_number",
  "skip_turn",
  "play_keypad_touch_tone",
  "voicemail_detection",
];

type Param = {
  name: string;
  type: string;
  required: boolean;
  description: string | null;
  enum: string[] | null;
  dynamicVariable: string | null;
  children: Param[];
};

function toParam(name: string, prop: ToolProperty, required: boolean): Param {
  const base = { name, type: prop.type, required, enum: null as string[] | null, dynamicVariable: null as string | null, children: [] as Param[] };
  if ("dynamic_variable" in prop) return { ...base, description: null, dynamicVariable: prop.dynamic_variable };
  if (prop.type === "array") return { ...base, type: `array of ${prop.items.type}`, description: prop.description, children: childrenOf(prop.items) };
  if (prop.type === "object") return { ...base, description: prop.description, children: childrenOf(prop) };
  return { ...base, description: prop.description, enum: prop.enum ?? null };
}

function childrenOf(prop: ToolProperty): Param[] {
  if (prop.type !== "object" || !("properties" in prop)) return [];
  return Object.entries(prop.properties).map(([n, p]) => toParam(n, p, prop.required.includes(n)));
}

const config = loadConfig();
// Tool IDs are platform IDs in the real build; the tool name stands in for them here.
const ids = Object.fromEntries(Object.values(TOOL_SPECS).map((s) => [s.name, s.name])) as unknown as WorkflowToolIds;
const workflow = buildWorkflow(ids, config, { consent: [] });
const env = readBuildEnv("https://pokta-clinic-web.vercel.app");
const agent = buildAgent({ config, env, workflow, globalToolIds: [], knowledgeBase: [] }) as {
  conversation_config: { agent: { prompt: { built_in_tools: Record<string, unknown>; tool_ids: string[] } } };
};
const prompt = agent.conversation_config.agent.prompt;
const builtIn = Object.keys(prompt.built_in_tools);

const nodes = Object.entries(workflow.nodes)
  .filter(([, n]) => n.type === "override_agent")
  .map(([id, n]) => {
    const llm = (n.conversation_config as { agent?: { prompt?: { llm?: string } } } | undefined)?.agent?.prompt?.llm ?? config.llm;
    const leadsTo = Object.values(workflow.edges)
      .filter((e) => e.source === id)
      .map((e) => workflow.nodes[e.target]?.label ?? (e.target === "end_node" ? "End" : e.target));
    return { id, label: n.label ?? id, llm, tools: n.additional_tool_ids ?? [], leadsTo };
  });

const tools = Object.values(TOOL_SPECS).map((spec) => {
  const params = Object.entries(spec.properties).map(([n, p]) => toParam(n, p, spec.required.includes(n)));
  const file = Object.entries(TOOL_SPECS).find(([, s]) => s === spec)![0].replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
  return {
    name: spec.name,
    description: spec.description,
    nodes: nodes.filter((n) => n.tools.includes(spec.name)).map((n) => n.label),
    params,
    delivery: {
      toolCallSound: spec.delivery?.tool_call_sound ?? null,
      toolCallSoundBehavior: spec.delivery?.tool_call_sound_behavior ?? null,
      interruptionMode: spec.delivery?.interruption_mode ?? "allow",
    },
    specPath: `agent/src/tools/${file}.ts`,
    routePath: `apps/web/src/app/api/tools/${spec.name}/route.ts`,
  };
});

const dynamicVariables = [...new Set(tools.flatMap((t) => t.params.map((p) => p.dynamicVariable).filter((v): v is string => !!v)))];

const catalog = {
  _generated: "by scripts/build-tools-catalog.ts from agent/src; do not edit by hand",
  webhook: { method: "POST", path: "/api/tools/<name>", secretHeader: SECRET_HEADER, timeoutSecs: config.tool_timeout_secs },
  agentLlm: config.llm,
  globalToolIds: prompt.tool_ids,
  dynamicVariables,
  nodes,
  tools,
  systemTools: {
    used: builtIn,
    notUsed: KNOWN_SYSTEM_TOOLS.filter((t) => !builtIn.includes(t)),
    workflowNodeTypes: [...new Set(Object.values(workflow.nodes).map((n) => n.type))],
  },
};

const json = `${JSON.stringify(catalog, null, 2)}\n`;
if (process.argv.includes("--check")) {
  let current = "";
  try {
    current = readFileSync(OUT, "utf8");
  } catch {
    // missing counts as stale
  }
  if (current !== json) {
    console.error("apps/web/src/tools-catalog/catalog.json is stale: run pnpm exec tsx scripts/build-tools-catalog.ts");
    process.exit(1);
  }
  console.log("tools catalog is up to date");
} else {
  writeFileSync(OUT, json);
  console.log(`wrote ${tools.length} tools, ${nodes.length} nodes to apps/web/src/tools-catalog/catalog.json`);
}
