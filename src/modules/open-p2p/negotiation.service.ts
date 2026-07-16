/**
 * Sails OpenP2P — Negotiation Service
 *
 * This is the file TODO.md §1 flagged as missing entirely — the heart of
 * the P2P Marketplace demo. Implements RFC-004
 * (rfcs/RFC-004-negotiation-state-machine.md): `NegotiationEvent` is the
 * abstraction, `HumanChatChannel` (this file) is one implementation of
 * `NegotiationChannel`, built on the real `pearNodeRegistry` — not a
 * mock transport.
 */
import { prisma } from '../../common/database'
import { NotFoundError } from '../../common/errors'
import { eventBus } from '../../common/events/event-bus'
import { pearNodeRegistry } from '../../infrastructure/p2p/pear.service'

// ─── RFC-004's NegotiationEvent — the actual abstraction ──────────────────────
export type NegotiationEvent =
  | { type: 'OFFER_PROPOSED';    by: string; terms: Record<string, unknown>; at: string }
  | { type: 'COUNTER_OFFERED';   by: string; terms: Record<string, unknown>; at: string }
  | { type: 'TERMS_ACCEPTED';    by: string; at: string }
  | { type: 'TERMS_REJECTED';    by: string; reason?: string; at: string }
  | { type: 'MESSAGE_EXCHANGED'; by: string; content: string; at: string }

// ─── RFC-004's NegotiationChannel — pluggable transport for those events ──────
export interface NegotiationChannel {
  sendEvent(event: NegotiationEvent): Promise<void>
  onEvent(handler: (event: NegotiationEvent) => void): void
}

// ─── HumanChatChannel — today's implementation, over real Pears/HyperDHT ─────
// A future StructuredChannel (agent-to-agent, RFC-004) implements the exact
// same NegotiationChannel interface — this class proves the interface is
// real by being a genuine, non-mock implementation of it.
export class HumanChatChannel implements NegotiationChannel {
  constructor(
    private readonly localUserId: string,
    private readonly remoteUserId: string,
    private readonly tradeId: string
  ) {}

  async sendEvent(event: NegotiationEvent): Promise<void> {
    const node = pearNodeRegistry.get(this.localUserId)
    if (!node) {
      throw new NotFoundError('PearNode for user (call POST /v1/peers/start first)', this.localUserId)
    }
    const delivered = node.sendToPeer(this.remoteUserId, {
      kind: 'negotiation_event',
      tradeId: this.tradeId,
      event,
    })
    // RFC-002's amendment: the protocol never assumes continuous
    // connectivity. A failed send is persisted for redelivery — not
    // silently dropped, and not treated as a hard failure.
    await prisma.message.create({
      data: {
        tradeId: this.tradeId,
        senderId: this.localUserId,
        content: event.type === 'MESSAGE_EXCHANGED' ? event.content : JSON.stringify(event),
        msgType: event.type === 'MESSAGE_EXCHANGED' ? 'TEXT' : 'SYSTEM',
      },
    })
    await eventBus.emit('openp2p.message.sent', {
      messageId: this.tradeId, // placeholder until Message model exposes its own id here
      tradeId: this.tradeId,
      senderId: this.localUserId,
      content: event.type === 'MESSAGE_EXCHANGED' ? event.content : JSON.stringify(event),
      msgType: event.type,
      timestamp: event.at,
    }, this.tradeId)   // correlationId (RFC-010)
    await eventBus.emit('negotiation.event_received', { tradeId: this.tradeId, eventType: event.type }, this.tradeId)
    if (!delivered) {
      console.warn(`[Negotiation] ${this.remoteUserId} not connected — event persisted, will be visible on their next sync`)
    }
  }

  onEvent(handler: (event: NegotiationEvent) => void): void {
    const node = pearNodeRegistry.get(this.localUserId)
    if (!node) {
      throw new NotFoundError('PearNode for user (call POST /v1/peers/start first)', this.localUserId)
    }
    node.on('message', ({ message }: { peerId: string; message: any }) => {
      if (message?.kind === 'negotiation_event' && message.tradeId === this.tradeId) {
        handler(message.event as NegotiationEvent)
      }
    })
  }
}

// ─── Negotiation state — PROTOCOL_SPECIFICATION.md §1.4, refined v8.7 ────────
export type NegotiationStatus = 'CREATED' | 'NEGOTIATING' | 'TERMS_AGREED' | 'ABANDONED'

export class NegotiationService {
  private status = new Map<string, NegotiationStatus>()

  async open(tradeId: string, buyerId: string, sellerId: string): Promise<HumanChatChannel> {
    const trade = await prisma.trade.findUnique({ where: { id: tradeId } })
    if (!trade) throw new NotFoundError('Trade', tradeId)

    this.status.set(tradeId, 'CREATED')
    await eventBus.emit('negotiation.opened', { tradeId, buyerId, sellerId }, tradeId)
    await eventBus.emit('openp2p.trade.status_changed', {
      tradeId, from: 'PENDING', to: 'NEGOTIATING', triggeredBy: buyerId,
    }, tradeId)
    this.status.set(tradeId, 'NEGOTIATING')

    // Both directions — buyer's view of the channel and seller's view are
    // two separate HumanChatChannel instances pointed at each other.
    return new HumanChatChannel(buyerId, sellerId, tradeId)
  }

  getStatus(tradeId: string): NegotiationStatus {
    return this.status.get(tradeId) ?? 'CREATED'
  }

  async markAgreed(tradeId: string): Promise<void> {
    // Boundary held per the v8.7 revision note: this stops at TERMS_AGREED.
    // AwaitingSettlement/Settled/Completed are Settlement's states
    // (escrow.service.ts), not Negotiation's — see
    // PROTOCOL_SPECIFICATION.md §3.1 for why that line is deliberate.
    this.status.set(tradeId, 'TERMS_AGREED')
    await eventBus.emit('negotiation.terms_agreed', { tradeId }, tradeId)
  }
}

export const negotiationService = new NegotiationService()
