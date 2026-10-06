// Validates the generated files against ElevenLabs' OpenAPI spec. The CLI's own --dry-run only catches
// unknown keys; this also checks enums, node types and edge conditions inside the workflow.
// Spec source: the live https://api.elevenlabs.io/openapi.json (a read-only GET, no key), because the
// spec embedded in CLI 1.4.0 lags the API (it lacks the eleven_v4_turbo TTS model). If the fetch fails
// it falls back to the embedded spec, which can report false failures for models newer than the CLI.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import { CLI_DIR } from "./config.ts";

interface Spec {
  components: { schemas: Record<string, unknown> };
  paths: Record<string, Record<string, { requestBody?: { content: Record<string, { schema: { $ref: string } }> } }>>;
}

async function loadSpecText(): Promise<string> {
  try {
    const res = await fetch("https://api.elevenlabs.io/openapi.json", { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    console.log("spec: live api.elevenlabs.io/openapi.json");
    return await res.text();
  } catch (err) {
    console.warn(`spec: live fetch failed (${(err as Error).message}), using the spec embedded in the CLI`);
    return execFileSync("elevenlabs", ["agents", "create", "--spec-raw"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  }
}
const specText = await loadSpecText();
const spec = JSON.parse(specText) as Spec;

// The embedded spec has a few dangling $refs (for example DynamicVariablesConfig-Input). Resolve each
// to its un-suffixed schema when there is one, else to "anything", so one bad ref cannot block validation.
for (const [, name] of specText.matchAll(/#\/components\/schemas\/([^"]+)/g)) {
  if (name && !(name in spec.components.schemas)) {
    spec.components.schemas[name] = spec.components.schemas[name.replace(/-(Input|Output)$/, "")] ?? {};
  }
}

function bodyRef(path: string): string {
  const ref = spec.paths[path]?.post?.requestBody?.content["application/json"]?.schema.$ref;
  if (!ref) throw new Error(`no request body schema for POST ${path} in the embedded spec`);
  return ref;
}

const ajv = new Ajv2020({ strict: false, allErrors: true });
ajv.addSchema({ $id: "spec", components: spec.components });
const agentCheck = ajv.compile({ $ref: `spec${bodyRef("/v1/convai/agents/create")}` });
const toolCheck = ajv.compile({ $ref: `spec${bodyRef("/v1/convai/tools")}` });

const read = (file: string) => JSON.parse(readFileSync(join(CLI_DIR, file), "utf8")) as unknown;
const registry = (file: string, key: string) => (read(file) as Record<string, { config: string }[]>)[key] ?? [];

let failed = 0;
function check(label: string, ok: boolean, errors: unknown) {
  if (ok) return console.log(`ok   ${label}`);
  failed++;
  console.error(`FAIL ${label}`);
  for (const e of (errors as { instancePath: string; message?: string }[]) ?? []) console.error(`     ${e.instancePath || "/"} ${e.message}`);
}

for (const { config } of registry("tools.json", "tools")) {
  check(config, toolCheck({ tool_config: read(config) }), toolCheck.errors);
}
for (const { config } of registry("agents.json", "agents")) {
  check(config, agentCheck(read(config)), agentCheck.errors);
}
if (failed) process.exit(1);
