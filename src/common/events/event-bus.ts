import { EventEmitter } from 'events'

/**
 * Sails Protocol — Event Contract
 *
 * Every event follows the canonical namespace: {module}.{entity}.{action}
 * This is mandated by MASTER_COORDINATION.md — it allows future modules
 * (Sails OpenFinance, Sails OpenAgents) to register handlers without
 * ambiguity about which module emitted what.
 *
 * Legacy names (trade.created, escrow.created, etc.) are NOT used here.
 * If external consumers still expect legacy names, add an alias layer
 * at the transport boundary (webhook dispatcher) — never in the Core.
 */

// ─── Sails OpenP2P events ──────────────────────────────────────────────────────
export interface OpenP2PTradeCreatedEvent {
  tradeId: string
  offerId: string
  buyerId: string
  sellerId: string
  asset: string
  amount: string    // decimal string — RFC-009, never a JS number
  priceUsd: string   // decimal string — RFC-009
}

export interface OpenP2PTradeStatusChangedEvent {
  tradeId: string
  from: string
  to: string
  triggeredBy: string
}

export interface OpenP2PMessageSentEvent {
  messageId: string
  tradeId: string
  senderId: string
  content: string
  msgType: string
  timestamp: string
}

// ─── Sails OpenSettlement events ───────────────────────────────────────────────
export interface SettlementEscrowCreatedEvent {
  escrowId: string
  tradeId: string
  type: string
  lockedAmount: string   // decimal string — RFC-009, never a JS number
  asset: string
}

export interface SettlementEscrowStatusChangedEvent {
  escrowId: string
  tradeId: string
  from: string
  to: string
  triggeredBy: string
  txId?: string
  note?: string
}

// ─── Sails OpenReputation events ───────────────────────────────────────────────
export interface ReputationUpdatedEvent {
  userId: string
  newScore: number
  totalTrades: number
  tradeId: string
  ratingGiven: number
}

// ─── Sails OpenLiquidity events ────────────────────────────────────────────────
export interface LiquidityOfferCreatedEvent {
  offerId: string
  userId: string
  asset: string
  side: string
  priceUsd: string   // decimal string — RFC-009, never a JS number
}

export interface LiquidityOfferStatusChangedEvent {
  offerId: string
  from: string
  to: string
  triggeredBy: string
}

// ─── Cross-module transport events (Pears/HyperDHT — not owned by any module) ─
export interface PeerConnectedEvent {
  userId: string
  peerId: string
  publicKey: string
}

export interface PeerDisconnectedEvent {
  userId: string
  peerId: string
}

// ─── Proof primitive events — RFC-003, PROTOCOL_SPECIFICATION.md §1.8 ────────
export interface ClaimAssertedEvent {
  claimId: string
  claimedBy: string
  claimType: string
}
export interface ProofSubmittedEvent {
  proofId: string
  claimId: string
}
export interface VerificationEvent {
  verificationId: string
  proofId: string
  verifiedBy: string
  verdict: 'ACCEPTED' | 'REJECTED'
}

// ─── Dispute primitive events — PROTOCOL_SPECIFICATION.md §1.9 ───────────────
export interface DisputeEvent {
  disputeId: string
  settlementId: string
  triggeredBy: string
}

// ─── Negotiation primitive events — PROTOCOL_SPECIFICATION.md §1.4 ───────────
export interface NegotiationOpenedEvent {
  tradeId: string
  buyerId: string
  sellerId: string
}
export interface NegotiationEventReceivedEvent {
  tradeId: string
  eventType: string
}
export interface NegotiationTermsAgreedEvent {
  tradeId: string
}
export interface NegotiationAbandonedEvent {
  tradeId: string
  by: string
}

// ─── Event Map — canonical namespace {module}.{entity}.{action} ──────────────
export interface SailsEventMap {
  // Sails OpenP2P — trade lifecycle
  'openp2p.trade.created': OpenP2PTradeCreatedEvent
  'openp2p.trade.status_changed': OpenP2PTradeStatusChangedEvent
  'openp2p.trade.completed': OpenP2PTradeStatusChangedEvent
  'openp2p.trade.disputed': OpenP2PTradeStatusChangedEvent
  'openp2p.trade.cancelled': OpenP2PTradeStatusChangedEvent
  'openp2p.message.sent': OpenP2PMessageSentEvent

  // Sails OpenSettlement — escrow lifecycle
  'settlement.escrow.created': SettlementEscrowCreatedEvent
  'settlement.escrow.locked': SettlementEscrowStatusChangedEvent
  'settlement.escrow.payment_pending': SettlementEscrowStatusChangedEvent
  'settlement.escrow.released': SettlementEscrowStatusChangedEvent
  'settlement.escrow.disputed': SettlementEscrowStatusChangedEvent
  'settlement.escrow.refunded': SettlementEscrowStatusChangedEvent

  // Sails OpenReputation
  'reputation.score.updated': ReputationUpdatedEvent

  // Sails OpenLiquidity — offers
  'liquidity.offer.created': LiquidityOfferCreatedEvent
  'liquidity.offer.status_changed': LiquidityOfferStatusChangedEvent

  // Proof primitive — RFC-003
  'claim.asserted': ClaimAssertedEvent
  'proof.submitted': ProofSubmittedEvent
  'verification.accepted': VerificationEvent
  'verification.rejected': VerificationEvent

  // Dispute primitive
  'dispute.opened': DisputeEvent
  'dispute.evidence_submitted': DisputeEvent
  'dispute.arbitrated': DisputeEvent
  'dispute.resolved': DisputeEvent

  // Negotiation primitive — RFC-004
  'negotiation.opened': NegotiationOpenedEvent
  'negotiation.event_received': NegotiationEventReceivedEvent
  'negotiation.terms_agreed': NegotiationTermsAgreedEvent
  'negotiation.abandoned': NegotiationAbandonedEvent

  // Cross-module — P2P transport (Pears/HyperDHT)
  'peer.connected': PeerConnectedEvent
  'peer.disconnected': PeerDisconnectedEvent
}

export type SailsEventName = keyof SailsEventMap

// ─── Typed Event Bus ──────────────────────────────────────────────────────────
class SailsEventBus extends EventEmitter {
  emit<K extends SailsEventName>(event: K, payload: SailsEventMap[K]): boolean {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[EventBus] ${event}`, JSON.stringify(payload, null, 2))
    }
    return super.emit(event, payload)
  }

  on<K extends SailsEventName>(
    event: K,
    listener: (payload: SailsEventMap[K]) => void | Promise<void>
  ): this {
    return super.on(event, (payload) => {
      const result = listener(payload)
      if (result instanceof Promise) {
        result.catch((err) => {
          console.error(`[EventBus] Async listener error on "${event}":`, err)
        })
      }
    })
  }

  once<K extends SailsEventName>(
    event: K,
    listener: (payload: SailsEventMap[K]) => void | Promise<void>
  ): this {
    return super.once(event, listener)
  }

  off<K extends SailsEventName>(
    event: K,
    listener: (payload: SailsEventMap[K]) => void | Promise<void>
  ): this {
    return super.off(event, listener)
  }
}

// Singleton — shared across all modules. This IS the "zero coupling" mechanism:
// modules never import each other, they only import this bus and react to events.
export const eventBus = new SailsEventBus()
eventBus.setMaxListeners(50)
