// Generates the ElevenLabs CLI project (agents.json, tools.json, agent_configs/, tool_configs/)
// into agent/cli/ from the typed sources in this directory. The generator is the source of truth;
// the generated files are committed so a pull request shows exactly what will be pushed.
//
//   POKTA_WEB_URL=https://... pnpm agent:build                      placeholders fill IDs not created yet
//   POKTA_WEB_URL=https://... pnpm agent:build --strict             also fail without a secret ID or on an example URL
//   POKTA_WEB_URL=https://... pnpm agent:build --strict --agent     also fail without the tool IDs (before pushing the agent)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildAgent } from "./agent.ts";
import { CLI_DIR, loadConfig, readBuildEnv } from "./config.ts";
import { TOOL_SPECS, toWebhookTool } from "./tools/index.ts";
import { buildWorkflow } from "./workflow.ts";

const strict = process.argv.includes("--strict");
const requireToolIds = process.argv.includes("--agent");
const config = loadConfig();
const env = readBuildEnv(process.env.POKTA_WEB_URL);

const pending: { msg: string; blocking: boolean }[] = [];
const SECRET_PLACEHOLDER = "PENDING_SECRET_ID_run_pnpm_agent_secret";
const toolPlaceholder = (name: string) => `PENDING_TOOL_ID_${name}`;

interface RegistryEntry {
  config: string;
  id?: string;
  [extra: string]: unknown;
}
// The CLI writes IDs back into the registries after the first push. Keep them across rebuilds.
function readRegistry(file: string, key: string): RegistryEntry[] {
  const path = join(CLI_DIR, file);
  if (!existsSync(path)) return [];
  return (JSON.parse(readFileSync(path, "utf8")) as Record<string, RegistryEntry[]>)[key] ?? [];
}
function writeJson(file: string, value: unknown, indent: number) {
  const path = join(CLI_DIR, file);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, indent)}\n`);
}

// "blocking" entries fail a --strict build; all entries are printed as warnings otherwise.
if (!config.tool_secret_id) pending.push({ msg: "tool_secret_id in agent/config.json (run pnpm agent:secret)", blocking: true });
if (/example/i.test(env.baseHost)) pending.push({ msg: `POKTA_WEB_URL host looks like a placeholder: ${env.baseHost}`, blocking: true });
const secretId = config.tool_secret_id || SECRET_PLACEHOLDER;

// Tools: one config file per tool, registered in tools.json (type + config path + id once pushed).
const oldTools = readRegistry("tools.json", "tools");
const toolEntries = Object.values(TOOL_SPECS).map((spec) => {
  const file = `tool_configs/${spec.name}.json`;
  writeJson(file, toWebhookTool(spec, { baseUrl: env.baseUrl, secretId, timeoutSecs: config.tool_timeout_secs }), 2);
  const previous = oldTools.find((t) => t.config === file);
  return { name: spec.name, entry: { type: "webhook", config: file, ...(previous?.id ? { id: previous.id } : {}) } };
});
writeJson("tools.json", { tools: toolEntries.map((t) => t.entry) }, 4);

// Agent tool references are the IDs the platform assigned when `tools push` created each tool.
const toolId = (name: string): string => {
  const id = (toolEntries.find((t) => t.name === name)?.entry as { id?: string } | undefined)?.id;
  if (id) return id;
  pending.push({ msg: `tool ID for ${name} (created by pnpm agent:tools:push:apply)`, blocking: requireToolIds });
  return toolPlaceholder(name);
};
const workflow = buildWorkflow({
  record_consent: toolId("record_consent"),
  find_patient: toolId("find_patient"),
  save_patient: toolId("save_patient"),
});

const agentFile = `agent_configs/${config.agent_name}.json`;
writeJson(agentFile, buildAgent({ config, env, workflow, globalToolIds: [] }), 2);
const oldAgents = readRegistry("agents.json", "agents");
const previousAgent = oldAgents.find((a) => a.config === agentFile);
writeJson("agents.json", { agents: [{ ...previousAgent, config: agentFile }] }, 4);

console.log(`built ${agentFile} and ${toolEntries.length} tools for ${env.baseUrl}`);
if (pending.length) {
  const list = (items: typeof pending) => items.map((p) => `  - ${p.msg}`).join("\n");
  const blockers = pending.filter((p) => p.blocking);
  if (strict && blockers.length) {
    console.error(`strict build failed, unresolved:\n${list(blockers)}`);
    process.exit(1);
  }
  console.warn(`placeholders in the output (fine for a dry run, not for apply):\n${list(pending)}`);
}
