import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import catalog from "./catalog.json";
import { DETAILS, SHARED_REPLIES } from "./details";

const REPO = join(__dirname, "../../../..");
const read = (path: string) => readFileSync(join(REPO, path), "utf8");

// The literal pieces of a reply, between the `{...}` placeholders. Short glue like ", " is skipped.
function pieces(message: string, composed?: true): string[] {
  const text = composed ? message.slice(0, message.indexOf(".") + 1) : message;
  return text
    .split(/\{[^}]*\}/)
    .map((p) => p.trim())
    .filter((p) => p.length >= 12);
}

describe("tools catalog", () => {
  it("has details for exactly the tools the agent defines", () => {
    expect(Object.keys(DETAILS).sort()).toEqual(catalog.tools.map((t) => t.name).sort());
  });

  it.each(catalog.tools.map((t) => [t.name, t] as const))("%s: every quoted reply is still in the route source", (name, t) => {
    const detail = DETAILS[name];
    const source = [t.routePath, ...(detail.related ?? [])].map(read).join("\n");
    for (const reply of detail.replies) {
      for (const piece of pieces(reply.message, reply.composed)) expect(source, `${name} / ${reply.when}`).toContain(piece);
    }
  });

  it("shared replies are still in their source", () => {
    for (const reply of SHARED_REPLIES.filter((r) => !r.message.startsWith("("))) expect(read(reply.source)).toContain(reply.message);
  });
});
