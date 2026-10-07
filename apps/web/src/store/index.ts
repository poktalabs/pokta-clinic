import { env } from "@/env";
import { createMemoryStore } from "./memory";
import type { Store } from "./types";
import { upstashStore } from "./upstash";

// Chosen at first use from STORE_PROVIDER so `next build` needs no env. Default is upstash; missing
// credentials throw. The memory store never stands in silently, and is refused on Vercel production.
// It lives on globalThis because dev mode loads each route in its own module graph.
const g = globalThis as unknown as { __pcMemoryStore?: Store; __pcUpstashStore?: Store };

function select(): Store {
  if (env.storeProvider === "memory") {
    if (process.env.VERCEL_ENV === "production") throw new Error("STORE_PROVIDER=memory is not allowed in production");
    return (g.__pcMemoryStore ??= createMemoryStore());
  }
  return (g.__pcUpstashStore ??= upstashStore());
}

export const store: Store = {
  addEvent: (e) => select().addEvent(e),
  recentEvents: (n) => select().recentEvents(n),
  getConsent: (c) => select().getConsent(c),
  putConsent: (c, d) => select().putConsent(c, d),
  getBooking: (c) => select().getBooking(c),
  putBooking: (c, b) => select().putBooking(c, b),
  enqueue: (i) => select().enqueue(i),
  outbox: () => select().outbox(),
  updateOutboxItem: (i) => select().updateOutboxItem(i),
  removeOutboxItem: (id) => select().removeOutboxItem(id),
  getEhrIntent: () => select().getEhrIntent(),
  putEhrIntent: (i) => select().putEhrIntent(i),
  putConversation: (r) => select().putConversation(r),
  getConversation: (id) => select().getConversation(id),
  listConversations: (n) => select().listConversations(n),
  putLead: (l) => select().putLead(l),
  getLead: (c) => select().getLead(c),
  listLeads: (n) => select().listLeads(n),
  lock: (name, ttl) => select().lock(name, ttl),
};

export * from "./types";
export { createMemoryStore } from "./memory";
