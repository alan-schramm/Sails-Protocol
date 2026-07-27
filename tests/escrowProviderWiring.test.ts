/**
 * escrow.service.ts's provider wiring — things found/fixed while building
 * the real MultisigProvider/LightningHodlProvider (multisig.provider.ts,
 * lightning-hodl.provider.ts):
 *
 * 1. getProvider()'s old `PROVIDERS[type] ?? PROVIDERS['MOCK']` fallback
 *    silently mock-processed ANY unregistered escrow type (MULTISIG/
 *    LIGHTNING_HODL before those files existed, still LIQUID_COVENANT
 *    today) — fixed to throw instead of quietly faking a real-money-shaped
 *    escrow.
 * 2. Client-held-keys pass (2026-07-27): createEscrow() no longer
 *    populates Escrow.multisigAddr immediately — it can't, since the
 *    address now depends on buyer/seller pubkeys submitted from their own
 *    clients, not server-derived IDs. submitParticipantKey() is the new
 *    write path: once BOTH buyer and seller pubkeys have arrived, it
 *    derives and persists the real address.
 *
 * multisig.provider.ts/lightning-hodl.provider.ts themselves are mocked
 * here — their own real cryptography is exhaustively covered by
 * tests/multisigProvider.test.ts / tests/lightningHodlProvider.test.ts;
 * this file is only about escrow.service.ts's wiring/routing logic
 * around them.
 */
export {} // see chatUnification.test.ts's identical comment

let mockEscrowFeatureFlag = false // MULTISIG/LIGHTNING_HODL only matter with mockEscrow off
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
const mockParticipantKeyUpsert = jest.fn()
const mockParticipantKeyFindMany = jest.fn()

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
    escrowParticipantKey: {
      upsert: (...args: unknown[]) => mockParticipantKeyUpsert(...args),
      findMany: (...args: unknown[]) => mockParticipantKeyFindMany(...args),
    },
  },
}))

import { escrowService } from '../src/modules/open-settlement/escrow.service'

const BUYER_PUBKEY = '021744d7bd3cd8e7f62e7aa8f7db8292680b745d09f8f40377c4bbbc0136d4e299'
const SELLER_PUBKEY = '038e41e2cb09677fd4bde9f232871533925c4b628c25efdb9d572546293850ddd4'

describe('createEscrow() — no longer populates multisigAddr immediately (client-held keys)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockEscrowFeatureFlag = false
  })

  it('does NOT call getDepositAddress for a MULTISIG escrow at creation time', async () => {
    mockTradeFindUnique.mockResolvedValue({ id: 'trade-1', buyerId: 'buyer-1', sellerId: 'seller-1', escrowId: null })
    mockEscrowCreate.mockResolvedValue({ id: 'escrow-1', tradeId: 'trade-1', type: 'MULTISIG', asset: 'BTC', lockedAmount: '0.001', multisigAddr: null })

    const result = await escrowService.createEscrow({ tradeId: 'trade-1', type: 'MULTISIG' as any, lockedAmount: '0.001', asset: 'BTC' as any })

    expect(mockGetDepositAddress).not.toHaveBeenCalled()
    expect(mockEscrowUpdate).not.toHaveBeenCalled()
    expect(result.multisigAddr).toBeNull()
  })

  it('does NOT call getDepositAddress for a non-MULTISIG escrow either', async () => {
    mockTradeFindUnique.mockResolvedValue({ id: 'trade-2', buyerId: 'buyer-1', sellerId: 'seller-1', escrowId: null })
    mockEscrowCreate.mockResolvedValue({ id: 'escrow-2', tradeId: 'trade-2', type: 'WDK_USDT_EVM', asset: 'USDT_ERC20', lockedAmount: '5' })

    await escrowService.createEscrow({ tradeId: 'trade-2', type: 'WDK_USDT_EVM' as any, lockedAmount: '5', asset: 'USDT_ERC20' as any })

    expect(mockGetDepositAddress).not.toHaveBeenCalled()
    expect(mockEscrowUpdate).not.toHaveBeenCalled()
  })
})

describe('submitParticipantKey() — the client-held-keys write path', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockEscrowFeatureFlag = false
  })

  it('persists the first submitted key but does NOT derive an address until both arrive', async () => {
    mockEscrowFindUnique.mockResolvedValue({ id: 'escrow-1', tradeId: 'trade-1', type: 'MULTISIG', multisigAddr: null })
    mockTradeFindUnique.mockResolvedValue({ id: 'trade-1', buyerId: 'buyer-1', sellerId: 'seller-1' })
    mockParticipantKeyFindMany.mockResolvedValue([{ escrowId: 'escrow-1', role: 'buyer', participantId: 'buyer-1', pubkey: BUYER_PUBKEY }])

    const result = await escrowService.submitParticipantKey('escrow-1', 'buyer-1', BUYER_PUBKEY)

    expect(mockParticipantKeyUpsert).toHaveBeenCalledWith({
      where: { escrowId_role: { escrowId: 'escrow-1', role: 'buyer' } },
      update: { participantId: 'buyer-1', pubkey: BUYER_PUBKEY },
      create: { escrowId: 'escrow-1', role: 'buyer', participantId: 'buyer-1', pubkey: BUYER_PUBKEY },
    })
    expect(mockGetDepositAddress).not.toHaveBeenCalled()
    expect(mockEscrowUpdate).not.toHaveBeenCalled()
    expect(result.buyerKeySubmitted).toBe(true)
    expect(result.sellerKeySubmitted).toBe(false)
  })

  it('derives and persists the real address once both buyer and seller keys have arrived', async () => {
    mockEscrowFindUnique.mockResolvedValue({ id: 'escrow-1', tradeId: 'trade-1', type: 'MULTISIG', multisigAddr: null })
    mockTradeFindUnique.mockResolvedValue({ id: 'trade-1', buyerId: 'buyer-1', sellerId: 'seller-1' })
    mockParticipantKeyFindMany.mockResolvedValue([
      { escrowId: 'escrow-1', role: 'buyer', participantId: 'buyer-1', pubkey: BUYER_PUBKEY },
      { escrowId: 'escrow-1', role: 'seller', participantId: 'seller-1', pubkey: SELLER_PUBKEY },
    ])
    mockGetDepositAddress.mockResolvedValue('tb1qexampleaddressxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx')
    mockEscrowUpdate.mockResolvedValue({ id: 'escrow-1', multisigAddr: 'tb1qexampleaddressxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' })

    const result = await escrowService.submitParticipantKey('escrow-1', 'seller-1', SELLER_PUBKEY)

    expect(mockGetDepositAddress).toHaveBeenCalledWith('trade-1', BUYER_PUBKEY, SELLER_PUBKEY)
    expect(mockEscrowUpdate).toHaveBeenCalledWith({
      where: { id: 'escrow-1' },
      data: { multisigAddr: 'tb1qexampleaddressxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' },
    })
    expect(result.escrow.multisigAddr).toBe('tb1qexampleaddressxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx')
  })

  it('does not re-derive an address that already exists (idempotent re-submission)', async () => {
    mockEscrowFindUnique.mockResolvedValue({ id: 'escrow-1', tradeId: 'trade-1', type: 'MULTISIG', multisigAddr: 'tb1qalreadyset' })
    mockTradeFindUnique.mockResolvedValue({ id: 'trade-1', buyerId: 'buyer-1', sellerId: 'seller-1' })
    mockParticipantKeyFindMany.mockResolvedValue([
      { escrowId: 'escrow-1', role: 'buyer', participantId: 'buyer-1', pubkey: BUYER_PUBKEY },
      { escrowId: 'escrow-1', role: 'seller', participantId: 'seller-1', pubkey: SELLER_PUBKEY },
    ])

    await escrowService.submitParticipantKey('escrow-1', 'buyer-1', BUYER_PUBKEY)

    expect(mockGetDepositAddress).not.toHaveBeenCalled()
    expect(mockEscrowUpdate).not.toHaveBeenCalled()
  })

  it('rejects a submission from someone who is not the trade\'s buyer or seller', async () => {
    mockEscrowFindUnique.mockResolvedValue({ id: 'escrow-1', tradeId: 'trade-1', type: 'MULTISIG', multisigAddr: null })
    mockTradeFindUnique.mockResolvedValue({ id: 'trade-1', buyerId: 'buyer-1', sellerId: 'seller-1' })

    await expect(escrowService.submitParticipantKey('escrow-1', 'not-a-party', BUYER_PUBKEY)).rejects.toThrow(
      'is not a counterparty (buyer or seller)'
    )
    expect(mockParticipantKeyUpsert).not.toHaveBeenCalled()
  })

  it('rejects a malformed pubkey before ever touching the database', async () => {
    mockEscrowFindUnique.mockResolvedValue({ id: 'escrow-1', tradeId: 'trade-1', type: 'MULTISIG', multisigAddr: null })
    mockTradeFindUnique.mockResolvedValue({ id: 'trade-1', buyerId: 'buyer-1', sellerId: 'seller-1' })

    await expect(escrowService.submitParticipantKey('escrow-1', 'buyer-1', 'not-a-real-pubkey')).rejects.toThrow(
      'must be a 33-byte compressed secp256k1 public key'
    )
    expect(mockParticipantKeyUpsert).not.toHaveBeenCalled()
  })

  it('rejects submission for an escrow type that does not use client-submitted keys', async () => {
    mockEscrowFindUnique.mockResolvedValue({ id: 'escrow-1', tradeId: 'trade-1', type: 'WDK_USDT_EVM', multisigAddr: null })

    await expect(escrowService.submitParticipantKey('escrow-1', 'buyer-1', BUYER_PUBKEY)).rejects.toThrow(
      'does not use client-submitted keys'
    )
    expect(mockTradeFindUnique).not.toHaveBeenCalled()
  })

  it('skips address derivation when MOCK_ESCROW is on, even once both keys arrive', async () => {
    mockEscrowFeatureFlag = true
    mockEscrowFindUnique.mockResolvedValue({ id: 'escrow-1', tradeId: 'trade-1', type: 'MULTISIG', multisigAddr: null })
    mockTradeFindUnique.mockResolvedValue({ id: 'trade-1', buyerId: 'buyer-1', sellerId: 'seller-1' })
    mockParticipantKeyFindMany.mockResolvedValue([
      { escrowId: 'escrow-1', role: 'buyer', participantId: 'buyer-1', pubkey: BUYER_PUBKEY },
      { escrowId: 'escrow-1', role: 'seller', participantId: 'seller-1', pubkey: SELLER_PUBKEY },
    ])

    await escrowService.submitParticipantKey('escrow-1', 'seller-1', SELLER_PUBKEY)

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
    // Both pubkeys present, so the flow reaches this file's own config
    // mock (arkade.seed: '') rather than stopping earlier at the
    // missing-pubkey guard — this test is specifically about the
    // ARKADE_SEED gate, not the pubkey one.
    mockParticipantKeyFindMany.mockResolvedValue([
      { escrowId: 'escrow-5', role: 'buyer', participantId: 'buyer-1', pubkey: BUYER_PUBKEY },
      { escrowId: 'escrow-5', role: 'seller', participantId: 'seller-1', pubkey: SELLER_PUBKEY },
    ])

    await expect(escrowService.lockFunds('escrow-5', 'seller-1')).rejects.toThrow('ARKADE_SEED')
  })
})
