/**
 * Sails Core Implementation Program M8-R2 (Destination Authority
 * Conformance, remaining disputed rails, 2026-09-11,
 * docs/DESTINATION_AUTHORITY_ARCHITECTURE.md) — end-to-end proof, through
 * the REAL dispute.service.ts -> escrow.service.ts -> escrow-pending-tx.ts
 * -> escrow-lifecycle.ts chain (only Prisma and the LIGHTNING_HODL/MOCK
 * settlement providers' own crypto internals are mocked — irrelevant to
 * destination-authority resolution, already covered by
 * tests/lightningHodlProvider.test.ts/tests/multisigProvider.test.ts),
 * that an arbiter's ruling for a NON-MULTISIG disputed escrow can no
 * longer choose or substitute the beneficiary's payout destination.
 *
 * MULTISIG's own disputed path (applyRulingCoreAuthoritative()) is
 * UNTOUCHED by the mission this file covers — see
 * tests/dispatchTranslationGuard.test.ts/tests/disputeCorrespondence.test.ts
 * for its own unchanged coverage. This file exercises exactly the
 * branch dispute.service.ts's resolveDispute() routes every OTHER
 * escrow type through: applyRuling(), which (as of this mission) no
 * longer accepts a destination parameter at all — see that method's own
 * header comment in src/modules/open-settlement/dispute.service.ts.
 */
export {} // see disputeFlow.test.ts's identical forced-module-scope reasoning

import nacl from 'tweetnacl'
import { signAuthorityDecision, type AuthorityDecisionPayload } from '../src/modules/open-settlement/arbitration-authority'

jest.mock('../src/config', () => ({
  get config() {
    return {
      features: { mockEscrow: true, enforceCapabilities: false, requireDualApprovalForRelease: false },
      trade: { defaultTimelockHours: 24 },
      settlement: { trustedArbitrators: ['arbiter-1'], protocolFeeRate: 0 },
      arkade: { seed: '' },
      escrowCircuitBreaker: { failureThreshold: 1000, windowMs: 60_000, cooldownMs: 60_000 },
    }
  },
}))

jest.mock('@tetherto/wdk-wallet-evm', () => ({ __esModule: true, default: class FakeWalletManagerEvm {} }))
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

// The one collaborator genuinely mocked away — LightningHodlProvider's
// own Ark/VTXO construction is irrelevant to what this file proves
// (already covered by tests/lightningHodlProvider.test.ts) and would
// otherwise need a full funding/pubkey fixture for no benefit here.
// `buildUnsignedRelease`'s SECOND argument is exactly
// `resolvePayoutAddress()`'s own return value — the fact under test.
const mockBuildUnsignedRelease = jest.fn()
const mockFinalizeRelease = jest.fn()
jest.mock('../src/modules/open-settlement/lightning-hodl.provider', () => ({
  lightningHodlProvider: {
    custodyModel: 'client-held-buyer-seller-keys-server-held-arbiter',
    buildUnsignedRelease: (...args: unknown[]) => mockBuildUnsignedRelease(...args),
    finalizeRelease: (...args: unknown[]) => mockFinalizeRelease(...args),
  },
}))
// Bare, import-safe stand-ins — escrow-providers.ts imports these at
// module scope regardless of which rail this file actually exercises.
jest.mock('../src/modules/open-settlement/multisig.provider', () => ({
  multisigProvider: {}, identifyFeeOutput: jest.fn(), networkFor: jest.fn(),
}))
jest.mock('../src/modules/open-settlement/safe-guard-evm.provider', () => ({ safeGuardEvmProvider: {} }))
jest.mock('../src/modules/open-settlement/wdk-settlement.provider', () => ({ wdkSettlementProvider: {} }))

const testKeypair = nacl.sign.keyPair()
const testPublicKeyHex = Buffer.from(testKeypair.publicKey).toString('hex')

const mockEscrowFindUnique = jest.fn()
const mockEscrowUpdateMany = jest.fn().mockResolvedValue({ count: 1 })
const mockEscrowUpdate = jest.fn()
const mockTradeFindUnique = jest.fn()
const mockDisputeFindUnique = jest.fn()
const mockDisputeUpdate = jest.fn()
const mockEscrowParticipantKeyFindUnique = jest.fn().mockResolvedValue(null) // no committed arbiter — non-MULTISIG
const mockEscrowEventCreate = jest.fn().mockResolvedValue({})
const mockEscrowEventFindFirst = jest.fn().mockResolvedValue(null)
const mockParticipantKeyFindMany = jest.fn().mockResolvedValue([])
const mockEscrowFundingEvidenceFindMany = jest.fn().mockResolvedValue([])
const mockUserFindUnique = jest.fn().mockImplementation(async ({ where }: { where: { id: string } }) => ({ id: where.id, publicKey: testPublicKeyHex }))
// The exact fact under adversarial test.
const mockPayoutAddressFindUnique = jest.fn()
let pendingTxStore: Record<string, unknown> | null = null
const mockPendingTxCreate = jest.fn((args: { data: Record<string, unknown> }) => {
  pendingTxStore = { id: 'pending-1', ...args.data }
  return Promise.resolve(pendingTxStore)
})
const mockPendingTxFindUnique = jest.fn((_arg?: unknown) => Promise.resolve(pendingTxStore))
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
    dispute: {
      findUnique: (...args: unknown[]) => mockDisputeFindUnique(...args),
      update: (...args: unknown[]) => mockDisputeUpdate(...args),
      // escrow-lifecycle.ts's isSellerOrAssignedArbiter() falls back to
      // this (escrowRepository.findDisputeByTradeAndArbiter()) whenever
      // triggeredBy isn't the trade's own seller — true for every
      // resolveDispute() call in this file, since the arbiter (never the
      // seller) is who triggers a ruling. Must resolve to a real
      // dispute row for {tradeId, arbiterId} or every ruling in this file
      // would be wrongly rejected as unauthorized before ever reaching
      // the destination-resolution code this file actually tests.
      // Literal ids used directly (not the module's own TRADE_ID/ARBITER_ID
      // constants) — this factory runs when DisputeService is first
      // required, which ES-module import hoisting can trigger before
      // those later `const` declarations in this same file initialize.
      findFirst: jest.fn().mockImplementation(({ where }: { where: { tradeId: string; arbiterId: string } }) =>
        Promise.resolve(where.tradeId === 'trade-1' && where.arbiterId === 'arbiter-1' ? { id: 'dispute-1', tradeId: 'trade-1', arbiterId: 'arbiter-1' } : null)
      ),
    },
    user: { findUnique: (...args: unknown[]) => mockUserFindUnique(...args) },
    escrowParticipantKey: {
      findUnique: (...args: unknown[]) => mockEscrowParticipantKeyFindUnique(...args),
      findMany: (...args: unknown[]) => mockParticipantKeyFindMany(...args),
    },
    escrowEvent: {
      create: (...args: unknown[]) => mockEscrowEventCreate(...args),
      findFirst: (...args: unknown[]) => mockEscrowEventFindFirst(...args),
    },
    payoutAddress: { findUnique: (...args: unknown[]) => mockPayoutAddressFindUnique(...args) },
    escrowFundingEvidence: { findMany: (...args: unknown[]) => mockEscrowFundingEvidenceFindMany(...args) },
    escrowPendingTransaction: {
      findUnique: (arg: unknown) => mockPendingTxFindUnique(arg),
      create: (arg: { data: Record<string, unknown> }) => mockPendingTxCreate(arg),
      delete: jest.fn().mockResolvedValue({}),
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
        escrowPendingTransaction: { create: (arg: { data: Record<string, unknown> }) => mockPendingTxCreate(arg) },
      }),
  },
}))

jest.mock('../src/common/events/event-bus', () => ({
  eventBus: { emit: jest.fn().mockResolvedValue(undefined), on: jest.fn(), onDurable: jest.fn() },
}))

import { DisputeService } from '../src/modules/open-settlement/dispute.service'
import { TrustedArbitratorProvider } from '../src/modules/open-settlement/arbitration-provider'

const TRADE_ID = 'trade-1'
const ESCROW_ID = 'escrow-1'
const BUYER_ID = 'buyer-1'
const SELLER_ID = 'seller-1'
const ARBITER_ID = 'arbiter-1'
const DISPUTE_ID = 'dispute-1'
const TRADE_ROW = { id: TRADE_ID, buyerId: BUYER_ID, sellerId: SELLER_ID }

function escrowRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ESCROW_ID, tradeId: TRADE_ID, type: 'LIGHTNING_HODL', status: 'PAYMENT_PENDING',
    lockedAmount: '0.01', asset: 'BTC',
    ...overrides,
  }
}

function signResolution(outcome: 'RELEASE' | 'REFUND' | 'SPLIT', buyerBps: number | null = null, issuedAt = '2026-09-11T00:00:00.000Z'): [string, string] {
  const payload: AuthorityDecisionPayload = {
    disputeId: DISPUTE_ID, escrowId: ESCROW_ID, appealRound: 0, authorityId: ARBITER_ID, outcome, buyerBps, issuedAt,
  }
  return [signAuthorityDecision(payload, testKeypair.secretKey), issuedAt]
}

describe('Disputed non-MULTISIG rails — Destination Authority conformance (M8-R2)', () => {
  const service = new DisputeService(new TrustedArbitratorProvider([ARBITER_ID]))

  beforeEach(() => {
    jest.clearAllMocks()
    pendingTxStore = null
    signatureStore = []
    mockTradeFindUnique.mockResolvedValue(TRADE_ROW)
    mockEscrowFindUnique.mockResolvedValue(escrowRow())
    mockDisputeFindUnique.mockResolvedValue({ id: DISPUTE_ID, tradeId: TRADE_ID, escrowId: ESCROW_ID, arbiterId: ARBITER_ID, status: 'OPENED', appealRound: 0 })
    mockDisputeUpdate.mockResolvedValue({ id: DISPUTE_ID, status: 'RESOLVED', ruling: 'RELEASE' })
    mockEscrowUpdateMany.mockResolvedValue({ count: 1 })
    mockUserFindUnique.mockImplementation(async ({ where }: { where: { id: string } }) => ({ id: where.id, publicKey: testPublicKeyHex }))
    mockBuildUnsignedRelease.mockResolvedValue({ psbtBase64: 'psbt-stub', requiredSigners: [SELLER_ID, BUYER_ID] })
  })

  it('1/3/9. an arbiter-supplied wrong RELEASE destination cannot override the buyer\'s registered PayoutAddress — resolved and bound at ruling time', async () => {
    mockPayoutAddressFindUnique.mockResolvedValue({ address: 'buyer-address-A', participantId: BUYER_ID, asset: 'BTC' })
    const [sig, issuedAt] = signResolution('RELEASE')

    await service.resolveDispute(DISPUTE_ID, ARBITER_ID, 'RELEASE', 'attacker-controlled-address', undefined, undefined, sig, issuedAt)

    expect(mockPayoutAddressFindUnique).toHaveBeenCalledWith({ where: { participantId_asset: { participantId: BUYER_ID, asset: 'BTC' } } })
    expect(mockBuildUnsignedRelease.mock.calls[0][1]).toBe('buyer-address-A')
    expect((pendingTxStore as any).toAddress).toBe('buyer-address-A')
  })

  it('7. missing beneficiary destination fails closed — no pending transaction is created, the provider is never invoked, the ruling itself is reverted', async () => {
    mockPayoutAddressFindUnique.mockResolvedValue(null)
    const [sig, issuedAt] = signResolution('RELEASE')

    await expect(
      service.resolveDispute(DISPUTE_ID, ARBITER_ID, 'RELEASE', undefined, undefined, undefined, sig, issuedAt)
    ).rejects.toThrow(/No payout address provided.*none is registered/)

    expect(mockBuildUnsignedRelease).not.toHaveBeenCalled()
    expect(pendingTxStore).toBeNull()
    // The dispute's RESOLVED write is reverted back to its prior state —
    // applyRuling()'s own catch block, unchanged by this mission.
    expect(mockDisputeUpdate).toHaveBeenLastCalledWith({
      where: { id: DISPUTE_ID },
      data: { status: 'OPENED', ruling: null, resolvedAt: null, authoritySignature: null, authorityIssuedAt: null, authorityBuyerBps: null },
    })
  })

  describe('4/5/6. rotation and retry — binding survives across the signature-collection round', () => {
    beforeEach(async () => {
      mockPayoutAddressFindUnique.mockResolvedValue({ address: 'buyer-address-A', participantId: BUYER_ID, asset: 'BTC' })
      const [sig, issuedAt] = signResolution('RELEASE')
      await service.resolveDispute(DISPUTE_ID, ARBITER_ID, 'RELEASE', undefined, undefined, undefined, sig, issuedAt)
      expect((pendingTxStore as any).toAddress).toBe('buyer-address-A')
      mockEscrowFindUnique.mockResolvedValue(escrowRow({ status: 'DISPUTED' }))
      // Rotation AFTER the ruling's own destination-binding moment.
      mockPayoutAddressFindUnique.mockResolvedValue({ address: 'buyer-address-B', participantId: BUYER_ID, asset: 'BTC' })
      mockPayoutAddressFindUnique.mockClear()
      mockBuildUnsignedRelease.mockClear()
    })

    it('finalize (both required signers submitting) uses the address bound at ruling time, never re-resolving PayoutAddress', async () => {
      mockFinalizeRelease.mockResolvedValue({ txId: 'tx-1' })
      const { submitTransactionSignature } = require('../src/modules/open-settlement/escrow-pending-tx')
      await submitTransactionSignature(ESCROW_ID, SELLER_ID, 'signed-seller')
      const result = await submitTransactionSignature(ESCROW_ID, BUYER_ID, 'signed-buyer')

      expect(result.complete).toBe(true)
      expect(mockFinalizeRelease.mock.calls[0][1]).toBe('psbt-stub')
      expect(mockPayoutAddressFindUnique).not.toHaveBeenCalled()
      expect(mockBuildUnsignedRelease).not.toHaveBeenCalled()
    })

    it('a retried signature submission (resubmit before the round completes) does not re-resolve PayoutAddress either', async () => {
      const { submitTransactionSignature } = require('../src/modules/open-settlement/escrow-pending-tx')
      const first = await submitTransactionSignature(ESCROW_ID, SELLER_ID, 'signed-seller-v1')
      expect(first.complete).toBe(false)
      const retry = await submitTransactionSignature(ESCROW_ID, SELLER_ID, 'signed-seller-v2')
      expect(retry.complete).toBe(false)
      expect(mockPayoutAddressFindUnique).not.toHaveBeenCalled()
    })
  })

  it('9/10. resolves the correct beneficiary for REFUND (seller) via the direct-call MOCK path, independent of RELEASE\'s buyer resolution', async () => {
    mockEscrowFindUnique.mockResolvedValue({ id: ESCROW_ID, tradeId: TRADE_ID, type: 'MOCK', status: 'FUNDS_LOCKED', lockedAmount: '0.01', asset: 'BTC' })
    mockEscrowUpdate.mockResolvedValue({ id: ESCROW_ID, status: 'REFUNDED' })
    mockDisputeUpdate.mockResolvedValue({ id: DISPUTE_ID, status: 'RESOLVED', ruling: 'REFUND' })
    // Refund's direct-call path (MOCK) takes no destination parameter at
    // all — nothing to resolve or bind; included here to prove REFUND
    // reaches the seller-scoped code path without error and without
    // consulting PayoutAddress (MOCK.refundFunds() has no destination
    // concept, matching escrow-providers.ts's own MockSettlementProvider).
    const [sig, issuedAt] = signResolution('REFUND')

    const updated = await service.resolveDispute(DISPUTE_ID, ARBITER_ID, 'REFUND', undefined, 'attacker-controlled-seller-address', undefined, sig, issuedAt)

    expect(updated!.status).toBe('RESOLVED')
    expect(mockPayoutAddressFindUnique).not.toHaveBeenCalled()
  })
})
