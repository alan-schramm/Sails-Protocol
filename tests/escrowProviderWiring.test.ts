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

// lightning-hodl.provider.ts's Phase 2 addition imports @scure/btc-signer
// directly (pure ESM, same reason @arkade-os/sdk itself is mocked above)
// — this test never reaches those code paths, a bare stub is enough.
jest.mock('@scure/btc-signer', () => ({ Transaction: { fromPSBT: jest.fn() } }))

const mockGetDepositAddress = jest.fn()
const mockBuildUnsignedRelease = jest.fn()
const mockBuildUnsignedRefund = jest.fn()
const mockFinalizeRelease = jest.fn()
const mockFinalizeRefund = jest.fn()
// RFC-021 D9 (2026-08-02)
const mockBuildUnsignedSplit = jest.fn()
const mockFinalizeSplit = jest.fn()
jest.mock('../src/modules/open-settlement/multisig.provider', () => ({
  multisigProvider: {
    name: 'MULTISIG',
    getDepositAddress: (...args: unknown[]) => mockGetDepositAddress(...args),
    lockFunds: jest.fn(),
    releaseFunds: jest.fn(),
    refundFunds: jest.fn(),
    verifyLock: jest.fn(),
    buildUnsignedRelease: (...args: unknown[]) => mockBuildUnsignedRelease(...args),
    buildUnsignedRefund: (...args: unknown[]) => mockBuildUnsignedRefund(...args),
    finalizeRelease: (...args: unknown[]) => mockFinalizeRelease(...args),
    finalizeRefund: (...args: unknown[]) => mockFinalizeRefund(...args),
    buildUnsignedSplit: (...args: unknown[]) => mockBuildUnsignedSplit(...args),
    finalizeSplit: (...args: unknown[]) => mockFinalizeSplit(...args),
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
const mockPendingTxFindUnique = jest.fn()
const mockPendingTxCreate = jest.fn()
const mockPendingTxDelete = jest.fn()
const mockTxSignatureUpsert = jest.fn()
const mockTxSignatureFindMany = jest.fn()

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
    escrowPendingTransaction: {
      findUnique: (...args: unknown[]) => mockPendingTxFindUnique(...args),
      create: (...args: unknown[]) => mockPendingTxCreate(...args),
      delete: (...args: unknown[]) => mockPendingTxDelete(...args),
    },
    escrowTransactionSignature: {
      upsert: (...args: unknown[]) => mockTxSignatureUpsert(...args),
      findMany: (...args: unknown[]) => mockTxSignatureFindMany(...args),
    },
    dispute: { findFirst: jest.fn().mockResolvedValue(null) },
  },
}))

import { escrowService, recommendedEscrowType } from '../src/modules/open-settlement/escrow.service'

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

    const result = await escrowService.createEscrow({ tradeId: 'trade-1', type: 'MULTISIG' as any, lockedAmount: '0.001', asset: 'BTC' as any }, 'buyer-1')

    expect(mockGetDepositAddress).not.toHaveBeenCalled()
    expect(mockEscrowUpdate).not.toHaveBeenCalled()
    expect(result.multisigAddr).toBeNull()
  })

  it('does NOT call getDepositAddress for a non-MULTISIG escrow either', async () => {
    mockTradeFindUnique.mockResolvedValue({ id: 'trade-2', buyerId: 'buyer-1', sellerId: 'seller-1', escrowId: null })
    mockEscrowCreate.mockResolvedValue({ id: 'escrow-2', tradeId: 'trade-2', type: 'WDK_USDT_EVM', asset: 'USDT_ERC20', lockedAmount: '5' })

    await escrowService.createEscrow({ tradeId: 'trade-2', type: 'WDK_USDT_EVM' as any, lockedAmount: '5', asset: 'USDT_ERC20' as any }, 'buyer-1')

    expect(mockGetDepositAddress).not.toHaveBeenCalled()
    expect(mockEscrowUpdate).not.toHaveBeenCalled()
  })
})

describe('createEscrow() — asset-aware default type (multisig-coverage-per-asset audit)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockEscrowFeatureFlag = false
  })

  it('defaults an omitted type to MULTISIG for a BTC trade', async () => {
    mockTradeFindUnique.mockResolvedValue({ id: 'trade-1', buyerId: 'buyer-1', sellerId: 'seller-1', escrowId: null })
    mockEscrowCreate.mockResolvedValue({ id: 'escrow-1', tradeId: 'trade-1', type: 'MULTISIG', asset: 'BTC', lockedAmount: '0.001' })

    await escrowService.createEscrow({ tradeId: 'trade-1', lockedAmount: '0.001', asset: 'BTC' as any }, 'buyer-1')

    expect(mockEscrowCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ type: 'MULTISIG' }) }))
  })

  it('defaults an omitted type to LIGHTNING_HODL for an LN_BTC trade', async () => {
    mockTradeFindUnique.mockResolvedValue({ id: 'trade-2', buyerId: 'buyer-1', sellerId: 'seller-1', escrowId: null })
    mockEscrowCreate.mockResolvedValue({ id: 'escrow-2', tradeId: 'trade-2', type: 'LIGHTNING_HODL', asset: 'LN_BTC', lockedAmount: '0.001' })

    await escrowService.createEscrow({ tradeId: 'trade-2', lockedAmount: '0.001', asset: 'LN_BTC' as any }, 'buyer-1')

    expect(mockEscrowCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ type: 'LIGHTNING_HODL' }) }))
  })

  it('defaults an omitted type to WDK_USDT_EVM for a USDT_ERC20 trade', async () => {
    mockTradeFindUnique.mockResolvedValue({ id: 'trade-3', buyerId: 'buyer-1', sellerId: 'seller-1', escrowId: null })
    mockEscrowCreate.mockResolvedValue({ id: 'escrow-3', tradeId: 'trade-3', type: 'WDK_USDT_EVM', asset: 'USDT_ERC20', lockedAmount: '5' })

    await escrowService.createEscrow({ tradeId: 'trade-3', lockedAmount: '5', asset: 'USDT_ERC20' as any }, 'buyer-1')

    expect(mockEscrowCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ type: 'WDK_USDT_EVM' }) }))
  })

  it('does NOT silently default to MULTISIG for an asset with no real provider — throws instead', async () => {
    mockTradeFindUnique.mockResolvedValue({ id: 'trade-4', buyerId: 'buyer-1', sellerId: 'seller-1', escrowId: null })

    await expect(escrowService.createEscrow({ tradeId: 'trade-4', lockedAmount: '10', asset: 'SPARK' as any }, 'buyer-1')).rejects.toThrow(
      "No real SettlementProvider is wired for asset 'SPARK'"
    )
    expect(mockEscrowCreate).not.toHaveBeenCalled()
  })

  it('MOCK_ESCROW=true still defaults every asset to MOCK regardless of recommendedEscrowType', async () => {
    mockEscrowFeatureFlag = true
    mockTradeFindUnique.mockResolvedValue({ id: 'trade-5', buyerId: 'buyer-1', sellerId: 'seller-1', escrowId: null })
    mockEscrowCreate.mockResolvedValue({ id: 'escrow-5', tradeId: 'trade-5', type: 'MOCK', asset: 'SPARK', lockedAmount: '10' })

    await escrowService.createEscrow({ tradeId: 'trade-5', lockedAmount: '10', asset: 'SPARK' as any }, 'buyer-1')

    expect(mockEscrowCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ type: 'MOCK' }) }))
  })

  it('an explicitly passed type is never overridden, even for an asset with a different recommendation', async () => {
    mockTradeFindUnique.mockResolvedValue({ id: 'trade-6', buyerId: 'buyer-1', sellerId: 'seller-1', escrowId: null })
    mockEscrowCreate.mockResolvedValue({ id: 'escrow-6', tradeId: 'trade-6', type: 'MOCK', asset: 'BTC', lockedAmount: '0.001' })

    await escrowService.createEscrow({ tradeId: 'trade-6', type: 'MOCK', lockedAmount: '0.001', asset: 'BTC' as any }, 'buyer-1')

    expect(mockEscrowCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ type: 'MOCK' }) }))
  })
})

describe('recommendedEscrowType()', () => {
  it('matches the audited real-provider coverage exactly', () => {
    expect(recommendedEscrowType('BTC' as any)).toBe('MULTISIG')
    expect(recommendedEscrowType('LN_BTC' as any)).toBe('LIGHTNING_HODL')
    expect(recommendedEscrowType('USDT_ERC20' as any)).toBe('WDK_USDT_EVM')
  })

  it('throws for every asset with no real SettlementProvider yet, instead of guessing', () => {
    for (const asset of ['USDT_TRC20', 'USDT_LIQUID', 'USDT_LIGHTNING', 'LIQUID_BTC', 'SPARK', 'STACKS', 'RSK_BTC']) {
      expect(() => recommendedEscrowType(asset as any)).toThrow(`No real SettlementProvider is wired for asset '${asset}'`)
    }
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

// Phase 2 (2026-07-27) — the signature-collection orchestration:
// initiateRelease()/initiateRefund() build+persist an unsigned PSBT
// without transitioning the escrow; submitTransactionSignature() collects
// each required signer's own signed copy and only finalizes (real
// provider call + status transition) once every required signer has
// submitted. multisig.provider.ts's own real PSBT/combine logic is
// covered by tests/multisigProvider.test.ts — this file only exercises
// escrow.service.ts's orchestration around it.
describe('initiateRelease()/initiateRefund() — Phase 2 signature-collection round setup', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockEscrowFeatureFlag = false
    mockEscrowUpdateMany.mockResolvedValue({ count: 1 })
    mockTradeFindUnique.mockResolvedValue({ id: 'trade-1', buyerId: 'buyer-1', sellerId: 'seller-1' })
    mockParticipantKeyFindMany.mockResolvedValue([
      { escrowId: 'escrow-1', role: 'buyer', participantId: 'buyer-1', pubkey: BUYER_PUBKEY },
      { escrowId: 'escrow-1', role: 'seller', participantId: 'seller-1', pubkey: SELLER_PUBKEY },
    ])
    mockPendingTxFindUnique.mockResolvedValue(null)
  })

  it('initiateRelease builds an unsigned PSBT via the provider and persists it, without transitioning the escrow', async () => {
    mockEscrowFindUnique.mockResolvedValue({ id: 'escrow-1', tradeId: 'trade-1', type: 'MULTISIG', status: 'PAYMENT_PENDING' })
    mockBuildUnsignedRelease.mockResolvedValue({ psbtBase64: 'unsigned-psbt', requiredSigners: ['buyer-1', 'seller-1'] })
    mockPendingTxCreate.mockResolvedValue({ id: 'ptx-1', escrowId: 'escrow-1', kind: 'release', requiredSigners: ['buyer-1', 'seller-1'] })

    const result = await escrowService.initiateRelease('escrow-1', 'tb1qexample', 'seller-1')

    expect(mockBuildUnsignedRelease).toHaveBeenCalledWith(
      expect.objectContaining({ buyerId: 'buyer-1', sellerId: 'seller-1', buyerPubkey: BUYER_PUBKEY, sellerPubkey: SELLER_PUBKEY }),
      'tb1qexample'
    )
    expect(mockPendingTxCreate).toHaveBeenCalledWith({
      data: { escrowId: 'escrow-1', kind: 'release', toAddress: 'tb1qexample', unsignedPsbtBase64: 'unsigned-psbt', requiredSigners: ['buyer-1', 'seller-1'], triggeredBy: 'seller-1' },
    })
    expect(mockEscrowUpdateMany).not.toHaveBeenCalled()
    expect(result.id).toBe('ptx-1')
  })

  it('initiateRelease rejects a caller who is neither the seller nor the assigned arbiter', async () => {
    mockEscrowFindUnique.mockResolvedValue({ id: 'escrow-1', tradeId: 'trade-1', type: 'MULTISIG', status: 'PAYMENT_PENDING' })

    await expect(escrowService.initiateRelease('escrow-1', 'tb1qexample', 'buyer-1')).rejects.toThrow(
      'is neither the seller'
    )
    expect(mockBuildUnsignedRelease).not.toHaveBeenCalled()
  })

  it('initiateRelease rejects when a signing round is already in flight for this escrow', async () => {
    mockEscrowFindUnique.mockResolvedValue({ id: 'escrow-1', tradeId: 'trade-1', type: 'MULTISIG', status: 'PAYMENT_PENDING' })
    mockPendingTxFindUnique.mockResolvedValue({ id: 'ptx-existing', kind: 'release' })

    await expect(escrowService.initiateRelease('escrow-1', 'tb1qexample', 'seller-1')).rejects.toThrow(
      'already has a pending release transaction'
    )
    expect(mockBuildUnsignedRelease).not.toHaveBeenCalled()
  })

  it('initiateRelease rejects an escrow type with no registered SignatureCollectionProvider', async () => {
    mockEscrowFindUnique.mockResolvedValue({ id: 'escrow-2', tradeId: 'trade-2', type: 'MOCK', status: 'PAYMENT_PENDING' })

    await expect(escrowService.initiateRelease('escrow-2', 'tb1qexample', 'seller-1')).rejects.toThrow(
      'does not use the client-signature-collection release flow'
    )
  })

  it('initiateRefund builds an unsigned refund PSBT and persists the provider-derived toAddress', async () => {
    mockEscrowFindUnique.mockResolvedValue({ id: 'escrow-1', tradeId: 'trade-1', type: 'MULTISIG', status: 'FUNDS_LOCKED' })
    mockBuildUnsignedRefund.mockResolvedValue({ psbtBase64: 'unsigned-refund-psbt', requiredSigners: ['seller-1', 'buyer-1'], toAddress: 'tb1qsellerrefund' })
    mockPendingTxCreate.mockResolvedValue({ id: 'ptx-2', escrowId: 'escrow-1', kind: 'refund', requiredSigners: ['seller-1', 'buyer-1'] })

    const result = await escrowService.initiateRefund('escrow-1', 'seller-1')

    expect(mockPendingTxCreate).toHaveBeenCalledWith({
      data: { escrowId: 'escrow-1', kind: 'refund', toAddress: 'tb1qsellerrefund', unsignedPsbtBase64: 'unsigned-refund-psbt', requiredSigners: ['seller-1', 'buyer-1'], triggeredBy: 'seller-1' },
    })
    expect(result.id).toBe('ptx-2')
  })
})

// RFC-021 D9 (2026-08-02) — the client-signature-collection equivalent of
// escrowReleaseControls.test.ts's own splitFunds() coverage. SPLIT only
// ever reaches an escrow via a dispute ruling (VALID_TRANSITIONS), so
// status is 'DISPUTED' throughout, unlike initiateRelease/initiateRefund's
// own PAYMENT_PENDING fixtures above.
describe('initiateSplit() — Phase 2 signature-collection round setup for SPLIT', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockEscrowFeatureFlag = false
    mockEscrowUpdateMany.mockResolvedValue({ count: 1 })
    mockTradeFindUnique.mockResolvedValue({ id: 'trade-1', buyerId: 'buyer-1', sellerId: 'seller-1' })
    mockParticipantKeyFindMany.mockResolvedValue([
      { escrowId: 'escrow-1', role: 'buyer', participantId: 'buyer-1', pubkey: BUYER_PUBKEY },
      { escrowId: 'escrow-1', role: 'seller', participantId: 'seller-1', pubkey: SELLER_PUBKEY },
    ])
    mockPendingTxFindUnique.mockResolvedValue(null)
  })

  it('builds an unsigned split PSBT via the provider and persists both payout addresses', async () => {
    mockEscrowFindUnique.mockResolvedValue({ id: 'escrow-1', tradeId: 'trade-1', type: 'MULTISIG', status: 'DISPUTED' })
    // Real MultisigProvider.buildUnsignedSplit() only requires ONE more
    // signer alongside the arbiter's pre-embedded one (still a 2-of-3
    // script — see that method's own comment); mocked here as buyer-1,
    // matching its real default pairing.
    mockBuildUnsignedSplit.mockResolvedValue({ psbtBase64: 'unsigned-split-psbt', requiredSigners: ['buyer-1'] })
    mockPendingTxCreate.mockResolvedValue({ id: 'ptx-3', escrowId: 'escrow-1', kind: 'split', requiredSigners: ['buyer-1'] })

    const result = await escrowService.initiateSplit('escrow-1', 'tb1qbuyer', 'tb1qseller', 6000, 'seller-1')

    expect(mockBuildUnsignedSplit).toHaveBeenCalledWith(
      expect.objectContaining({ buyerId: 'buyer-1', sellerId: 'seller-1', buyerPubkey: BUYER_PUBKEY, sellerPubkey: SELLER_PUBKEY }),
      'tb1qbuyer',
      'tb1qseller',
      6000
    )
    expect(mockPendingTxCreate).toHaveBeenCalledWith({
      data: {
        escrowId: 'escrow-1', kind: 'split', toAddress: 'tb1qbuyer', toAddressSecondary: 'tb1qseller',
        unsignedPsbtBase64: 'unsigned-split-psbt', requiredSigners: ['buyer-1'], triggeredBy: 'seller-1',
      },
    })
    expect(result.id).toBe('ptx-3')
  })

  it('rejects buyerBps of 0 or 10000 — those are RELEASE/REFUND in disguise, not a real split', async () => {
    mockEscrowFindUnique.mockResolvedValue({ id: 'escrow-1', tradeId: 'trade-1', type: 'MULTISIG', status: 'DISPUTED' })
    await expect(escrowService.initiateSplit('escrow-1', 'tb1qbuyer', 'tb1qseller', 0, 'seller-1')).rejects.toThrow(
      /buyerBps must be strictly between 0 and 10000/
    )
    await expect(escrowService.initiateSplit('escrow-1', 'tb1qbuyer', 'tb1qseller', 10000, 'seller-1')).rejects.toThrow(
      /buyerBps must be strictly between 0 and 10000/
    )
    expect(mockBuildUnsignedSplit).not.toHaveBeenCalled()
  })

  it('rejects an escrow type with no registered SignatureCollectionProvider', async () => {
    mockEscrowFindUnique.mockResolvedValue({ id: 'escrow-2', tradeId: 'trade-2', type: 'MOCK', status: 'DISPUTED' })
    await expect(escrowService.initiateSplit('escrow-2', 'tb1qbuyer', 'tb1qseller', 6000, 'seller-1')).rejects.toThrow(
      'does not use the client-signature-collection split flow'
    )
  })
})

describe('submitTransactionSignature() — collects signatures, finalizes only once every required signer has submitted', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockEscrowFeatureFlag = false
    mockEscrowUpdateMany.mockResolvedValue({ count: 1 })
    mockPendingTxDelete.mockResolvedValue({})
  })

  it('records a partial submission without finalizing when not every required signer has submitted yet', async () => {
    mockEscrowFindUnique.mockResolvedValue({ id: 'escrow-1', tradeId: 'trade-1', type: 'MULTISIG', status: 'PAYMENT_PENDING' })
    mockPendingTxFindUnique.mockResolvedValue({
      id: 'ptx-1', escrowId: 'escrow-1', kind: 'release', requiredSigners: ['buyer-1', 'seller-1'],
      unsignedPsbtBase64: 'unsigned-psbt', triggeredBy: 'seller-1',
    })
    mockTxSignatureFindMany.mockResolvedValue([{ participantId: 'buyer-1', signedPsbtBase64: 'buyer-signed' }])

    const result = await escrowService.submitTransactionSignature('escrow-1', 'buyer-1', 'buyer-signed')

    expect(mockTxSignatureUpsert).toHaveBeenCalledWith({
      where: { pendingTxId_participantId: { pendingTxId: 'ptx-1', participantId: 'buyer-1' } },
      update: { signedPsbtBase64: 'buyer-signed' },
      create: { pendingTxId: 'ptx-1', participantId: 'buyer-1', signedPsbtBase64: 'buyer-signed' },
    })
    expect(result.complete).toBe(false)
    expect(mockFinalizeRelease).not.toHaveBeenCalled()
    expect(mockEscrowUpdateMany).not.toHaveBeenCalled()
  })

  it('finalizes for real once every required signer has submitted — release path', async () => {
    mockEscrowFindUnique.mockResolvedValue({ id: 'escrow-1', tradeId: 'trade-1', type: 'MULTISIG', status: 'PAYMENT_PENDING' })
    mockPendingTxFindUnique.mockResolvedValue({
      id: 'ptx-1', escrowId: 'escrow-1', kind: 'release', requiredSigners: ['buyer-1', 'seller-1'],
      unsignedPsbtBase64: 'unsigned-psbt', triggeredBy: 'seller-1',
    })
    mockTxSignatureFindMany.mockResolvedValue([
      { participantId: 'buyer-1', signedPsbtBase64: 'buyer-signed' },
      { participantId: 'seller-1', signedPsbtBase64: 'seller-signed' },
    ])
    mockFinalizeRelease.mockResolvedValue({ txId: 'real-release-txid' })
    mockEscrowUpdate.mockResolvedValue({ id: 'escrow-1', status: 'COMPLETED', txReleaseId: 'real-release-txid' })

    const result = await escrowService.submitTransactionSignature('escrow-1', 'seller-1', 'seller-signed')

    expect(mockFinalizeRelease).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'escrow-1' }),
      'unsigned-psbt',
      ['buyer-signed', 'seller-signed']
    )
    expect(mockEscrowUpdateMany).toHaveBeenCalledWith({ where: { id: 'escrow-1', status: 'PAYMENT_PENDING' }, data: { status: 'COMPLETED' } })
    expect(mockEscrowUpdate).toHaveBeenCalledWith({ where: { id: 'escrow-1' }, data: { txReleaseId: 'real-release-txid', releasedAt: expect.any(Date) } })
    expect(mockPendingTxDelete).toHaveBeenCalledWith({ where: { id: 'ptx-1' } })
    expect(result.complete).toBe(true)
  })

  it('finalizes for real once every required signer has submitted — refund path', async () => {
    mockEscrowFindUnique.mockResolvedValue({ id: 'escrow-1', tradeId: 'trade-1', type: 'MULTISIG', status: 'FUNDS_LOCKED' })
    mockPendingTxFindUnique.mockResolvedValue({
      id: 'ptx-2', escrowId: 'escrow-1', kind: 'refund', requiredSigners: ['seller-1'],
      unsignedPsbtBase64: 'unsigned-refund-psbt', triggeredBy: 'seller-1',
    })
    mockTxSignatureFindMany.mockResolvedValue([{ participantId: 'seller-1', signedPsbtBase64: 'seller-signed' }])
    mockFinalizeRefund.mockResolvedValue({ txId: 'real-refund-txid' })
    mockEscrowUpdate.mockResolvedValue({ id: 'escrow-1', status: 'REFUNDED', txReleaseId: 'real-refund-txid' })

    const result = await escrowService.submitTransactionSignature('escrow-1', 'seller-1', 'seller-signed')

    expect(mockFinalizeRefund).toHaveBeenCalledWith(expect.objectContaining({ id: 'escrow-1' }), 'unsigned-refund-psbt', ['seller-signed'])
    expect(mockEscrowUpdateMany).toHaveBeenCalledWith({ where: { id: 'escrow-1', status: 'FUNDS_LOCKED' }, data: { status: 'REFUNDED' } })
    expect(mockEscrowUpdate).toHaveBeenCalledWith({ where: { id: 'escrow-1' }, data: { txReleaseId: 'real-refund-txid' } })
    expect(result.complete).toBe(true)
  })

  it('finalizes for real once every required signer has submitted — split path (RFC-021 D9)', async () => {
    // Real MultisigProvider.buildUnsignedSplit() requires only ONE more
    // signer alongside the arbiter's pre-embedded one (see that method's
    // own comment) — mocked here as buyer-1, its real default pairing.
    mockEscrowFindUnique.mockResolvedValue({ id: 'escrow-1', tradeId: 'trade-1', type: 'MULTISIG', status: 'DISPUTED' })
    mockPendingTxFindUnique.mockResolvedValue({
      id: 'ptx-3', escrowId: 'escrow-1', kind: 'split', requiredSigners: ['buyer-1'],
      unsignedPsbtBase64: 'unsigned-split-psbt', triggeredBy: 'arbiter-1',
    })
    mockTxSignatureFindMany.mockResolvedValue([
      { participantId: 'buyer-1', signedPsbtBase64: 'buyer-signed' },
    ])
    mockFinalizeSplit.mockResolvedValue({ txId: 'real-split-txid' })
    mockEscrowUpdate.mockResolvedValue({ id: 'escrow-1', status: 'SPLIT', txReleaseId: 'real-split-txid' })

    const result = await escrowService.submitTransactionSignature('escrow-1', 'buyer-1', 'buyer-signed')

    expect(mockFinalizeSplit).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'escrow-1' }),
      'unsigned-split-psbt',
      ['buyer-signed']
    )
    expect(mockEscrowUpdateMany).toHaveBeenCalledWith({ where: { id: 'escrow-1', status: 'DISPUTED' }, data: { status: 'SPLIT' } })
    expect(mockEscrowUpdate).toHaveBeenCalledWith({ where: { id: 'escrow-1' }, data: { txReleaseId: 'real-split-txid', releasedAt: expect.any(Date) } })
    expect(mockPendingTxDelete).toHaveBeenCalledWith({ where: { id: 'ptx-3' } })
    expect(result.complete).toBe(true)
  })

  it('rejects a signature from someone who is not a required signer for this pending transaction', async () => {
    mockEscrowFindUnique.mockResolvedValue({ id: 'escrow-1', tradeId: 'trade-1', type: 'MULTISIG', status: 'PAYMENT_PENDING' })
    mockPendingTxFindUnique.mockResolvedValue({
      id: 'ptx-1', escrowId: 'escrow-1', kind: 'release', requiredSigners: ['buyer-1', 'seller-1'],
      unsignedPsbtBase64: 'unsigned-psbt', triggeredBy: 'seller-1',
    })

    await expect(escrowService.submitTransactionSignature('escrow-1', 'not-a-party', 'sig')).rejects.toThrow(
      'is not one of the required signers'
    )
    expect(mockTxSignatureUpsert).not.toHaveBeenCalled()
  })

  it('rejects when no signing round is in flight for this escrow', async () => {
    mockEscrowFindUnique.mockResolvedValue({ id: 'escrow-1', tradeId: 'trade-1', type: 'MULTISIG', status: 'PAYMENT_PENDING' })
    mockPendingTxFindUnique.mockResolvedValue(null)

    await expect(escrowService.submitTransactionSignature('escrow-1', 'buyer-1', 'sig')).rejects.toThrow(
      'has no pending transaction awaiting signatures'
    )
  })
})

describe('getPendingTransaction()', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns the pending transaction row (with signatures) when one exists', async () => {
    mockPendingTxFindUnique.mockResolvedValue({ id: 'ptx-1', escrowId: 'escrow-1', kind: 'release', requiredSigners: ['buyer-1', 'seller-1'], signatures: [] })
    const result = await escrowService.getPendingTransaction('escrow-1')
    expect(result.id).toBe('ptx-1')
  })

  it('throws NotFoundError when no signing round is in flight', async () => {
    mockPendingTxFindUnique.mockResolvedValue(null)
    await expect(escrowService.getPendingTransaction('escrow-1')).rejects.toThrow('EscrowPendingTransaction')
  })
})

// UI-audit follow-up gap (2026-08-03) — found while confirming buyer/
// seller/arbiter dispute visibility was actually complete: only whoever
// CALLED raiseDispute() ever learned the resulting disputeId (in that
// POST's own response). The other trade party had no REST or WS way to
// discover it at all. getEscrow()/getEscrowByTrade() now include the
// already-existing Escrow.disputes relation so the same public GET a
// trade party already polls for status answers this too.
describe('getEscrow() / getEscrowByTrade() — includes disputes (UI-audit gap, 2026-08-03)', () => {
  beforeEach(() => jest.clearAllMocks())

  it('getEscrow requests the disputes relation and returns it', async () => {
    mockEscrowFindUnique.mockResolvedValue({ id: 'escrow-1', tradeId: 'trade-1', disputes: [{ id: 'dispute-1', tradeId: 'trade-1' }] })

    const result = await escrowService.getEscrow('escrow-1')

    expect(mockEscrowFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ include: expect.objectContaining({ disputes: true }) })
    )
    expect(result.disputes).toEqual([{ id: 'dispute-1', tradeId: 'trade-1' }])
  })

  it('getEscrow returns an empty disputes array for an escrow with no dispute', async () => {
    mockEscrowFindUnique.mockResolvedValue({ id: 'escrow-1', tradeId: 'trade-1', disputes: [] })
    const result = await escrowService.getEscrow('escrow-1')
    expect(result.disputes).toEqual([])
  })

  it('getEscrowByTrade also requests the disputes relation', async () => {
    mockEscrowFindUnique.mockResolvedValue({ id: 'escrow-1', tradeId: 'trade-1', disputes: [] })

    await escrowService.getEscrowByTrade('trade-1')

    expect(mockEscrowFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tradeId: 'trade-1' }, include: expect.objectContaining({ disputes: true }) })
    )
  })
})
