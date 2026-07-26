/**
 * @sails/sdk — Sails OpenP2P module (verified against
 * src/modules/open-p2p/trade.routes.ts and chat.routes.ts directly).
 *
 * Deviation from SDK_GUIDE.md section 2's literal signature, noted rather
 * than silently matched: that doc specifies `trade(offerId: string):
 * Promise<Trade>`, but `POST /v1/openp2p/trades`'s real body requires
 * `amount` too (trade.routes.ts) — a two-arg call that omits it would
 * just 400 at runtime, which is worse than an honest three-arg signature
 * here. Flagged for SDK_GUIDE.md to reconcile, not fixed by dropping a
 * required field.
 */
import type { SailsTransport } from '../transport'
import type { Message, PaginatedTrades, Trade } from '../types'
import { SailsTransportError } from '../errors'

export interface ChatFrame {
  type: string
  payload: unknown
}

// The real shape of a NEW_MESSAGE frame's payload
// (common/events/event-bus.ts's OpenP2PMessageSentEvent, broadcast
// verbatim by common/events/handlers.ts's `openp2p.message.sent`
// reaction) — genuinely different field names from the persisted
// `Message` row this file used to (incorrectly) claim onMessage()
// delivers: `messageId` not `id`, `timestamp` not `createdAt`, no
// `readAt`. Found and fixed wiring the first real caller
// (packages/sails-ui's Trade screen) — invisible to this SDK's own
// tests, which never exercise a live WS round trip.
export interface ChatMessageEvent {
  messageId: string
  tradeId: string
  senderId: string
  content: string
  msgType: string
  timestamp: string
}

/**
 * Wraps the real WS protocol at `GET /v1/openp2p/chat?token=...`
 * (API_REFERENCE.md section 5). Auto-joins `tradeId`'s room once the
 * socket opens — matches SDK_GUIDE.md section 4's usage example
 * (`chat.onMessage(...)`, `chat.send(...)` with no further JOIN_TRADE
 * plumbing exposed to the caller).
 */
export class WebSocketChannel {
  private messageHandlers: Array<(msg: ChatMessageEvent) => void> = []
  private eventHandlers: Array<(frame: ChatFrame) => void> = []

  constructor(private readonly ws: WebSocket, private readonly tradeId: string) {
    this.ws.addEventListener('open', () => {
      this.sendFrame('JOIN_TRADE', { tradeId: this.tradeId })
    })
    this.ws.addEventListener('message', (event: MessageEvent) => {
      let frame: ChatFrame
      try {
        frame = JSON.parse(typeof event.data === 'string' ? event.data : String(event.data))
      } catch {
        return
      }
      for (const handler of this.eventHandlers) handler(frame)
      if (frame.type === 'NEW_MESSAGE') {
        for (const handler of this.messageHandlers) handler(frame.payload as ChatMessageEvent)
      }
    })
  }

  private sendFrame(type: string, payload: unknown): void {
    this.ws.send(JSON.stringify({ type, payload }))
  }

  /** Fires for every NEW_MESSAGE frame — the common case (SDK_GUIDE.md section 4). */
  onMessage(handler: (msg: ChatMessageEvent) => void): void {
    this.messageHandlers.push(handler)
  }

  /** Fires for every frame (TRADE_STATUS_UPDATE, ESCROW_STATUS_UPDATE, USER_ONLINE/OFFLINE, ERROR, ...) — for callers that need more than chat messages. */
  onEvent(handler: (frame: ChatFrame) => void): void {
    this.eventHandlers.push(handler)
  }

  send(input: { content: string; msgType?: string }): void {
    this.sendFrame('SEND_MESSAGE', { tradeId: this.tradeId, content: input.content, msgType: input.msgType ?? 'TEXT' })
  }

  leave(): void {
    this.sendFrame('LEAVE_TRADE', { tradeId: this.tradeId })
  }

  close(): void {
    this.ws.close()
  }
}

export class SailsOpenP2PModule {
  constructor(private readonly transport: SailsTransport) {}

  /** Requires an active session. See this file's header for the `amount` deviation from SDK_GUIDE.md. */
  async trade(offerId: string, amount: string): Promise<Trade> {
    return this.transport.post<Trade>('/v1/openp2p/trades', { offerId, amount }, true)
  }

  /**
   * Requires an active session — the caller's own trade history (as
   * buyer or seller), never a global listing (trade.service.ts's
   * getTrades()). Fase 2 (SDK React) addition: closes the gap
   * useSailsTrades() needed — no such endpoint existed before (see that
   * service method's own comment for why packages/sails-ui's
   * TradeHistory.tsx uses mock data today). `limit` is clamped
   * server-side to 1-50 (default 10), matching liquidity's
   * getOffers()/discover() pagination convention.
   */
  async getTrades(pagination?: { limit?: number; offset?: number }): Promise<PaginatedTrades> {
    return this.transport.get<PaginatedTrades>(
      '/v1/openp2p/trades',
      { limit: pagination?.limit, offset: pagination?.offset },
      true
    )
  }

  /** Unlike trade()'s create response, this always populates `offer` (trade.service.ts's getTrade() includes it) — real, not just typed-optional. */
  async getTrade(tradeId: string): Promise<Trade> {
    return this.transport.get<Trade>(`/v1/openp2p/trades/${tradeId}`)
  }

  /** RFC-018's intentId link, exposed directly — the same lookup intent-facade.ts's dispute() uses internally to turn an intentId into the Trade/Escrow it produced. */
  async getTradeByIntent(intentId: string): Promise<Trade> {
    return this.transport.get<Trade>(`/v1/openp2p/trades/by-intent/${intentId}`)
  }

  /** Requires an active session. status: 'ACTIVE' | 'CANCELLED'. */
  async updateTradeStatus(tradeId: string, status: 'ACTIVE' | 'CANCELLED'): Promise<Trade> {
    return this.transport.patch<Trade>(`/v1/openp2p/trades/${tradeId}/status`, { status }, true)
  }

  async getMessages(tradeId: string): Promise<Message[]> {
    return this.transport.get<Message[]>(`/v1/openp2p/chat/${tradeId}/messages`, undefined, true)
  }

  /** Requires an active session (token passed as a WS query param — the real route's own auth shape, distinct from the Bearer header every other authenticated call uses). */
  chat(tradeId: string): WebSocketChannel {
    const token = this.transport.getSessionToken()
    if (!token) {
      throw new SailsTransportError('openp2p.chat() requires an active session — call identity.authenticate() first.')
    }
    const ws = this.transport.openWebSocket('/v1/openp2p/chat', { token })
    return new WebSocketChannel(ws, tradeId)
  }
}
