/**
 * Dispute flow + p2p-schemas — 04-Deepseek Review.md Tasks 1 & 2.
 *
 * Same mocking pattern as intentFlow.test.ts: Prisma/eventBus are mocked
 * to unit-test the real business logic (authorization, freeze-then-assign
 * ordering, ruling -> escrow action mapping) without a live Postgres.
 * deriveTradeState is a pure function — no mocking needed at all.
 */
import { deriveTradeState } from '@sails/p2p-schemas'
import { toOfferSchema } from '@sails/p2p-schemas'
import { TrustedArbitratorProvider } from '../src/modules/open-settlement/arbitration-provider'

const mockTradeFindUnique = jest.fn()
const mockDisputeCreate = jest.fn()
const mockDisputeFindUnique = jest.fn()
const mockDisputeUpdate = jest.fn()

jest.mock('../src/common/database', () => ({
  prisma: {
    trade: { findUnique: (...args: unknown[]) => mockTradeFindUnique(...args) },
    dispute: {
      create: (...args: unknown[]) => mockDisputeCreate(...args),
      findUnique: (...args: unknown[]) => mockDisputeFindUnique(...args),
      update: (...args: unknown[]) => mockDisputeUpdate(...args),
    },
  },
}))

const mockEmit = jest.fn().mockResolvedValue(undefined)
jest.mock('../src/common/events/event-bus', () => ({
  eventBus: { emit: (...args: unknown[]) => mockEmit(...args) },
}))

const mockOpenDispute = jest.fn().mockResolvedValue({})
const mockReleaseFunds = jest.fn().mockResolvedValue({})
const mockRefundFunds = jest.fn().mockResolvedValue({})
jest.mock('../src/modules/open-settlement/escrow.service', () => ({
  escrowService: {
    openDispute: (...args: unknown[]) => mockOpenDispute(...args),
    releaseFunds: (...args: unknown[]) => mockReleaseFunds(...args),
    refundFunds: (...args: unknown[]) => mockRefundFunds(...args),
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

  it('rejects RELEASE without a payout address instead of fabricating one', async () => {
    mockDisputeFindUnique.mockResolvedValue({ id: 'dispute-1', tradeId: 'trade-1', escrowId: 'escrow-1', arbiterId: 'arbiter-1', status: 'OPENED' })
    await expect(service.resolveDispute('dispute-1', 'arbiter-1', 'RELEASE')).rejects.toThrow(/releaseToAddress/)
  })
})
