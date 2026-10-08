// Exports the ElevenLabs platform test suite and its latest results for reviewers who cannot open our
// ElevenLabs workspace (the agent's Tests tab). Writes apps/web/src/test-results/results.json, which the
// /testing and home pages render (apps/web/src/components/test-results.tsx).
//
// Reads the test definitions (agent/src/tests/index.ts), the pushed test IDs (agent/cli/tests.json), the
// evaluation criteria and data collection (agent/cli/agent_configs/pokta-clinic.json) and the scripted
// text scenarios (scripts/converse-scenarios.ts). Results come from GET-only calls to the ElevenLabs API:
// it lists the agent's test invocations and reads the newest one that ran each test. It never starts a
// run (that is pnpm agent:tests:run) and never prints the API key. Rerun after every test run or push.
//
// Usage: pnpm tests:export   (reads ELEVENLABS_API_KEY from .env.local)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { TESTS, TEST_REGISTRY, type TestRegistryEntry } from "../agent/src/tests/index.ts";
import { buildScenario } from "./converse-scenarios.ts";

const API = "https://api.elevenlabs.io/v1/convai";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CLI = join(ROOT, "agent/cli");
const OUT = join(ROOT, "apps/web/src/test-results/results.json");
const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;

const agentId = readJson<{ agents: { id: string }[] }>(join(CLI, "agents.json")).agents[0]?.id;
if (!agentId) throw new Error("no agent in agent/cli/agents.json");
const registry = readJson<{ tests: TestRegistryEntry[] }>(join(CLI, TEST_REGISTRY)).tests;
const toolNames = new Map(
  readJson<{ tools: { config: string; id: string }[] }>(join(CLI, "tools.json")).tools.map((t) => [t.id, t.config.replace(/^tool_configs\/|\.json$/g, "")]),
);

// ---- definitions ----

const TYPE_LABEL: Record<string, string> = { simulation: "simulation", llm: "next reply", tool: "tool call" };
// One line for the table: the first sentence, without parenthetical asides.
const firstSentence = (s: string) => (s.split(/(?<=\.)\s+(?=[A-Z])/)[0] ?? s).replace(/\s*\([^)]*\)/g, "").trim();
const sentences = (s: string) => s.split(/(?<=\.)\s+(?=[A-Z])/).map((x) => x.trim()).filter(Boolean);

function checksOf(body: Record<string, unknown>): string[] {
  if (body.type === "simulation") return body.success_conditions as string[];
  if (body.type === "llm") return sentences(String(body.success_condition));
  const p = body.tool_call_parameters as { referenced_tool: { id: string }; parameters: { path: string; eval: { pattern: string } }[]; verify_absence: boolean };
  const tool = toolNames.get(p.referenced_tool.id) ?? p.referenced_tool.id;
  const params = p.parameters.map((x) => `${x.path} matching ${x.eval.pattern}`).join(", ");
  return [`The agent's next turn ${p.verify_absence ? "does not call" : "calls"} ${tool}${params ? ` with ${params}` : ""}.`];
}

// ---- results (GET only) ----

interface InvocationSummary {
  id: string;
  created_at_unix_secs: number;
  title: string;
  test_run_count: number;
  passed_count: number;
  failed_count: number;
  repeat_count: number;
  version_id: string;
  ran_against_draft: boolean;
}
interface TestRun {
  test_id: string;
  status: "pending" | "passed" | "failed" | "cancelled";
  last_updated_at_unix?: number;
}

async function get<T>(path: string): Promise<T> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not set (it lives in .env.local)");
  const res = await fetch(`${API}${path}`, { headers: { "xi-api-key": apiKey } });
  if (res.status !== 200) throw new Error(`GET ${path.split("?")[0]} failed: HTTP ${res.status}`);
  return (await res.json()) as T;
}

async function listInvocations(): Promise<InvocationSummary[]> {
  const all: InvocationSummary[] = [];
  let cursor: string | null = null;
  do {
    const page: { results: InvocationSummary[]; next_cursor: string | null; has_more: boolean } = await get(
      `/test-invocations?agent_id=${agentId}&page_size=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
    );
    all.push(...page.results);
    cursor = page.has_more ? page.next_cursor : null;
  } while (cursor);
  return all.sort((a, b) => b.created_at_unix_secs - a.created_at_unix_secs);
}

const iso = (secs: number) => new Date(secs * 1000).toISOString();

interface Latest {
  passed: number;
  runs: number;
  run_at: string;
  invocation_id: string;
}

async function main(): Promise<void> {
  let source: string;
  let history: { invocation_id: string; run_at: string; title: string; passed: number; runs: number; repeat: number; agent_version_id: string }[] = [];
  const latest = new Map<string, Latest>();
  try {
    const invocations = await listInvocations();
    history = invocations.map((i) => ({
      invocation_id: i.id,
      run_at: iso(i.created_at_unix_secs),
      title: i.title,
      passed: i.passed_count,
      runs: i.test_run_count,
      repeat: i.repeat_count,
      agent_version_id: i.version_id,
    }));
    // Walk newest first until every pushed test has its latest invocation.
    const wanted = new Set(registry.map((r) => r.id));
    for (const inv of invocations) {
      if ([...wanted].every((id) => latest.has(id))) break;
      const detail = await get<{ test_runs: TestRun[] }>(`/test-invocations/${inv.id}`);
      for (const id of wanted) {
        if (latest.has(id)) continue;
        const mine = detail.test_runs.filter((r) => r.test_id === id && r.status !== "pending");
        if (mine.length === 0) continue;
        latest.set(id, { passed: mine.filter((r) => r.status === "passed").length, runs: mine.length, run_at: iso(inv.created_at_unix_secs), invocation_id: inv.id });
      }
    }
    source = "ElevenLabs API: GET /v1/convai/test-invocations (latest invocation per test)";
  } catch (err) {
    if (existsSync(OUT)) {
      console.error(`${(err as Error).message}; kept the existing ${OUT.replace(`${ROOT}/`, "")}`);
      process.exit(1);
    }
    console.error(`${(err as Error).message}; writing definitions only, results from docs/agent.md`);
    source = "docs/agent.md, Platform tests section (the API was unreachable at export time)";
  }

  // ---- scenarios, evaluation criteria, data collection ----

  const scenarioSource = readFileSync(join(ROOT, "scripts/converse-scenarios.ts"), "utf8");
  const KNOWN = "5500000000";
  process.env.SCENARIO_PHONE = KNOWN;
  const scenarios = [...scenarioSource.matchAll(/case "([a-z_]+)":/g)].map(([, key]) => {
    const s = buildScenario(key as string);
    const description = s.description.replaceAll(KNOWN, "(a patient from an earlier golden run)").replace(/\b55\d{8}\b/g, "(random, fictional)");
    return { key: s.name, language: s.language ?? "es", description };
  });

  const config = readJson<{
    platform_settings: {
      evaluation: { criteria: { id: string; name: string; conversation_goal_prompt: string }[] };
      data_collection: Record<string, { type: string; enum?: string[]; description: string }>;
    };
  }>(join(CLI, "agent_configs/pokta-clinic.json"));
  const criteria = config.platform_settings.evaluation.criteria.map((c) => ({ id: c.id, name: c.name, checks: firstSentence(c.conversation_goal_prompt) }));
  const dataCollection = Object.entries(config.platform_settings.data_collection).map(([id, d]) => ({
    id,
    type: d.type,
    ...(d.enum ? { values: d.enum } : {}),
    description: firstSentence(d.description),
  }));

  // ---- write ----

  const tests = TESTS.map((t) => {
    const entry = registry.find((r) => r.key === t.key);
    const result = entry ? latest.get(entry.id) : undefined;
    const checks = checksOf(t.body);
    return {
      key: t.key,
      name: t.name.replace(/^PoktaClinic:\s*/, ""),
      type: TYPE_LABEL[String(t.body.type)] ?? String(t.body.type),
      node: t.node ?? "start",
      summary: firstSentence(checks[0] ?? ""),
      checks,
      pushed: Boolean(entry),
      passed: result?.passed ?? null,
      runs: result?.runs ?? null,
      run_at: result?.run_at ?? null,
      invocation_id: result?.invocation_id ?? null,
    };
  });
  const ran = tests.filter((t) => t.runs !== null);
  const out = {
    exported_at: new Date().toISOString(),
    source,
    agent_id: agentId,
    totals: {
      tests: tests.length,
      passed: ran.reduce((n, t) => n + (t.passed ?? 0), 0),
      runs: ran.reduce((n, t) => n + (t.runs ?? 0), 0),
      last_run_at: ran.map((t) => t.run_at as string).sort().at(-1) ?? null,
    },
    tests,
    history,
    scenarios,
    evaluation_criteria: criteria,
    data_collection: dataCollection,
  };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`);
  console.log(`wrote ${OUT.replace(`${ROOT}/`, "")}: ${tests.length} tests, ${out.totals.passed}/${out.totals.runs} latest runs passed, ${history.length} invocations, ${scenarios.length} scenarios, ${criteria.length} criteria, ${dataCollection.length} data fields`);
  const missing = tests.filter((t) => t.runs === null).map((t) => t.key);
  if (missing.length) console.log(`not run yet: ${missing.join(", ")}`);
}

main().catch((err: Error) => {
  console.error(err.message);
  process.exit(1);
});
