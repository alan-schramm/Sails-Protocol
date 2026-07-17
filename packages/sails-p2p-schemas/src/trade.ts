/**
 * Trade schema — sails-p2p-schemas (04-Deepseek Review.md Task 1).
 *
 * `TradeState` is the requested explicit vocabulary
 * (open -> payment_sent -> payment_confirmed -> escrow_released, plus
 * dispute states). It is DERIVED from the real `Trade.status` +
 * `Escrow.status` + `Dispute.status`/`ruling` columns already in
 * `prisma/schema.prisma` — not a new, separately-stored column. Storing a
 * fourth parallel status field would create exactly the kind of divergent
 * source-of-truth risk RFC-011 was built to close for Postgres/P2P; this
 * schema is a read-model/vocabulary layer over the existing columns, the
 * same relationship RFC-008's Timeline has to the Event Bus.
 */

export type TradeState =
  | 'open'
  | 'payment_sent'
  | 'payment_confirmed'
  | 'escrow_released'
  | 'dispute_opened'
  | 'dispute_resolved_buyer'
  | 'dispute_resolved_seller'
  | 'cancelled'

export interface TradeSchema {
  id: string
  offerId: string
  buyerId: string
  sellerId: string
  asset: string
  amount: string // decimal string (RFC-009)
  price: string // decimal string (RFC-009)
  state: TradeState
  escrowId: string | null
}

export interface TradeStatusInput {
  status: 'PENDING' | 'ACTIVE' | 'COMPLETED' | 'DISPUTED' | 'CANCELLED'
}

export interface EscrowStatusInput {
  status: 'CREATED' | 'FUNDS_LOCKED' | 'PAYMENT_PENDING' | 'COMPLETED' | 'DISPUTED' | 'REFUNDED'
}

export interface DisputeStatusInput {
  status: 'OPENED' | 'EVIDENCE_SUBMITTED' | 'ARBITRATED' | 'RESOLVED'
  ruling: 'RELEASE' | 'REFUND' | 'SPLIT' | null
}

/**
 * A real gap worth stating plainly rather than papering over: the
 * requested 4-state happy path has no backing column distinguishing
 * "payment_confirmed" (seller acknowledged receiving payment) from
 * "payment_sent" (buyer marked payment sent) — `EscrowStatus` only has
 * `PAYMENT_PENDING` for both. `payment_confirmed` is aliased to
 * `payment_sent` below until a real intermediate confirmation step
 * exists (BACKLOG.md follow-up) — this function does not fabricate a
 * distinction the schema doesn't actually have yet.
 */
export function deriveTradeState(
  trade: TradeStatusInput,
  escrow: EscrowStatusInput | null,
  dispute: DisputeStatusInput | null
): TradeState {
  if (dispute) {
    if (dispute.status === 'RESOLVED') {
      if (dispute.ruling === 'RELEASE') return 'dispute_resolved_buyer'
      if (dispute.ruling === 'REFUND') return 'dispute_resolved_seller'
      // SPLIT has no buyer/seller-exclusive equivalent in this vocabulary —
      // falls through to dispute_opened rather than fabricating a winner.
    }
    return 'dispute_opened'
  }

  if (trade.status === 'CANCELLED') return 'cancelled'
  if (!escrow) return 'open'

  switch (escrow.status) {
    case 'CREATED':
    case 'FUNDS_LOCKED':
      return 'open'
    case 'PAYMENT_PENDING':
      return 'payment_sent' // see doc comment above — payment_confirmed has no distinct backing state today
    case 'COMPLETED':
      return 'escrow_released'
    case 'REFUNDED':
      return 'cancelled'
    case 'DISPUTED':
      return 'dispute_opened' // reached only if the Dispute row lookup above missed it
    default:
      return 'open'
  }
}
