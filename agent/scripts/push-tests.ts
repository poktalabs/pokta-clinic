// Creates or updates the agent tests defined in agent/src/tests/index.ts, then records each test's ID
// and body hash in agent/cli/tests.json. Dry run by default; `--apply` WRITES test resources to
// ElevenLabs (tests only: the agent itself is not touched). The API key is never printed, and neither
// are response bodies.
//
//   pnpm agent:tests:push          dry run: what would be created, updated or left alone (read-only GETs)
//   pnpm agent:tests:push:apply    create and update for real
//
// Per test: no ID yet -> reuse a test with exactly the same name, else create one; ID but a different
// hash -> PUT the new body. Simulation tests mock every webhook tool (agent/src/tests/mocks.ts).
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CLI_DIR } from "../src/config.ts";
import { TESTS, TEST_REGISTRY, type TestRegistryEntry } from "../src/tests/index.ts";

const apply = process.argv.includes("--apply");
const apiKey = process.env.ELEVENLABS_API_KEY;
const API = "https://api.elevenlabs.io/v1/convai/agent-testing";
const REGISTRY_PATH = join(CLI_DIR, TEST_REGISTRY);

if (apply && !apiKey) throw new Error("ELEVENLABS_API_KEY is not set (it lives in .env.local).");

const registry: TestRegistryEntry[] = existsSync(REGISTRY_PATH) ? (JSON.parse(readFileSync(REGISTRY_PATH, "utf8")) as { tests: TestRegistryEntry[] }).tests : [];
const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

async function call(method: string, path: string, body?: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { "xi-api-key": apiKey as string, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}
// Validation errors (422) name the offending field, which is safe to print; other bodies are not.
function expectOk(what: string, r: { status: number; json: Record<string, unknown> }) {
  if (r.status === 200) return;
  const detail = r.status === 422 ? `: ${JSON.stringify(r.json.detail).slice(0, 1500)}` : "";
  throw new Error(`${what} failed: HTTP ${r.status}${detail}`);
}

// A test with exactly this name, if one exists. Read-only, so the dry run uses it too.
async function findByName(name: string): Promise<string | null> {
  const r = await call("GET", `?search=${encodeURIComponent(name)}&page_size=100`);
  expectOk(`search for "${name}"`, r);
  const match = (r.json.tests as { id: string; name: string }[] | undefined)?.find((t) => t.name === name);
  return match?.id ?? null;
}

function saveRegistry() {
  writeFileSync(REGISTRY_PATH, `${JSON.stringify({ tests: registry }, null, 4)}\n`);
}

if (!apply) console.log("dry run: nothing is written to ElevenLabs.");
for (const test of TESTS) {
  const body = { name: test.name, ...test.body };
  const hash = sha256(JSON.stringify(body));
  const type = String(test.body.type);
  const label = `"${test.name}" (${test.key}, ${type}${test.node ? `, node ${test.node}` : ""})`;
  let entry = registry.find((e) => e.key === test.key);

  let id = entry?.id ?? null;
  let action: "create" | "update" | "unchanged";
  if (id) {
    action = entry?.sha256 === hash ? "unchanged" : "update";
  } else {
    const existing = apiKey ? await findByName(test.name) : null;
    id = existing;
    action = existing ? "update" : "create";
  }

  if (!apply) {
    console.log(`would ${action === "unchanged" ? "leave unchanged" : action}${id ? ` ${id}` : ""}: ${label}`);
    continue;
  }

  if (action === "create") {
    const r = await call("POST", "/create", body);
    expectOk(`create ${label}`, r);
    id = String(r.json.id);
    console.log(`created ${id}: ${label}`);
  } else if (action === "update") {
    const r = await call("PUT", `/${id}`, body);
    expectOk(`update ${label}`, r);
    console.log(`updated ${id}: ${label}`);
  } else {
    console.log(`unchanged ${id}: ${label}`);
  }
  if (!entry) {
    entry = { key: test.key, name: test.name, id: id as string, sha256: hash };
    registry.push(entry);
  }
  Object.assign(entry, { name: test.name, id: id as string, sha256: hash });
  saveRegistry();
}
if (apply) console.log(`IDs recorded in agent/cli/${TEST_REGISTRY}. Next: pnpm agent:tests:run.`);
