// Minimal client for the ElevenLabs Agents WebSocket API: connect, send text turns, collect events.
// Protocol: https://elevenlabs.io/docs/eleven-agents/api-reference/eleven-agents/websocket.md
export type AgentEvent = { type: string; [key: string]: unknown };

export interface ConnectOptions {
  agentId: string;
  /** Used only to ask for a signed URL when the agent requires auth. Never logged. */
  apiKey?: string;
  textOnly: boolean;
  onEvent?: (event: AgentEvent) => void;
}

const WS_BASE = "wss://api.elevenlabs.io/v1/convai/conversation";

export class ConverseClient {
  conversationId = "";
  events: AgentEvent[] = [];
  closed = false;
  closeInfo = "";
  private ws!: WebSocket;
  private lastEventAt = Date.now();
  private pendingTools = new Set<string>();
  private waiters: Array<() => void> = [];

  constructor(private opts: ConnectOptions) {}

  async connect(): Promise<void> {
    const url = await this.resolveUrl();
    this.ws = new WebSocket(url);
    await new Promise<void>((resolve, reject) => {
      this.ws.addEventListener("open", () => resolve(), { once: true });
      this.ws.addEventListener("error", () => reject(new Error("websocket error on connect")), { once: true });
    });
    this.ws.addEventListener("message", (m) => this.handle(String(m.data)));
    this.ws.addEventListener("close", (c) => {
      this.closed = true;
      this.closeInfo = `${c.code} ${c.reason}`.trim();
      this.wake();
    });
    const override = this.opts.textOnly ? { conversation_config_override: { conversation: { text_only: true } } } : {};
    this.send({ type: "conversation_initiation_client_data", ...override });
    // Wait for the metadata event (carries the conversation id) or an early close.
    const deadline = Date.now() + 15_000;
    while (!this.conversationId && !this.closed && Date.now() < deadline) await this.sleep(100);
    if (!this.conversationId) throw new Error(`no conversation_initiation_metadata (${this.closeInfo || "timeout"})`);
  }

  private async resolveUrl(): Promise<string> {
    const base = `${WS_BASE}?agent_id=${this.opts.agentId}`;
    if (!this.opts.apiKey) return base;
    return base; // Public agent: no signed URL needed. Swap to get-signed-url here if auth is ever enabled.
  }

  send(payload: Record<string, unknown>): void {
    this.ws.send(JSON.stringify(payload));
  }

  sendUserMessage(text: string): void {
    this.send({ type: "user_message", text });
  }

  close(): void {
    if (!this.closed) this.ws.close();
  }

  private handle(raw: string): void {
    let event: AgentEvent;
    try {
      event = JSON.parse(raw) as AgentEvent;
    } catch {
      return;
    }
    if (event.type === "ping") {
      const id = (event.ping_event as { event_id?: number } | undefined)?.event_id;
      this.send({ type: "pong", event_id: id });
      return;
    }
    if (event.type === "audio") return; // ignored: we only read text
    if (event.type === "conversation_initiation_metadata") {
      this.conversationId = (event.conversation_initiation_metadata_event as { conversation_id: string }).conversation_id;
    }
    if (event.type === "agent_tool_request") {
      this.pendingTools.add((event.agent_tool_request as { tool_call_id: string }).tool_call_id);
    }
    if (event.type === "agent_tool_response") {
      this.pendingTools.delete((event.agent_tool_response as { tool_call_id: string }).tool_call_id);
    }
    if (event.type !== "vad_score") this.lastEventAt = Date.now();
    this.events.push(event);
    this.opts.onEvent?.(event);
    this.wake();
  }

  /** Agent texts received since event index `from`. */
  agentTextsSince(from: number): string[] {
    return this.events
      .slice(from)
      .filter((e) => e.type === "agent_response")
      .map((e) => (e.agent_response_event as { agent_response: string }).agent_response);
  }

  /**
   * Resolve once the agent has spoken at least once since `from` and then stayed quiet for `quietMs`
   * with no tool call in flight; or when the socket closes; or on `maxMs`.
   */
  async waitForAgent(from: number, quietMs = 2500, maxMs = 90_000): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < maxMs) {
      if (this.closed) return;
      const spoke = this.agentTextsSince(from).length > 0;
      const quiet = Date.now() - this.lastEventAt >= quietMs;
      if (spoke && quiet && this.pendingTools.size === 0) return;
      await new Promise<void>((r) => {
        this.waiters.push(r);
        setTimeout(r, 250);
      });
    }
  }

  private wake(): void {
    const w = this.waiters;
    this.waiters = [];
    for (const r of w) r();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
}
