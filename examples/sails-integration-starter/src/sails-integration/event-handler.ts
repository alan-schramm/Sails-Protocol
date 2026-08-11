/**
 * Fase 6 — `TradeEventHandler`, a typed convenience wrapper around
 * `SailsClient.openp2p.chat(tradeId)`'s real `WebSocketChannel`
 * (`packages/sails-sdk/src/modules/openp2p.ts`). That class already
 * exposes real `onMessage`/`onEvent`/`send`/`leave`/`close` — this
 * wrapper adds two things a raw integration would otherwise hand-roll
 * itself: (1) dispatching `onEvent()`'s frames by their real `type`
 * string (`NEW_MESSAGE`/`TRADE_STATUS_UPDATE`/`ESCROW_STATUS_UPDATE`/
 * `ERROR` — the real, documented set, verified by reading
 * `WebSocketChannel`'s own doc comment before writing this, not
 * invented), so a caller doesn't have to `if (frame.type === '...')`
 * and cast `frame.payload` by hand; (2) an in-memory message history
 * buffer, useful for a chat UI that mounts after messages have already
 * started arriving.
 *
 * `ChannelLike` is a structural subset of `WebSocketChannel`'s real
 * public API — lets this class (and its tests) work against any object
 * with the same shape, without needing a live `WebSocket`/Sails node,
 * the same reason `escrow.service.ts`'s own `EscrowRecord` type is a
 * structural subset of the full Prisma row rather than the row itself.
 */
import type { ChatFrame, ChatMessageEvent } from '@satsails/p2p-trading-sdk'

export interface ChannelLike {
  onMessage(handler: (msg: ChatMessageEvent) => void): void
  onEvent(handler: (frame: ChatFrame) => void): void
  send(input: { content: string; msgType?: string }): void
  leave(): void
  close(): void
}

export class TradeEventHandler {
  private history: ChatMessageEvent[] = []
  private tradeStatusHandlers: Array<(payload: unknown) => void> = []
  private escrowStatusHandlers: Array<(payload: unknown) => void> = []
  private errorHandlers: Array<(payload: unknown) => void> = []
  private userPresenceHandlers: Array<(payload: unknown) => void> = []

  constructor(private readonly channel: ChannelLike) {
    this.channel.onMessage((msg) => this.history.push(msg))
    this.channel.onEvent((frame) => this.dispatch(frame))
  }

  private dispatch(frame: ChatFrame): void {
    switch (frame.type) {
      case 'TRADE_STATUS_UPDATE':
        for (const h of this.tradeStatusHandlers) h(frame.payload)
        break
      case 'ESCROW_STATUS_UPDATE':
        for (const h of this.escrowStatusHandlers) h(frame.payload)
        break
      case 'ERROR':
        for (const h of this.errorHandlers) h(frame.payload)
        break
      case 'USER_ONLINE':
      case 'USER_OFFLINE':
        for (const h of this.userPresenceHandlers) h(frame.payload)
        break
      // NEW_MESSAGE is handled by channel.onMessage() above, not here —
      // WebSocketChannel already fires both callbacks for it internally.
    }
  }

  /** Every chat message received since this handler was constructed, oldest first. */
  getHistory(): readonly ChatMessageEvent[] {
    return this.history
  }

  onMessage(handler: (msg: ChatMessageEvent) => void): void {
    this.channel.onMessage(handler)
  }

  onTradeStatusChange(handler: (payload: unknown) => void): void {
    this.tradeStatusHandlers.push(handler)
  }

  onEscrowStatusChange(handler: (payload: unknown) => void): void {
    this.escrowStatusHandlers.push(handler)
  }

  onError(handler: (payload: unknown) => void): void {
    this.errorHandlers.push(handler)
  }

  onUserPresenceChange(handler: (payload: unknown) => void): void {
    this.userPresenceHandlers.push(handler)
  }

  sendMessage(content: string, msgType?: string): void {
    this.channel.send({ content, msgType })
  }

  leave(): void {
    this.channel.leave()
  }

  close(): void {
    this.channel.close()
  }
}
