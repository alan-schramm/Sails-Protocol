import type { Trade, Escrow, ReputationScore } from '@satsails/p2p-trading-sdk'

/**
 * Real Trade/Escrow field shapes (@satsails/p2p-trading-sdk's real types, confirmed
 * against packages/sails-sdk/src/types.ts before writing this) — used
 * by both this package's Vitest tests and its Storybook stories, so
 * there's exactly one place these fixtures are defined.
 */
export function mockTrade(overrides: Partial<Trade> = {}): Trade {
  return {
    id: 'trade-1',
    offerId: 'offer-1',
    buyerId: 'buyer-1',
    sellerId: 'seller-1',
    asset: 'BTC',
    amount: '0.05',
    priceUsd: '65000',
    totalUsd: '3250',
    status: 'ACTIVE',
    escrowId: 'escrow-1',
    network: null,
    completedAt: null,
    cancelledAt: null,
    createdAt: '2026-07-01T12:00:00.000Z',
    updatedAt: '2026-07-01T12:05:00.000Z',
    ...overrides,
  }
}

export function mockEscrow(overrides: Partial<Escrow> = {}): Escrow {
  return {
    id: 'escrow-1',
    tradeId: 'trade-1',
    type: 'MOCK',
    status: 'FUNDS_LOCKED',
    lockedAmount: '3250',
    asset: 'BTC',
    network: null,
    multisigAddr: null,
    txLockId: 'tx-lock-1',
    // Missão 11 Fase 9.3.6 — stale-fixture fix, not a contract
    // disagreement: this field was added to the real Escrow type by
    // Fase 9.1.1 §3 (see that type's own comment) but this fixture
    // predates the change and was never updated. null matches this
    // MOCK-type fixture's own existing convention for every other
    // Bitcoin-outpoint-specific field it doesn't otherwise populate.
    txLockVout: null,
    // Same stale-fixture story as txLockVout above — added by the same
    // Fase 9.1.1 §3 typing-gap fix, never backfilled here.
    fundedAmount: null,
    txReleaseId: null,
    timelockHours: 24,
    lockedAt: '2026-07-01T12:01:00.000Z',
    expiresAt: '2026-07-02T12:01:00.000Z',
    releasedAt: null,
    createdAt: '2026-07-01T12:00:00.000Z',
    updatedAt: '2026-07-01T12:01:00.000Z',
    // Missão 11 Fase 7.3 (cumulative audit) — required, non-optional
    // fields added to the real Escrow type by Fase 7.3's own §Z SDK fix;
    // this fixture predates that change. null throughout, matching a
    // legacy (pre-fee-versioning) escrow — the real, permanent meaning
    // for a MOCK-type fixture like this one, not a placeholder.
    feePolicyVersionId: null,
    snapshotProtocolFeeRate: null,
    snapshotPayerModel: null,
    snapshotEconomicBasis: null,
    snapshotFeeCollectionAddress: null,
    snapshotFeeCollectionWaivedPreFunding: null,
    ...overrides,
  }
}

// Missão 11 Fase 9.3.6 — CONTRACT INTEGRITY FIX. Matches
// reputation.service.ts's real getScore() response exactly (traced
// directly, not assumed) — no identity fields (participantId is the
// lookup key, not a returned identity fact; a real display name/
// publicKey come from a separate identity.get() call, composed by the
// caller — see ReputationBadge's own updated props).
export function mockReputationScore(overrides: Partial<ReputationScore> = {}): ReputationScore {
  return {
    participantId: 'user-1',
    total: 42,
    tradeScore: 45,
    volumeScore: 40,
    settlementScore: 42,
    disputeRate: 0.1,
    totalTrades: 18,
    cumulativeFeesObserved: '0.001',
    ...overrides,
  }
}
