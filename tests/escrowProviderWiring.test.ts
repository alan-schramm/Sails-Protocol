/**
 * escrow.service.ts's provider wiring — two things found/fixed while
 * building the real MultisigProvider (multisig.provider.ts):
 *
 * 1. createEscrow() now populates Escrow.multisigAddr immediately for a
 *    MULTISIG escrow, since (unlike MOCK/WDK_USDT_EVM) that provider never
 *    pushes funds into escrow itself — the seller needs the deposit
 *    address before any lockFunds() call, not only after.
 * 2. getProvider()'s old `PROVIDERS[type] ?? PROVIDERS['MOCK']` fallback
 *    silently mock-processed ANY unregistered escrow type (MULTISIG
 *    before this file existed, and still LIQUID_COVENANT today) — fixed
 *    to throw the same way LIGHTNING_HODL's own stub already did, instead
 *    of quietly faking a real-money-shaped escrow.
 *
 * multisig.provider.ts itself is mocked here — its own real cryptography
 * is exhaustively covered by tests/multisigProvider.test.ts; this file is
 * only about escrow.service.ts's wiring/routing logic around it.
 */
export {} // see chatUnification.test.ts's identical comment

let mockEscrowFeatureFlag = false // MULTISIG only matters with mockEscrow off
jest.mock('../src/config', () => ({
  get config() {
    return {
      features: { mockEscrow: mockEscrowFeatureFlag, enforceCapabilities: false, requireDualApprovalForRelease: false },
      trade: { defaultTimelockHours: 24 },
      settlement: { trustedArbitrators: ['arb-1'] },
      // Empty on purpose — lightning-hodl.provider.ts (real since the
      // Arkade build) is inert without it, same "clear config error"
      // pattern as multisig.provider.ts's own empty seed default below.
      arkade: { seed: '' },
    }
  },
}))

jest.mock('@tetherto/wdk-wallet-evm', () => ({
  __esModule: true,
  default: class FakeWalletManagerEvm {},
}))

// @arkade-os/sdk's CJS build still transitively requires @scure/btc-signer,
// which ships pure ESM (no CJS build) — same "Unexpected token 'export'"
// problem as @tetherto/wdk-wallet-evm above, same fix. None of these tests
// exercise lightning-hodl.provider.ts's real Arkade calls.
jest.mock('@arkade-os/sdk', () => ({
  SeedIdentity: { fromSeed: jest.fn() },
  MultisigTapscript: { encode: jest.fn() },
  CSVMultisigTapscript: { encode: jest.fn() },
  VtxoScript: class FakeVtxoScript {},
  RestArkProvider: class FakeRestArkProvider {},
  RestIndexerProvider: class FakeRestIndexerProvider {},
  buildOffchainTx: jest.fn(),
  combineTapscriptSigs: jest.fn(),
  verifyTapscriptSignatures: jest.fn(),
}))

const mockGetDepositAddress = jest.fn()
jest.mock('../src/modules/open-settlement/multisig.provider', () => ({
  multisigProvider: {
    name: 'MULTISIG',
    getDepositAddress: (...args: unknown[]) => mockGetDepositAddress(...args),
    lockFunds: jest.fn(),
    releaseFunds: jest.fn(),
    refundFunds: jest.fn(),
    verifyLock: jest.fn(),
  },
}))

const mockEscrowFindUnique = jest.fn()
const mockEscrowUpdate = jest.fn()
const mockEscrowUpdateMany = jest.fn().mockResolvedValue({ count: 1 })
const mockEscrowCreate = jest.fn()
const mockEscrowEventCreate = jest.fn()
const mockTradeFindUnique = jest.fn()

jest.mock('../src/common/database', () => ({
  prisma: {
    escrow: {
      findUnique: (...args: unknown[]) => mockEscrowFindUnique(...args),
      update: (...args: unknown[]) => mockEscrowUpdate(...args),
      updateMany: (...args: unknown[]) => mockEscrowUpdateMany(...args),
      create: (...args: unknown[]) => mockEscrowCreate(...args),
    },
    escrowEvent: { create: (...args: unknown[]) => mockEscrowEventCreate(...args) },
    trade: { findUnique: (...args: unknown[]) => mockTradeFindUnique(...args) },
  },
}))

import { escrowService } from '../src/modules/open-settlement/escrow.service'

describe('createEscrow() — MULTISIG deposit-address wiring', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockEscrowFeatureFlag = false
  })

  it('populates Escrow.multisigAddr from multisigProvider.getDepositAddress() right after creation', async () => {
    mockTradeFindUnique.mockResolvedValue({ id: 'trade-1', buyerId: 'buyer-1', sellerId: 'seller-1', escrowId: null })
    mockEscrowCreate.mockResolvedValue({ id: 'escrow-1', tradeId: 'trade-1', type: 'MULTISIG', asset: 'BTC', lockedAmount: '0.001', multisigAddr: null })
    mockGetDepositAddress.mockResolvedValue('tb1qexampleaddressxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx')
    mockEscrowUpdate.mockResolvedValue({
      id: 'escrow-1', tradeId: 'trade-1', type: 'MULTISIG', asset: 'BTC', lockedAmount: '0.001',
      multisigAddr: 'tb1qexampleaddressxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    })

    const result = await escrowService.createEscrow({ tradeId: 'trade-1', type: 'MULTISIG' as any, lockedAmount: '0.001', asset: 'BTC' as any })

    expect(mockGetDepositAddress).toHaveBeenCalledWith('trade-1', 'buyer-1', 'seller-1')
    expect(mockEscrowUpdate).toHaveBeenCalledWith({
      where: { id: 'escrow-1' },
      data: { multisigAddr: 'tb1qexampleaddressxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' },
    })
    expect(result.multisigAddr).toBe('tb1qexampleaddressxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx')
  })

  it('does NOT call getDepositAddress for a non-MULTISIG escrow', async () => {
    mockTradeFindUnique.mockResolvedValue({ id: 'trade-2', buyerId: 'buyer-1', sellerId: 'seller-1', escrowId: null })
    mockEscrowCreate.mockResolvedValue({ id: 'escrow-2', tradeId: 'trade-2', type: 'WDK_USDT_EVM', asset: 'USDT_ERC20', lockedAmount: '5' })

    await escrowService.createEscrow({ tradeId: 'trade-2', type: 'WDK_USDT_EVM' as any, lockedAmount: '5', asset: 'USDT_ERC20' as any })

    expect(mockGetDepositAddress).not.toHaveBeenCalled()
    expect(mockEscrowUpdate).not.toHaveBeenCalled()
  })

  it('skips deposit-address population when MOCK_ESCROW is on, even for a MULTISIG-typed escrow', async () => {
    mockEscrowFeatureFlag = true
    mockTradeFindUnique.mockResolvedValue({ id: 'trade-3', buyerId: 'buyer-1', sellerId: 'seller-1', escrowId: null })
    mockEscrowCreate.mockResolvedValue({ id: 'escrow-3', tradeId: 'trade-3', type: 'MULTISIG', asset: 'BTC', lockedAmount: '0.001' })

    await escrowService.createEscrow({ tradeId: 'trade-3', type: 'MULTISIG' as any, lockedAmount: '0.001', asset: 'BTC' as any })

    expect(mockGetDepositAddress).not.toHaveBeenCalled()
  })
})

describe('getProvider() — no more silent MOCK fallback for an unregistered real type', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockEscrowFeatureFlag = false
  })

  it('throws a clear error for LIQUID_COVENANT instead of silently mock-processing it', async () => {
    mockEscrowFindUnique.mockResolvedValue({
      id: 'escrow-4', tradeId: 'trade-4', type: 'LIQUID_COVENANT', status: 'CREATED', timelockHours: 24,
    })
    mockTradeFindUnique.mockResolvedValue({ id: 'trade-4', buyerId: 'buyer-1', sellerId: 'seller-1' })

    await expect(escrowService.lockFunds('escrow-4', 'seller-1')).rejects.toThrow(
      "No SettlementProvider registered for escrow type 'LIQUID_COVENANT'"
    )
  })

  it('LIGHTNING_HODL is registered (real since the Arkade build) and throws its own clear config error, not a fallback', async () => {
    mockEscrowFindUnique.mockResolvedValue({
      id: 'escrow-5', tradeId: 'trade-5', type: 'LIGHTNING_HODL', status: 'CREATED', timelockHours: 24,
    })
    mockTradeFindUnique.mockResolvedValue({ id: 'trade-5', buyerId: 'buyer-1', sellerId: 'seller-1' })

    await expect(escrowService.lockFunds('escrow-5', 'seller-1')).rejects.toThrow('ARKADE_SEED')
  })
})
