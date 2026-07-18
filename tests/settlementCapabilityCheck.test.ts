/**
 * RFC-014's second real capability-registry.ts caller: executeSettlement()'s
 * check before the actual USDT release (the highest-stakes line in
 * settlement-orchestrator.ts — the one that moves real, testnet funds).
 * Gated behind config.features.enforceCapabilities (default false), same
 * pattern as tests/intentCapabilityCheck.test.ts — kept as a separate file
 * for the same jest.mock-hoisting reason documented there.
 */
export {} // see chatUnification.test.ts's identical comment

let enforceCapabilities = false
jest.mock('../src/config', () => ({
  get config() {
    return { features: { enforceCapabilities } }
  },
}))

const mockCheck = jest.fn()
jest.mock('../src/core/capability-registry', () => ({
  capabilityRegistry: { check: (...args: unknown[]) => mockCheck(...args) },
  CAPABILITY_IMPLEMENTATIONS: { openp2p: 'trade-coordination', opensettlement: 'settlement' },
}))

const mockTradeFindUnique = jest.fn()
jest.mock('../src/common/database', () => ({
  prisma: { trade: { findUnique: (...args: unknown[]) => mockTradeFindUnique(...args) } },
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

describe('executeSettlement() — RFC-014 capability check (USDT release)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    enforceCapabilities = false
    mockTradeFindUnique.mockResolvedValue({
      id: 'trade-1', buyerId: 'buyer-1', sellerId: 'seller-1', amount: '20.5', asset: 'USDT_ERC20',
    })
    mockCreateEscrow.mockResolvedValue({ id: 'escrow-1', tradeId: 'trade-1' })
    mockLockFunds.mockResolvedValue({ id: 'escrow-1', status: 'FUNDS_LOCKED', txLockId: 'tx-lock-1' })
    mockMarkPaymentSent.mockResolvedValue({ id: 'escrow-1', status: 'PAYMENT_PENDING' })
    mockReleaseFunds.mockResolvedValue({ id: 'escrow-1', status: 'COMPLETED', txReleaseId: 'tx-release-1' })
  })

  it('never calls capabilityRegistry.check when enforceCapabilities is false (the default)', async () => {
    enforceCapabilities = false
    await executeSettlement({ tradeId: 'trade-1', buyerReceivingAddress: '0xbuyer' })
    expect(mockCheck).not.toHaveBeenCalled()
    expect(mockReleaseFunds).toHaveBeenCalled()
  })

  it('rejects with ForbiddenError before releaseFunds when enforcement is on and no grant covers it — lockFunds/markPaymentSent already ran', async () => {
    enforceCapabilities = true
    mockCheck.mockResolvedValue(false)

    await expect(
      executeSettlement({ tradeId: 'trade-1', buyerReceivingAddress: '0xbuyer' })
    ).rejects.toThrow(/no active 'settlement' capability grant/)

    expect(mockCheck).toHaveBeenCalledWith('seller-1', 'settlement', 'settlement.escrow.released')
    expect(mockLockFunds).toHaveBeenCalled() // escrow already locked before the release check
    expect(mockReleaseFunds).not.toHaveBeenCalled() // the actual fund movement never fires
  })

  it("checks the sellerAgentId (not the raw sellerId) when an agent is acting on the seller's behalf", async () => {
    enforceCapabilities = true
    mockCheck.mockResolvedValue(true)

    await executeSettlement({
      tradeId: 'trade-1', buyerReceivingAddress: '0xbuyer', sellerAgentId: 'agent:seller-wallet:seller-1',
    })

    expect(mockCheck).toHaveBeenCalledWith('agent:seller-wallet:seller-1', 'settlement', 'settlement.escrow.released')
    expect(mockReleaseFunds).toHaveBeenCalled()
  })

  it('proceeds normally when enforcement is on and a grant covers it', async () => {
    enforceCapabilities = true
    mockCheck.mockResolvedValue(true)

    const result = await executeSettlement({ tradeId: 'trade-1', buyerReceivingAddress: '0xbuyer' })
    expect(result.releaseTxId).toBe('tx-release-1')
    expect(mockCheck).toHaveBeenCalledWith('seller-1', 'settlement', 'settlement.escrow.released')
  })
})
