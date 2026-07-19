/**
 * Sails OpenP2P — Trade Service
 *
 * negotiation.service.ts already owns the negotiation channel/state
 * machine (RFC-004) but assumes a `Trade` row already exists — nothing
 * created one. This is that missing piece: turning an accepted Offer
 * into a real Trade row, the other half of TODO.md §1's "modules/open-p2p/
 * — trade routes ... only service-layer logic survived" gap.
 */
import { prisma } from '../../common/database'
import { NotFoundError, ValidationError, ForbiddenError } from '../../common/errors'
import { eventBus } from '../../common/events/event-bus'
import { negotiationService } from './negotiation.service'
import { intentEngine } from '../../core/intent-engine'
import type { TradeStatus } from '../../common/types'

export interface CreateTradeInput {
  offerId: string
  counterpartyId: string // the participant accepting the offer (caller)
  amount: string          // decimal string — RFC-009
}

export class TradeService {
  async createTrade(input: CreateTradeInput) {
    const offer = await prisma.offer.findUnique({ where: { id: input.offerId } })
    if (!offer) throw new NotFoundError('Offer', input.offerId)
    if (offer.status !== 'ACTIVE') {
      throw new ValidationError(`Offer ${input.offerId} is not active (status: ${offer.status})`)
    }
    if (offer.userId === input.counterpartyId) {
      throw new ValidationError('Cannot start a trade against your own offer')
    }

    // Offer.side is the offer creator's side — the caller takes the
    // opposite role. A SELL offer means the creator is the seller; a BUY
    // offer means the creator is the buyer.
    const [buyerId, sellerId] =
      offer.side === 'SELL' ? [input.counterpartyId, offer.userId] : [offer.userId, input.counterpartyId]

    const priceUsd = offer.priceUsd
    const totalUsd = (Number(priceUsd) * Number(input.amount)).toFixed(8)

    const trade = await prisma.trade.create({
      data: {
        offerId: offer.id,
        buyerId,
        sellerId,
        asset: offer.asset,
        amount: input.amount,
        priceUsd,
        totalUsd,
        network: offer.network,
        intentId: offer.intentId, // RFC-018 — carried over from the accepted Offer
      },
    })

    await eventBus.emit('openp2p.trade.created', {
      tradeId: trade.id,
      offerId: offer.id,
      buyerId,
      sellerId,
      asset: trade.asset,
      amount: trade.amount.toString(),   // RFC-009 — Decimal -> decimal string at the event boundary
      priceUsd: trade.priceUsd.toString(),
    }, trade.id)

    // RFC-018 (rfcs/RFC-018-intent-as-canonical-trade-entry-point.md) —
    // walks the originating Intent through the states this reference
    // implementation's synchronous "accept an offer" flow actually
    // represents: DISCOVERING (the search that led the counterparty to
    // this offer already happened, outside this function) -> MATCHED (a
    // counterparty is now committed) -> NEGOTIATING (negotiationService.
    // open() below opens the chat channel immediately after). COMMITTED
    // itself waits for escrow to actually lock
    // (common/events/handlers.ts's settlement.escrow.locked reaction) —
    // this mapping is PROTOCOL_SPECIFICATION.md §3.1's own table, not
    // invented here. `offer.intentId` is null for any Offer created
    // before this RFC landed — skipped entirely, not an error, same
    // backward-compatible posture as every other nullable-FK migration
    // in this codebase.
    if (offer.intentId) {
      const triggeredBy = 'system:trade-lifecycle'
      await intentEngine.transition(offer.intentId, 'DISCOVERING', triggeredBy, 'intent.discovering', { intentId: offer.intentId })
      await intentEngine.transition(offer.intentId, 'MATCHED', triggeredBy, 'intent.matched', { intentId: offer.intentId, candidateIds: [input.counterpartyId] })
      await intentEngine.transition(offer.intentId, 'NEGOTIATING', triggeredBy, 'intent.negotiating', { intentId: offer.intentId, negotiationId: trade.id })
    }

    // Opens the negotiation channel's in-memory status tracking and emits
    // negotiation.opened/openp2p.trade.status_changed. The HumanChatChannel
    // instance this returns is discarded here — chat.routes.ts constructs
    // its own per-connection channel scoped to whichever participant is
    // actually connected via WebSocket, not the buyer specifically.
    await negotiationService.open(trade.id, buyerId, sellerId)

    return trade
  }

  async getTrade(tradeId: string) {
    const trade = await prisma.trade.findUnique({
      where: { id: tradeId },
      include: {
        escrow: true,
        messages: { orderBy: { createdAt: 'asc' } },
      },
    })
    if (!trade) throw new NotFoundError('Trade', tradeId)
    return trade
  }

  // Only the subset of transitions a participant can trigger directly —
  // COMPLETED is driven exclusively by settlement.escrow.released
  // (common/events/handlers.ts), never set here, so this method never
  // needs to duplicate that reaction.
  async updateStatus(tradeId: string, status: Extract<TradeStatus, 'ACTIVE' | 'CANCELLED'>, triggeredBy: string) {
    const trade = await prisma.trade.findUnique({ where: { id: tradeId } })
    if (!trade) throw new NotFoundError('Trade', tradeId)
    if (triggeredBy !== trade.buyerId && triggeredBy !== trade.sellerId) {
      throw new ForbiddenError(`${triggeredBy} is not a party to trade ${tradeId}`)
    }

    const updated = await prisma.trade.update({
      where: { id: tradeId },
      data: {
        status,
        cancelledAt: status === 'CANCELLED' ? new Date() : undefined,
      },
    })

    await eventBus.emit('openp2p.trade.status_changed', {
      tradeId,
      from: trade.status,
      to: status,
      triggeredBy,
    }, tradeId)

    return updated
  }
}

export const tradeService = new TradeService()
