/**
 * Policy / Rules Engine — Sails Protocol Core Component
 * PROTOCOL_SPECIFICATION.md section 1.10, PROTOCOL_ECONOMY.md
 *
 * STUB — not yet implemented. This is where FeePolicy's 4-bucket split
 * (PROTOCOL_ECONOMY.md section 6.2) becomes an enforced, versioned rule
 * instead of prose in a document.
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

export function validateFinancialSanity(payload: { maxValue?: string; minValue?: string }): SanityCheckResult {
  const errors: string[] = []

  for (const [field, raw] of [['minValue', payload.minValue], ['maxValue', payload.maxValue]] as const) {
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

  return errors.length === 0 ? { valid: true } : { valid: false, errors }
}
