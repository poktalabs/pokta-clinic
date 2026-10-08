// Generates the ElevenLabs CLI project (agents.json, tools.json, agent_configs/, tool_configs/)
// into agent/cli/ from the typed sources in this directory. The generator is the source of truth;
// the generated files are committed so a pull request shows exactly what will be pushed.
//
//   POKTA_WEB_URL=https://... pnpm agent:build                      placeholders fill IDs not created yet
//   POKTA_WEB_URL=https://... pnpm agent:build --strict             also fail without a secret ID or on an example URL
//   POKTA_WEB_URL=https://... pnpm agent:build --strict --agent     also fail without the tool and knowledge base IDs (before pushing the agent)
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BRANCHES } from "../../apps/web/src/scheduling/branches.ts";
import { buildAgent } from "./agent.ts";
import { CLI_DIR, loadConfig, readBuildEnv } from "./config.ts";
import { KB_DOCS, KB_REGISTRY, kbFile, type KbRegistryEntry } from "./kb/index.ts";
import { TOOL_SPECS, toWebhookTool } from "./tools/index.ts";
import type { KnowledgeBaseLocator } from "./types.ts";
import { buildWorkflow } from "./workflow.ts";

const strict = process.argv.includes("--strict");
const requireToolIds = process.argv.includes("--agent");
const config = loadConfig();
const env = readBuildEnv(process.env.POKTA_WEB_URL);

const pending: { msg: string; blocking: boolean }[] = [];
const SECRET_PLACEHOLDER = "PENDING_SECRET_ID_run_pnpm_agent_secret";
const toolPlaceholder = (name: string) => `PENDING_TOOL_ID_${name}`;
const kbPlaceholder = (key: string) => `PENDING_KB_ID_${key}`;

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
// Knowledge base: one text file per document under kb_docs/, registered in knowledge_base.json. IDs and
// hashes are written by pnpm agent:kb:push:apply and kept across rebuilds, like the tool IDs.
const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");
const oldKb = existsSync(join(CLI_DIR, KB_REGISTRY))
  ? ((JSON.parse(readFileSync(join(CLI_DIR, KB_REGISTRY), "utf8")) as { docs?: KbRegistryEntry[] }).docs ?? [])
  : [];
const kbDocs = KB_DOCS.map((doc) => {
  const text = `${doc.render().trim()}\n`;
  // Dynamic variables in a document are never filled and would be read aloud as braces.
  if (text.includes("{{")) throw new Error(`knowledge base ${doc.key}: contains "{{"; documents must not use dynamic variables`);
  const file = kbFile(doc.key);
  mkdirSync(join(CLI_DIR, "kb_docs"), { recursive: true });
  writeFileSync(join(CLI_DIR, file), text);
  const previous = oldKb.find((e) => e.key === doc.key);
  const entry: KbRegistryEntry = { key: doc.key, name: doc.name, file, ...(previous?.id ? { id: previous.id } : {}), ...(previous?.sha256 ? { sha256: previous.sha256 } : {}) };
  if (!entry.id) pending.push({ msg: `knowledge base ID for ${doc.key} (created by pnpm agent:kb:push:apply)`, blocking: requireToolIds });
  else if (entry.sha256 !== sha256(text)) pending.push({ msg: `knowledge base ${doc.key} changed since its last upload (run pnpm agent:kb:push:apply)`, blocking: false });
  return { doc, text, entry };
});
writeJson(KB_REGISTRY, { docs: kbDocs.map((d) => d.entry) }, 4);

// The guide must give every branch address exactly as the booking tools return it.
const guide = kbDocs.find((d) => d.doc.key === "primera-visita")?.text ?? "";
for (const branch of Object.values(BRANCHES)) {
  if (!guide.includes(branch.address)) throw new Error(`knowledge base primera-visita: missing the address of ${branch.name}`);
}
const locators = (scope: "agent" | "consent"): KnowledgeBaseLocator[] =>
  kbDocs
    .filter((d) => d.doc.scope === scope)
    .map((d) => ({ type: "text", name: d.doc.name, id: d.entry.id ?? kbPlaceholder(d.doc.key), usage_mode: d.doc.usageMode }));

const workflow = buildWorkflow(
  {
    record_consent: toolId("record_consent"),
    find_patient: toolId("find_patient"),
    save_patient: toolId("save_patient"),
    get_questionnaire: toolId("get_questionnaire"),
    save_history: toolId("save_history"),
    check_availability: toolId("check_availability"),
    book_appointment: toolId("book_appointment"),
    reschedule_appointment: toolId("reschedule_appointment"),
    request_callback: toolId("request_callback"),
    escalate: toolId("escalate"),
  },
  config,
  { consent: locators("consent") },
);

const agentFile = `agent_configs/${config.agent_name}.json`;
const agent = buildAgent({ config, env, workflow, globalToolIds: [], knowledgeBase: locators("agent") });
// No dynamic variables in the agent: a "{{name}}" in a prompt or filler that the client does not pass
// ends the session (WebSocket 1008). Tools may bind only system__ variables, which every session has.
if (JSON.stringify(agent).includes("{{")) throw new Error(`${config.agent_name}: a prompt, message or filler contains "{{"; no dynamic variables`);
if (JSON.stringify(agent).includes("dynamic_variable")) throw new Error(`${config.agent_name}: the agent config references a dynamic_variable`);
for (const spec of Object.values(TOOL_SPECS)) {
  for (const [prop, value] of Object.entries(spec.properties)) {
    if ("dynamic_variable" in value && !value.dynamic_variable.startsWith("system__")) {
      throw new Error(`tool ${spec.name}.${prop}: bound to dynamic variable ${value.dynamic_variable}; only system__ variables are allowed`);
    }
  }
}
writeJson(agentFile, agent, 2);
const oldAgents = readRegistry("agents.json", "agents");
const previousAgent = oldAgents.find((a) => a.config === agentFile);
writeJson("agents.json", { agents: [{ ...previousAgent, config: agentFile }] }, 4);

console.log(`built ${agentFile}, ${toolEntries.length} tools and ${kbDocs.length} knowledge base documents for ${env.baseUrl}`);
if (pending.length) {
  const list = (items: typeof pending) => items.map((p) => `  - ${p.msg}`).join("\n");
  const blockers = pending.filter((p) => p.blocking);
  if (strict && blockers.length) {
    console.error(`strict build failed, unresolved:\n${list(blockers)}`);
    process.exit(1);
  }
  console.warn(`placeholders in the output (fine for a dry run, not for apply):\n${list(pending)}`);
}
