// Exports one stored conversation for reviewers who cannot open our ElevenLabs workspace: a trimmed,
// sanitized conversation.json, the call audio, the agent configuration as pushed, and a zip of it all,
// as static files under apps/web/public/review/ that the /review/<conversation_id> page replays.
// GET-only against the ElevenLabs API. Never prints the API key.
// Usage: pnpm review:export conv_...   (reads ELEVENLABS_API_KEY from .env.local)
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { findConfigSecrets, redactPaths, redactText, textHasSecret, toReviewConversation } from "../apps/web/src/review/export.ts";

const API = "https://api.elevenlabs.io/v1/convai";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "apps/web/public/review");
const CLI = join(ROOT, "agent/cli");

const id = process.argv[2] ?? "";
if (!/^conv_[a-z0-9]+$/i.test(id)) {
  console.error("Usage: pnpm review:export <conversation_id>   (e.g. conv_5601m4e3hsy2fg88wyndbtnz7vh9)");
  process.exit(1);
}
const apiKey = process.env.ELEVENLABS_API_KEY;
if (!apiKey) {
  console.error("ELEVENLABS_API_KEY is not set (expected in .env.local).");
  process.exit(1);
}

async function get(path: string): Promise<Response> {
  const res = await fetch(`${API}${path}`, { method: "GET", headers: { "xi-api-key": apiKey! } });
  if (!res.ok && res.status !== 404) {
    const detail = (await res.text()).slice(0, 300);
    throw new Error(`GET ${path} failed: HTTP ${res.status} ${detail}`);
  }
  return res;
}

const sha256 = (buf: Buffer) => createHash("sha256").update(buf).digest("hex");
const writeJson = (path: string, value: unknown) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);

async function main() {
  // 1. The conversation, trimmed to a whitelist and scrubbed.
  const res = await get(`/conversations/${id}`);
  if (res.status === 404) throw new Error(`Conversation ${id} not found`);
  const conversation = toReviewConversation(await res.json());
  const dir = join(OUT, id);
  mkdirSync(dir, { recursive: true });
  writeJson(join(dir, "conversation.json"), conversation);

  // 2. The recorded audio (both sides, mp3). Text-only runs may have none.
  let audio: Buffer | null = null;
  if (conversation.has_audio) {
    const a = await get(`/conversations/${id}/audio`);
    if (a.ok) {
      const buf = Buffer.from(await a.arrayBuffer());
      if (buf.length > 0) audio = buf;
    }
  }
  const audioPath = join(dir, "audio.mp3");
  if (audio) writeFileSync(audioPath, audio);
  else if (existsSync(audioPath)) rmSync(audioPath);

  // 3. The agent configuration as pushed (agent/cli is what `elevenlabs agents push` sends).
  const configDir = join(OUT, "config");
  rmSync(configDir, { recursive: true, force: true });
  const redactions: string[] = [];
  const files: { path: string; kind: "agent" | "workflow" | "tool" | "kb"; name: string }[] = [];
  for (const [sub, kind, ext] of [
    ["agent_configs", "agent", ".json"],
    ["tool_configs", "tool", ".json"],
    ["kb_docs", "kb", ".md"],
  ] as const) {
    mkdirSync(join(configDir, sub), { recursive: true });
    for (const file of readdirSync(join(CLI, sub)).filter((f) => f.endsWith(ext)).sort()) {
      const raw = readFileSync(join(CLI, sub, file), "utf8");
      const rel = `${sub}/${file}`;
      if (ext === ".json") {
        const value = JSON.parse(raw) as Record<string, unknown>;
        const hits = findConfigSecrets(value);
        redactions.push(...hits.map((h) => `${rel} ${h}`));
        const clean = redactPaths(value, hits) as Record<string, unknown>;
        writeJson(join(configDir, rel), clean);
        if (kind === "agent" && clean.workflow) {
          writeJson(join(configDir, "workflow.json"), clean.workflow);
          files.push({ path: "workflow.json", kind: "workflow", name: "workflow" });
        }
      } else {
        if (textHasSecret(raw)) redactions.push(`${rel} (text)`);
        writeFileSync(join(configDir, rel), redactText(raw));
      }
      files.push({ path: rel, kind, name: basename(file, ext) });
    }
  }
  const agents = JSON.parse(readFileSync(join(CLI, "agents.json"), "utf8")) as { agents?: { version_id?: string }[] };
  writeJson(join(configDir, "index.json"), { agent_version_id: agents.agents?.[0]?.version_id ?? null, copied_from: "agent/cli", files });

  // 4. Per-conversation manifest and the site-wide index the /review page lists.
  const exportedAt = new Date().toISOString();
  const listing = readdirSync(dir).filter((f) => f.endsWith(".json") || f.endsWith(".mp3"));
  const manifest = {
    conversation_id: id,
    exported_at: exportedAt,
    source: "ElevenLabs Agents Platform API: GET /v1/convai/conversations/{id} and /audio",
    call_version_id: conversation.version_id,
    config_version_id: agents.agents?.[0]?.version_id ?? null,
    audio: audio ? "audio.mp3" : null,
    zip: null as string | null,
    files: listing
      .filter((f) => f !== "manifest.json")
      .map((f) => {
        const buf = readFileSync(join(dir, f));
        return { name: f, bytes: buf.length, sha256: sha256(buf) };
      }),
  };
  writeJson(join(dir, "manifest.json"), manifest);

  // 5. One zip with the conversation folder and the configuration, when the zip CLI is available.
  const zipName = `pokta-clinic-review-${id}.zip`;
  rmSync(join(dir, zipName), { force: true });
  try {
    const tmp = mkdtempSync(join(tmpdir(), "review-zip-"));
    execFileSync("zip", ["-r", "-X", "-q", join(tmp, zipName), id, "config"], { cwd: OUT });
    renameSync(join(tmp, zipName), join(dir, zipName));
    rmSync(tmp, { recursive: true, force: true });
    manifest.zip = zipName;
    writeJson(join(dir, "manifest.json"), manifest);
  } catch {
    console.warn("zip is not available; skipped the archive");
  }

  const indexPath = join(OUT, "index.json");
  const index = existsSync(indexPath) ? (JSON.parse(readFileSync(indexPath, "utf8")) as { conversations: { conversation_id: string }[] }) : { conversations: [] };
  const entry = {
    conversation_id: id,
    title: conversation.analysis.call_summary_title,
    start_time_unix_secs: conversation.metadata.start_time_unix_secs,
    call_duration_secs: conversation.metadata.call_duration_secs,
    main_language: conversation.metadata.main_language,
    call_successful: conversation.analysis.call_successful,
    has_audio: Boolean(audio),
    zip: manifest.zip,
    exported_at: exportedAt,
  };
  index.conversations = [entry, ...index.conversations.filter((c) => c.conversation_id !== id)];
  writeJson(indexPath, index);

  const turns = conversation.transcript.length;
  const tools = conversation.transcript.reduce((n, t) => n + t.tool_calls.filter((c) => c.type !== "workflow").length, 0);
  console.log(`Exported ${id}: ${turns} transcript entries, ${tools} tool calls, audio ${audio ? `${(audio.length / 1e6).toFixed(1)} MB` : "none"}`);
  console.log(`  ${dir}`);
  for (const f of manifest.files) console.log(`    ${f.name} (${f.bytes} bytes)`);
  if (manifest.zip) console.log(`    ${manifest.zip} (${statSync(join(dir, manifest.zip)).size} bytes)`);
  console.log(`  ${configDir}: ${files.length} files`);
  if (conversation.version_id !== manifest.config_version_id) {
    console.log(`  Note: the call ran on agent version ${conversation.version_id}; the copied config is ${manifest.config_version_id}.`);
  }
  if (redactions.length) {
    console.log("  Redacted secret-looking config values:");
    for (const r of redactions) console.log(`    ${r}`);
  } else {
    console.log("  Config secret check: clean (tool secret headers are secret_id references).");
  }
  console.log(`  Review page: /review/${id}`);
}

main().catch((err: Error) => {
  console.error(err.message);
  process.exit(1);
});
