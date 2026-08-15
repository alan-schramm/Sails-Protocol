import { z } from 'zod'

/**
 * Shared Zod refinement for a peer-submitted decimal-string field that
 * feeds fund-related math (RFC-009's decimal-string convention).
 *
 * 2026-08-15 security review: found the same unvalidated-numeric-field
 * bug class behind Bisq's May 2026 incident (a taker-submitted miner fee
 * never checked for negative, corrupting a multisig calculation) on
 * `lockedAmount`/`priceUsd`/`minAmount`/`maxAmount` in this codebase.
 * Concretely exploitable, not theoretical: a negative `priceUsd` on an
 * Offer would flow into trade.service.ts's `totalUsd = priceUsd * amount`
 * and go negative even though `amount` is validated — the amount check
 * alone doesn't save you if the other multiplicand is unchecked.
 *
 * Shared on purpose: four independent inline `.refine()` calls is what
 * let this gap exist in the first place.
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
