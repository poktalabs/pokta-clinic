import { Redis } from "@upstash/redis";
import { env } from "@/env";
import { TTL_SECONDS } from "./types";
import type { Lead, ConsentDecision, ConversationRecord, NewOutboxItem, OutboxItem, Store, ToolEvent } from "./types";

const MAX_EVENTS = 200;

// The client auto-serializes objects to JSON and parses JSON back, but a member written as a string
// can come back parsed or raw depending on its shape; normalize so callers always get the object.
function parse<T>(value: unknown): T | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }
  return value as T;
}

export function createUpstashStore(redis: Redis): Store {
  const key = {
    events: "pc:events",
    consent: (c: string) => `pc:consent:${c}`,
    booking: (c: string) => `pc:booking:${c}`,
    outboxIndex: "pc:outbox",
    outboxSeq: "pc:outbox:seq",
    outboxItem: (id: string) => `pc:outbox:item:${id}`,
    intent: "pc:ehr:intent",
    conv: (id: string) => `pc:conv:${id}`,
    convIndex: "pc:convs",
    lock: (name: string) => `pc:lock:${name}`,
    lead: (c: string) => `pc:lead:${c}`,
    leadIndex: "pc:leads",
  };

  async function getJson<T>(k: string): Promise<T | null> {
    return parse<T>(await redis.get(k));
  }

  return {
    async addEvent(event) {
      await redis.zadd(key.events, { score: event.at, member: JSON.stringify(event) });
      await redis.zremrangebyrank(key.events, 0, -(MAX_EVENTS + 1));
      await redis.expire(key.events, TTL_SECONDS);
    },
    async recentEvents(limit) {
      const members = await redis.zrange<unknown[]>(key.events, -limit, -1);
      return members.map((m) => parse<ToolEvent>(m)).filter((e): e is ToolEvent => !!e);
    },

    getConsent: (c) => getJson<ConsentDecision>(key.consent(c)),
    async putConsent(c, decision) {
      await redis.set(key.consent(c), JSON.stringify(decision), { ex: TTL_SECONDS });
    },

    getBooking: (c) => getJson(key.booking(c)),
    async putBooking(c, booking) {
      await redis.set(key.booking(c), JSON.stringify(booking), { ex: TTL_SECONDS });
    },

    async enqueue(item: NewOutboxItem) {
      const id = crypto.randomUUID();
      const stored = { ...item, id, createdAt: Date.now(), attempts: 0, lastError: null } as OutboxItem;
      // The score is a global counter, not a timestamp: two items in the same millisecond keep their order.
      const seq = await redis.incr(key.outboxSeq);
      await redis.set(key.outboxItem(id), JSON.stringify(stored), { ex: TTL_SECONDS });
      await redis.zadd(key.outboxIndex, { score: seq, member: id });
      await redis.expire(key.outboxIndex, TTL_SECONDS);
      await redis.expire(key.outboxSeq, TTL_SECONDS);
      return stored;
    },
    async outbox() {
      const ids = await redis.zrange<string[]>(key.outboxIndex, 0, -1);
      if (!ids.length) return [];
      const rows = await redis.mget<unknown[]>(...ids.map((id) => key.outboxItem(id)));
      const items: OutboxItem[] = [];
      const expired: string[] = [];
      rows.forEach((row, i) => {
        const item = parse<OutboxItem>(row);
        if (item) items.push(item);
        else expired.push(ids[i]);
      });
      if (expired.length) await redis.zrem(key.outboxIndex, ...expired);
      return items;
    },
    async updateOutboxItem(item) {
      await redis.set(key.outboxItem(item.id), JSON.stringify(item), { xx: true, keepTtl: true });
    },
    async removeOutboxItem(id) {
      await redis.zrem(key.outboxIndex, id);
      await redis.del(key.outboxItem(id));
    },

    getEhrIntent: () => getJson(key.intent),
    async putEhrIntent(intent) {
      if (!intent) await redis.del(key.intent);
      else await redis.set(key.intent, JSON.stringify(intent), { ex: 3600 });
    },

    async putConversation(record) {
      await redis.set(key.conv(record.id), JSON.stringify(record), { ex: TTL_SECONDS });
      await redis.zadd(key.convIndex, { score: record.receivedAt, member: record.id });
      await redis.expire(key.convIndex, TTL_SECONDS);
    },
    getConversation: (id) => getJson(key.conv(id)),
    async listConversations(limit) {
      const ids = await redis.zrange<string[]>(key.convIndex, 0, limit - 1, { rev: true });
      if (!ids.length) return [];
      const rows = await redis.mget<unknown[]>(...ids.map((id) => key.conv(id)));
      return rows.map((r) => parse<ConversationRecord>(r)).filter((r): r is ConversationRecord => !!r);
    },

    async putLead(lead) {
      await redis.set(key.lead(lead.conversationId), JSON.stringify(lead), { ex: TTL_SECONDS });
      await redis.zadd(key.leadIndex, { score: lead.at, member: lead.conversationId });
      await redis.expire(key.leadIndex, TTL_SECONDS);
    },
    getLead: (c) => getJson(key.lead(c)),
    async listLeads(limit) {
      const ids = await redis.zrange<string[]>(key.leadIndex, 0, limit - 1, { rev: true });
      if (!ids.length) return [];
      const rows = await redis.mget<unknown[]>(...ids.map((id) => key.lead(id)));
      return rows.map((r) => parse<Lead>(r)).filter((r): r is Lead => !!r);
    },

    async lock(name, ttlSeconds) {
      const k = key.lock(name);
      const token = crypto.randomUUID();
      const got = await redis.set(k, token, { nx: true, ex: ttlSeconds });
      if (!got) return null;
      return async () => {
        // Release only our own lock: it may have expired and been taken by another run.
        if ((await redis.get(k)) === token) await redis.del(k);
      };
    },
  };
}

export function upstashStore(): Store {
  return createUpstashStore(new Redis({ url: env.upstashUrl, token: env.upstashToken }));
}
