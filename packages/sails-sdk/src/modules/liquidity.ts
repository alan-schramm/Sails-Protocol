/**
 * @sails/sdk — Sails OpenLiquidity module (verified against
 * src/modules/open-liquidity/liquidity.routes.ts directly).
 *
 * SDK_GUIDE.md marks this namespace "advanced/direct use" — the six-verb
 * Intent facade's createIntent()+negotiate() is the path most
 * applications should reach for first (intent-facade.ts).
 *
 * Note: `GET /v1/liquidity/offers` only filters by `asset`/`side` today
 * — `paymentMethod`/price-range filters described in some earlier docs
 * are not implemented server-side (verified against the real route
 * handler, not assumed from API_REFERENCE.md's prose); `discover()`'s
 * signature below reflects only what the server actually accepts.
 */
import type { SailsTransport } from '../transport'
import type { AssetType, Offer, PaymentMethod, TradeSide } from '../types'

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
  requiresKyc?: boolean
}

export interface OrderBook {
  asset: AssetType
  bids: Offer[]
  asks: Offer[]
  spread: string | null
}

export interface MatchInput {
  asset: AssetType
  side: TradeSide
  amount: string
}

export class SailsLiquidityModule {
  constructor(private readonly transport: SailsTransport) {}

  async discover(filter: { asset: AssetType; side: TradeSide }): Promise<Offer[]> {
    return this.transport.get<Offer[]>('/v1/liquidity/offers', filter)
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

  async match(input: MatchInput): Promise<Offer | null> {
    return this.transport.post<Offer | null>('/v1/liquidity/match', input)
  }
}
