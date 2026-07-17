/**
 * RFC-007 D8/D9 Outcome Engine — the dispute-aware branching in
 * common/events/handlers.ts's settlement.escrow.released/refunded
 * reactions. This is the one genuinely new piece of business logic in
 * the open-reputation pass (everything else is route wiring around an
 * existing service) — worth verifying directly, the same way
 * disputeFlow.test.ts verifies dispute.service.ts's own branching rather
 * than only exercising it through an HTTP round-trip.
 */
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
  },
}))

jest.mock('../src/modules/open-p2p/reconciliation.service', () => ({
  reconciliationService: { reconcilePeerPair: jest.fn().mockResolvedValue([]) },
}))

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { registerEventHandlers } = require('../src/common/events/handlers')

describe('RFC-007 D8/D9 Outcome Engine (dispute-aware, via settlement.escrow.released/refunded handlers)', () => {
  beforeAll(() => {
    registerEventHandlers()
  })

  beforeEach(() => {
    jest.clearAllMocks()
    mockTradeUpdate.mockResolvedValue({ id: 'trade-1', buyerId: 'buyer-1', sellerId: 'seller-1', amount: '0.01' })
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
