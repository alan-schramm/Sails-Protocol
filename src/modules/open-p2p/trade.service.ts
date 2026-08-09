/**
 * Sails OpenP2P — Trade Service
 *
 * negotiation.service.ts already owns the negotiation channel/state
 * machine (RFC-004) but assumes a `Trade` row already exists — nothing
 * created one. This is that missing piece: turning an accepted Offer
 * into a real Trade row, the other half of TODO.md §1's "modules/open-p2p/
 * — trade routes ... only service-layer logic survived" gap.
 */
import { NotFoundError, ValidationError, ForbiddenError } from '../../common/errors'
import { eventBus } from '../../common/events/event-bus'
import { negotiationService } from './negotiation.service'
import { intentEngine } from '../../core/intent-engine'
import { tradeRepository, type TradeRepository } from './trade-repository'
import type { TradeStatus } from '../../common/types'

export interface CreateTradeInput {
  offerId: string
  counterpartyId: string // the participant accepting the offer (caller)
  amount: string          // decimal string — RFC-009
}

export interface TradePagination {
  limit?: number
  offset?: number
}

export class TradeService {
  constructor(private readonly repo: TradeRepository = tradeRepository) {}

  async createTrade(input: CreateTradeInput) {
    const offer = await this.repo.findOfferById(input.offerId)
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

    const trade = await this.repo.create({
      offerId: offer.id,
      buyerId,
      sellerId,
      asset: offer.asset,
      amount: input.amount,
      priceUsd,
      totalUsd,
      network: offer.network,
      intentId: offer.intentId, // RFC-018 — carried over from the accepted Offer
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
    const trade = await this.repo.findByIntentId(intentId)
    if (!trade) throw new NotFoundError('Trade for Intent', intentId)
    return trade
  }

  // escrow + messages(asc) + offer include — found while auditing a real
  // gap: the buyer has nowhere to see *where* to send fiat (the seller's
  // Offer.paymentDetails) once a trade is already underway — OfferDetail
  // shows it, but Trade never re-fetched the Offer at all.
  // paymentMethod/paymentDetails are the two fields this exists for; the
  // rest of Offer comes along for free via the relation, same low-risk
  // tradeoff every other `include` this shape makes (see
  // trade-repository.ts's findByIdWithDetails()).
  async getTrade(tradeId: string) {
    const trade = await this.repo.findByIdWithDetails(tradeId)
    if (!trade) throw new NotFoundError('Trade', tradeId)
    return trade
  }

  // trade.routes.ts's own /reconcile handler and chat.routes.ts's 3 call
  // sites (JOIN_TRADE, SEND_MESSAGE, GET messages) all did this exact
  // fetch+ownership-check+throw inline — extracted here so all 4 share
  // one implementation. Deliberately uses the bare findById() shape (no
  // escrow/messages/offer include), not getTrade(), because none of
  // these 4 call sites need anything beyond buyerId/sellerId for the
  // check.
  async assertParticipant(tradeId: string, participantId: string) {
    const trade = await this.repo.findById(tradeId)
    if (!trade) throw new NotFoundError('Trade', tradeId)
    if (participantId !== trade.buyerId && participantId !== trade.sellerId) {
      throw new ForbiddenError(`${participantId} is not a party to trade ${tradeId}`)
    }
    return trade
  }

  // Fase 2 (SDK React) — closes a real gap found while scoping
  // useSailsTrades(): no "list my trades" endpoint existed anywhere
  // (packages/sails-ui's own TradeHistory.tsx uses MOCK_TRADE_HISTORY
  // for exactly this reason). Scoped to trades where the caller is
  // buyer OR seller — never a global listing, which would leak every
  // participant's trade activity to every other participant. Same
  // limit/offset clamping convention liquidity.service.ts's
  // InternalOrderBook.getOffers() already established (limit 1-50,
  // default 10) — matched here rather than inventing a second
  // pagination convention or a cursor-based one.
  async getTrades(participantId: string, pagination?: TradePagination) {
    const limit = Math.min(Math.max(pagination?.limit ?? 10, 1), 50)
    const offset = Math.max(pagination?.offset ?? 0, 0)

    const [trades, total] = await Promise.all([
      this.repo.findManyByParticipant(participantId, limit, offset),
      this.repo.countByParticipant(participantId),
    ])

    return { trades, total, hasMore: offset + trades.length < total }
  }

  // Only the subset of transitions a participant can trigger directly —
  // COMPLETED is driven exclusively by settlement.escrow.released
  // (common/events/handlers.ts), never set here, so this method never
  // needs to duplicate that reaction.
  async updateStatus(tradeId: string, status: Extract<TradeStatus, 'ACTIVE' | 'CANCELLED'>, triggeredBy: string) {
    const trade = await this.repo.findById(tradeId)
    if (!trade) throw new NotFoundError('Trade', tradeId)
    if (triggeredBy !== trade.buyerId && triggeredBy !== trade.sellerId) {
      throw new ForbiddenError(`${triggeredBy} is not a party to trade ${tradeId}`)
    }

    const updated = await this.repo.updateStatus(tradeId, status, status === 'CANCELLED' ? new Date() : undefined)

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
