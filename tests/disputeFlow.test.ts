/**
 * Dispute flow + p2p-schemas — 04-Deepseek Review.md Tasks 1 & 2.
 *
 * Same mocking pattern as intentFlow.test.ts: Prisma/eventBus are mocked
 * to unit-test the real business logic (authorization, freeze-then-assign
 * ordering, ruling -> escrow action mapping) without a live Postgres.
 * deriveTradeState is a pure function — no mocking needed at all.
 */
import { deriveTradeState } from '@satsails/p2p-schemas'
import { toOfferSchema } from '@satsails/p2p-schemas'
import { TrustedArbitratorProvider } from '../src/modules/open-settlement/arbitration-provider'

const mockTradeFindUnique = jest.fn()
const mockDisputeCreate = jest.fn()
const mockDisputeFindUnique = jest.fn()
const mockDisputeFindMany = jest.fn().mockResolvedValue([])
const mockDisputeCount = jest.fn().mockResolvedValue(0)
const mockDisputeUpdate = jest.fn()
const mockDisputeUpdateMany = jest.fn().mockResolvedValue({ count: 1 })
// RFC-021 D9 (2026-08-02) — applyRuling() now looks up the escrow itself
// (isSignatureCollectionType() dispatch) even for RELEASE/REFUND, so every
// test needs a real default here, not just the new SPLIT-specific ones.
// 'MOCK' keeps isSignatureCollectionType() false, preserving this file's
// existing tests' direct-call expectations unchanged.
const mockEscrowFindUnique = jest.fn().mockResolvedValue({ id: 'escrow-1', type: 'MOCK' })
// RFC-021 D6 real appeal-fee collection (2026-08-01) — appeal() charges
// one of these per appeal round, resolveDispute() settles its outcome.
const mockDisputeAppealFeeCreate = jest.fn().mockResolvedValue({ id: 'appeal-fee-1' })
const mockDisputeAppealFeeUpdateMany = jest.fn().mockResolvedValue({ count: 1 })

jest.mock('../src/common/database', () => ({
  prisma: {
    trade: { findUnique: (...args: unknown[]) => mockTradeFindUnique(...args) },
    dispute: {
      create: (...args: unknown[]) => mockDisputeCreate(...args),
      findUnique: (...args: unknown[]) => mockDisputeFindUnique(...args),
      findMany: (...args: unknown[]) => mockDisputeFindMany(...args),
      count: (...args: unknown[]) => mockDisputeCount(...args),
      update: (...args: unknown[]) => mockDisputeUpdate(...args),
      updateMany: (...args: unknown[]) => mockDisputeUpdateMany(...args),
    },
    disputeAppealFee: {
      create: (...args: unknown[]) => mockDisputeAppealFeeCreate(...args),
      updateMany: (...args: unknown[]) => mockDisputeAppealFeeUpdateMany(...args),
    },
    escrow: { findUnique: (...args: unknown[]) => mockEscrowFindUnique(...args) },
  },
}))

// dispute.service.ts's new RFC-021 D8 methods read
// config.settlement.qvacAutoResolutionWindowHours — a real config import,
// not mocked away in the other tests in this file (which never needed
// it), so it's mocked here specifically for the new describe blocks.
jest.mock('../src/config', () => ({
  config: { settlement: { qvacAutoResolutionWindowHours: 24 } },
}))

const mockEmit = jest.fn().mockResolvedValue(undefined)
jest.mock('../src/common/events/event-bus', () => ({
  eventBus: { emit: (...args: unknown[]) => mockEmit(...args) },
}))

const mockOpenDispute = jest.fn().mockResolvedValue({})
const mockReleaseFunds = jest.fn().mockResolvedValue({})
const mockRefundFunds = jest.fn().mockResolvedValue({})
// RFC-021 D9 (2026-08-02)
const mockSplitFunds = jest.fn().mockResolvedValue({})
const mockInitiateRelease = jest.fn().mockResolvedValue({})
const mockInitiateRefund = jest.fn().mockResolvedValue({})
const mockInitiateSplit = jest.fn().mockResolvedValue({})
const mockIsSignatureCollectionType = jest.fn().mockReturnValue(false)
jest.mock('../src/modules/open-settlement/escrow.service', () => ({
  escrowService: {
    openDispute: (...args: unknown[]) => mockOpenDispute(...args),
    releaseFunds: (...args: unknown[]) => mockReleaseFunds(...args),
    refundFunds: (...args: unknown[]) => mockRefundFunds(...args),
    splitFunds: (...args: unknown[]) => mockSplitFunds(...args),
    initiateRelease: (...args: unknown[]) => mockInitiateRelease(...args),
    initiateRefund: (...args: unknown[]) => mockInitiateRefund(...args),
    initiateSplit: (...args: unknown[]) => mockInitiateSplit(...args),
    isSignatureCollectionType: (...args: unknown[]) => mockIsSignatureCollectionType(...args),
  },
}))

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DisputeService } = require('../src/modules/open-settlement/dispute.service')

describe('deriveTradeState — Task 1 state vocabulary over the real columns', () => {
  it('maps the happy path: open -> payment_sent -> escrow_released', () => {
    expect(deriveTradeState({ status: 'PENDING' }, null, null)).toBe('open')
    expect(deriveTradeState({ status: 'ACTIVE' }, { status: 'FUNDS_LOCKED' }, null)).toBe('open')
    expect(deriveTradeState({ status: 'ACTIVE' }, { status: 'PAYMENT_PENDING' }, null)).toBe('payment_sent')
    expect(deriveTradeState({ status: 'COMPLETED' }, { status: 'COMPLETED' }, null)).toBe('escrow_released')
  })

  it('maps dispute states, including buyer/seller resolutions', () => {
    expect(deriveTradeState({ status: 'DISPUTED' }, { status: 'DISPUTED' }, { status: 'OPENED', ruling: null })).toBe('dispute_opened')
    expect(deriveTradeState({ status: 'COMPLETED' }, { status: 'COMPLETED' }, { status: 'RESOLVED', ruling: 'RELEASE' })).toBe('dispute_resolved_buyer')
    expect(deriveTradeState({ status: 'CANCELLED' }, { status: 'REFUNDED' }, { status: 'RESOLVED', ruling: 'REFUND' })).toBe('dispute_resolved_seller')
  })

  it('maps cancellation/refund to cancelled', () => {
    expect(deriveTradeState({ status: 'CANCELLED' }, null, null)).toBe('cancelled')
    expect(deriveTradeState({ status: 'ACTIVE' }, { status: 'REFUNDED' }, null)).toBe('cancelled')
  })
})

describe('toOfferSchema — Task 1 Offer contract over the real Prisma shape', () => {
  it('derives assetSell/assetBuy from asset+side and wraps paymentMethod as array', () => {
    const schema = toOfferSchema({
      id: 'offer-1',
      userId: 'user-1',
      asset: 'BTC',
      side: 'SELL',
      priceUsd: { toString: () => '65000' },
      priceBrl: { toString: () => '350000' },
      maxAmount: { toString: () => '0.5' },
      paymentMethod: 'PIX',
      status: 'ACTIVE',
    })
    expect(schema).toMatchObject({
      assetSell: 'BTC',
      assetBuy: 'BRL', // BRL quote present -> BRL pair
      amount: '0.5',
      price: '350000',
      paymentMethods: ['PIX'],
    })
  })
})

describe('DisputeService — Task 2 raiseDispute/resolveDispute', () => {
  const arbitration = new TrustedArbitratorProvider(['arbiter-1', 'arbiter-2'])
  const service = new DisputeService(arbitration)

  beforeEach(() => jest.clearAllMocks())

  it('raiseDispute freezes the escrow, persists, assigns an arbiter, and notifies via pubsub', async () => {
    mockTradeFindUnique.mockResolvedValue({ id: 'trade-1', buyerId: 'buyer-1', sellerId: 'seller-1', escrowId: 'escrow-1' })
    mockDisputeCreate.mockResolvedValue({ id: 'dispute-1' })
    mockDisputeUpdate.mockResolvedValue({ id: 'dispute-1', arbiterId: 'arbiter-1' })

    const dispute = await service.raiseDispute('trade-1', 'buyer-1', 'paguei e não recebi', [])

    expect(mockOpenDispute).toHaveBeenCalledWith('escrow-1', 'buyer-1', 'paguei e não recebi') // freeze
    expect(dispute.arbiterId).toBe('arbiter-1') // assignment via ArbitrationProvider
    expect(mockEmit).toHaveBeenCalledWith(
      'dispute.opened',
      expect.objectContaining({ disputeId: 'dispute-1', tradeId: 'trade-1', arbiterId: 'arbiter-1' }),
      'trade-1' // correlationId (RFC-010)
    )
  })

  // Security-validation round (2026-07-19, "disputa dupla" scenario):
  // buyer and seller both raising a dispute at once can both pass every
  // check in raiseDispute()/openDispute() before either write lands —
  // nothing serializes the two calls. The real guard is the database:
  // schema.prisma's Dispute model gained @@unique([tradeId]), so the
  // second concurrent prisma.dispute.create() throws a real P2002 (this
  // mock stands in for that database behavior, not fabricating a new
  // failure mode). Proves raiseDispute() converts it to a clean rejection
  // instead of letting a second Dispute row silently exist.
  it('a second concurrent raiseDispute for the same trade is rejected, not silently duplicated', async () => {
    mockTradeFindUnique.mockResolvedValue({ id: 'trade-1', buyerId: 'buyer-1', sellerId: 'seller-1', escrowId: 'escrow-1' })
    const p2002 = Object.assign(new Error('Unique constraint failed on the fields: (`tradeId`)'), { code: 'P2002' })
    mockDisputeCreate.mockRejectedValueOnce(p2002)

    await expect(service.raiseDispute('trade-1', 'seller-1', 'contraparte não confirma pagamento')).rejects.toThrow(
      /already been raised/
    )
    // openDispute() still ran (the escrow-side race isn't what's being
    // asserted here — the Dispute-row race is) — this test's own value is
    // that the ValidationError surfaces cleanly, not a raw P2002.
    expect(mockOpenDispute).toHaveBeenCalled()
  })

  it('rejects a raiseDispute from someone who is not a party to the trade', async () => {
    mockTradeFindUnique.mockResolvedValue({ id: 'trade-1', buyerId: 'buyer-1', sellerId: 'seller-1', escrowId: 'escrow-1' })
    await expect(service.raiseDispute('trade-1', 'stranger', 'reason')).rejects.toThrow(/not a party/)
    expect(mockOpenDispute).not.toHaveBeenCalled()
  })

  it('resolveDispute RELEASE (buyer wins) releases the escrow and emits the ruling', async () => {
    mockDisputeFindUnique.mockResolvedValue({ id: 'dispute-1', tradeId: 'trade-1', escrowId: 'escrow-1', arbiterId: 'arbiter-1', status: 'OPENED' })
    mockDisputeUpdate.mockResolvedValue({ id: 'dispute-1', status: 'RESOLVED', ruling: 'RELEASE' })

    await service.resolveDispute('dispute-1', 'arbiter-1', 'RELEASE', 'bc1qbuyeraddress')

    expect(mockReleaseFunds).toHaveBeenCalledWith('escrow-1', 'bc1qbuyeraddress', 'arbiter-1')
    expect(mockEmit).toHaveBeenCalledWith(
      'dispute.resolved',
      expect.objectContaining({ ruling: 'RELEASE', tradeId: 'trade-1' }),
      'trade-1'
    )
  })

  it('resolveDispute REFUND (seller wins) refunds the escrow', async () => {
    mockDisputeFindUnique.mockResolvedValue({ id: 'dispute-1', tradeId: 'trade-1', escrowId: 'escrow-1', arbiterId: 'arbiter-1', status: 'OPENED' })
    mockDisputeUpdate.mockResolvedValue({ id: 'dispute-1', status: 'RESOLVED', ruling: 'REFUND' })

    await service.resolveDispute('dispute-1', 'arbiter-1', 'REFUND')
    expect(mockRefundFunds).toHaveBeenCalledWith('escrow-1', 'arbiter-1')
  })

  it('rejects a resolution from anyone but the assigned arbiter', async () => {
    mockDisputeFindUnique.mockResolvedValue({ id: 'dispute-1', tradeId: 'trade-1', escrowId: 'escrow-1', arbiterId: 'arbiter-1', status: 'OPENED' })
    await expect(service.resolveDispute('dispute-1', 'impostor', 'REFUND')).rejects.toThrow(/not the arbiter/)
    expect(mockRefundFunds).not.toHaveBeenCalled()
  })

  // BACKLOG.md's own "Participant payout address" gap, closed 2026-08-04
  // — resolveDispute() no longer pre-validates address presence itself;
  // it forwards through to escrowService.releaseFunds(), whose own
  // resolvePayoutAddress() falls back to a registered PayoutAddress and
  // only throws if neither that nor an explicit address exists. This
  // test now asserts that forwarding, not an upfront rejection.
  it('forwards an omitted releaseToAddress through to escrowService.releaseFunds() rather than rejecting upfront', async () => {
    mockDisputeFindUnique.mockResolvedValue({ id: 'dispute-1', tradeId: 'trade-1', escrowId: 'escrow-1', arbiterId: 'arbiter-1', status: 'OPENED' })
    mockDisputeUpdate.mockResolvedValue({ id: 'dispute-1', status: 'RESOLVED', ruling: 'RELEASE' })
    await service.resolveDispute('dispute-1', 'arbiter-1', 'RELEASE')
    expect(mockReleaseFunds).toHaveBeenCalledWith('escrow-1', undefined, 'arbiter-1')
  })

  // RFC-021 D9 (2026-08-02) — the third §1.9 dispute-ruling option finally
  // has a real settlement action.
  describe('resolveDispute SPLIT (RFC-021 D9)', () => {
    it('rejects SPLIT missing splitBuyerBps — addresses alone are no longer required upfront (2026-08-04, PayoutAddress fallback)', async () => {
      mockDisputeFindUnique.mockResolvedValue({ id: 'dispute-1', tradeId: 'trade-1', escrowId: 'escrow-1', arbiterId: 'arbiter-1', status: 'OPENED' })
      await expect(service.resolveDispute('dispute-1', 'arbiter-1', 'SPLIT', 'bc1qbuyer', 'bc1qseller')).rejects.toThrow(/splitBuyerBps/)
      expect(mockSplitFunds).not.toHaveBeenCalled()
    })

    it('calls escrowService.splitFunds() directly for a MOCK/WDK-style escrow', async () => {
      mockDisputeFindUnique.mockResolvedValue({ id: 'dispute-1', tradeId: 'trade-1', escrowId: 'escrow-1', arbiterId: 'arbiter-1', status: 'OPENED' })
      mockDisputeUpdate.mockResolvedValue({ id: 'dispute-1', status: 'RESOLVED', ruling: 'SPLIT' })

      await service.resolveDispute('dispute-1', 'arbiter-1', 'SPLIT', 'bc1qbuyer', 'bc1qseller', 6000)

      expect(mockSplitFunds).toHaveBeenCalledWith('escrow-1', 'bc1qbuyer', 'bc1qseller', 6000, 'arbiter-1')
      expect(mockInitiateSplit).not.toHaveBeenCalled()
      expect(mockEmit).toHaveBeenCalledWith(
        'dispute.resolved',
        expect.objectContaining({ ruling: 'SPLIT', tradeId: 'trade-1' }),
        'trade-1'
      )
    })

    it('routes to initiateSplit() instead for a signature-collection escrow (MULTISIG/LIGHTNING_HODL/SAFE_GUARD_EVM)', async () => {
      mockDisputeFindUnique.mockResolvedValue({ id: 'dispute-1', tradeId: 'trade-1', escrowId: 'escrow-1', arbiterId: 'arbiter-1', status: 'OPENED' })
      mockDisputeUpdate.mockResolvedValue({ id: 'dispute-1', status: 'RESOLVED', ruling: 'SPLIT' })
      mockIsSignatureCollectionType.mockReturnValueOnce(true)

      await service.resolveDispute('dispute-1', 'arbiter-1', 'SPLIT', 'bc1qbuyer', 'bc1qseller', 4000)

      expect(mockInitiateSplit).toHaveBeenCalledWith('escrow-1', 'bc1qbuyer', 'bc1qseller', 4000, 'arbiter-1')
      expect(mockSplitFunds).not.toHaveBeenCalled()
    })

    it('reverts the dispute to its prior state if the underlying settlement action throws (e.g. SAFE_GUARD_EVM/LIGHTNING_HODL rejecting an unsupported split)', async () => {
      mockDisputeFindUnique.mockResolvedValue({ id: 'dispute-1', tradeId: 'trade-1', escrowId: 'escrow-1', arbiterId: 'arbiter-1', status: 'OPENED' })
      mockDisputeUpdate.mockResolvedValue({ id: 'dispute-1', status: 'RESOLVED', ruling: 'SPLIT' })
      mockIsSignatureCollectionType.mockReturnValueOnce(true)
      mockInitiateSplit.mockRejectedValueOnce(new Error('SPLIT is not supported for this escrow type'))

      await expect(service.resolveDispute('dispute-1', 'arbiter-1', 'SPLIT', 'bc1qbuyer', 'bc1qseller', 4000)).rejects.toThrow(
        /SPLIT is not supported/
      )
      // Reverted back to the dispute's own pre-resolution status, ruling cleared.
      expect(mockDisputeUpdate).toHaveBeenLastCalledWith({
        where: { id: 'dispute-1' },
        data: { status: 'OPENED', ruling: null, resolvedAt: null },
      })
    })
  })

  // RFC-021 D9 (2026-08-02) — real bug found while building SPLIT:
  // applyRuling() used to call escrowService.releaseFunds()/refundFunds()
  // unconditionally, but those throw "not directly callable" for
  // MULTISIG/LIGHTNING_HODL/SAFE_GUARD_EVM (client-held keys). Fixed for
  // all three rulings, not just SPLIT — see escrowService.
  // isSignatureCollectionType()'s own comment.
  describe('resolveDispute RELEASE/REFUND — signature-collection dispatch fix (RFC-021 D9)', () => {
    it('routes RELEASE to initiateRelease() instead of releaseFunds() for a signature-collection escrow', async () => {
      mockDisputeFindUnique.mockResolvedValue({ id: 'dispute-1', tradeId: 'trade-1', escrowId: 'escrow-1', arbiterId: 'arbiter-1', status: 'OPENED' })
      mockDisputeUpdate.mockResolvedValue({ id: 'dispute-1', status: 'RESOLVED', ruling: 'RELEASE' })
      mockIsSignatureCollectionType.mockReturnValueOnce(true)

      await service.resolveDispute('dispute-1', 'arbiter-1', 'RELEASE', 'bc1qbuyeraddress')

      expect(mockInitiateRelease).toHaveBeenCalledWith('escrow-1', 'bc1qbuyeraddress', 'arbiter-1')
      expect(mockReleaseFunds).not.toHaveBeenCalled()
    })

    it('routes REFUND to initiateRefund() instead of refundFunds() for a signature-collection escrow', async () => {
      mockDisputeFindUnique.mockResolvedValue({ id: 'dispute-1', tradeId: 'trade-1', escrowId: 'escrow-1', arbiterId: 'arbiter-1', status: 'OPENED' })
      mockDisputeUpdate.mockResolvedValue({ id: 'dispute-1', status: 'RESOLVED', ruling: 'REFUND' })
      mockIsSignatureCollectionType.mockReturnValueOnce(true)

      await service.resolveDispute('dispute-1', 'arbiter-1', 'REFUND')

      expect(mockInitiateRefund).toHaveBeenCalledWith('escrow-1', 'arbiter-1')
      expect(mockRefundFunds).not.toHaveBeenCalled()
    })
  })
})

// A minimal ArbitrationProvider stub implementing the three RFC-021 D6
// optional methods — stands in for MarketArbitrationProvider (which has
// its own real-math unit tests in marketArbitrationProvider.test.ts) so
// these tests can focus purely on DisputeService's own orchestration:
// does it call assignAppealPanel/slash/recordRuling with the right
// arguments, at the right time, and not at all when it shouldn't.
function marketProviderStub() {
  const mockAssignAppealPanel = jest.fn()
  const mockSlash = jest.fn().mockResolvedValue({})
  const mockRecordRuling = jest.fn().mockResolvedValue(undefined)
  const provider = {
    name: 'market-arbitration',
    arbitrators: [] as string[],
    assign: jest.fn(),
    assignAppealPanel: (...args: unknown[]) => mockAssignAppealPanel(...args),
    slash: (...args: unknown[]) => mockSlash(...args),
    recordRuling: (...args: unknown[]) => mockRecordRuling(...args),
  }
  return { provider, mockAssignAppealPanel, mockSlash, mockRecordRuling }
}

describe('DisputeService — appeal() (RFC-021 D6)', () => {
  const { provider: marketProvider, mockAssignAppealPanel } = marketProviderStub()
  const marketService = new DisputeService(marketProvider as any)

  beforeEach(() => jest.clearAllMocks())

  it('rejects appealing a dispute that is not RESOLVED', async () => {
    mockDisputeFindUnique.mockResolvedValue({ id: 'dispute-1', status: 'OPENED' })
    await expect(marketService.appeal('dispute-1', 'buyer-1')).rejects.toThrow(/only a RESOLVED dispute can be appealed/)
  })

  it('rejects an appeal from someone who is not a party to the trade', async () => {
    mockDisputeFindUnique.mockResolvedValue({ id: 'dispute-1', status: 'RESOLVED', tradeId: 'trade-1' })
    mockTradeFindUnique.mockResolvedValue({ id: 'trade-1', buyerId: 'buyer-1', sellerId: 'seller-1' })
    await expect(marketService.appeal('dispute-1', 'stranger')).rejects.toThrow(/not a party/)
  })

  it('surfaces a clear config error under trusted-list mode instead of a crash', async () => {
    mockDisputeFindUnique.mockResolvedValue({ id: 'dispute-1', status: 'RESOLVED', tradeId: 'trade-1' })
    mockTradeFindUnique.mockResolvedValue({ id: 'trade-1', buyerId: 'buyer-1', sellerId: 'seller-1' })
    const trustedService = new DisputeService(new TrustedArbitratorProvider(['arbiter-1']))
    await expect(trustedService.appeal('dispute-1', 'buyer-1')).rejects.toThrow(/ARBITRATION_MODE=market/)
  })

  it('reopens the dispute, draws a new arbiter excluding the original, and computes the appeal fee', async () => {
    mockDisputeFindUnique.mockResolvedValue({
      id: 'dispute-1', status: 'RESOLVED', tradeId: 'trade-1', escrowId: 'escrow-1',
      arbiterId: 'original-arbiter', ruling: 'RELEASE', appealRound: 0,
    })
    mockTradeFindUnique.mockResolvedValue({ id: 'trade-1', buyerId: 'buyer-1', sellerId: 'seller-1' })
    mockAssignAppealPanel.mockResolvedValue('new-arbiter')
    mockEscrowFindUnique.mockResolvedValue({ id: 'escrow-1', feeCharged: '1.0' })
    mockDisputeUpdate.mockResolvedValue({ id: 'dispute-1', status: 'APPEALED', arbiterId: 'new-arbiter', appealRound: 1 })

    const result = await marketService.appeal('dispute-1', 'seller-1')

    expect(mockAssignAppealPanel).toHaveBeenCalledWith('dispute-1', 'trade-1', 1, 'original-arbiter')
    expect(mockDisputeUpdate).toHaveBeenCalledWith({
      where: { id: 'dispute-1' },
      data: {
        status: 'APPEALED',
        appealRound: 1,
        previousRuling: 'RELEASE',
        previousArbiterId: 'original-arbiter',
        arbiterId: 'new-arbiter',
        ruling: null,
        resolvedAt: null,
      },
    })
    expect(result.appealFeeRequired).toBe('2.00000000') // 1.0 * APPEAL_FEE_MULTIPLIER(2)
    expect(mockEmit).toHaveBeenCalledWith(
      'dispute.appealed',
      expect.objectContaining({ disputeId: 'dispute-1', tradeId: 'trade-1', round: 1, newArbiterId: 'new-arbiter' }),
      'trade-1'
    )
    // Real charge (2026-08-01), not just a computed-and-returned number —
    // see dispute.service.ts's own header comment on APPEAL_FEE_MULTIPLIER.
    expect(mockDisputeAppealFeeCreate).toHaveBeenCalledWith({
      data: {
        disputeId: 'dispute-1',
        appealRound: 1,
        requestedBy: 'seller-1',
        amount: '2.00000000',
        asset: 'BTC',
      },
    })
  })
})

// RFC-021 D6 real appeal-fee settlement (2026-08-01) — resolveDispute()'s
// other new behavior alongside the slashing block above, same
// dispute.previousRuling-vs-ruling comparison, different outcome table.
describe('DisputeService — resolveDispute() appeal-fee settlement (RFC-021 D6)', () => {
  const { provider: marketProvider } = marketProviderStub()
  const marketService = new DisputeService(marketProvider as any)

  beforeEach(() => {
    jest.clearAllMocks()
    mockEscrowFindUnique.mockResolvedValue({ id: 'escrow-1', feeCharged: null })
  })

  it('forfeits the appeal fee when the panel upholds the original ruling (denied, frivolous appeal)', async () => {
    mockDisputeFindUnique.mockResolvedValue({
      id: 'dispute-1', tradeId: 'trade-1', escrowId: 'escrow-1', arbiterId: 'new-arbiter', status: 'APPEALED',
      previousRuling: 'RELEASE', previousArbiterId: 'original-arbiter', appealRound: 1,
    })
    mockDisputeUpdate.mockResolvedValue({ id: 'dispute-1', status: 'RESOLVED', ruling: 'RELEASE' })

    await marketService.resolveDispute('dispute-1', 'new-arbiter', 'RELEASE', 'bc1qbuyer')

    expect(mockDisputeAppealFeeUpdateMany).toHaveBeenCalledWith({
      where: { disputeId: 'dispute-1', appealRound: 1, outcome: null },
      data: { outcome: 'FORFEITED', settledAt: expect.any(Date) },
    })
  })

  it('refunds the appeal fee when the panel overturns the original ruling', async () => {
    mockDisputeFindUnique.mockResolvedValue({
      id: 'dispute-1', tradeId: 'trade-1', escrowId: 'escrow-1', arbiterId: 'new-arbiter', status: 'APPEALED',
      previousRuling: 'RELEASE', previousArbiterId: 'original-arbiter', appealRound: 1,
    })
    mockDisputeUpdate.mockResolvedValue({ id: 'dispute-1', status: 'RESOLVED', ruling: 'REFUND' })

    await marketService.resolveDispute('dispute-1', 'new-arbiter', 'REFUND')

    expect(mockDisputeAppealFeeUpdateMany).toHaveBeenCalledWith({
      where: { disputeId: 'dispute-1', appealRound: 1, outcome: null },
      data: { outcome: 'REFUNDED', settledAt: expect.any(Date) },
    })
  })

  it('does not touch appeal-fee settlement on an ordinary first-instance (non-appeal) resolution', async () => {
    mockDisputeFindUnique.mockResolvedValue({
      id: 'dispute-1', tradeId: 'trade-1', escrowId: 'escrow-1', arbiterId: 'arbiter-1', status: 'OPENED',
      previousRuling: null, previousArbiterId: null, appealRound: 0,
    })
    mockDisputeUpdate.mockResolvedValue({ id: 'dispute-1', status: 'RESOLVED', ruling: 'REFUND' })

    await marketService.resolveDispute('dispute-1', 'arbiter-1', 'REFUND')

    expect(mockDisputeAppealFeeUpdateMany).not.toHaveBeenCalled()
  })
})

describe('DisputeService — resolveDispute() slashing on overturn (RFC-021 D6)', () => {
  const { provider: marketProvider, mockSlash, mockRecordRuling } = marketProviderStub()
  const marketService = new DisputeService(marketProvider as any)

  beforeEach(() => {
    jest.clearAllMocks()
    // RFC-021 D4, Phase 3 default: no fee charged on this escrow — most
    // tests below aren't about feeObserved, so a null default keeps the
    // recordRuling() assertions simple; the one test that IS about the
    // fee dimension overrides this explicitly.
    mockEscrowFindUnique.mockResolvedValue({ id: 'escrow-1', feeCharged: null })
  })

  it('slashes the original arbiter when an appeal panel overturns their ruling', async () => {
    mockDisputeFindUnique.mockResolvedValue({
      id: 'dispute-1', tradeId: 'trade-1', escrowId: 'escrow-1', arbiterId: 'new-arbiter', status: 'APPEALED',
      previousRuling: 'RELEASE', previousArbiterId: 'original-arbiter',
    })
    mockDisputeUpdate.mockResolvedValue({ id: 'dispute-1', status: 'RESOLVED', ruling: 'REFUND' })

    await marketService.resolveDispute('dispute-1', 'new-arbiter', 'REFUND')

    expect(mockSlash).toHaveBeenCalledWith('original-arbiter')
    expect(mockRecordRuling).toHaveBeenCalledWith('new-arbiter', undefined)
  })

  it('does NOT slash when the appeal panel upholds the original ruling — a denied, not frivolous-punished, appeal', async () => {
    mockDisputeFindUnique.mockResolvedValue({
      id: 'dispute-1', tradeId: 'trade-1', escrowId: 'escrow-1', arbiterId: 'new-arbiter', status: 'APPEALED',
      previousRuling: 'RELEASE', previousArbiterId: 'original-arbiter',
    })
    mockDisputeUpdate.mockResolvedValue({ id: 'dispute-1', status: 'RESOLVED', ruling: 'RELEASE' })

    await marketService.resolveDispute('dispute-1', 'new-arbiter', 'RELEASE', 'bc1qbuyer')

    expect(mockSlash).not.toHaveBeenCalled()
    expect(mockRecordRuling).toHaveBeenCalledWith('new-arbiter', undefined)
  })

  it('does not attempt to slash on an ordinary first-instance (non-appeal) resolution', async () => {
    mockDisputeFindUnique.mockResolvedValue({
      id: 'dispute-1', tradeId: 'trade-1', escrowId: 'escrow-1', arbiterId: 'arbiter-1', status: 'OPENED',
      previousRuling: null, previousArbiterId: null,
    })
    mockDisputeUpdate.mockResolvedValue({ id: 'dispute-1', status: 'RESOLVED', ruling: 'REFUND' })

    await marketService.resolveDispute('dispute-1', 'arbiter-1', 'REFUND')

    expect(mockSlash).not.toHaveBeenCalled()
    expect(mockRecordRuling).toHaveBeenCalledWith('arbiter-1', undefined)
  })

  // RFC-021 D4, Phase 3 — the arbiter-side half of cumulativeFeesObserved.
  it('passes the resolved escrow\'s real feeCharged through to recordRuling()', async () => {
    mockDisputeFindUnique.mockResolvedValue({
      id: 'dispute-1', tradeId: 'trade-1', escrowId: 'escrow-1', arbiterId: 'arbiter-1', status: 'OPENED',
      previousRuling: null, previousArbiterId: null,
    })
    mockDisputeUpdate.mockResolvedValue({ id: 'dispute-1', status: 'RESOLVED', ruling: 'RELEASE' })
    mockEscrowFindUnique.mockResolvedValue({ id: 'escrow-1', feeCharged: '0.5' })

    await marketService.resolveDispute('dispute-1', 'arbiter-1', 'RELEASE', 'bc1qbuyer')

    expect(mockRecordRuling).toHaveBeenCalledWith('arbiter-1', '0.5')
  })
})

describe('DisputeService — submitEvidence() (RFC-021 D8)', () => {
  const service = new DisputeService(new TrustedArbitratorProvider(['arbiter-1']))

  beforeEach(() => jest.clearAllMocks())

  it('appends evidence, transitions OPENED -> EVIDENCE_SUBMITTED, and emits the event finally reachable after this pass', async () => {
    mockDisputeFindUnique.mockResolvedValue({
      id: 'dispute-1', tradeId: 'trade-1', escrowId: 'escrow-1', status: 'OPENED', evidence: [],
    })
    mockTradeFindUnique.mockResolvedValue({ id: 'trade-1', buyerId: 'buyer-1', sellerId: 'seller-1' })
    mockDisputeUpdate.mockResolvedValue({ id: 'dispute-1', status: 'EVIDENCE_SUBMITTED' })

    await service.submitEvidence('dispute-1', 'buyer-1', { type: 'payment_receipt', note: 'bank confirmation' })

    expect(mockDisputeUpdate).toHaveBeenCalledWith({
      where: { id: 'dispute-1' },
      data: {
        evidence: [expect.objectContaining({ type: 'payment_receipt', note: 'bank confirmation', submittedBy: 'buyer-1' })],
        status: 'EVIDENCE_SUBMITTED',
      },
    })
    expect(mockEmit).toHaveBeenCalledWith(
      'dispute.evidence_submitted',
      expect.objectContaining({ disputeId: 'dispute-1', tradeId: 'trade-1', triggeredBy: 'buyer-1' }),
      'trade-1'
    )
  })

  it('appends to existing evidence rather than overwriting it', async () => {
    mockDisputeFindUnique.mockResolvedValue({
      id: 'dispute-1', tradeId: 'trade-1', escrowId: 'escrow-1', status: 'EVIDENCE_SUBMITTED',
      evidence: [{ type: 'chat_log', submittedBy: 'seller-1', submittedAt: '2026-01-01T00:00:00.000Z' }],
    })
    mockTradeFindUnique.mockResolvedValue({ id: 'trade-1', buyerId: 'buyer-1', sellerId: 'seller-1' })
    mockDisputeUpdate.mockResolvedValue({})

    await service.submitEvidence('dispute-1', 'seller-1', { type: 'payment_receipt' })

    const call = mockDisputeUpdate.mock.calls[0][0]
    expect(call.data.evidence).toHaveLength(2)
    expect(call.data.evidence[0].type).toBe('chat_log')
    expect(call.data.evidence[1].type).toBe('payment_receipt')
  })

  it('rejects a submitter who is not a party to the trade', async () => {
    mockDisputeFindUnique.mockResolvedValue({ id: 'dispute-1', tradeId: 'trade-1', escrowId: 'escrow-1', status: 'OPENED', evidence: [] })
    mockTradeFindUnique.mockResolvedValue({ id: 'trade-1', buyerId: 'buyer-1', sellerId: 'seller-1' })

    await expect(service.submitEvidence('dispute-1', 'not-a-party', { type: 'payment_receipt' })).rejects.toThrow('is not a party to trade')
    expect(mockDisputeUpdate).not.toHaveBeenCalled()
  })

  it('rejects new evidence once the dispute has moved past evidence-gathering (RESOLVED/APPEALED/AUTO_PROPOSED)', async () => {
    mockDisputeFindUnique.mockResolvedValue({ id: 'dispute-1', tradeId: 'trade-1', escrowId: 'escrow-1', status: 'RESOLVED', evidence: [] })
    mockTradeFindUnique.mockResolvedValue({ id: 'trade-1', buyerId: 'buyer-1', sellerId: 'seller-1' })

    await expect(service.submitEvidence('dispute-1', 'buyer-1', { type: 'payment_receipt' })).rejects.toThrow('cannot accept new evidence')
  })
})

describe('DisputeService — proposeAutoResolution() / contestAutoResolution() (RFC-021 D8)', () => {
  const service = new DisputeService(new TrustedArbitratorProvider(['arbiter-1']))

  beforeEach(() => jest.clearAllMocks())

  it('atomically claims an open dispute and moves it to AUTO_PROPOSED with the recommendation attached', async () => {
    mockDisputeFindUnique
      .mockResolvedValueOnce({ id: 'dispute-1', tradeId: 'trade-1', escrowId: 'escrow-1', status: 'EVIDENCE_SUBMITTED' })
      .mockResolvedValueOnce({ id: 'dispute-1', status: 'AUTO_PROPOSED' })
    mockDisputeUpdateMany.mockResolvedValue({ count: 1 })

    const result = await service.proposeAutoResolution('dispute-1', 'RELEASE', 0.92, 'clear matching receipt')

    expect(mockDisputeUpdateMany).toHaveBeenCalledWith({
      where: { id: 'dispute-1', status: { in: ['OPENED', 'EVIDENCE_SUBMITTED'] }, ruling: null },
      data: expect.objectContaining({
        status: 'AUTO_PROPOSED',
        autoResolutionRecommendation: 'RELEASE',
        autoResolutionConfidence: 0.92,
        autoResolutionReasoning: 'clear matching receipt',
      }),
    })
    expect(mockEmit).toHaveBeenCalledWith(
      'dispute.auto_resolution_proposed',
      expect.objectContaining({ disputeId: 'dispute-1', recommendation: 'RELEASE', confidence: 0.92 }),
      'trade-1'
    )
    expect(result).toEqual({ id: 'dispute-1', status: 'AUTO_PROPOSED' })
  })

  it('loses the race cleanly (returns null, no event) when a human arbiter already resolved/appealed the dispute', async () => {
    mockDisputeFindUnique.mockResolvedValue({ id: 'dispute-1', tradeId: 'trade-1', escrowId: 'escrow-1', status: 'RESOLVED' })
    mockDisputeUpdateMany.mockResolvedValue({ count: 0 })

    const result = await service.proposeAutoResolution('dispute-1', 'REFUND', 0.9, 'r')

    expect(result).toBeNull()
    expect(mockEmit).not.toHaveBeenCalled()
  })

  it('contestAutoResolution reverts to EVIDENCE_SUBMITTED and clears the auto-resolution fields', async () => {
    mockDisputeFindUnique.mockResolvedValue({
      id: 'dispute-1', tradeId: 'trade-1', escrowId: 'escrow-1', status: 'AUTO_PROPOSED',
      autoResolutionDeadline: new Date(Date.now() + 3600_000),
    })
    mockTradeFindUnique.mockResolvedValue({ id: 'trade-1', buyerId: 'buyer-1', sellerId: 'seller-1' })
    mockDisputeUpdate.mockResolvedValue({ id: 'dispute-1', status: 'EVIDENCE_SUBMITTED' })

    await service.contestAutoResolution('dispute-1', 'seller-1')

    expect(mockDisputeUpdate).toHaveBeenCalledWith({
      where: { id: 'dispute-1' },
      data: {
        status: 'EVIDENCE_SUBMITTED',
        autoResolutionRecommendation: null,
        autoResolutionConfidence: null,
        autoResolutionReasoning: null,
        autoResolutionDeadline: null,
      },
    })
    expect(mockEmit).toHaveBeenCalledWith(
      'dispute.auto_resolution_contested',
      expect.objectContaining({ disputeId: 'dispute-1', contestedBy: 'seller-1' }),
      'trade-1'
    )
  })

  it('rejects a contest from someone who is not a party to the trade', async () => {
    mockDisputeFindUnique.mockResolvedValue({ id: 'dispute-1', tradeId: 'trade-1', escrowId: 'escrow-1', status: 'AUTO_PROPOSED', autoResolutionDeadline: new Date(Date.now() + 3600_000) })
    mockTradeFindUnique.mockResolvedValue({ id: 'trade-1', buyerId: 'buyer-1', sellerId: 'seller-1' })

    await expect(service.contestAutoResolution('dispute-1', 'not-a-party')).rejects.toThrow('is not a party to trade')
  })

  it('rejects a contest once the window has already closed', async () => {
    mockDisputeFindUnique.mockResolvedValue({
      id: 'dispute-1', tradeId: 'trade-1', escrowId: 'escrow-1', status: 'AUTO_PROPOSED',
      autoResolutionDeadline: new Date(Date.now() - 1000),
    })
    mockTradeFindUnique.mockResolvedValue({ id: 'trade-1', buyerId: 'buyer-1', sellerId: 'seller-1' })

    await expect(service.contestAutoResolution('dispute-1', 'buyer-1')).rejects.toThrow('contest window has already closed')
  })

  it('rejects a contest when there is no pending automated resolution at all', async () => {
    mockDisputeFindUnique.mockResolvedValue({ id: 'dispute-1', tradeId: 'trade-1', escrowId: 'escrow-1', status: 'EVIDENCE_SUBMITTED' })
    mockTradeFindUnique.mockResolvedValue({ id: 'trade-1', buyerId: 'buyer-1', sellerId: 'seller-1' })

    await expect(service.contestAutoResolution('dispute-1', 'buyer-1')).rejects.toThrow('no pending automated resolution')
  })
})

describe('DisputeService — sweepExpiredAutoResolutions() (RFC-021 D8)', () => {
  const service = new DisputeService(new TrustedArbitratorProvider(['arbiter-1']))

  beforeEach(() => jest.clearAllMocks())

  it('applies an uncontested REFUND recommendation via the already-assigned arbiter\'s identity — escrow.service.ts\'s authorization is untouched', async () => {
    mockDisputeFindMany.mockResolvedValue([
      { id: 'dispute-1', tradeId: 'trade-1', escrowId: 'escrow-1', status: 'AUTO_PROPOSED', arbiterId: 'arbiter-1', autoResolutionRecommendation: 'REFUND' },
    ])
    mockDisputeUpdate.mockResolvedValue({ id: 'dispute-1', status: 'RESOLVED' })

    const result = await service.sweepExpiredAutoResolutions()

    expect(mockRefundFunds).toHaveBeenCalledWith('escrow-1', 'arbiter-1')
    expect(mockDisputeUpdate).toHaveBeenCalledWith({ where: { id: 'dispute-1' }, data: { autoResolved: true } })
    expect(result.resolved).toEqual(['dispute-1'])
    expect(result.failed).toEqual([])
  })

  it('refuses to auto-apply a RELEASE recommendation — no real payout address exists to use, a real disclosed gap, not fabricated from a participant id', async () => {
    mockDisputeFindMany.mockResolvedValue([
      { id: 'dispute-1', tradeId: 'trade-1', escrowId: 'escrow-1', status: 'AUTO_PROPOSED', arbiterId: 'arbiter-1', autoResolutionRecommendation: 'RELEASE' },
    ])

    const result = await service.sweepExpiredAutoResolutions()

    expect(mockReleaseFunds).not.toHaveBeenCalled()
    expect(result.resolved).toEqual([])
    expect(result.failed).toEqual([{ disputeId: 'dispute-1', error: expect.stringContaining('needs a real payout address') }])
  })

  it('collects failures per-dispute without letting one bad row stop the rest of the sweep', async () => {
    mockDisputeFindMany.mockResolvedValue([
      { id: 'dispute-1', tradeId: 'trade-1', escrowId: 'escrow-1', status: 'AUTO_PROPOSED', arbiterId: null, autoResolutionRecommendation: 'REFUND' },
      { id: 'dispute-2', tradeId: 'trade-2', escrowId: 'escrow-2', status: 'AUTO_PROPOSED', arbiterId: 'arbiter-1', autoResolutionRecommendation: 'REFUND' },
    ])
    mockDisputeUpdate.mockResolvedValue({})

    const result = await service.sweepExpiredAutoResolutions()

    expect(result.failed).toEqual([{ disputeId: 'dispute-1', error: expect.stringContaining('no assigned arbiterId') }])
    expect(result.resolved).toEqual(['dispute-2'])
  })
})

// UI-audit gap (2026-08-03, sails-ui SLC audit relayed via the parallel UI
// session) — every dispute action above was real and callable, but the
// operator/arbiter console had no way to discover a disputeId to call
// them with. getDispute()/listForArbiter() are the fetch this closes.
describe('DisputeService — getDispute() / listForArbiter() (UI-audit gap, 2026-08-03)', () => {
  const service = new DisputeService(new TrustedArbitratorProvider(['arbiter-1']))

  beforeEach(() => jest.clearAllMocks())

  it('getDispute returns the real dispute row for a valid id', async () => {
    mockDisputeFindUnique.mockResolvedValue({ id: 'dispute-1', arbiterId: 'arbiter-1', status: 'OPENED' })
    const dispute = await service.getDispute('dispute-1')
    expect(dispute).toEqual({ id: 'dispute-1', arbiterId: 'arbiter-1', status: 'OPENED' })
  })

  it('getDispute throws NotFoundError for an unknown id', async () => {
    mockDisputeFindUnique.mockResolvedValue(null)
    await expect(service.getDispute('nope')).rejects.toThrow(/Dispute/)
  })

  it('listForArbiter scopes the query to the given arbiterId — never a client-supplied filter', async () => {
    mockDisputeFindMany.mockResolvedValue([{ id: 'dispute-1', arbiterId: 'arbiter-1' }])
    mockDisputeCount.mockResolvedValue(1)

    const result = await service.listForArbiter('arbiter-1')

    expect(mockDisputeFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { arbiterId: 'arbiter-1' } })
    )
    expect(mockDisputeCount).toHaveBeenCalledWith(expect.objectContaining({ where: { arbiterId: 'arbiter-1' } }))
    expect(result).toEqual({ disputes: [{ id: 'dispute-1', arbiterId: 'arbiter-1' }], total: 1, hasMore: false })
  })

  it('clamps pagination the same way trade.service.ts\'s getTrades() does (limit 1-50, default 10)', async () => {
    mockDisputeFindMany.mockResolvedValue([])
    mockDisputeCount.mockResolvedValue(0)

    await service.listForArbiter('arbiter-1', { limit: 500, offset: -5 })

    expect(mockDisputeFindMany).toHaveBeenCalledWith(expect.objectContaining({ take: 50, skip: 0 }))
  })

  it('hasMore is true when more rows exist beyond this page', async () => {
    mockDisputeFindMany.mockResolvedValue([{ id: 'd1' }, { id: 'd2' }])
    mockDisputeCount.mockResolvedValue(5)

    const result = await service.listForArbiter('arbiter-1', { limit: 2, offset: 0 })

    expect(result.hasMore).toBe(true)
  })
})
