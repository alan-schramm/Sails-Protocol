/**
 * RFC-007 D8/D9 Outcome Engine — the dispute-aware branching in
 * common/events/handlers.ts's settlement.escrow.released/refunded
 * reactions. This is the one genuinely new piece of business logic in
 * the open-reputation pass (everything else is route wiring around an
 * existing service) — worth verifying directly, the same way
 * disputeFlow.test.ts verifies dispute.service.ts's own branching rather
 * than only exercising it through an HTTP round-trip.
 */
export {} // forces this file to be an ES module — see chatUnification.test.ts's
// identical comment for why this matters (no top-level import/export
// otherwise means top-level `const`s leak into the global scope and can
// collide with another require()-only test file's identically-named ones).

const mockTradeUpdate = jest.fn()
const mockDisputeFindFirst = jest.fn()
const mockUserUpdate = jest.fn()

jest.mock('../src/common/database', () => ({
  prisma: {
    trade: { update: (...args: unknown[]) => mockTradeUpdate(...args) },
    dispute: { findFirst: (...args: unknown[]) => mockDisputeFindFirst(...args) },
    user: { update: (...args: unknown[]) => mockUserUpdate(...args) },
  },
}))

const mockEmit = jest.fn().mockResolvedValue(undefined)
const handlers: Record<string, (payload: unknown) => Promise<void>> = {}
jest.mock('../src/common/events/event-bus', () => ({
  eventBus: {
    emit: (...args: unknown[]) => mockEmit(...args),
    on: (event: string, handler: (payload: unknown) => Promise<void>) => {
      handlers[event] = handler
    },
    onDurable: jest.fn(),
  },
}))

jest.mock('../src/modules/open-p2p/reconciliation.service', () => ({
  reconciliationService: { reconcilePeerPair: jest.fn().mockResolvedValue([]) },
}))

// RFC-018 — handlers.ts now calls intentEngine.transition() from these
// same reactions; mocked wholesale (rather than the internal prisma
// chain intentEngine.transition() itself makes) so this file can assert
// on the call without re-deriving that chain — that internal mechanism
// is already covered by tests/intentFlow.test.ts.
const mockIntentTransition = jest.fn().mockResolvedValue(undefined)
jest.mock('../src/core/intent-engine', () => ({
  intentEngine: { transition: (...args: unknown[]) => mockIntentTransition(...args) },
}))

// @tetherto/wdk-wallet-evm ships pure ESM (no CJS build) — handlers.ts now
// transitively imports it via settlement-orchestrator.ts/escrow.service.ts/
// wdk-settlement.provider.ts (executeSettlement()'s auto-settle-on-match
// wiring). None of this suite's tests trigger openp2p.trade.created, so
// it's mocked out entirely, same reasoning as routes.test.ts.
jest.mock('@tetherto/wdk-wallet-evm', () => ({
  __esModule: true,
  default: class FakeWalletManagerEvm {},
}))

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { registerEventHandlers } = require('../src/common/events/handlers')

describe('RFC-007 D8/D9 Outcome Engine (dispute-aware, via settlement.escrow.released/refunded handlers)', () => {
  beforeAll(() => {
    registerEventHandlers()
  })

  beforeEach(() => {
    jest.clearAllMocks()
    mockTradeUpdate.mockResolvedValue({ id: 'trade-1', buyerId: 'buyer-1', sellerId: 'seller-1', amount: '0.01', intentId: 'intent-1' })
    mockUserUpdate.mockResolvedValue({ id: 'x', reputationScore: 0, totalTrades: 0 })
  })

  it('happy-path completion (no dispute): both parties get POSITIVE outcomes', async () => {
    mockDisputeFindFirst.mockResolvedValueOnce(null) // no resolved RELEASE dispute for this trade

    await handlers['settlement.escrow.released']({ tradeId: 'trade-1', escrowId: 'escrow-1', triggeredBy: 'buyer-1', from: 'PAYMENT_PENDING', to: 'COMPLETED' })

    // 2 calls for totalTrades/totalVolumeBtc + 2 calls inside recordOutcome
    // (buyer, seller) — reputationScore increments are the ones that matter here.
    const scoreUpdates = mockUserUpdate.mock.calls.filter((c) => c[0]?.data?.reputationScore)
    expect(scoreUpdates).toHaveLength(2)
    expect(scoreUpdates.find((c) => c[0].where.id === 'buyer-1')?.[0].data.reputationScore).toEqual({ increment: 2 })
    expect(scoreUpdates.find((c) => c[0].where.id === 'seller-1')?.[0].data.reputationScore).toEqual({ increment: 2 })
  })

  it('completion via a RELEASE dispute ruling: buyer POSITIVE, seller NEGATIVE — not both Positive', async () => {
    mockDisputeFindFirst.mockResolvedValueOnce({ id: 'dispute-1', tradeId: 'trade-1', status: 'RESOLVED', ruling: 'RELEASE' })

    await handlers['settlement.escrow.released']({ tradeId: 'trade-1', escrowId: 'escrow-1', triggeredBy: 'arbiter-1', from: 'DISPUTED', to: 'COMPLETED' })

    const scoreUpdates = mockUserUpdate.mock.calls.filter((c) => c[0]?.data?.reputationScore)
    expect(scoreUpdates.find((c) => c[0].where.id === 'buyer-1')?.[0].data.reputationScore).toEqual({ increment: 2 })
    expect(scoreUpdates.find((c) => c[0].where.id === 'seller-1')?.[0].data.reputationScore).toEqual({ increment: -5 })
  })

  it('plain refund with no dispute ever raised: both parties NEUTRAL (RFC-007 D9 — never Negative)', async () => {
    mockDisputeFindFirst.mockResolvedValueOnce(null)

    await handlers['settlement.escrow.refunded']({ tradeId: 'trade-1', escrowId: 'escrow-1', triggeredBy: 'seller-1', from: 'FUNDS_LOCKED', to: 'REFUNDED' })

    const scoreUpdates = mockUserUpdate.mock.calls.filter((c) => c[0]?.data?.reputationScore)
    expect(scoreUpdates.find((c) => c[0].where.id === 'buyer-1')?.[0].data.reputationScore).toEqual({ increment: 0 })
    expect(scoreUpdates.find((c) => c[0].where.id === 'seller-1')?.[0].data.reputationScore).toEqual({ increment: 0 })
  })

  it('refund via a REFUND dispute ruling: seller POSITIVE, buyer NEGATIVE — not both Neutral', async () => {
    mockDisputeFindFirst.mockResolvedValueOnce({ id: 'dispute-1', tradeId: 'trade-1', status: 'RESOLVED', ruling: 'REFUND' })

    await handlers['settlement.escrow.refunded']({ tradeId: 'trade-1', escrowId: 'escrow-1', triggeredBy: 'arbiter-1', from: 'DISPUTED', to: 'REFUNDED' })

    const scoreUpdates = mockUserUpdate.mock.calls.filter((c) => c[0]?.data?.reputationScore)
    expect(scoreUpdates.find((c) => c[0].where.id === 'buyer-1')?.[0].data.reputationScore).toEqual({ increment: -5 })
    expect(scoreUpdates.find((c) => c[0].where.id === 'seller-1')?.[0].data.reputationScore).toEqual({ increment: 2 })
  })
})

// RFC-018 (rfcs/RFC-018-intent-as-canonical-trade-entry-point.md) —
// the same three handlers above (plus settlement.escrow.locked) also
// drive the originating Intent's lifecycle now. Verified directly here
// since these are the real call sites, not just intent-engine.ts's own
// internal transition() logic (already covered by intentFlow.test.ts).
describe('RFC-018 — Intent lifecycle driven by settlement.escrow.* handlers', () => {
  beforeAll(() => {
    registerEventHandlers()
  })

  beforeEach(() => {
    jest.clearAllMocks()
    mockTradeUpdate.mockResolvedValue({ id: 'trade-1', buyerId: 'buyer-1', sellerId: 'seller-1', amount: '0.01', intentId: 'intent-1' })
    mockUserUpdate.mockResolvedValue({ id: 'x', reputationScore: 0, totalTrades: 0 })
    mockDisputeFindFirst.mockResolvedValue(null)
  })

  it('settlement.escrow.locked transitions the Intent to COMMITTED', async () => {
    await handlers['settlement.escrow.locked']({ tradeId: 'trade-1', escrowId: 'escrow-1', triggeredBy: 'seller-1', from: 'CREATED', to: 'FUNDS_LOCKED' })

    expect(mockIntentTransition).toHaveBeenCalledWith(
      'intent-1', 'COMMITTED', 'system:trade-lifecycle', 'intent.committed',
      expect.objectContaining({ intentId: 'intent-1', settlementId: 'escrow-1' })
    )
  })

  it('settlement.escrow.locked skips Intent transition when the Trade predates RFC-018 (intentId null)', async () => {
    mockTradeUpdate.mockResolvedValueOnce({ id: 'trade-1', buyerId: 'buyer-1', sellerId: 'seller-1', amount: '0.01', intentId: null })

    await handlers['settlement.escrow.locked']({ tradeId: 'trade-1', escrowId: 'escrow-1', triggeredBy: 'seller-1', from: 'CREATED', to: 'FUNDS_LOCKED' })

    expect(mockIntentTransition).not.toHaveBeenCalled()
  })

  it('settlement.escrow.released walks the Intent through SETTLING then FULFILLED, in order', async () => {
    await handlers['settlement.escrow.released']({ tradeId: 'trade-1', escrowId: 'escrow-1', triggeredBy: 'buyer-1', from: 'PAYMENT_PENDING', to: 'COMPLETED' })

    const calls = mockIntentTransition.mock.calls.map((c) => c[1]) // toStatus per call
    expect(calls).toEqual(['SETTLING', 'FULFILLED'])
  })

  it('settlement.escrow.refunded transitions the Intent to FAILED', async () => {
    await handlers['settlement.escrow.refunded']({ tradeId: 'trade-1', escrowId: 'escrow-1', triggeredBy: 'seller-1', from: 'FUNDS_LOCKED', to: 'REFUNDED' })

    expect(mockIntentTransition).toHaveBeenCalledWith(
      'intent-1', 'FAILED', 'system:trade-lifecycle', 'intent.failed',
      expect.objectContaining({ intentId: 'intent-1' })
    )
  })
})
