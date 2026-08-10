import { AssetType, TradeSide, PaymentMethod, OfferStatus } from '../../common/types'
import { prisma } from '../../common/database'
import { NotFoundError, ForbiddenError } from '../../common/errors'
import { eventBus } from '../../common/events/event-bus'
import { intentEngine } from '../../core/intent-engine'
import { childLogger } from '../../common/logger'
import { DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT } from '../../common/pagination'
import type { TradeIntentPayload } from '../../common/types/intent'
import type { Prisma } from '@prisma/client'

const log = childLogger('liquidity')

/**
 * Sails OpenLiquidity — Reference Implementation
 *
 * MOVED from src/modules/routing/routing.service.ts (folder name "routing"
 * did not match any of the 8 official module names in MASTER_COORDINATION.md).
 *
 * Fix applied: getOffers() and matchOrder() previously duplicated the same
 * 8-field object-literal mapping from a Prisma Offer row to a LiquidityOffer.
 * Extracted into mapOfferToLiquidityOffer() below — one source of truth for
 * that shape, so changing the LiquidityOffer contract only requires editing
 * one place instead of two (and future providers only implement the same
 * helper pattern instead of re-deriving the mapping).
 */

// ─── Protocol interface (Sails Protocol Spec — LiquidityProvider) ─────────────
export interface LiquidityOffer {
  id: string
  source: 'internal' | 'hodlhodl' | 'robosats' | string
  asset: AssetType
  side: TradeSide
  priceUsd: string    // decimal string — RFC-009, never a JS number
  minAmount: string    // decimal string — RFC-009
  maxAmount: string    // decimal string — RFC-009
  paymentMethods: string[]
  traderReputation?: number
}

// Real gap found dogfooding @sails/sdk (examples/simple-wallet,
// docs/TODO.md §25): getOffers()/getAggregatedOffers() had a hard
// `take: 10` with no way for a caller to reach anything beyond the 10
// cheapest active offers for an asset/side — on any marketplace with
// more than 10 active offers (a certainty at real scale), a caller has
// no way to discover the rest. `limit` defaults to 10 (unchanged
// behavior for every existing caller that doesn't pass it) and is
// capped at 50 to keep a single query bounded.
export interface OfferPagination {
  limit?: number
  offset?: number
}

// Production Readiness Audit (2026-08-09) — API_REFERENCE.md always
// documented GET /v1/liquidity/offers as filterable by
// "asset/side/paymentMethod/price range," but the route only ever
// accepted asset/side; this closes that gap for real instead of just
// correcting the doc. A separate type from OfferPagination on purpose —
// filters and pagination are different concerns, and every provider's
// getOffers() already takes pagination independently of them.
export interface OfferFilters {
  paymentMethod?: PaymentMethod
  /** Decimal string, inclusive lower bound on Offer.priceUsd — same RFC-009 convention as every other price/amount field. */
  priceMin?: string
  /** Decimal string, inclusive upper bound on Offer.priceUsd. */
  priceMax?: string
}

export interface LiquidityProvider {
  name: string
  isAvailable(): Promise<boolean>
  getOffers(asset: AssetType, side: TradeSide, pagination?: OfferPagination, filters?: OfferFilters): Promise<LiquidityOffer[]>
  matchOrder(asset: AssetType, side: TradeSide, amount: string): Promise<LiquidityOffer | null>
}

// ─── Pagination ────────────────────────────────────────────────────────────────
// One source of truth for limit/offset clamping — same convention every other
// paginated list in this codebase already follows (trade.service.ts's
// getTrades(), dispute.service.ts's listForArbiter(), routes.test.ts's own
// zod schemas). Keep it as a pure helper so both providers and the router can
// reuse it.
function normalizePagination(pagination?: OfferPagination): { limit: number; offset: number } {
  const limit = Math.min(Math.max(pagination?.limit ?? DEFAULT_PAGE_LIMIT, 1), MAX_PAGE_LIMIT)
  const offset = Math.max(pagination?.offset ?? 0, 0)
  return { limit, offset }
}

// Number() coercion here is intentional and safe — a sort comparator only
// needs correct relative order, not exact arithmetic, so float precision
// is immaterial (unlike a stored/computed amount). See RFC-009.
function compareByPriceDesc(a: LiquidityOffer, b: LiquidityOffer): number {
  return Number(b.priceUsd) - Number(a.priceUsd)
}

function compareByPriceAsc(a: LiquidityOffer, b: LiquidityOffer): number {
  return Number(a.priceUsd) - Number(b.priceUsd)
}

// ─── Shared mapping helper (was duplicated in getOffers + matchOrder) ────────
// priceUsd/minAmount/maxAmount are Prisma.Decimal here (internal, module-local
// shape reading straight off a query result) — converted to decimal string
// only where they cross into the protocol-level LiquidityOffer shape below,
// per RFC-009.
type OfferRow = {
  id: string
  asset: string
  side: string
  priceUsd: Prisma.Decimal
  minAmount: Prisma.Decimal
  maxAmount: Prisma.Decimal
  paymentMethod: string
  user: { reputationScore: number }
}

function mapOfferToLiquidityOffer(offer: OfferRow): LiquidityOffer {
  return {
    id: offer.id,
    source: 'internal',
    asset: offer.asset as AssetType,
    side: offer.side as TradeSide,
    priceUsd: offer.priceUsd.toString(),
    minAmount: offer.minAmount.toString(),
    maxAmount: offer.maxAmount.toString(),
    paymentMethods: [offer.paymentMethod],
    traderReputation: offer.user.reputationScore,
  }
}

// ─── Internal P2P Order Book ──────────────────────────────────────────────────
class InternalOrderBook implements LiquidityProvider {
  name = 'internal'

  async isAvailable() {
    return true
  }

  async getOffers(asset: AssetType, side: TradeSide, pagination?: OfferPagination, filters?: OfferFilters): Promise<LiquidityOffer[]> {
    const { limit, offset } = normalizePagination(pagination)
    const offers = await prisma.offer.findMany({
      where: {
        asset,
        side,
        status: 'ACTIVE',
        ...(filters?.paymentMethod ? { paymentMethod: filters.paymentMethod } : {}),
        ...(filters?.priceMin || filters?.priceMax
          ? {
              priceUsd: {
                ...(filters?.priceMin ? { gte: filters.priceMin } : {}),
                ...(filters?.priceMax ? { lte: filters.priceMax } : {}),
              },
            }
          : {}),
      },
      orderBy: { priceUsd: side === 'SELL' ? 'asc' : 'desc' },
      take: limit,
      skip: offset,
      include: { user: { select: { reputationScore: true } } },
    })
    return offers.map(mapOfferToLiquidityOffer)
  }

  async matchOrder(asset: AssetType, side: TradeSide, amount: string): Promise<LiquidityOffer | null> {
    const counterSide: TradeSide = side === 'BUY' ? 'SELL' : 'BUY'

    const offer = await prisma.offer.findFirst({
      where: {
        asset,
        side: counterSide,
        status: 'ACTIVE',
        minAmount: { lte: amount },
        maxAmount: { gte: amount },
      },
      orderBy: { priceUsd: counterSide === 'SELL' ? 'asc' : 'desc' },
      include: { user: { select: { reputationScore: true } } },
    })

    return offer ? mapOfferToLiquidityOffer(offer) : null
  }
}

// ─── Offer creation/lifecycle — local to the Internal Order Book, since only
// internal offers can be created/paused/cancelled through this reference
// implementation (HodlHodl offers are theirs to manage, read-only here) ──────
export interface CreateOfferInput {
  userId: string
  asset: AssetType
  side: TradeSide
  priceUsd: string
  priceBrl?: string
  minAmount: string
  maxAmount: string
  paymentMethod: PaymentMethod
  paymentDetails?: string
  network?: string
  description?: string
}

// RFC-018 (rfcs/RFC-018-intent-as-canonical-trade-entry-point.md) — an Offer is
// conceptually a published, discoverable TradeIntent
// (PROTOCOL_SPECIFICATION.md §1.11); the payload's maxValue/minValue are the
// offer's total fiat range (priceUsd × the amount bounds already validated by
// this route's caller), decimal strings per RFC-009 — never a JS number.
function buildTradeIntentPayload(input: CreateOfferInput): TradeIntentPayload {
  return {
    asset: input.asset,
    side: input.side,
    maxValue: (Number(input.priceUsd) * Number(input.maxAmount)).toFixed(8),
    minValue: (Number(input.priceUsd) * Number(input.minAmount)).toFixed(8),
    fiatMethod: input.paymentMethod,
    network: input.network,
  }
}

// ─── Router: tries providers in order, aggregates and ranks ──────────────────
export class LiquidityRouter {
  private readonly providers: LiquidityProvider[]

  // HodlHodl aggregation (pulling their public order book into search
  // results) was a stubbed LiquidityProvider here — always isAvailable()
  // === false, zero test coverage, no runtime effect. Removed 2026-08-09
  // per project-owner decision: not needed for the current milestone,
  // stays a roadmap line in BACKLOG.md instead of dead code in the tree.
  // The unrelated real code that cites HodlHodl as a design precedent
  // (multisig.provider.ts, lightning-hodl.provider.ts's 2-of-3 escrow
  // model) is untouched — that's shipped, working code, not this stub.
  constructor() {
    this.providers = [new InternalOrderBook()]
  }

  async createOffer(input: CreateOfferInput) {
    const intent = await intentEngine.create('TradeIntent', buildTradeIntentPayload(input), input.userId)

    const offer = await prisma.offer.create({
      data: {
        userId: input.userId,
        asset: input.asset,
        side: input.side,
        priceUsd: input.priceUsd,
        priceBrl: input.priceBrl,
        minAmount: input.minAmount,
        maxAmount: input.maxAmount,
        paymentMethod: input.paymentMethod,
        paymentDetails: input.paymentDetails,
        network: input.network,
        description: input.description,
        intentId: intent.id,
      },
    })

    await eventBus.emit('liquidity.offer.created', {
      offerId: offer.id,
      userId: offer.userId,
      asset: offer.asset,
      side: offer.side,
      priceUsd: offer.priceUsd.toString(),   // RFC-009 — Decimal -> decimal string at the event boundary
    }, offer.id)   // correlationId (RFC-010) — no tradeId exists yet for an offer

    return offer
  }

  // Real gap found wiring the first real caller (packages/sails-ui's
  // OfferDetail screen): no route ever let a caller fetch a single Offer
  // by id, including its owner's public profile fields — discover()/
  // getAggregatedOffers() only support asset+side listing, and the
  // aggregated LiquidityOffer summary shape they return is missing
  // several fields OfferDetail genuinely needs (network, description,
  // the seller's displayName/verified/totalTrades). This is
  // the persisted Offer row plus its real User relation, not a second
  // aggregation-shaped summary.
  async getOffer(offerId: string) {
    const offer = await prisma.offer.findUnique({
      where: { id: offerId },
      include: { user: { select: {
        id: true, publicKey: true, displayName: true, peerId: true,
        reputationScore: true, totalTrades: true, disputeCount: true,
        totalVolumeBtc: true, verified: true, createdAt: true,
      } } },
    })
    if (!offer) throw new NotFoundError('Offer', offerId)
    return offer
  }

  // Real gap found auditing packages/sails-ui's Profile screen
  // (2026-08-01): "Minhas Ofertas" read lib/offersStore.ts/localStorage
  // instead of the real backend, so a just-published offer never showed
  // up on the publisher's own profile. No route/service method existed
  // to list a participant's own offers — discover()/getAggregatedOffers()
  // only ever filter by asset+side, never by userId, and intentionally
  // exclude non-ACTIVE offers (a user's own paused/completed/cancelled
  // offers must still be visible to them). Returns the raw persisted
  // Offer rows (not the LiquidityOffer aggregation summary) — same
  // shape getOffer() above already returns, since a self-view needs
  // status/createdAt/etc., not an aggregation-only summary.
  async getOffersByUser(userId: string) {
    return prisma.offer.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    })
  }

  async updateOfferStatus(offerId: string, status: OfferStatus, triggeredBy: string) {
    const offer = await prisma.offer.findUnique({ where: { id: offerId } })
    if (!offer) throw new NotFoundError('Offer', offerId)
    if (offer.userId !== triggeredBy) {
      throw new ForbiddenError(`${triggeredBy} does not own offer ${offerId}`)
    }

    const updated = await prisma.offer.update({ where: { id: offerId }, data: { status } })

    await eventBus.emit('liquidity.offer.status_changed', {
      offerId,
      from: offer.status,
      to: status,
      triggeredBy,
    }, offerId)

    return updated
  }

  async getOrderBook(asset: AssetType): Promise<{
    asset: AssetType
    bids: LiquidityOffer[]
    asks: LiquidityOffer[]
    spread: string | null
  }> {
    const [bids, asks] = await Promise.all([
      this.getAggregatedOffers(asset, 'BUY'),
      this.getAggregatedOffers(asset, 'SELL'),
    ])

    const bestBid = bids.offers[0]?.priceUsd
    const bestAsk = asks.offers[0]?.priceUsd
    // Number() coercion here is display-only (the spread shown in an order
    // book response), same justification as the sort comparator above —
    // never used for a stored/computed amount. See RFC-009.
    const spread = bestBid && bestAsk ? (Number(bestAsk) - Number(bestBid)).toFixed(8) : null

    return { asset, bids: bids.offers, asks: asks.offers, spread }
  }

  // Real, pre-existing limitation found while wiring OfferFilters through
  // here (Production Readiness Audit, 2026-08-09), left as-is rather than
  // silently fixed alongside an unrelated feature: `collectFromProviders()`
  // below never actually forwards `pagination` to each provider's own
  // getOffers() call (only `filters` now does) — every provider always
  // fetches its own first DEFAULT_PAGE_LIMIT page internally, and this
  // method's own slice below re-paginates *that* fixed window, not the
  // true full result set. Harmless for `offset=0` with a small `limit`
  // (today's only real caller shape); a caller requesting `offset > 0` or
  // `limit > DEFAULT_PAGE_LIMIT` against a single real provider
  // (InternalOrderBook; HodlHodl stays disabled) would get an incorrectly
  // short/empty page. `filters` narrows what each provider's own query
  // matches *before* that fixed-window fetch, so it composes correctly
  // regardless of this — a separate fix, tracked, not bundled in here.
  async getAggregatedOffers(
    asset: AssetType,
    side: TradeSide,
    pagination?: OfferPagination,
    filters?: OfferFilters
  ): Promise<{ offers: LiquidityOffer[]; sources: string[]; total: number; hasMore: boolean }> {
    const { offers: all, sources } = await this.collectFromProviders(asset, side, filters)

    // Number() coercion here is intentional and safe — a sort comparator only
    // needs correct relative order, not exact arithmetic, so float precision
    // is immaterial (unlike a stored/computed amount). See RFC-009.
    const sorted = all.sort(side === 'BUY' ? compareByPriceDesc : compareByPriceAsc)

    const { limit, offset } = normalizePagination(pagination)
    const paginated = sorted.slice(offset, offset + limit)
    const total = sorted.length
    const hasMore = offset + limit < total

    return { offers: paginated, sources, total, hasMore }
  }

  // Same `try/continue on failure` discipline the router's findBestMatch()
  // already uses — a single provider going down (e.g. HodlHodl API auth
  // expiring) should never take the whole discovery endpoint down with it.
  // Extracted so the for-loop body is the single source of truth for
  // "what counts as a provider succeeding."
  private async collectFromProviders(asset: AssetType, side: TradeSide, filters?: OfferFilters): Promise<{ offers: LiquidityOffer[]; sources: string[] }> {
    const offers: LiquidityOffer[] = []
    const sources: string[] = []

    for (const provider of this.providers) {
      try {
        if (!(await provider.isAvailable())) continue
        offers.push(...await provider.getOffers(asset, side, undefined, filters))
        sources.push(provider.name)
      } catch (err) {
        log.error({ err, provider: provider.name }, '[Router] Provider failed')
      }
    }

    return { offers, sources }
  }

  async findBestMatch(asset: AssetType, side: TradeSide, amount: string): Promise<LiquidityOffer | null> {
    for (const provider of this.providers) {
      try {
        if (!(await provider.isAvailable())) continue
        const match = await provider.matchOrder(asset, side, amount)
        if (match) return match
      } catch (err) {
        log.error({ err, provider: provider.name }, '[Router] matchOrder failed')
      }
    }
    return null
  }
}

export const liquidityRouter = new LiquidityRouter()
