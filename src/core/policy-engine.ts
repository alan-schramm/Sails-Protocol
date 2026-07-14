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
