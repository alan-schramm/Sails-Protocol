/**
 * escrow.service.ts's releaseFunds() — the real single choke point every
 * fund release goes through (settlement-orchestrator.ts's
 * executeSettlement(), settlement.routes.ts's direct release route, and
 * dispute.service.ts's arbitrated resolveDispute()). Two real,
 * config-gated controls live here:
 *
 * - RFC-014's capability check — originally shipped inside
 *   settlement-orchestrator.ts, relocated here once RFC-015's work
 *   surfaced that the orchestrator wasn't the only real caller (see
 *   escrow.service.ts's own comment on releaseFunds() for the full
 *   explanation).
 * - RFC-015's two-person control (application-layer, not on-chain
 *   multisig — WDK's real package is single-owner-only) — requires both
 *   of a trade's own two counterparties to approve before a normal
 *   (non-disputed) release proceeds.
 *
 * capabilityRegistry.check() is exercised for real here (not mocked) —
 * only prisma.capabilityGrant is mocked, the same "mock the boundary,
 * test what's actually new" discipline this suite already follows
 * elsewhere (tests/capabilityRegistry.test.ts). @tetherto/wdk-wallet-evm
 * is mocked because it ships pure ESM (same reasoning as
 * tests/routes.test.ts) — none of these tests exercise the real WDK path
 * since config.features.mockEscrow stays true throughout, routing every
 * release through the real, harmless MockSettlementProvider instead.
 */
export {} // see chatUnification.test.ts's identical comment

let enforceCapabilities = false
let requireDualApprovalForRelease = false
let mockEscrowFeatureFlag = true
jest.mock('../src/config', () => ({
  get config() {
    return {
      features: { mockEscrow: mockEscrowFeatureFlag, enforceCapabilities, requireDualApprovalForRelease },
      trade: { defaultTimelockHours: 24 },
    }
  },
}))

jest.mock('@tetherto/wdk-wallet-evm', () => ({
  __esModule: true,
  default: class FakeWalletManagerEvm {},
}))

const mockEscrowFindUnique = jest.fn()
const mockEscrowUpdate = jest.fn()
const mockEscrowCreate = jest.fn()
const mockEscrowEventCreate = jest.fn()
const mockTradeFindUnique = jest.fn()
const mockCapabilityGrantFindMany = jest.fn()
const mockApprovalUpsert = jest.fn()
const mockApprovalFindMany = jest.fn()
const mockApprovalCount = jest.fn()
const mockDisputeFindFirst = jest.fn()

jest.mock('../src/common/database', () => ({
  prisma: {
    escrow: {
      findUnique: (...args: unknown[]) => mockEscrowFindUnique(...args),
      update: (...args: unknown[]) => mockEscrowUpdate(...args),
      create: (...args: unknown[]) => mockEscrowCreate(...args),
    },
    escrowEvent: { create: (...args: unknown[]) => mockEscrowEventCreate(...args) },
    trade: { findUnique: (...args: unknown[]) => mockTradeFindUnique(...args) },
    capabilityGrant: { findMany: (...args: unknown[]) => mockCapabilityGrantFindMany(...args) },
    escrowReleaseApproval: {
      upsert: (...args: unknown[]) => mockApprovalUpsert(...args),
      findMany: (...args: unknown[]) => mockApprovalFindMany(...args),
      count: (...args: unknown[]) => mockApprovalCount(...args),
    },
    dispute: { findFirst: (...args: unknown[]) => mockDisputeFindFirst(...args) },
  },
}))

jest.mock('../src/common/events/event-bus', () => ({
  eventBus: { emit: jest.fn().mockResolvedValue(undefined) },
}))

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { escrowService } = require('../src/modules/open-settlement/escrow.service')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { eventBus } = require('../src/common/events/event-bus')

const baseEscrow = {
  id: 'escrow-1', tradeId: 'trade-1', type: 'MOCK', status: 'PAYMENT_PENDING',
  lockedAmount: '20.5', asset: 'USDT_ERC20', timelockHours: 24,
}

describe('escrowService.releaseFunds — RFC-014 capability check (relocated from the orchestrator)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    enforceCapabilities = false
    requireDualApprovalForRelease = false
    mockEscrowFeatureFlag = true
    mockEscrowFindUnique.mockResolvedValue(baseEscrow)
    mockEscrowUpdate.mockResolvedValue({ ...baseEscrow, status: 'COMPLETED', txReleaseId: 'tx-1' })
    // Gap-audit ownership check runs before the capability check — every
    // test in this block acts as 'seller-1', so the trade's sellerId
    // must match for these tests to exercise the capability check itself.
    mockTradeFindUnique.mockResolvedValue({ id: 'trade-1', buyerId: 'buyer-1', sellerId: 'seller-1' })
  })

  it('releases without ever querying CapabilityGrant when enforceCapabilities is false (the default)', async () => {
    await escrowService.releaseFunds('escrow-1', '0xbuyer', 'seller-1')
    expect(mockCapabilityGrantFindMany).not.toHaveBeenCalled()
    expect(mockEscrowUpdate).toHaveBeenCalled()
  })

  it('rejects with ForbiddenError, before ever moving funds, when enforcement is on and no grant covers it', async () => {
    enforceCapabilities = true
    mockCapabilityGrantFindMany.mockResolvedValue([])

    await expect(escrowService.releaseFunds('escrow-1', '0xbuyer', 'seller-1')).rejects.toThrow(
      /no active 'settlement' capability grant/
    )
    expect(mockEscrowUpdate).not.toHaveBeenCalled()
  })

  it('releases normally when enforcement is on and an active grant covers it', async () => {
    enforceCapabilities = true
    mockCapabilityGrantFindMany.mockResolvedValue([
      { id: 'g1', grantedTo: 'seller-1', capabilityName: 'settlement', scope: ['settlement.escrow.released'], constraints: null, issuedBy: 'seller-1' },
    ])

    const result = await escrowService.releaseFunds('escrow-1', '0xbuyer', 'seller-1')
    expect(result.status).toBe('COMPLETED')
  })

  it('is exercised by the direct release path too, not just an orchestrator-level shortcut — same call, no special-casing needed', async () => {
    // settlement.routes.ts's POST /v1/settlement/escrow/:id/release calls
    // escrowService.releaseFunds() with exactly this shape — no
    // orchestrator involved. Proves the check protects that path now.
    enforceCapabilities = true
    mockCapabilityGrantFindMany.mockResolvedValue([])
    await expect(escrowService.releaseFunds('escrow-1', '0xbuyer', 'seller-1')).rejects.toThrow(/ForbiddenError|no active/)
  })
})

describe('escrowService — RFC-015 two-person control', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    enforceCapabilities = false
    requireDualApprovalForRelease = false
    mockEscrowFeatureFlag = true
    mockEscrowFindUnique.mockResolvedValue(baseEscrow)
    mockEscrowUpdate.mockResolvedValue({ ...baseEscrow, status: 'COMPLETED', txReleaseId: 'tx-1' })
    mockTradeFindUnique.mockResolvedValue({ id: 'trade-1', buyerId: 'buyer-1', sellerId: 'seller-1' })
  })

  describe('approveRelease', () => {
    it('rejects an approver who is neither the buyer nor the seller of the trade', async () => {
      await expect(escrowService.approveRelease('escrow-1', 'stranger-1')).rejects.toThrow(
        /not a counterparty/
      )
      expect(mockApprovalUpsert).not.toHaveBeenCalled()
    })

    it('upserts an approval for the buyer', async () => {
      mockApprovalUpsert.mockResolvedValue({ id: 'appr-1', escrowId: 'escrow-1', approverId: 'buyer-1' })
      await escrowService.approveRelease('escrow-1', 'buyer-1')
      expect(mockApprovalUpsert).toHaveBeenCalledWith({
        where: { escrowId_approverId: { escrowId: 'escrow-1', approverId: 'buyer-1' } },
        update: {},
        create: { escrowId: 'escrow-1', approverId: 'buyer-1' },
      })
    })

    it('upserts an approval for the seller', async () => {
      mockApprovalUpsert.mockResolvedValue({ id: 'appr-2', escrowId: 'escrow-1', approverId: 'seller-1' })
      await escrowService.approveRelease('escrow-1', 'seller-1')
      expect(mockApprovalUpsert).toHaveBeenCalledWith(
        expect.objectContaining({ create: { escrowId: 'escrow-1', approverId: 'seller-1' } })
      )
    })
  })

  describe('hasDualApproval', () => {
    it('is false with fewer than 2 recorded approvals', async () => {
      mockApprovalCount.mockResolvedValue(1)
      expect(await escrowService.hasDualApproval('escrow-1')).toBe(false)
    })

    it('is true with 2 or more recorded approvals', async () => {
      mockApprovalCount.mockResolvedValue(2)
      expect(await escrowService.hasDualApproval('escrow-1')).toBe(true)
    })
  })

  describe('releaseFunds gate', () => {
    it('releases without checking approvals when requireDualApprovalForRelease is false (the default)', async () => {
      requireDualApprovalForRelease = false
      await escrowService.releaseFunds('escrow-1', '0xbuyer', 'seller-1')
      expect(mockApprovalCount).not.toHaveBeenCalled()
      expect(mockEscrowUpdate).toHaveBeenCalled()
    })

    it('blocks a normal (PAYMENT_PENDING) release with only 1 approval', async () => {
      requireDualApprovalForRelease = true
      mockApprovalCount.mockResolvedValue(1)

      await expect(escrowService.releaseFunds('escrow-1', '0xbuyer', 'seller-1')).rejects.toThrow(
        /Release blocked.*both counterparties.*approve-release/
      )
      expect(mockEscrowUpdate).not.toHaveBeenCalled()
    })

    it('releases a normal (PAYMENT_PENDING) escrow once both counterparties have approved', async () => {
      requireDualApprovalForRelease = true
      mockApprovalCount.mockResolvedValue(2)

      const result = await escrowService.releaseFunds('escrow-1', '0xbuyer', 'seller-1')
      expect(result.status).toBe('COMPLETED')
    })

    it('bypasses the approval count entirely for an arbitrated (DISPUTED) release, even with zero approvals', async () => {
      requireDualApprovalForRelease = true
      mockEscrowFindUnique.mockResolvedValue({ ...baseEscrow, status: 'DISPUTED' })
      mockApprovalCount.mockResolvedValue(0)
      // Gap-audit ownership check: 'arbiter-1' isn't the seller, so it
      // must be the assigned arbiter of an open dispute on this trade
      // for the release to be authorized at all.
      mockDisputeFindFirst.mockResolvedValue({ id: 'dispute-1', tradeId: 'trade-1', arbiterId: 'arbiter-1' })

      const result = await escrowService.releaseFunds('escrow-1', '0xbuyer', 'arbiter-1')
      expect(mockApprovalCount).not.toHaveBeenCalled()
      expect(result.status).toBe('COMPLETED')
    })
  })
})

// Gap audit (not tied to any single RFC): none of lockFunds/markPaymentSent/
// releaseFunds/refundFunds/openDispute verified `triggeredBy` was actually
// a party to the trade before this fix — any authenticated participant on
// the platform could mutate any other trade's escrow (an IDOR, the same
// class of bug RT-002 already fixed once for raw-userId-in-body, one layer
// deeper at the service boundary). releaseFunds' own ownership check is
// exercised above via the RFC-014/015 describe blocks; this block covers
// the other four methods, which had zero prior test coverage.
describe('escrowService — ownership/IDOR checks (gap audit)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    enforceCapabilities = false
    requireDualApprovalForRelease = false
    mockEscrowFeatureFlag = true
    mockTradeFindUnique.mockResolvedValue({ id: 'trade-1', buyerId: 'buyer-1', sellerId: 'seller-1' })
  })

  describe('lockFunds', () => {
    beforeEach(() => {
      mockEscrowFindUnique.mockResolvedValue({ ...baseEscrow, status: 'CREATED' })
      mockEscrowUpdate.mockResolvedValue({ ...baseEscrow, status: 'FUNDS_LOCKED' })
    })

    it('rejects a caller who is not the trade\'s seller', async () => {
      await expect(escrowService.lockFunds('escrow-1', 'buyer-1')).rejects.toThrow(/not the seller/)
      expect(mockEscrowUpdate).not.toHaveBeenCalled()
    })

    it('allows the seller', async () => {
      const result = await escrowService.lockFunds('escrow-1', 'seller-1')
      expect(result.status).toBe('FUNDS_LOCKED')
    })

    it("allows an agent acting on the seller's behalf (agent:{label}:{sellerId})", async () => {
      const result = await escrowService.lockFunds('escrow-1', 'agent:seller-wallet:seller-1')
      expect(result.status).toBe('FUNDS_LOCKED')
    })

    // Failure-scenario coverage requested directly in a CTO-role
    // follow-up after RFC-018 landed ("garantir que os testes cubram
    // cenários de falha... escrow não bloqueado"). This is deliberate
    // control flow, not a new behavior: escrowService.lockFunds() calls
    // provider.lockFunds() before persisting anything or emitting
    // settlement.escrow.locked (the event handlers.ts's Intent
    // COMMITTED transition reacts to) — a provider failure must never
    // leave a half-locked escrow or a falsely-COMMITTED Intent behind.
    it('a provider lock failure leaves the escrow unpersisted and never emits settlement.escrow.locked', async () => {
      jest.clearAllMocks()
      // mockEscrow must be off here — otherwise getProvider() always
      // short-circuits to the harmless MOCK provider regardless of
      // escrow.type, and this test would never actually exercise
      // LightningHodlProvider's failure path.
      mockEscrowFeatureFlag = false
      mockTradeFindUnique.mockResolvedValue({ id: 'trade-1', buyerId: 'buyer-1', sellerId: 'seller-1' })
      // LIGHTNING_HODL's provider always throws "not yet implemented" —
      // real, already-existing behavior (escrow.service.ts's PROVIDERS
      // map), reused here rather than fabricating a new failure mode.
      mockEscrowFindUnique.mockResolvedValue({ ...baseEscrow, type: 'LIGHTNING_HODL', status: 'CREATED' })

      await expect(escrowService.lockFunds('escrow-1', 'seller-1')).rejects.toThrow(/not yet implemented/)

      expect(mockEscrowUpdate).not.toHaveBeenCalled()
      expect(eventBus.emit).not.toHaveBeenCalledWith('settlement.escrow.locked', expect.anything(), expect.anything())
    })

    // Security-validation round (2026-07-19, "settlement falhando / retry
    // seguro" scenario): the test above proves a failed lock leaves
    // nothing persisted — this one proves the OTHER half of "safe retry":
    // the same escrow row is still in a state where a corrected attempt
    // (here: the operator fixes the escrow's type, the real-world
    // equivalent of retrying against a working provider) goes through
    // cleanly via the exact same code path, no leftover half-locked state
    // from the failed attempt getting in the way.
    it('a failed lock leaves the escrow retry-safe — a subsequent attempt on the same row succeeds cleanly', async () => {
      jest.clearAllMocks()
      mockEscrowFeatureFlag = false
      mockTradeFindUnique.mockResolvedValue({ id: 'trade-1', buyerId: 'buyer-1', sellerId: 'seller-1' })
      mockEscrowFindUnique.mockResolvedValueOnce({ ...baseEscrow, type: 'LIGHTNING_HODL', status: 'CREATED' })

      await expect(escrowService.lockFunds('escrow-1', 'seller-1')).rejects.toThrow(/not yet implemented/)

      // Retry: same escrow id, still status CREATED (never advanced), now
      // routed through a working provider — mockEscrow back on, matching
      // an operator retrying with the config actually fixed.
      mockEscrowFeatureFlag = true
      mockEscrowFindUnique.mockResolvedValueOnce({ ...baseEscrow, type: 'MOCK', status: 'CREATED' })
      mockEscrowUpdate.mockResolvedValueOnce({ ...baseEscrow, status: 'FUNDS_LOCKED' })

      const result = await escrowService.lockFunds('escrow-1', 'seller-1')

      expect(result.status).toBe('FUNDS_LOCKED')
      expect(mockEscrowUpdate).toHaveBeenCalledTimes(1)
    })
  })

  describe('markPaymentSent', () => {
    beforeEach(() => {
      mockEscrowFindUnique.mockResolvedValue({ ...baseEscrow, status: 'FUNDS_LOCKED' })
      mockEscrowUpdate.mockResolvedValue({ ...baseEscrow, status: 'PAYMENT_PENDING' })
    })

    it('rejects a caller who is not the trade\'s buyer', async () => {
      await expect(escrowService.markPaymentSent('escrow-1', 'seller-1')).rejects.toThrow(/not the buyer/)
      expect(mockEscrowUpdate).not.toHaveBeenCalled()
    })

    it('allows the buyer', async () => {
      const result = await escrowService.markPaymentSent('escrow-1', 'buyer-1')
      expect(result.status).toBe('PAYMENT_PENDING')
    })
  })

  describe('refundFunds', () => {
    beforeEach(() => {
      mockEscrowFindUnique.mockResolvedValue({ ...baseEscrow, status: 'FUNDS_LOCKED' })
      mockEscrowUpdate.mockResolvedValue({ ...baseEscrow, status: 'REFUNDED' })
    })

    it('rejects a caller who is neither the seller nor an assigned arbiter', async () => {
      mockDisputeFindFirst.mockResolvedValue(null)
      await expect(escrowService.refundFunds('escrow-1', 'buyer-1')).rejects.toThrow(
        /neither the seller.*nor its assigned dispute arbiter/
      )
      expect(mockEscrowUpdate).not.toHaveBeenCalled()
    })

    it('allows the seller (e.g. a trade cancelled before payment, collateral returned)', async () => {
      const result = await escrowService.refundFunds('escrow-1', 'seller-1')
      expect(result.status).toBe('REFUNDED')
    })

    it('allows the assigned arbiter of an open dispute on this trade', async () => {
      mockDisputeFindFirst.mockResolvedValue({ id: 'dispute-1', tradeId: 'trade-1', arbiterId: 'arbiter-1' })
      const result = await escrowService.refundFunds('escrow-1', 'arbiter-1')
      expect(result.status).toBe('REFUNDED')
    })
  })

  describe('openDispute', () => {
    beforeEach(() => {
      mockEscrowFindUnique.mockResolvedValue({ ...baseEscrow, status: 'FUNDS_LOCKED' })
      mockEscrowUpdate.mockResolvedValue({ ...baseEscrow, status: 'DISPUTED' })
    })

    it('rejects a caller who is not a party to the trade', async () => {
      await expect(escrowService.openDispute('escrow-1', 'stranger-1', 'reason')).rejects.toThrow(
        /not a party to trade/
      )
      expect(mockEscrowUpdate).not.toHaveBeenCalled()
    })

    it('allows the buyer', async () => {
      const result = await escrowService.openDispute('escrow-1', 'buyer-1', 'reason')
      expect(result.status).toBe('DISPUTED')
    })

    it('allows the seller', async () => {
      const result = await escrowService.openDispute('escrow-1', 'seller-1', 'reason')
      expect(result.status).toBe('DISPUTED')
    })
  })
})
