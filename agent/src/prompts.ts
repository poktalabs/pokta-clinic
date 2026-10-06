import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AGENT_DIR } from "./config.ts";

// Prompts are plain markdown files so a diff shows exactly what the agent will say.
export function prompt(name: string): string {
  return readFileSync(join(AGENT_DIR, "src", "prompts", `${name}.md`), "utf8").trim();
}
