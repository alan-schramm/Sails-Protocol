/**
 * executeSettlement() — settlement-orchestrator.ts's composition logic.
 *
 * escrow.service.ts already has its own real state-machine logic exercised
 * indirectly via tests/routes.test.ts's HTTP round-trips; this suite mocks
 * it entirely (not its own prisma/wdk dependencies) so what's actually
 * verified here is the orchestrator's own job: reading the Trade, calling
 * the escrow lifecycle in the right order with the right arguments, and
 * producing an honestly-labeled emulated PIX confirmation — the same
 * "mock the boundary, test what's actually new" discipline the rest of
 * this test suite already follows.
 */
const mockTradeFindUnique = jest.fn()

jest.mock('../src/common/database', () => ({
  prisma: {
    trade: { findUnique: (...args: unknown[]) => mockTradeFindUnique(...args) },
  },
}))

const mockCreateEscrow = jest.fn()
const mockLockFunds = jest.fn()
const mockMarkPaymentSent = jest.fn()
const mockReleaseFunds = jest.fn()

jest.mock('../src/modules/open-settlement/escrow.service', () => ({
  escrowService: {
    createEscrow: (...args: unknown[]) => mockCreateEscrow(...args),
    lockFunds: (...args: unknown[]) => mockLockFunds(...args),
    markPaymentSent: (...args: unknown[]) => mockMarkPaymentSent(...args),
    releaseFunds: (...args: unknown[]) => mockReleaseFunds(...args),
  },
}))

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { executeSettlement } = require('../src/modules/open-settlement/settlement-orchestrator')

describe('executeSettlement (open-settlement)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockTradeFindUnique.mockResolvedValue({
      id: 'trade-1',
      buyerId: 'buyer-1',
      sellerId: 'seller-1',
      amount: '20.5',
      asset: 'USDT_ERC20',
    })
    mockCreateEscrow.mockResolvedValue({ id: 'escrow-1', tradeId: 'trade-1' })
    mockLockFunds.mockResolvedValue({ id: 'escrow-1', status: 'FUNDS_LOCKED', txLockId: 'tx-lock-1' })
    mockMarkPaymentSent.mockResolvedValue({ id: 'escrow-1', status: 'PAYMENT_PENDING' })
    mockReleaseFunds.mockResolvedValue({ id: 'escrow-1', status: 'COMPLETED', txReleaseId: 'tx-release-1' })
  })

  it('throws if the trade does not exist', async () => {
    mockTradeFindUnique.mockResolvedValue(null)

    await expect(
      executeSettlement({ tradeId: 'nope', buyerReceivingAddress: '0xabc' })
    ).rejects.toThrow(/Trade/)
    expect(mockCreateEscrow).not.toHaveBeenCalled()
  })

  it('runs the full sequence in order: createEscrow -> lockFunds -> markPaymentSent -> releaseFunds', async () => {
    const result = await executeSettlement({ tradeId: 'trade-1', buyerReceivingAddress: '0xbuyer' })

    expect(mockCreateEscrow).toHaveBeenCalledWith({
      tradeId: 'trade-1',
      type: 'WDK_USDT_EVM',
      lockedAmount: '20.5',
      asset: 'USDT_ERC20',
    })
    expect(mockLockFunds).toHaveBeenCalledWith('escrow-1', 'seller-1')
    expect(mockMarkPaymentSent).toHaveBeenCalledWith('escrow-1', 'buyer-1')
    expect(mockReleaseFunds).toHaveBeenCalledWith('escrow-1', '0xbuyer', 'seller-1')

    // call order matters: lockFunds before markPaymentSent before releaseFunds
    const order = [mockCreateEscrow, mockLockFunds, mockMarkPaymentSent, mockReleaseFunds]
      .map((fn) => fn.mock.invocationCallOrder[0])
    expect(order).toEqual([...order].sort((a, b) => a - b))

    expect(result.escrowId).toBe('escrow-1')
    expect(result.lockTxId).toBe('tx-lock-1')
    expect(result.releaseTxId).toBe('tx-release-1')
  })

  it('defaults triggeredBy to the trade.sellerId when no sellerAgentId is given', async () => {
    await executeSettlement({ tradeId: 'trade-1', buyerReceivingAddress: '0xbuyer' })
    expect(mockLockFunds).toHaveBeenCalledWith('escrow-1', 'seller-1')
    expect(mockReleaseFunds).toHaveBeenCalledWith('escrow-1', '0xbuyer', 'seller-1')
  })

  it('uses sellerAgentId as triggeredBy when provided (the Seller Agent acting on the seller\'s behalf)', async () => {
    await executeSettlement({
      tradeId: 'trade-1',
      buyerReceivingAddress: '0xbuyer',
      sellerAgentId: 'agent:seller-wallet:seller-1',
    })

    expect(mockLockFunds).toHaveBeenCalledWith('escrow-1', 'agent:seller-wallet:seller-1')
    expect(mockReleaseFunds).toHaveBeenCalledWith('escrow-1', '0xbuyer', 'agent:seller-wallet:seller-1')
  })

  it('produces an honestly-labeled emulated PIX confirmation, not one indistinguishable from a real proof', async () => {
    const result = await executeSettlement({ tradeId: 'trade-1', buyerReceivingAddress: '0xbuyer' })

    expect(result.pixConfirmation.emulated).toBe(true)
    expect(result.pixConfirmation.method).toBe('PIX')
    expect(result.pixConfirmation.confirmedBy).toBe('seller-1')
    expect(result.pixConfirmation.confirmedAt).toBeInstanceOf(Date)
    expect(result.pixConfirmation.reference).toMatch(/^emulated-pix-/)
  })

  it('respects a caller-supplied escrowType instead of always defaulting to WDK_USDT_EVM', async () => {
    await executeSettlement({ tradeId: 'trade-1', buyerReceivingAddress: '0xbuyer', escrowType: 'MOCK' })
    expect(mockCreateEscrow).toHaveBeenCalledWith(expect.objectContaining({ type: 'MOCK' }))
  })
})
