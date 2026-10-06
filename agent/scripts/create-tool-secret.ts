// Creates the workspace secret that holds the tool shared secret, then records its ID in
// agent/config.json (the tool configs reference the secret by ID, not by name). WRITES to ElevenLabs:
// run it once, deliberately, through `pnpm agent:secret`. The value comes from TOOL_SECRET (the same
// value the web app checks) and is never printed or logged.
//
//   pnpm agent:secret -- --dry-run   check the inputs, make no API call
import { readFileSync, writeFileSync } from "node:fs";
import { CONFIG_PATH, loadConfig } from "../src/config.ts";

const dryRun = process.argv.includes("--dry-run");
const apiKey = process.env.ELEVENLABS_API_KEY;
const value = process.env.TOOL_SECRET;
const config = loadConfig();
const API = "https://api.elevenlabs.io/v1/convai/secrets";

if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not set (it lives in .env.local).");
if (!value || value.length < 32) throw new Error("TOOL_SECRET is not set or shorter than 32 characters (see scripts/gen-secrets.sh).");

function saveId(secretId: string) {
  const raw = JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as Record<string, unknown>;
  raw.tool_secret_id = secretId;
  writeFileSync(CONFIG_PATH, `${JSON.stringify(raw, null, 2)}\n`);
  console.log(`tool_secret_id recorded in agent/config.json: ${secretId}`);
}

async function call(method: string, body?: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(API, {
    method,
    headers: { "xi-api-key": apiKey as string, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

if (dryRun) {
  console.log(`dry run: would create workspace secret "${config.tool_secret_name}" (value length ${value.length}, not shown). No API call made.`);
  process.exit(0);
}

// Refuse to create a duplicate: reuse the ID of a secret with the same name. Rotating the value is a
// deliberate PATCH /v1/convai/secrets/{id}, not something this script does.
const list = await call("GET");
const existing = (list.json.secrets as { name: string; secret_id: string }[] | undefined)?.find((s) => s.name === config.tool_secret_name);
if (existing) {
  console.log(`secret "${config.tool_secret_name}" already exists; not creating a duplicate.`);
  saveId(existing.secret_id);
  process.exit(0);
}

const created = await call("POST", { type: "new", name: config.tool_secret_name, value });
if (created.status !== 200 || typeof created.json.secret_id !== "string") {
  throw new Error(`secret creation failed: HTTP ${created.status} ${JSON.stringify(created.json).slice(0, 300)}`);
}
console.log(`created secret "${config.tool_secret_name}"`);
saveId(created.json.secret_id);
