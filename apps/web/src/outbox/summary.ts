import type { OutboxItem } from "@/store";

// What the public page may see: how many items, which kinds, how old. Never the payload or the Conversation.
export function summarizeOutbox(items: OutboxItem[], now = Date.now()) {
  return {
    count: items.length,
    items: items.map((i) => ({ kind: i.kind, ageSeconds: Math.max(0, Math.round((now - i.createdAt) / 1000)), attempts: i.attempts })),
  };
}
