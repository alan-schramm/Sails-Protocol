import { z } from 'zod'

/**
 * Shared Zod refinement for a peer-submitted decimal-string field that
 * feeds fund-related math (amounts, prices, locked balances — RFC-009's
 * decimal-string convention).
 *
 * 2026-08-15 security review — Bisq's May 2026 incident (11.59 BTC
 * drained from ten users) traced to exactly one unvalidated numeric
 * field: a taker-submitted miner fee never checked against negative
 * numbers, corrupting a multisig output calculation. trade.service.ts's
 * own `amount` field already guarded against this class of bug inline
 * (positive/finite/bounded) before this file existed; auditing this
 * codebase found the same guard missing on `lockedAmount`
 * (settlement.routes.ts) and `priceUsd`/`minAmount`/`maxAmount`
 * (liquidity.routes.ts's createOfferSchema) — the exact "one forgotten
 * field in an otherwise-careful protocol" failure mode Bisq's own
 * post-mortem described. A negative `priceUsd` on an Offer is
 * especially real, not theoretical: liquidity.service.ts's
 * createOffer() never checked it, and trade.service.ts's own
 * `totalUsd = priceUsd * amount` would silently go negative even though
 * `amount` itself is validated — the amount check alone doesn't save you
 * if the *other* multiplicand was never checked.
 *
 * Shared rather than four independent inline `.refine()` calls on
 * purpose: that's what let this gap exist in the first place — the
 * point of this helper is that a fifth future peer-submitted decimal
 * field reaches for this instead of re-deriving (or forgetting) the
 * same check.
 */
export function positiveDecimalString(fieldLabel: string) {
  return z.string().min(1).refine(
    (value: string) => {
      const n = Number(value)
      return Number.isFinite(n) && n > 0
    },
    { message: `${fieldLabel} must be a positive decimal string` }
  )
}
