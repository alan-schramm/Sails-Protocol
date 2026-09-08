/**
 * CTO Mission #56 — WDK_USDT_EVM lockFunds() unknown-outcome / retry-safety
 * evidence (docs/BACKLOG.md's #56, docs/TECHNICAL_DEBT_AUDIT.md #56).
 *
 * Exercises the REAL escrow.service.ts/escrow-lifecycle.ts orchestration
 * (nothing about the claim/revert/retry logic is mocked) against a fake
 * WdkSettlementProvider — only the provider boundary and the database are
 * mocked, the same "mock the boundary, test what's actually new" discipline
 * tests/escrowProviderWiring.test.ts and tests/escrowReleaseControls.test.ts
 * already use for MULTISIG/LIGHTNING_HODL.
 *
 * The property under test (not a mechanism): a side-effecting external
 * funding action must not be repeated merely because the caller could not
 * determine whether the first attempt succeeded. escrow.service.ts's
 * existing claimEscrowTransition() (2026-07-20, "robustness-audit fix")
 * already proves CONCURRENT double-calls are safe — two simultaneous
 * lockFunds() requests can't both reach the provider, because only one
 * wins the atomic CREATED->FUNDS_LOCKED claim. That is NOT what this file
 * tests. This file tests the orthogonal, unaddressed case: a SEQUENTIAL
 * retry after the FIRST call's own catch block has already reverted the
 * claim back to CREATED — which happens unconditionally on any throw
 * inside lockFunds()'s try block, including a throw that occurs AFTER the
 * provider's real external transfer already completed (a local
 * persistence failure, not a provider failure).
 */
export {} // see chatUnification.test.ts's identical comment

jest.mock('../src/config', () => ({
  get config() {
    return {
      features: { mockEscrow: false, enforceCapabilities: false, requireDualApprovalForRelease: false },
      trade: { defaultTimelockHours: 24 },
      settlement: { trustedArbitrators: [] },
      arkade: { seed: '' },
      // High enough that this file's own two-attempts-per-test scenarios
      // never trip the breaker — this file is about the claim/revert/retry
      // logic itself, not tests/escrowCircuitBreaker.test.ts's own concern.
      escrowCircuitBreaker: { failureThreshold: 1000, windowMs: 60_000, cooldownMs: 60_000 },
    }
  },
}))

// The real WdkSettlementProvider is replaced entirely — this file is about
// escrow.service.ts's orchestration AROUND the provider call, not about
// wdk-settlement.provider.ts's own real transfer logic (tests/wdkSettlementProvider.test.ts
// covers that provider's own pure helpers directly).
const mockWdkLockFunds = jest.fn()
jest.mock('../src/modules/open-settlement/wdk-settlement.provider', () => ({
  wdkSettlementProvider: {
    name: 'WDK_USDT_EVM',
    custodyModel: 'server-custodial-reference-implementation',
    lockFunds: (...args: unknown[]) => mockWdkLockFunds(...args),
    releaseFunds: jest.fn(),
    refundFunds: jest.fn(),
    splitFunds: jest.fn(),
  },
}))

const mockEscrowFindUnique = jest.fn()
const mockEscrowUpdate = jest.fn()
const mockEscrowUpdateMany = jest.fn().mockResolvedValue({ count: 1 })
const mockEscrowEventCreate = jest.fn()
const mockEscrowEventFindFirst = jest.fn().mockResolvedValue(null)
const mockTradeFindUnique = jest.fn()
const mockDurableEventCreate = jest.fn()
const mockDurableEventFindFirst = jest.fn().mockResolvedValue(null)

const mockTransaction = jest.fn(async (callback: (tx: any) => Promise<unknown>) =>
  callback({
    durableEventRecord: {
      create: (...args: unknown[]) => mockDurableEventCreate(...args),
      findFirst: (...args: unknown[]) => mockDurableEventFindFirst(...args),
    },
    escrow: {
      updateMany: (...args: unknown[]) => mockEscrowUpdateMany(...args),
    },
    escrowEvent: {
      findFirst: (...args: unknown[]) => mockEscrowEventFindFirst(...args),
      create: (...args: unknown[]) => mockEscrowEventCreate(...args),
    },
    $executeRaw: jest.fn().mockResolvedValue(0),
  })
)

jest.mock('../src/common/database', () => ({
  prisma: {
    escrow: {
      findUnique: (...args: unknown[]) => mockEscrowFindUnique(...args),
      update: (...args: unknown[]) => mockEscrowUpdate(...args),
      updateMany: (...args: unknown[]) => mockEscrowUpdateMany(...args),
    },
    escrowEvent: {
      create: (...args: unknown[]) => mockEscrowEventCreate(...args),
      findFirst: (...args: unknown[]) => mockEscrowEventFindFirst(...args),
    },
    trade: { findUnique: (...args: unknown[]) => mockTradeFindUnique(...args) },
    dispute: { findFirst: jest.fn().mockResolvedValue(null) },
    durableEventRecord: {
      create: (...args: unknown[]) => mockDurableEventCreate(...args),
      findFirst: (...args: unknown[]) => mockDurableEventFindFirst(...args),
    },
    $transaction: (...args: unknown[]) => mockTransaction(...(args as [any])),
  },
}))

import { escrowService } from '../src/modules/open-settlement/escrow.service'
import { resetEscrowCircuitBreaker } from '../src/modules/open-settlement/escrow-circuit-breaker'

const baseEscrow = {
  id: 'escrow-1', tradeId: 'trade-1', type: 'WDK_USDT_EVM', lockedAmount: '5', timelockHours: 24,
}

describe('WDK_USDT_EVM lockFunds() — unknown-outcome / retry-safety (Mission #56)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockEscrowUpdateMany.mockResolvedValue({ count: 1 })
    mockEscrowEventFindFirst.mockResolvedValue(null)
    mockDurableEventFindFirst.mockResolvedValue(null)
    mockTradeFindUnique.mockResolvedValue({ id: 'trade-1', buyerId: 'buyer-1', sellerId: 'seller-1' })
    resetEscrowCircuitBreaker()
  })

  // ─── DEMONSTRATED RETRY-SAFETY GAP ────────────────────────────────────
  // The critical adversarial scenario the mission calls "submit then
  // throw": the provider's real external transfer succeeds (a genuine,
  // externally-visible economic action), but a step AFTER that call —
  // here, the DB write that would have persisted the resulting txId —
  // throws. escrow.service.ts's catch block does not, and cannot,
  // distinguish "the provider itself failed" from "the provider succeeded
  // and something else failed" — it reverts unconditionally.
  it('a local persistence failure AFTER a successful provider transfer reverts the escrow to CREATED with no record of the real txId, and a retry invokes the provider a second time', async () => {
    mockEscrowFindUnique.mockResolvedValue({ ...baseEscrow, status: 'CREATED' })

    // Attempt 1: the provider genuinely succeeds — this stands in for a
    // real, already-broadcast (or already-confirmed) on-chain USDT
    // transfer. Nothing about this scenario requires the transfer to be
    // ambiguous or slow; it succeeded, plainly.
    mockWdkLockFunds.mockResolvedValueOnce({ txId: '0xREAL_EXTERNAL_TRANSFER_1', address: '0xescrowAddr1' })
    // The FIRST prisma.escrow.update() call inside lockFunds() is
    // updateLockResult() — persisting txLockId/lockedAt/expiresAt. Fails
    // here, simulating an ordinary, non-exotic operational fault (a
    // dropped Postgres connection, a pool-exhaustion timeout — nothing
    // provider-specific).
    mockEscrowUpdate.mockRejectedValueOnce(new Error('simulated: Postgres connection lost mid-write'))
    // The SECOND prisma.escrow.update() call is revertEscrowStatus() —
    // escrow.service.ts's catch block reverting back to the pre-claim
    // status. This one succeeds (a transient DB blip need not affect both
    // calls identically, and even if it did, revertStatus()'s own
    // .catch(() => {}) would swallow that — the point stands either way).
    mockEscrowUpdate.mockResolvedValueOnce({ ...baseEscrow, status: 'CREATED' })

    await expect(escrowService.lockFunds('escrow-1', 'seller-1')).rejects.toThrow(
      'simulated: Postgres connection lost mid-write'
    )

    // The provider's real transfer happened exactly once.
    expect(mockWdkLockFunds).toHaveBeenCalledTimes(1)

    // Two escrow.update() calls occurred: the failed persistence attempt,
    // then the revert. Confirm the revert is unconditional and blind to
    // *why* the try block failed — it always reverts to the escrow's
    // pre-claim status, never inspecting whether a real external transfer
    // already completed.
    expect(mockEscrowUpdate).toHaveBeenCalledTimes(2)
    expect(mockEscrowUpdate).toHaveBeenNthCalledWith(2, { where: { id: 'escrow-1' }, data: { status: 'CREATED' } })

    // The dispositive check: the real transaction hash from the successful
    // external transfer (0xREAL_EXTERNAL_TRANSFER_1) was NEVER successfully
    // persisted anywhere. The first update() call did attempt to carry it —
    // confirming the attempt was made — but that exact call is the one that
    // REJECTED (already proven above by `.rejects.toThrow('simulated: Postgres
    // connection lost mid-write')`, since that rejection could only have come
    // from this call). The second (revert) call's data has no txLockId field
    // at all. Sails' own durable state therefore retains no trace of the real
    // transfer that happened.
    expect(mockEscrowUpdate).toHaveBeenNthCalledWith(1, {
      where: { id: 'escrow-1' },
      data: expect.objectContaining({ txLockId: '0xREAL_EXTERNAL_TRANSFER_1' }),
    })
    const revertCallData = mockEscrowUpdate.mock.calls[1][0]?.data
    expect(revertCallData).not.toHaveProperty('txLockId')

    // Retry: an operator or an automatic caller, seeing lockFunds() throw
    // and observing escrow.status is (once again) CREATED, does the only
    // thing the current design allows — retries the identical logical
    // action. Nothing in escrow.service.ts or the escrow-repository layer
    // remembers that a real transfer already happened.
    mockEscrowFindUnique.mockResolvedValue({ ...baseEscrow, status: 'CREATED' })
    mockWdkLockFunds.mockResolvedValueOnce({ txId: '0xREAL_EXTERNAL_TRANSFER_2', address: '0xescrowAddr1' })
    mockEscrowUpdate.mockResolvedValueOnce({ ...baseEscrow, status: 'FUNDS_LOCKED', txLockId: '0xREAL_EXTERNAL_TRANSFER_2' })

    const retried = await escrowService.lockFunds('escrow-1', 'seller-1')
    expect(retried.status).toBe('FUNDS_LOCKED')

    // DEMONSTRATED: the provider was invoked a SECOND time for the same
    // logical lock action. If the first (0xREAL_EXTERNAL_TRANSFER_1)
    // transfer was in fact a genuine, confirmed on-chain transfer (not
    // merely broadcast-and-lost), the treasury has now sent real funds
    // twice for one escrow, and Sails' own database only ever names one
    // of the two transfers (0xREAL_EXTERNAL_TRANSFER_2). This is not an
    // inferred risk — it is the exact, directly observed behavior of the
    // real, unmocked lockFunds()/claimEscrowTransition()/revertEscrowStatus()
    // code path today.
    expect(mockWdkLockFunds).toHaveBeenCalledTimes(2)
  })

  // ─── CONTRAST: the case the existing design DOES handle safely ───────
  // A provider failure that occurs BEFORE any external side effect (a
  // pure configuration/validation error — nothing was ever broadcast) is
  // genuinely safe to retry: no external state changed, so reverting to
  // CREATED and trying again is correct. This is the case
  // tests/escrowReleaseControls.test.ts's own "a provider lock failure
  // leaves the escrow unpersisted... Retry" test already exercises for a
  // different provider. Included here as a same-file contrast so the
  // boundary between "safe to retry" and "not yet proven safe to retry"
  // is explicit, not just asserted in prose.
  it('a pre-submission provider failure (no external side effect) is safe to retry — contrast case', async () => {
    mockEscrowFindUnique.mockResolvedValue({ ...baseEscrow, status: 'CREATED' })
    mockWdkLockFunds.mockRejectedValueOnce(new Error('WDK_USDT_EVM provider requires WDK_SEED_PHRASE configured'))
    mockEscrowUpdate.mockResolvedValueOnce({ ...baseEscrow, status: 'CREATED' })

    await expect(escrowService.lockFunds('escrow-1', 'seller-1')).rejects.toThrow('WDK_SEED_PHRASE')
    expect(mockWdkLockFunds).toHaveBeenCalledTimes(1)

    // Retry with a "fixed" provider — succeeds cleanly, provider called
    // exactly once more (total 2 calls across the whole test — 1 genuine
    // failure + 1 genuine success, never two successful transfers).
    mockEscrowFindUnique.mockResolvedValue({ ...baseEscrow, status: 'CREATED' })
    mockWdkLockFunds.mockResolvedValueOnce({ txId: '0xREAL_TRANSFER', address: '0xescrowAddr1' })
    mockEscrowUpdate.mockResolvedValueOnce({ ...baseEscrow, status: 'FUNDS_LOCKED', txLockId: '0xREAL_TRANSFER' })

    const result = await escrowService.lockFunds('escrow-1', 'seller-1')
    expect(result.status).toBe('FUNDS_LOCKED')
    expect(mockWdkLockFunds).toHaveBeenCalledTimes(2)
  })

  // ─── The boundary that IS protected today ─────────────────────────────
  // Once an escrow has genuinely, successfully reached FUNDS_LOCKED, a
  // further lockFunds() call is correctly rejected by assertEscrowTransition
  // — this is not in question and this file does not claim otherwise. The
  // gap demonstrated above exists ONLY in the window between "provider
  // call resolved" and "the resulting state was durably persisted."
  it('once FUNDS_LOCKED is durably persisted, a further lockFunds() call is rejected — the already-protected case', async () => {
    mockEscrowFindUnique.mockResolvedValue({ ...baseEscrow, status: 'FUNDS_LOCKED' })

    await expect(escrowService.lockFunds('escrow-1', 'seller-1')).rejects.toThrow(/Invalid escrow transition/)
    expect(mockWdkLockFunds).not.toHaveBeenCalled()
  })
})
