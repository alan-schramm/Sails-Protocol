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

export function mockReputationScore(overrides: Partial<ReputationScore> = {}): ReputationScore {
  return {
    id: 'user-1',
    publicKey: 'ed25519-abcdef0123456789',
    displayName: 'alice.sats',
    reputationScore: 42,
    total: 42,
    tradeScore: 45,
    volumeScore: 40,
    settlementScore: 42,
    disputeRate: 0.1,
    totalTrades: 18,
    disputeCount: 1,
    cumulativeFeesObserved: '0.001',
    ...overrides,
  }
}
