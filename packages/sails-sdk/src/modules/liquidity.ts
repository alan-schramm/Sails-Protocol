/**
 * @satsails/p2p-trading-sdk — Sails OpenLiquidity module (verified against
 * src/modules/open-liquidity/liquidity.routes.ts directly).
 *
 * SDK_GUIDE.md marks this namespace "advanced/direct use" — the six-verb
 * Intent facade's createIntent()+negotiate() is the path most
 * applications should reach for first (intent-facade.ts).
 *
 * `GET /v1/liquidity/offers` filters by `asset`/`side`, optional
 * `limit`/`offset`, and optional `paymentMethod`/`priceMin`/`priceMax`
 * (Production Readiness Audit, 2026-08-09 — verified against the real
 * route handler and liquidity.service.ts's InternalOrderBook, not
 * assumed from API_REFERENCE.md's prose).
 */
import type { SailsTransport } from '../transport'
import type { AssetType, Offer, PaymentMethod, Participant, TradeSide } from '../types'

export interface PublishOfferInput {
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

// The shape GET /v1/liquidity/offers actually returns per item
// (liquidity.service.ts's LiquidityOffer, mapOfferToLiquidityOffer()) —
// genuinely different from the persisted `Offer` model this file used to
// (incorrectly) claim discover() returns: no `userId`/`priceBrl`/
// `status`, a `paymentMethods` array instead of a single
// `paymentMethod`, and an aggregation-only `source`/`traderReputation`.
// Found and fixed while wiring the first real caller of this method
// (packages/sails-ui) — the mismatch was never exercised against a live
// server before.
export interface LiquidityOfferSummary {
  id: string
  source: 'internal' | 'hodlhodl' | 'robosats' | string
  asset: AssetType
  side: TradeSide
  priceUsd: string
  minAmount: string
  maxAmount: string
  paymentMethods: string[]
  traderReputation?: number
}

// getAggregatedOffers()'s real return shape — also not a bare array.
// Backend now returns total/hasMore pagination metadata alongside
// offers/sources (liquidity.service.ts getAggregatedOffers()).
export interface DiscoverResult {
  offers: LiquidityOfferSummary[]
  sources: string[]
  total: number
  hasMore: boolean
}

// bids/asks are LiquidityOfferSummary, not Offer — getOrderBook()
// (liquidity.service.ts) delegates to the same getAggregatedOffers()
// discover() does. Confirmed against the live route (same fix as
// DiscoverResult above), not assumed.
export interface OrderBook {
  asset: AssetType
  bids: LiquidityOfferSummary[]
  asks: LiquidityOfferSummary[]
  spread: string | null
}

export interface MatchInput {
  asset: AssetType
  side: TradeSide
  amount: string
}

export class SailsLiquidityModule {
  constructor(private readonly transport: SailsTransport) {}

  /**
   * `limit` (default 10, max 50) and `offset` are optional — added
   * (docs/TODO.md §25) after dogfooding this SDK (examples/simple-wallet)
   * found that without them, an offer beyond the 10 cheapest active ones
   * for an asset/side was simply unreachable through this method on any
   * marketplace with more than 10 active offers.
   */
  async discover(filter: {
    asset: AssetType
    side: TradeSide
    limit?: number
    offset?: number
    paymentMethod?: PaymentMethod
    priceMin?: string
    priceMax?: string
  }): Promise<DiscoverResult> {
    return this.transport.get<DiscoverResult>('/v1/liquidity/offers', filter)
  }

  /**
   * Single-offer lookup with the seller's real public profile fields —
   * genuinely didn't exist until packages/sails-ui's OfferDetail screen
   * needed it (real route added the same day: GET
   * /v1/liquidity/offers/:id, liquidity.routes.ts). Was
   * /v1/liquidity/offers/id/:id (redundant `id` segment) — renamed
   * PRODUCTION_READINESS_FIXES.md P1 item 12, closed 2026-08-08.
   */
  async getOffer(offerId: string): Promise<Offer & { user: Participant }> {
    return this.transport.get<Offer & { user: Participant }>(`/v1/liquidity/offers/${offerId}`)
  }

  /** Requires an active session. */
  async publish(input: PublishOfferInput): Promise<Offer> {
    return this.transport.post<Offer>('/v1/liquidity/offers', input, true)
  }

  async book(asset: AssetType): Promise<OrderBook> {
    return this.transport.get<OrderBook>(`/v1/liquidity/offers/${asset}/book`)
  }

  /** Requires an active session. status: 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED'. */
  async updateStatus(offerId: string, status: Offer['status']): Promise<Offer> {
    return this.transport.patch<Offer>(`/v1/liquidity/offers/${offerId}/status`, { status }, true)
  }

  /**
   * The authenticated caller's own offers — including non-ACTIVE ones
   * (paused/completed/cancelled), unlike discover(). Real, persisted
   * Offer rows, not the LiquidityOffer aggregation summary discover()/
   * book() return. Additive method (docs/API_STABLE.md's freeze allows
   * new methods) — added for a real caller (packages/sails-ui's Profile
   * screen, 2026-08-01), not speculatively.
   */
  async getMyOffers(): Promise<Offer[]> {
    return this.transport.get<Offer[]>('/v1/liquidity/offers/mine', undefined, true)
  }

  // findBestMatch() (liquidity.service.ts) also returns a
  // LiquidityOfferSummary, not a persisted Offer — same class of bug as
  // discover()/book() above, same fix.
  async match(input: MatchInput): Promise<LiquidityOfferSummary | null> {
    return this.transport.post<LiquidityOfferSummary | null>('/v1/liquidity/match', input)
  }
}
