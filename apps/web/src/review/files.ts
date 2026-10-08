// Reads the static review exports (apps/web/public/review, written by `pnpm review:export`) at build
// time. Server only: the pages are prerendered, so nothing here runs on a request.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReviewConversation } from "./export";

export type ReviewIndexEntry = {
  conversation_id: string;
  title: string | null;
  start_time_unix_secs: number | null;
  call_duration_secs: number | null;
  main_language: string | null;
  call_successful: string | null;
  has_audio: boolean;
  zip: string | null;
};

export type ReviewManifest = {
  conversation_id: string;
  exported_at: string;
  call_version_id: string | null;
  config_version_id: string | null;
  audio: string | null;
  zip: string | null;
  files: { name: string; bytes: number; sha256: string }[];
};

export type ConfigIndex = { agent_version_id: string | null; files: { path: string; kind: "agent" | "workflow" | "tool" | "kb"; name: string }[] };

const ROOT = join(process.cwd(), "public", "review");
const ID = /^conv_[a-z0-9]+$/i;

function readJson<T>(...parts: string[]): T | null {
  const path = join(ROOT, ...parts);
  return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as T) : null;
}

export function reviewIndex(): ReviewIndexEntry[] {
  return readJson<{ conversations: ReviewIndexEntry[] }>("index.json")?.conversations.filter((c) => ID.test(c.conversation_id)) ?? [];
}

export function loadReview(id: string): { conversation: ReviewConversation; manifest: ReviewManifest; config: ConfigIndex | null } | null {
  if (!ID.test(id)) return null;
  const conversation = readJson<ReviewConversation>(id, "conversation.json");
  const manifest = readJson<ReviewManifest>(id, "manifest.json");
  if (!conversation || !manifest) return null;
  return { conversation, manifest, config: readJson<ConfigIndex>("config", "index.json") };
}
