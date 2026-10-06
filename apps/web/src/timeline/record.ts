import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { store, type ToolEvent } from "@/store";

// The timeline must never fail or slow a tool response: the write starts after the response is built,
// is kept alive past it with after(), gives up after a short timeout, and only logs on error.
const TIMEOUT_MS = 1500;

async function write(event: ToolEvent): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("timeout")), TIMEOUT_MS);
    });
    await Promise.race([store.addEvent(event), timeout]);
  } catch (err) {
    console.error(JSON.stringify({ timeline: "record_failed", error: (err as Error).message }));
  } finally {
    clearTimeout(timer);
  }
}

// `outcome` is a short label such as "consent granted"; never put patient answers, names or phones in it.
export function recordEvent(input: Omit<ToolEvent, "id" | "at">): void {
  const task = write({ ...input, id: randomUUID(), at: Date.now() });
  try {
    after(task);
  } catch {
    // Outside a request scope (tests, scripts) the promise simply runs on its own.
  }
}
