/**
 * FeeReserveMath — Missão 11 Fase 4.
 *
 * The single, shared, pure-function source of truth for the frozen
 * seller-funded-reserve arithmetic (Fase 3.2/3.3/3.4). Used by BOTH
 * multisig.provider.ts (sats-level PSBT construction) and
 * fee-obligation.service.ts (Decimal-level settlement-time accounting) —
 * deliberately the SAME function in both places, not two independent
 * reimplementations, so the amount actually built into a transaction and
 * the amount recorded as the FeeObligation can never silently diverge
 * (Fase 4 §J's own requirement).
 *
 * Rounding: floor to 8 decimal places (Fase 1.2 §4's own frozen rule — the
 * actual charge must never exceed what the disclosed rate implies). For a
 * BTC-denominated escrow, 8 decimal places IS satoshi precision, so this
 * already produces sat-exact results; multisig.provider.ts's own sats
 * conversion (`× 1e8`) is exact, not a second independent rounding step.
 *
 * Does NOT decide waiver (dust-vs-collectible) — that decision needs a
 * concrete recipient script (rail-specific), computed only inside the
 * relevant SettlementProvider (multisig.provider.ts's own decideFeeOutput()).
 * This module only ever computes amounts, never destinations or dust policy.
 */
import { Prisma } from '@prisma/client'

/**
 * F = basisAmount × rate, floored to 8 decimal places.
 * Used both for Fmax (basisAmount = full lockedAmount, T) and for the
 * actual settled fee on a partial basis (e.g. SPLIT's seller-only portion).
 */
export function computeProtocolFee(basisAmount: Prisma.Decimal | string, rate: Prisma.Decimal | string): Prisma.Decimal {
  return new Prisma.Decimal(basisAmount).times(rate).toDecimalPlaces(8, Prisma.Decimal.ROUND_DOWN)
}

/** Fmax — the maximum possible Protocol Fee for this escrow, sized against
 *  the worst case (a full release, basis = the entire trade notional T).
 *  This is what the seller must pre-fund on top of T (Fase 3.2/3.3). */
export function computeMaxProtocolFee(lockedAmount: Prisma.Decimal | string, rate: Prisma.Decimal | string): Prisma.Decimal {
  return computeProtocolFee(lockedAmount, rate)
}

/** R = T + Fmax — the required funding amount disclosed to the seller
 *  before they fund (Fase 3.3 §I's lifecycle: this must be computed from
 *  the escrow's own immutable policy snapshot, never a live/global rate). */
export function computeRequiredFundingAmount(lockedAmount: Prisma.Decimal | string, rate: Prisma.Decimal | string): Prisma.Decimal {
  return new Prisma.Decimal(lockedAmount).plus(computeMaxProtocolFee(lockedAmount, rate))
}
