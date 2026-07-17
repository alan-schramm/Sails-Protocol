/**
 * Offer schema — sails-p2p-schemas (04-Deepseek Review.md Task 1).
 *
 * This is the formal SDK-facing contract requested — deliberately NOT the
 * same shape as the real `Offer` Prisma model (`prisma/schema.prisma`),
 * which was built for a narrower case (one asset vs. USD/BRL fiat, one
 * `PaymentMethod`) before this broader `assetSell`/`assetBuy` contract was
 * requested. Rather than silently pretend they're identical, or silently
 * rewrite the real model (which `liquidity.service.ts` already depends
 * on), this file states the target contract and maps to/from what's
 * actually persisted today, with the divergences named explicitly.
 */

export interface OfferSchema {
  id: string
  participantId: string // Offer.userId in the real model
  assetSell: string
  assetBuy: string
  amount: string // decimal string (RFC-009) — never a JS number
  price: string // decimal string (RFC-009)
  paymentMethods: string[]
  expiresAt?: string // ISO 8601
  status: 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED'
}

// ─── Reconciliation against the real Offer model ──────────────────────────
//
// 1. assetSell/assetBuy don't exist as stored columns — the real model
//    stores `asset` (e.g. 'BTC') + `side` ('BUY' | 'SELL' of that asset)
//    against a fiat quote (`priceUsd`/`priceBrl`). Derived below: an offer
//    creator selling BTC for BRL has assetSell='BTC', assetBuy='BRL'; an
//    offer creator wanting to buy BTC with USD has assetSell='USD',
//    assetBuy='BTC'. This only covers asset-vs-fiat pairs, not arbitrary
//    asset-vs-asset swaps — the real schema doesn't model those yet.
// 2. `amount` is a single value here; the real model stores a range
//    (`minAmount`/`maxAmount` — an offer, not a fixed-size order). Mapped
//    to `maxAmount` below (the offer's full available size) — a caller
//    wanting the range should read the Prisma row directly, this schema
//    is the single-value SDK-facing view.
// 3. `paymentMethods` is a plural array here; the real model has a
//    singular `paymentMethod` enum field. Wrapped as a one-element array
//    below — extending the real model to a true multi-method array is a
//    separate, larger schema change not made here (Prisma column type +
//    every existing row's shape), left as a reconciliation note rather
//    than a silent migration.
// 4. `expiresAt` doesn't exist on the real model at all. Left `undefined`
//    in the mapping below — adding it is a small, real follow-up
//    (BACKLOG.md), not done as a side effect of defining this schema.

export interface OfferRecord {
  id: string
  userId: string
  asset: string
  side: 'BUY' | 'SELL'
  priceUsd: { toString(): string }
  priceBrl: { toString(): string } | null
  maxAmount: { toString(): string }
  paymentMethod: string
  status: 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED'
}

export function toOfferSchema(offer: OfferRecord): OfferSchema {
  const quoteCurrency = offer.priceBrl !== null ? 'BRL' : 'USD'
  const quotePrice = offer.priceBrl !== null ? offer.priceBrl : offer.priceUsd
  const [assetSell, assetBuy] = offer.side === 'SELL' ? [offer.asset, quoteCurrency] : [quoteCurrency, offer.asset]

  return {
    id: offer.id,
    participantId: offer.userId,
    assetSell,
    assetBuy,
    amount: offer.maxAmount.toString(),
    price: quotePrice.toString(),
    paymentMethods: [offer.paymentMethod],
    status: offer.status,
  }
}
