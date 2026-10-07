// Holds a scripted, text-only conversation with the deployed agent over the Agents WebSocket API,
// then fetches the stored conversation to show workflow nodes, tool calls and analysis.
// Usage: pnpm agent:converse <golden|refuse|redflag> [--audio]   (reads ELEVENLABS_API_KEY from .env.local)
import { ConverseClient, type AgentEvent } from "./converse-client.ts";
import { buildScenario, isGoodbye, normalize } from "./converse-scenarios.ts";

const AGENT_ID = process.env.ELEVENLABS_AGENT_ID ?? "agent_1701m47rjpwcfqasqaw19hph7qb4";
const API = "https://api.elevenlabs.io/v1/convai";
const MAX_TURNS = 50;
const MAX_MS = 10 * 60_000;

const json = (v: unknown): string => JSON.stringify(v);
const apiKey = process.env.ELEVENLABS_API_KEY;

function logEvent(e: AgentEvent): void {
  switch (e.type) {
    case "agent_response":
      console.log(`  AGENT: ${(e.agent_response_event as { agent_response: string }).agent_response}`);
      break;
    case "agent_tool_request":
    case "agent_tool_response":
    case "client_tool_call":
    case "mcp_tool_call":
    case "agent_response_metadata":
    case "client_error":
    case "guardrail_triggered":
      console.log(`  [${e.type}] ${json(e[e.type] ?? e[`${e.type}_event`] ?? e)}`);
      break;
    case "conversation_initiation_metadata":
      break;
    default:
      if (/node|workflow|transfer/i.test(e.type)) console.log(`  [${e.type}] ${json(e)}`);
  }
}

async function converse(name: string): Promise<string> {
  const scenario = buildScenario(name);
  console.log(`Scenario ${scenario.name}: ${scenario.description}`);
  const run = async (textOnly: boolean) => {
    const client = new ConverseClient({ agentId: AGENT_ID, apiKey, textOnly, onEvent: logEvent });
    await client.connect();
    return client;
  };
  let client: ConverseClient;
  try {
    client = await run(!process.argv.includes("--audio"));
  } catch (err) {
    console.log(`text-only override failed (${(err as Error).message}); retrying in normal mode`);
    client = await run(false);
  }
  console.log(`Conversation ID: ${client.conversationId}`);

  const used = new Set<number>();
  const started = Date.now();
  let from = 0;
  let farewellSent = false;
  // The agent speaks first (first_message), so wait for it before the first user turn.
  await client.waitForAgent(from);
  for (let turn = 1; turn <= MAX_TURNS && Date.now() - started < MAX_MS && !client.closed; turn++) {
    const texts = client.agentTextsSince(from);
    // Match the agent's last question when there is one, so a preamble ("gracias por su consentimiento") does not pick the rule.
    const all = normalize(texts.join(" "));
    const q = all.lastIndexOf("¿");
    const last = q >= 0 ? all.slice(q) : all;
    let say: string | undefined;
    if (isGoodbye(texts.join(" "))) {
      if (farewellSent) break;
      farewellSent = true;
      say = scenario.farewell;
    } else {
      const idx = scenario.rules.findIndex((r, i) => r.match.test(last) && !(r.once && used.has(i)));
      if (idx >= 0) {
        used.add(idx);
        say = scenario.rules[idx]?.say;
      }
      say ??= scenario.fallback;
    }
    from = client.events.length;
    console.log(`  USER (turn ${turn}): ${say}`);
    client.sendUserMessage(say);
    await client.waitForAgent(from);
  }
  if (client.closed) console.log(`socket closed by server: ${client.closeInfo}`);
  client.close();
  return client.conversationId;
}

// Fetch the stored conversation, polling until the platform has finished processing it.
async function report(id: string): Promise<void> {
  if (!apiKey) {
    console.log("ELEVENLABS_API_KEY missing: skipping stored conversation report");
    return;
  }
  type Conv = {
    status?: string;
    transcript?: Array<{
      role: string;
      message?: string | null;
      agent_metadata?: { workflow_node_id?: string; agent_id?: string } | null;
      tool_calls?: Array<{ tool_name: string; params_as_json?: string }>;
      tool_results?: Array<{ tool_name: string; result_value?: string; is_error?: boolean }>;
    }>;
    analysis?: { data_collection_results?: Record<string, unknown>; evaluation_criteria_results?: Record<string, unknown>; call_successful?: string; transcript_summary?: string };
  };
  let conv: Conv = {};
  for (let i = 0; i < 24; i++) {
    const res = await fetch(`${API}/conversations/${id}`, { headers: { "xi-api-key": apiKey } });
    conv = (await res.json()) as Conv;
    if (conv.status === "done" || conv.status === "failed") break;
    await new Promise((r) => setTimeout(r, 5000));
  }
  console.log(`\n=== Stored conversation ${id} (status ${conv.status}) ===`);
  for (const [i, t] of (conv.transcript ?? []).entries()) {
    const node = t.agent_metadata?.workflow_node_id ? ` [node ${t.agent_metadata.workflow_node_id}]` : "";
    console.log(`${i} ${t.role}${node}: ${t.message ?? ""}`);
    for (const c of t.tool_calls ?? []) console.log(`    tool_call ${c.tool_name} ${c.params_as_json ?? ""}`);
    for (const r of t.tool_results ?? []) console.log(`    tool_result ${r.tool_name}${r.is_error ? " (error)" : ""} ${(r.result_value ?? "").slice(0, 400)}`);
  }
  console.log("\nAnalysis:");
  console.log(json({ call_successful: conv.analysis?.call_successful, data_collection: conv.analysis?.data_collection_results, evaluation: conv.analysis?.evaluation_criteria_results, summary: conv.analysis?.transcript_summary }));
}

async function main(): Promise<void> {
  const name = process.argv[2];
  if (!name) {
    console.error("usage: pnpm agent:converse <golden|refuse|redflag> [--audio]");
    process.exit(1);
  }
  const id = await converse(name);
  await report(id);
  process.exit(0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
