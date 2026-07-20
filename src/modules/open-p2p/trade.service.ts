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

    // Robustness-audit fix (2026-07-20): createTrade() never validated
    // `input.amount` at all — neither that it's a sane positive number,
    // nor that it falls within the very `minAmount`/`maxAmount` bounds
    // the Offer publishes and the UI displays as a hard constraint
    // (OfferDetail.tsx's "Limites 10-100 USDT"). A caller could request
    // any amount, including one wildly outside what the seller actually
    // offered, and a real Trade would be created for it — an accepted
    // "trade" the counterparty never agreed to, not just a UX gap.
    // `Number()` here is the same "bounds check, not exact arithmetic"
    // precedent RFC-009 already established (policy-engine.ts's
    // validateFinancialSanity(), liquidity.service.ts's sort comparator)
    // — the decimal string itself is still what's persisted below.
    const amountNum = Number(input.amount)
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      throw new ValidationError(`amount must be a positive decimal string, got "${input.amount}"`)
    }
    if (amountNum < Number(offer.minAmount) || amountNum > Number(offer.maxAmount)) {
      throw new ValidationError(
        `amount ${input.amount} is outside Offer ${offer.id}'s limits (${offer.minAmount}-${offer.maxAmount})`
      )
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

  // Closes the real gap @sails/sdk's intent-facade.ts's dispute() needed:
  // resolving an intentId (the caller's own vocabulary — createIntent()
  // is the entry point) to the Trade/Escrow RFC-018 already links it to
  // server-side. Same no-auth pattern as getTrade() below — an intentId
  // isn't guessable-and-sensitive any more than a tradeId already is,
  // and getTrade() itself has never required auth.
  async getTradeByIntentId(intentId: string) {
    const trade = await prisma.trade.findFirst({
      where: { intentId },
      include: { escrow: true, offer: true },
    })
    if (!trade) throw new NotFoundError('Trade for Intent', intentId)
    return trade
  }

  async getTrade(tradeId: string) {
    const trade = await prisma.trade.findUnique({
      where: { id: tradeId },
      include: {
        escrow: true,
        messages: { orderBy: { createdAt: 'asc' } },
        // Found while auditing a real gap: the buyer has nowhere to see
        // *where* to send fiat (the seller's Offer.paymentDetails) once a
        // trade is already underway — OfferDetail shows it, but Trade
        // never re-fetched the Offer at all. paymentMethod/paymentDetails
        // are the two fields this exists for; the rest of Offer comes
        // along for free via the relation, same low-risk tradeoff every
        // other `include` in this file already makes.
        offer: true,
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

    // RFC-018 gap found by a CTO-role review after the initial rollout
    // ("garantir que os testes cubram cenários de falha... trade
    // cancelado"): a Trade cancelled before escrow ever locks left its
    // Intent stuck at NEGOTIATING forever — nothing transitioned it.
    // CANCELLED is a valid direct transition from every pre-COMMITTED
    // state (core/state-machine.ts), so this is safe regardless of
    // which one the Intent is actually in.
    if (status === 'CANCELLED' && trade.intentId) {
      await intentEngine.transition(
        trade.intentId, 'CANCELLED', triggeredBy, 'intent.cancelled',
        { intentId: trade.intentId, cancelledBy: triggeredBy }
      )
    }

    return updated
  }
}

export const tradeService = new TradeService()
