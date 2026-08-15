/**
 * Policy / Rules Engine — Sails Protocol Core Component
 * PROTOCOL_SPECIFICATION.md section 1.10, PROTOCOL_ECONOMY.md
 *
 * STUB — get/propose/activate below (the GOVERNED, versioned
 * policy-storage system, PROTOCOL_ECONOMY.md §7's Months 10-12
 * multi-stakeholder governance layer) are still deliberately
 * unimplemented — real scope, correctly out of the current MVP per this
 * file's own original reasoning below.
 *
 * RFC-021 Phase 0 (`docs/rfcs/RFC-021-...md`) added the actual fee
 * *collection* this comment used to say didn't exist: a real
 * `config.settlement.protocolFeeRate` read directly by
 * `escrow.service.ts`'s `releaseFunds()`, using PROTOCOL_ECONOMY.md
 * §6.2's already-decided 40/30/20/10 split — deliberately bypassing
 * this file's governed-policy indirection, the same way
 * `validateFinancialSanity()` below already bypasses it for its own
 * real, working check. A single hardcoded rate is not a governed,
 * versioned `FeePolicy` — this file's `get`/`propose`/`activate` still
 * throw, correctly, until that bigger governance feature is actually
 * built.
 */
export interface FeePolicy {
  feeRate: number
  bucketSplit: { nodeOperators: number; treasury: number; walletRebate: number; arbitratorReserve: number }
}
export interface TrustPolicy {
  tradeLimitsByScore: { minScore: number; maxTradeValue: number }[]
}
export interface RoutingPolicy {
  rankingWeights: { price: number; reputation: number }
}

export interface PolicyEngine {
  get<T>(appliesTo: string): Promise<T>
  propose<T>(appliesTo: string, rules: T): Promise<void>
  activate(policyId: string): Promise<void>
}

// TODO(Meses 1-3): implement. Governance transition (Satsails-controlled →
// multi-stakeholder) tracked in PROTOCOL_ECONOMY.md section 7.
export const policyEngine: PolicyEngine = {
  async get() { throw new Error('Not yet implemented — see TODO.md') },
  async propose() { throw new Error('Not yet implemented — see TODO.md') },
  async activate() { throw new Error('Not yet implemented — see TODO.md') },
}

// ─── Financial sanity check — CISO Economic Rule (03-implementation_plan.md) ─
// A real, working policy check, separate from the get/propose/activate
// governed-policy-storage system above (which needs a Prisma-backed
// policies table that doesn't exist yet — bigger scope than the MVP happy
// path warrants). This is what core/intent-engine.ts actually calls today.
// maxValue/minValue are decimal strings (RFC-009) — parsed via Number()
// only for the sanity comparison itself, never stored or propagated as a
// number, consistent with RFC-009's sort-comparator precedent
// (liquidity.service.ts) of Number() being fine for a bounds check that
// only needs "is this roughly sane," not exact arithmetic.
const MAX_SANE_TRADE_VALUE = 100_000_000 // 100M units of any asset — a deliberately generous ceiling; a real value here is a governance decision (section 7), not an engineering one

export interface SanityCheckResult {
  valid: boolean
  errors?: string[]
}

export function validateFinancialSanity(payload: {
  maxValue?: string; minValue?: string
  // RFC-023 — same sanity gate as maxValue/minValue, applied to the new
  // price-limit fields so they're checked for sanity (non-negative, sane
  // ceiling, min <= max), not just type (intent-handler.ts's validate()
  // only confirms these are strings, not that they're sane numbers).
  maxPriceUsd?: string; minPriceUsd?: string
}): SanityCheckResult {
  const errors: string[] = []

  for (const [field, raw] of [
    ['minValue', payload.minValue], ['maxValue', payload.maxValue],
    ['minPriceUsd', payload.minPriceUsd], ['maxPriceUsd', payload.maxPriceUsd],
  ] as const) {
    if (raw === undefined) continue
    const n = Number(raw)
    if (!Number.isFinite(n)) {
      errors.push(`${field} is not a valid decimal string: "${raw}"`)
      continue
    }
    if (n < 0) errors.push(`${field} cannot be negative: ${raw}`)
    if (n > MAX_SANE_TRADE_VALUE) errors.push(`${field} exceeds sane bounds (${MAX_SANE_TRADE_VALUE}): ${raw}`)
  }

  if (
    payload.minValue !== undefined &&
    payload.maxValue !== undefined &&
    Number.isFinite(Number(payload.minValue)) &&
    Number.isFinite(Number(payload.maxValue)) &&
    Number(payload.minValue) > Number(payload.maxValue)
  ) {
    errors.push(`minValue (${payload.minValue}) cannot exceed maxValue (${payload.maxValue})`)
  }

  if (
    payload.minPriceUsd !== undefined &&
    payload.maxPriceUsd !== undefined &&
    Number.isFinite(Number(payload.minPriceUsd)) &&
    Number.isFinite(Number(payload.maxPriceUsd)) &&
    Number(payload.minPriceUsd) > Number(payload.maxPriceUsd)
  ) {
    errors.push(`minPriceUsd (${payload.minPriceUsd}) cannot exceed maxPriceUsd (${payload.maxPriceUsd})`)
  }

  return errors.length === 0 ? { valid: true } : { valid: false, errors }
}
