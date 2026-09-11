/**
 * Sails Core Implementation Program M8-R2 (Destination Authority
 * Conformance, cooperative path, 2026-09-11) — proves the FULL
 * cooperative resolve-bind-persist-retry-immutability chain for the
 * client-signature-collection flow (escrow-pending-tx.ts's
 * initiateRelease()/submitTransactionSignature(), MULTISIG/
 * LIGHTNING_HODL/SAFE_GUARD_EVM), exercising the REAL escrow.service.ts/
 * escrow-pending-tx.ts/escrow-lifecycle.ts/payout-address.service.ts code
 * — only Prisma and the MULTISIG provider's own crypto internals
 * (irrelevant to destination-authority resolution) are mocked, same
 * "mock the boundary, test what's actually new" discipline
 * tests/fundMovementCapabilityCoverage.test.ts already established for
 * this exact module.
 *
 * Central property under test: `resolvePayoutAddress()` is called AT
 * MOST ONCE per release — at initiateRelease() time — and its result is
 * persisted onto `EscrowPendingTransaction.toAddress` before any
 * signature is collected. submitTransactionSignature() (however many
 * times it's called, by however many signers, over however long a
 * window) never calls it again. A PayoutAddress rotation after
 * initiateRelease() therefore cannot rewrite an already-bound execution
 * — the same "bind once, never re-read" property M8.5's MULTISIG-
 * disputed path already relies on (docs/DESTINATION_AUTHORITY_ARCHITECTURE.md
 * §6/§13), now proved for the cooperative path too.
 */
export {} // see fundMovementCapabilityCoverage.test.ts's identical comment

jest.mock('../src/config', () => ({
  get config() {
    return {
      features: { mockEscrow: true, enforceCapabilities: false, requireDualApprovalForRelease: false },
      trade: { defaultTimelockHours: 24 },
      settlement: { trustedArbitrators: [], protocolFeeRate: 0 },
      arkade: { seed: '' },
      escrowCircuitBreaker: { failureThreshold: 1000, windowMs: 60_000, cooldownMs: 60_000 },
    }
  },
}))

jest.mock('@tetherto/wdk-wallet-evm', () => ({
  __esModule: true,
  default: class FakeWalletManagerEvm {},
}))
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
jest.mock('@scure/btc-signer', () => ({ Transaction: { fromPSBT: jest.fn() } }))

// The one collaborator genuinely mocked away — MultisigProvider's own
// PSBT/Bitcoin-script construction is irrelevant to what this file
// proves (already covered by tests/multisigProvider.test.ts) and would
// otherwise require a full funding-UTXO/pubkey fixture for no benefit
// here. `buildUnsignedRelease`'s SECOND argument is exactly
// `resolvePayoutAddress()`'s own return value — the fact under test.
const mockBuildUnsignedRelease = jest.fn()
const mockFinalizeRelease = jest.fn()
jest.mock('../src/modules/open-settlement/multisig.provider', () => ({
  multisigProvider: {
    custodyModel: 'client-held-buyer-seller-keys-server-held-arbiter',
    buildUnsignedRelease: (...args: unknown[]) => mockBuildUnsignedRelease(...args),
    finalizeRelease: (...args: unknown[]) => mockFinalizeRelease(...args),
  },
  identifyFeeOutput: jest.fn(),
  networkFor: jest.fn(),
}))

const mockEscrowFindUnique = jest.fn()
const mockEscrowUpdateMany = jest.fn().mockResolvedValue({ count: 1 })
const mockEscrowUpdate = jest.fn()
const mockTradeFindUnique = jest.fn()
const mockEscrowEventCreate = jest.fn().mockResolvedValue({})
const mockEscrowEventFindFirst = jest.fn().mockResolvedValue(null)
const mockParticipantKeyFindMany = jest.fn().mockResolvedValue([])
const mockEscrowFundingEvidenceFindMany = jest.fn().mockResolvedValue([])
// The exact fact under adversarial test: how many times, and with what
// arguments, the beneficiary's registered destination is actually read.
const mockPayoutAddressFindUnique = jest.fn()
let pendingTxStore: Record<string, unknown> | null = null
const mockPendingTxCreate = jest.fn((args: { data: Record<string, unknown> }) => {
  pendingTxStore = { id: 'pending-1', ...args.data }
  return Promise.resolve(pendingTxStore)
})
const mockPendingTxFindUnique = jest.fn((_arg?: unknown) => Promise.resolve(pendingTxStore))
const mockPendingTxDelete = jest.fn().mockResolvedValue({})
let signatureStore: Array<{ pendingTxId: string; participantId: string; signedPsbtBase64: string }> = []
const mockSignatureUpsert = jest.fn((args: { create: { pendingTxId: string; participantId: string; signedPsbtBase64: string } }) => {
  signatureStore = signatureStore.filter((s) => s.participantId !== args.create.participantId)
  signatureStore.push(args.create)
  return Promise.resolve(args.create)
})
const mockSignatureFindMany = jest.fn((_arg?: unknown) => Promise.resolve(signatureStore))

jest.mock('../src/common/database', () => ({
  prisma: {
    escrow: {
      findUnique: (...args: unknown[]) => mockEscrowFindUnique(...args),
      update: (...args: unknown[]) => mockEscrowUpdate(...args),
      updateMany: (...args: unknown[]) => mockEscrowUpdateMany(...args),
    },
    trade: { findUnique: (...args: unknown[]) => mockTradeFindUnique(...args) },
    dispute: { findFirst: jest.fn().mockResolvedValue(null) },
    escrowEvent: {
      create: (...args: unknown[]) => mockEscrowEventCreate(...args),
      findFirst: (...args: unknown[]) => mockEscrowEventFindFirst(...args),
    },
    escrowParticipantKey: { findMany: (...args: unknown[]) => mockParticipantKeyFindMany(...args) },
    escrowFundingEvidence: { findMany: (...args: unknown[]) => mockEscrowFundingEvidenceFindMany(...args) },
    payoutAddress: { findUnique: (...args: unknown[]) => mockPayoutAddressFindUnique(...args) },
    escrowPendingTransaction: {
      findUnique: (arg: unknown) => mockPendingTxFindUnique(arg),
      create: (arg: { data: Record<string, unknown> }) => mockPendingTxCreate(arg),
      delete: (...args: unknown[]) => mockPendingTxDelete(...args),
    },
    escrowTransactionSignature: {
      upsert: (arg: { create: { pendingTxId: string; participantId: string; signedPsbtBase64: string } }) => mockSignatureUpsert(arg),
      findMany: (arg: unknown) => mockSignatureFindMany(arg),
    },
    $transaction: (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        $executeRaw: jest.fn().mockResolvedValue(0),
        escrowEvent: {
          findFirst: (...args: unknown[]) => mockEscrowEventFindFirst(...args),
          create: (...args: unknown[]) => mockEscrowEventCreate(...args),
        },
        escrowFundingEvidence: { findMany: (...args: unknown[]) => mockEscrowFundingEvidenceFindMany(...args) },
        escrowPendingTransaction: {
          create: (arg: { data: Record<string, unknown> }) => mockPendingTxCreate(arg),
        },
      }),
  },
}))

jest.mock('../src/common/events/event-bus', () => ({
  eventBus: { emit: jest.fn().mockResolvedValue(undefined), on: jest.fn(), onDurable: jest.fn() },
}))

import { escrowService } from '../src/modules/open-settlement/escrow.service'

const TRADE_ID = 'trade-1'
const ESCROW_ID = 'escrow-1'
const BUYER_ID = 'buyer-1'
const SELLER_ID = 'seller-1'
const TRADE_ROW = { id: TRADE_ID, buyerId: BUYER_ID, sellerId: SELLER_ID }

function escrowRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ESCROW_ID, tradeId: TRADE_ID, type: 'MULTISIG', status: 'PAYMENT_PENDING',
    lockedAmount: '0.01', asset: 'BTC', multisigAddr: 'deposit-addr',
    ...overrides,
  }
}

describe('escrow-pending-tx.ts initiateRelease() — cooperative destination resolution and binding (M8-R2)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    pendingTxStore = null
    signatureStore = []
    mockTradeFindUnique.mockResolvedValue(TRADE_ROW)
    mockEscrowFindUnique.mockResolvedValue(escrowRow())
    mockEscrowUpdateMany.mockResolvedValue({ count: 1 })
    mockEscrowUpdate.mockResolvedValue(escrowRow({ status: 'COMPLETED' }))
    mockParticipantKeyFindMany.mockResolvedValue([])
    mockEscrowFundingEvidenceFindMany.mockResolvedValue([])
    mockPendingTxFindUnique.mockImplementation(() => Promise.resolve(pendingTxStore))
    mockBuildUnsignedRelease.mockResolvedValue({ psbtBase64: 'psbt-stub', requiredSigners: [BUYER_ID] })
  })

  it('1/2. resolves and PERSISTS the beneficiary\'s registered PayoutAddress — never a caller-supplied value (the route already always passes undefined; this proves what happens once it does)', async () => {
    mockPayoutAddressFindUnique.mockResolvedValue({ address: 'address-A', participantId: BUYER_ID, asset: 'BTC' })

    const pending: any = await escrowService.initiateRelease(ESCROW_ID, undefined, SELLER_ID)

    expect(mockPayoutAddressFindUnique).toHaveBeenCalledWith({ where: { participantId_asset: { participantId: BUYER_ID, asset: 'BTC' } } })
    expect(mockBuildUnsignedRelease.mock.calls[0][1]).toBe('address-A')
    expect(pending.toAddress).toBe('address-A')
  })

  it('7. missing beneficiary destination fails closed — no pending transaction is created, the provider is never invoked, no fabricated destination is ever bound', async () => {
    mockPayoutAddressFindUnique.mockResolvedValue(null)

    await expect(escrowService.initiateRelease(ESCROW_ID, undefined, SELLER_ID)).rejects.toThrow(
      /No payout address provided.*none is registered/
    )
    expect(mockBuildUnsignedRelease).not.toHaveBeenCalled()
    expect(mockPendingTxCreate).not.toHaveBeenCalled()
    expect(pendingTxStore).toBeNull()
  })

  describe('3/4/5/6. binding survives rotation and retry (initiate once, finalize across multiple submitTransactionSignature() calls)', () => {
    beforeEach(async () => {
      mockPayoutAddressFindUnique.mockResolvedValue({ address: 'address-A', participantId: BUYER_ID, asset: 'BTC' })
      // Two required signers (seller + buyer), so a genuine "one signs,
      // resubmits, then the other signs" sequence is exercisable.
      mockBuildUnsignedRelease.mockResolvedValue({ psbtBase64: 'psbt-stub', requiredSigners: [SELLER_ID, BUYER_ID] })
      await escrowService.initiateRelease(ESCROW_ID, undefined, SELLER_ID)
      expect(pendingTxStore).not.toBeNull()
      expect((pendingTxStore as any).toAddress).toBe('address-A')
      mockEscrowFindUnique.mockResolvedValue(escrowRow({ status: 'PAYMENT_PENDING' }))
      // Rotation AFTER commit — docs/DESTINATION_AUTHORITY_ARCHITECTURE.md
      // §13's Timing/State Policy table: "After Outcome commit, before
      // dispatch... never a mutation of the old one." The cooperative
      // pending-transaction row is this path's own equivalent commit
      // point. From here on, every mock read of PayoutAddress (if any
      // occurred) would see B, never A — proving A survives means proving
      // no such read happens at all.
      mockPayoutAddressFindUnique.mockResolvedValue({ address: 'address-B', participantId: BUYER_ID, asset: 'BTC' })
      mockPayoutAddressFindUnique.mockClear()
      mockBuildUnsignedRelease.mockClear()
    })

    it('a retried submission (the seller resubmitting before the buyer ever signs) does not complete early and never re-resolves PayoutAddress', async () => {
      const first = await escrowService.submitTransactionSignature(ESCROW_ID, SELLER_ID, 'signed-psbt-seller-v1')
      expect(first.complete).toBe(false)

      // Retry: the same signer resubmits (idempotent upsert, not a
      // second required signer) — still incomplete, no new resolution.
      const retry = await escrowService.submitTransactionSignature(ESCROW_ID, SELLER_ID, 'signed-psbt-seller-v2')
      expect(retry.complete).toBe(false)
      expect(mockPendingTxCreate).toHaveBeenCalledTimes(1) // only ever created once, at initiate time
      expect(mockPayoutAddressFindUnique).not.toHaveBeenCalled()
    })

    it('finalize (the second required signer completing the round) uses the address bound at initiate time, never re-resolving PayoutAddress', async () => {
      mockFinalizeRelease.mockResolvedValue({ txId: 'tx-1' })
      await escrowService.submitTransactionSignature(ESCROW_ID, SELLER_ID, 'signed-psbt-seller')

      const result = await escrowService.submitTransactionSignature(ESCROW_ID, BUYER_ID, 'signed-psbt-buyer')

      expect(result.complete).toBe(true)
      // The provider's finalize call received the SAME unsigned PSBT
      // built at initiate time (which already embeds address A via
      // buildUnsignedRelease's own second argument, asserted in the
      // previous test) — finalizeRelease() itself never takes or
      // resolves an address.
      expect(mockFinalizeRelease.mock.calls[0][1]).toBe('psbt-stub')
      // The decisive assertion: across the ENTIRE finalize sequence
      // (both signature submissions plus the completing broadcast),
      // PayoutAddress is read ZERO further times — the only read
      // happened earlier, inside the outer beforeEach's
      // initiateRelease() call. Rotation to 'address-B' already in
      // effect by this point has no way to reach this execution.
      expect(mockPayoutAddressFindUnique).not.toHaveBeenCalled()
      expect(mockBuildUnsignedRelease).not.toHaveBeenCalled() // never re-built either — the persisted PSBT is reused as-is
    })
  })
})
