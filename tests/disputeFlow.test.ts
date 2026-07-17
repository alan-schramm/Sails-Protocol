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
