// Runs the pushed agent tests (agent/cli/tests.json) against the live agent and prints a pass-rate
// table. Each test runs on the workflow node its definition names (agent/src/tests/index.ts). Running
// tests does not change the agent; simulations mock every webhook tool, and unit tests do not execute
// tools, so nothing is written to the EHR, the calendar or the mailer. Each run uses credits.
//
//   pnpm agent:tests:run                          every test, 3 runs each
//   pnpm agent:tests:run --repeat 5               every test, 5 runs each
//   pnpm agent:tests:run --only no-diagnosis,phone-correction
//   pnpm agent:tests:run --json <file>            also save the raw invocation (transcripts, rationales)
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CLI_DIR } from "../src/config.ts";
import { TESTS, TEST_REGISTRY, type TestRegistryEntry } from "../src/tests/index.ts";

const apiKey = process.env.ELEVENLABS_API_KEY;
if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not set (it lives in .env.local).");
const API = "https://api.elevenlabs.io/v1/convai";

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const repeat = Number(arg("--repeat") ?? 3);
const only = arg("--only")?.split(",").map((s) => s.trim());
const jsonOut = arg("--json");
if (!Number.isInteger(repeat) || repeat < 1 || repeat > 50) throw new Error("--repeat must be an integer from 1 to 50");

const agentId = (JSON.parse(readFileSync(join(CLI_DIR, "agents.json"), "utf8")) as { agents: { id: string }[] }).agents[0]?.id;
if (!agentId) throw new Error("no agent in agent/cli/agents.json");
const registry = (JSON.parse(readFileSync(join(CLI_DIR, TEST_REGISTRY), "utf8")) as { tests: TestRegistryEntry[] }).tests;

const selected = TESTS.filter((t) => !only || only.includes(t.key)).map((t) => {
  const entry = registry.find((e) => e.key === t.key);
  if (!entry) throw new Error(`${t.key} is not in agent/cli/${TEST_REGISTRY}; run pnpm agent:tests:push:apply first`);
  return { ...t, id: entry.id };
});
if (selected.length === 0) throw new Error(`no test matches --only ${only?.join(",")}`);

async function call(method: string, path: string, body?: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { "xi-api-key": apiKey as string, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.status !== 200) {
    const detail = res.status === 422 ? `: ${JSON.stringify(json.detail).slice(0, 1500)}` : "";
    throw new Error(`${method} ${path} failed: HTTP ${res.status}${detail}`);
  }
  return json;
}

interface TestRun {
  test_run_id: string;
  test_id: string;
  status: "pending" | "passed" | "failed" | "cancelled";
  condition_result?: { result?: string; rationale?: { summary?: string; messages?: string[] } } | null;
}

console.log(`running ${selected.length} tests x ${repeat} on ${agentId}`);
const started = await call("POST", `/agents/${agentId}/run-tests`, {
  tests: selected.map((t) => (t.node ? { test_id: t.id, workflow_node_id: t.node } : { test_id: t.id })),
  ...(repeat > 1 ? { repeat_count: repeat } : {}),
});
const invocationId = String(started.id);
console.log(`invocation ${invocationId}`);

// Poll until no run is pending (simulations take a minute or two each; they run in parallel).
let invocation = started;
const deadline = Date.now() + 30 * 60_000;
for (;;) {
  const runs = (invocation.test_runs as TestRun[] | undefined) ?? [];
  const pending = runs.filter((r) => r.status === "pending").length;
  if (runs.length > 0 && pending === 0) break;
  if (Date.now() > deadline) throw new Error(`timed out with ${pending} runs pending; check invocation ${invocationId}`);
  process.stdout.write(`  ${runs.length - pending}/${runs.length} done\r`);
  await new Promise((resolve) => setTimeout(resolve, 10_000));
  invocation = await call("GET", `/test-invocations/${invocationId}`);
}
// Failure bucketing finishes after the runs; give it a moment so the saved JSON includes it.
if (repeat > 1 && jsonOut) {
  for (let i = 0; i < 12 && invocation.bucketing_status === "pending"; i++) {
    await new Promise((resolve) => setTimeout(resolve, 5_000));
    invocation = await call("GET", `/test-invocations/${invocationId}`);
  }
}
if (jsonOut) writeFileSync(jsonOut, `${JSON.stringify(invocation, null, 2)}\n`);

const runs = invocation.test_runs as TestRun[];
const rows = selected.map((t) => {
  const mine = runs.filter((r) => r.test_id === t.id);
  const passed = mine.filter((r) => r.status === "passed").length;
  return { t, mine, passed };
});
const pad = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}.` : s.padEnd(n));
console.log(`\n${pad("test", 30)} ${pad("type", 11)} ${pad("node", 15)} ${pad("passed", 8)} rate`);
for (const { t, mine, passed } of rows) {
  const rate = mine.length ? Math.round((100 * passed) / mine.length) : 0;
  console.log(`${pad(t.key, 30)} ${pad(String(t.body.type), 11)} ${pad(t.node ?? "start", 15)} ${pad(`${passed}/${mine.length}`, 8)} ${rate}%`);
}
const total = rows.reduce((n, r) => n + r.mine.length, 0);
const passedTotal = rows.reduce((n, r) => n + r.passed, 0);
console.log(`\noverall ${passedTotal}/${total}`);

const failures = rows.flatMap(({ t, mine }) => mine.filter((r) => r.status !== "passed").map((r) => ({ t, r })));
if (failures.length) {
  console.log("\nfailed runs (open them in the dashboard: agent, Tests tab, or the invocation above):");
  for (const { t, r } of failures) {
    const why = r.condition_result?.rationale?.summary || r.condition_result?.rationale?.messages?.join(" ") || r.status;
    console.log(`- ${t.key} run ${r.test_run_id}: ${why.replace(/\s+/g, " ").slice(0, 400)}`);
  }
}
process.exitCode = failures.length ? 1 : 0;
