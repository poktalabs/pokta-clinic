import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const AGENT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
export const CONFIG_PATH = join(AGENT_DIR, "config.json");
// The CLI reads and writes its project files from the directory it runs in; we run it here.
export const CLI_DIR = join(AGENT_DIR, "cli");

export interface AgentConfig {
  agent_name: string;
  practice_name: string;
  language: string;
  llm: string;
  llm_reasoning_effort: "none" | "minimal" | "low" | "medium" | "high";
  llm_temperature: number;
  /** Stronger tool-capable LLM for the History node only (per-node override). */
  history_llm: string;
  history_llm_reasoning_effort: "none" | "minimal" | "low" | "medium" | "high";
  tts_model_id: string;
  voice_id: string;
  allowlist: string[];
  tool_secret_name: string;
  tool_secret_id: string;
  tool_timeout_secs: number;
  max_duration_seconds: number;
}

export function loadConfig(): AgentConfig {
  return JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as AgentConfig;
}

export interface BuildEnv {
  /** Origin of the web app that hosts the tool routes, no trailing slash. */
  baseUrl: string;
  /** Hostname of baseUrl, added to the agent's origin allowlist. */
  baseHost: string;
}

// POKTA_WEB_URL is required: a wrong base URL would point patient data at the wrong host, so there
// is no default. Plain http is accepted only for localhost.
export function readBuildEnv(raw: string | undefined): BuildEnv {
  if (!raw) throw new Error("POKTA_WEB_URL is required (the https origin of the web app, e.g. https://pokta-clinic.vercel.app).");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`POKTA_WEB_URL is not a valid URL: ${raw}`);
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) {
    throw new Error(`POKTA_WEB_URL must be https (http only for localhost), got ${url.protocol}//${url.host}`);
  }
  if (url.pathname !== "/" || url.search || url.hash) {
    throw new Error("POKTA_WEB_URL must be an origin only, with no path, query or fragment.");
  }
  return { baseUrl: url.origin, baseHost: url.host };
}
