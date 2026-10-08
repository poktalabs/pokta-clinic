// Uploads the knowledge base documents that `pnpm agent:build` rendered into agent/cli/kb_docs/, then
// records each document's ID and content hash in agent/cli/knowledge_base.json (the agent references
// documents by ID). Dry run by default; `--apply` WRITES to ElevenLabs. The API key is never printed,
// and neither are response bodies.
//
//   pnpm agent:kb:push           dry run: what would be created, updated or left alone (read-only GETs)
//   pnpm agent:kb:push:apply     create, update and index for real
//
// Per document: no ID yet -> reuse a text document with exactly the same name, else create one; ID but a
// different hash -> PATCH the content; then compute the RAG index for documents the agent retrieves
// with RAG (usage_mode auto). Documents in prompt mode need no index.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CLI_DIR } from "../src/config.ts";
import { KB_DOCS, KB_REGISTRY, RAG_EMBEDDING_MODEL, type KbRegistryEntry } from "../src/kb/index.ts";

const apply = process.argv.includes("--apply");
const apiKey = process.env.ELEVENLABS_API_KEY;
const API = "https://api.elevenlabs.io/v1/convai/knowledge-base";
const REGISTRY_PATH = join(CLI_DIR, KB_REGISTRY);

if (apply && !apiKey) throw new Error("ELEVENLABS_API_KEY is not set (it lives in .env.local).");

const registry = (JSON.parse(readFileSync(REGISTRY_PATH, "utf8")) as { docs: KbRegistryEntry[] }).docs;
const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

async function call(method: string, path: string, body?: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { "xi-api-key": apiKey as string, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}
function expectOk(what: string, r: { status: number }) {
  if (r.status !== 200) throw new Error(`${what} failed: HTTP ${r.status}`);
}

// A text document with exactly this name, if one exists. Read-only, so the dry run uses it too.
async function findByName(name: string): Promise<string | null> {
  const r = await call("GET", `?search=${encodeURIComponent(name)}&page_size=100&types=text`);
  expectOk(`search for "${name}"`, r);
  const match = (r.json.documents as { id: string; name: string; type: string }[] | undefined)?.find((d) => d.name === name && d.type === "text");
  return match?.id ?? null;
}

// Asks for the index and waits up to ~60 s for it; the endpoint starts indexing if needed and
// otherwise returns the current status.
async function computeIndex(id: string, name: string): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const r = await call("POST", `/${id}/rag-index`, { model: RAG_EMBEDDING_MODEL });
    expectOk(`RAG index of "${name}"`, r);
    const status = String(r.json.status);
    if (status === "succeeded") return status;
    if (["failed", "rag_limit_exceeded", "document_too_small", "cannot_index_folder"].includes(status)) {
      throw new Error(`RAG index of "${name}": ${status}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  return "still processing (check again with a rerun)";
}

function saveRegistry() {
  writeFileSync(REGISTRY_PATH, `${JSON.stringify({ docs: registry }, null, 4)}\n`);
}

if (!apply) console.log("dry run: nothing is written to ElevenLabs.");
for (const doc of KB_DOCS) {
  const entry = registry.find((e) => e.key === doc.key);
  if (!entry) throw new Error(`${doc.key} is not in ${KB_REGISTRY}; run pnpm agent:build first`);
  const text = readFileSync(join(CLI_DIR, entry.file), "utf8");
  if (!text.trim()) throw new Error(`${entry.file} is empty; run pnpm agent:build first`);
  const hash = sha256(text);
  const label = `"${entry.name}" (${doc.key}, ${text.length} chars, ${doc.usageMode})`;

  let id = entry.id ?? null;
  let action: "create" | "update" | "unchanged";
  if (id) {
    action = entry.sha256 === hash ? "unchanged" : "update";
  } else {
    const existing = apiKey ? await findByName(entry.name) : null;
    if (existing) {
      id = existing;
      // Its content is unknown, so upload ours over it.
      action = "update";
    } else {
      action = "create";
    }
  }

  if (!apply) {
    const note = !entry.id && !apiKey ? " (no ELEVENLABS_API_KEY, so an existing document with this name was not looked up)" : "";
    const target = id ? ` ${id}` : "";
    console.log(`would ${action === "unchanged" ? "leave unchanged" : action}${target}: ${label}${note}${doc.usageMode === "auto" && action !== "unchanged" ? `, then compute its RAG index (${RAG_EMBEDDING_MODEL})` : ""}`);
    continue;
  }

  if (action === "create") {
    const r = await call("POST", "/text", { text, name: entry.name });
    expectOk(`create ${label}`, r);
    id = String(r.json.id);
    console.log(`created ${id}: ${label}`);
  } else if (action === "update") {
    const r = await call("PATCH", `/${id}`, { name: entry.name, content: text });
    expectOk(`update ${label}`, r);
    console.log(`updated ${id}: ${label}`);
  } else {
    console.log(`unchanged ${id}: ${label}`);
  }
  entry.id = id as string;
  entry.sha256 = hash;
  saveRegistry();
  if (doc.usageMode === "auto" && action !== "unchanged") {
    console.log(`  RAG index: ${await computeIndex(entry.id, entry.name)}`);
  }
}
if (apply) console.log(`IDs recorded in agent/cli/${KB_REGISTRY}. Next: pnpm agent:push, then pnpm agent:push:apply.`);
