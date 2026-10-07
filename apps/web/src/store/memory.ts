import { randomUUID } from "node:crypto";
import type { BookingRecord, ConsentDecision, ConversationRecord, EhrIntent, Lead, NewOutboxItem, OutboxItem, Store, ToolEvent } from "./types";

const MAX_EVENTS = 200;

// In-process store for local dev and tests. No TTL: the process is short-lived. Never used on Vercel production.
export function createMemoryStore(): Store {
  let events: ToolEvent[] = [];
  const consents = new Map<string, ConsentDecision>();
  const bookings = new Map<string, BookingRecord>();
  const outbox = new Map<string, OutboxItem>(); // Map keeps insertion order
  const conversations = new Map<string, ConversationRecord>();
  const locks = new Set<string>();
  const leads = new Map<string, Lead>();
  let intent: EhrIntent | null = null;

  return {
    async addEvent(event) {
      events = [...events, event].sort((a, b) => a.at - b.at).slice(-MAX_EVENTS);
    },
    async recentEvents(limit) {
      return events.slice(-limit);
    },
    async getConsent(id) {
      return consents.get(id) ?? null;
    },
    async putConsent(id, decision) {
      consents.set(id, decision);
    },
    async putLead(lead) {
      leads.set(lead.conversationId, lead);
    },
    async getLead(id) {
      return leads.get(id) ?? null;
    },
    async listLeads(limit) {
      return [...leads.values()].sort((a, b) => b.at - a.at).slice(0, limit);
    },
    async getBooking(id) {
      return bookings.get(id) ?? null;
    },
    async putBooking(id, booking) {
      bookings.set(id, booking);
    },
    async enqueue(item: NewOutboxItem) {
      const stored = { ...item, id: randomUUID(), createdAt: Date.now(), attempts: 0, lastError: null } as OutboxItem;
      outbox.set(stored.id, stored);
      return stored;
    },
    async outbox() {
      return [...outbox.values()];
    },
    async updateOutboxItem(item) {
      if (outbox.has(item.id)) outbox.set(item.id, item);
    },
    async removeOutboxItem(id) {
      outbox.delete(id);
    },
    async getEhrIntent() {
      return intent;
    },
    async putEhrIntent(value) {
      intent = value;
    },
    async putConversation(record) {
      conversations.set(record.id, record);
    },
    async getConversation(id) {
      return conversations.get(id) ?? null;
    },
    async listConversations(limit) {
      return [...conversations.values()].sort((a, b) => b.receivedAt - a.receivedAt).slice(0, limit);
    },
    async lock(name) {
      if (locks.has(name)) return null;
      locks.add(name);
      return async () => {
        locks.delete(name);
      };
    },
  };
}
