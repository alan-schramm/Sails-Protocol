/**
 * Real Marketplace data — @sails/sdk's `liquidity.discover()`
 * (GET /v1/liquidity/offers), replacing `offersStore.ts`'s mocked
 * MOCK_OFFERS + localStorage layer.
 *
 * `discover()` only filters by asset+side (both required) — no
 * "give me everything" route exists (verified against
 * src/modules/open-liquidity/liquidity.routes.ts directly, same
 * limitation the SDK's own liquidity.ts doc comment already discloses).
 * To show the Marketplace's "Todos" default, this fans out one call per
 * (asset, side) combination and merges — 20 requests worst case (10
 * ASSETS × 2 sides), acceptable for this reference UI's scale, not a
 * pattern a high-traffic production client should copy without a real
 * "list all" backend route.
 *
 * `LiquidityOfferSummary` (the real response shape — see
 * packages/sails-sdk/src/modules/liquidity.ts's own comment for the bug
 * this uncovered) is missing several fields the UI's `Offer` type wants
 * (seller displayName, country, description, requiresKyc, paymentDetails,
 * network) — the real /v1/liquidity/offers route genuinely doesn't
 * return them today. Filled with honest placeholders below, each
 * commented, not silently invented as if real.
 */
import type { LiquidityOfferSummary } from '@sails/sdk'
import { sailsClient } from './sailsClient'
import type { AssetType, Offer, PaymentMethod, TradeSide, User } from '../types'
import { ASSETS } from '../data/mock'

function summaryToOffer(s: LiquidityOfferSummary): Offer {
  const price = Number(s.priceUsd)
  // GET /v1/liquidity/offers doesn't return the owning User row at all
  // (only traderReputation, mapOfferToLiquidityOffer() in
  // liquidity.service.ts) — displayName/verified/etc. aren't available
  // without a second real lookup this reference UI doesn't make yet.
  const placeholderUser: User = {
    id: 'unknown',
    publicKey: '',
    displayName: null,
    peerId: null,
    reputationScore: s.traderReputation ?? 0,
    totalTrades: 0,
    disputeCount: 0,
    totalVolumeBtc: 0,
    verified: false,
    createdAt: new Date().toISOString(),
  }

  return {
    id: s.id,
    userId: 'unknown', // not returned by this route — see placeholderUser's comment
    user: placeholderUser,
    asset: s.asset,
    side: s.side,
    priceUsd: price,
    fiatCurrency: 'BRL', // this route doesn't return priceBrl/fiat choice — BRL is this UI's default display currency
    priceFiat: price, // no real BRL conversion available from this endpoint; shown as USD-equivalent, not invented
    minAmount: Number(s.minAmount),
    maxAmount: Number(s.maxAmount),
    paymentMethod: (s.paymentMethods[0] as PaymentMethod) ?? 'PIX',
    status: 'ACTIVE', // discover()/getAggregatedOffers() only ever returns ACTIVE offers (liquidity.service.ts's own where clause)
    requiresKyc: false, // not returned by this route
    country: 'BR', // not returned by this route — no real country field exists on Offer yet, same gap types.ts's own header already discloses
    tradedWithCurrentUser: false, // needs a real trade-history join this route doesn't do — see types.ts's own comment on this field
    blockedRelationship: false, // no real block-list backend yet — same as above
    createdAt: new Date().toISOString(), // not returned by this route
  }
}

export async function fetchOffers(asset: AssetType | 'Todos', side: TradeSide | 'Todos'): Promise<Offer[]> {
  const assets: AssetType[] = asset === 'Todos' ? [...ASSETS] : [asset]
  const sides: TradeSide[] = side === 'Todos' ? ['BUY', 'SELL'] : [side]

  const results = await Promise.all(
    // limit: 50 (the route's own max, docs/TODO.md §25) — without it,
    // discover() defaults to 10, ordered by price ascending. A real
    // gap this exact default caused: e2e/golden-path.spec.ts's own
    // freshly-published offer stopped appearing in this Marketplace
    // once enough same-tier-priced offers had accumulated in the
    // shared local dev database, since it no longer ranked in the top
    // 10. This does not remove the underlying cap (a marketplace with
    // more than 50 active offers per asset/side still needs real
    // pagination/infinite-scroll here, not built yet) — it only widens
    // the window this reference UI already relies on implicitly.
    assets.flatMap((a) => sides.map((s) =>
      sailsClient.liquidity.discover({ asset: a, side: s, limit: 50 }).catch((err) => {
        console.error(`[realOffers] discover(${a}, ${s}) failed:`, err)
        return { offers: [], sources: [] }
      })
    ))
  )

  const seen = new Map<string, Offer>()
  for (const r of results) {
    for (const s of r.offers) seen.set(s.id, summaryToOffer(s))
  }
  return [...seen.values()]
}
