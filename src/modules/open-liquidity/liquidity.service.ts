import { AssetType, TradeSide, PaymentMethod, OfferStatus } from '../../common/types'
import { prisma } from '../../common/database'
import { NotFoundError, ForbiddenError } from '../../common/errors'
import { eventBus } from '../../common/events/event-bus'
import type { Prisma } from '@prisma/client'

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

export interface LiquidityProvider {
  name: string
  isAvailable(): Promise<boolean>
  getOffers(asset: AssetType, side: TradeSide): Promise<LiquidityOffer[]>
  matchOrder(asset: AssetType, side: TradeSide, amount: string): Promise<LiquidityOffer | null>
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

  async getOffers(asset: AssetType, side: TradeSide): Promise<LiquidityOffer[]> {
    const offers = await prisma.offer.findMany({
      where: { asset, side, status: 'ACTIVE' },
      orderBy: { priceUsd: side === 'SELL' ? 'asc' : 'desc' },
      take: 10,
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

// ─── HodlHodl Abstraction (stub — disabled until API key configured) ─────────
class HodlHodlProvider implements LiquidityProvider {
  name = 'hodlhodl'

  async isAvailable() {
    // TODO(roadmap Meses 1-3): ping HodlHodl API health endpoint
    return false
  }

  async getOffers(asset: AssetType, _side: TradeSide): Promise<LiquidityOffer[]> {
    // TODO(roadmap Meses 1-3): GET https://hodlhodl.com/api/v1/offers
    //   ?filters[currency_code]=BRL&filters[asset]=BTC
    console.log(`[HodlHodl] getOffers for ${asset} — not yet implemented`)
    return []
  }

  async matchOrder(_asset: AssetType, _side: TradeSide, _amount: string): Promise<LiquidityOffer | null> {
    return null
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
  requiresKyc?: boolean
}

// ─── Router: tries providers in order, aggregates and ranks ──────────────────
export class LiquidityRouter {
  private providers: LiquidityProvider[]

  constructor() {
    this.providers = [new InternalOrderBook(), new HodlHodlProvider()]
  }

  async createOffer(input: CreateOfferInput) {
    const offer = await prisma.offer.create({
      data: {
        userId: input.userId,
        asset: input.asset as any,
        side: input.side as any,
        priceUsd: input.priceUsd,
        priceBrl: input.priceBrl,
        minAmount: input.minAmount,
        maxAmount: input.maxAmount,
        paymentMethod: input.paymentMethod as any,
        paymentDetails: input.paymentDetails,
        network: input.network,
        description: input.description,
        requiresKyc: input.requiresKyc,
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

  async getAggregatedOffers(asset: AssetType, side: TradeSide): Promise<{ offers: LiquidityOffer[]; sources: string[] }> {
    const all: LiquidityOffer[] = []
    const sources: string[] = []

    for (const provider of this.providers) {
      try {
        if (!(await provider.isAvailable())) continue
        const offers = await provider.getOffers(asset, side)
        all.push(...offers)
        sources.push(provider.name)
      } catch (err) {
        console.error(`[Router] Provider ${provider.name} failed:`, err)
      }
    }

    // Number() coercion here is intentional and safe — a sort comparator only
    // needs correct relative order, not exact arithmetic, so float precision
    // is immaterial (unlike a stored/computed amount). See RFC-009.
    const sorted = all.sort((a, b) =>
      side === 'BUY' ? Number(a.priceUsd) - Number(b.priceUsd) : Number(b.priceUsd) - Number(a.priceUsd)
    )
    return { offers: sorted, sources }
  }

  async findBestMatch(asset: AssetType, side: TradeSide, amount: string): Promise<LiquidityOffer | null> {
    for (const provider of this.providers) {
      try {
        if (!(await provider.isAvailable())) continue
        const match = await provider.matchOrder(asset, side, amount)
        if (match) return match
      } catch (err) {
        console.error(`[Router] matchOrder failed on ${provider.name}:`, err)
      }
    }
    return null
  }
}

export const liquidityRouter = new LiquidityRouter()
