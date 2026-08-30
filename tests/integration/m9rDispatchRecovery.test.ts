// tests/integration/m9rDispatchRecovery.test.ts
//
// Sails Core Implementation Program M9-R (Recovery Closure), Part 1 (R1)
// + Part 2 — real-Postgres reproduction of crash window C4 (found during
// the M9 analytical gate: a dispute ruling's Outcome commits durably,
// but the process dies before `initiateRelease/Refund/Split()` ever
// persists the unsigned PSBT) and proof that
// `reconcileMissingDispatch()` resumes it safely, without re-running
// discretionary authority or reinterpreting the ruling.
//
// C4 is reproduced by calling `commitAuthoritativeDisputeRuling()`
// directly and STOPPING there — exactly the same technique
// `disputeOutcomeMultisigLive.test.ts`'s own "P15/replay-resistance"
// test already uses to isolate the record-commit layer from the
// business-workflow layer, applied here to isolate "the commit
// succeeded, dispatch never ran" instead of "two appeal rounds."

import { PrismaClient } from '@prisma/client'
import * as bitcoin from 'bitcoinjs-lib'
import * as ecc from '@bitcoinerlab/secp256k1'
import { createHash } from 'crypto'
import { createPostgresIntegrationHarness } from './postgresTestHarness'
import { MULTISIG_CAPABILITY_PROFILE_V1 } from '@satsails/p2p-schemas'
import type { AuthorityDecisionPayload } from '../../src/modules/open-settlement/arbitration-authority'
import nacl from 'tweetnacl'

bitcoin.initEccLib(ecc)

function testnetAddress(label: string): string {
  const scalar = createHash('sha256').update(label).digest()
  const pubkey = Buffer.from(ecc.pointFromScalar(scalar, true)!)
  return bitcoin.payments.p2wpkh({ pubkey, network: bitcoin.networks.testnet }).address!
}

describe('M9-R — C4 recovery: authorized dispatch that never persisted (real Postgres)', () => {
  jest.setTimeout(120_000)

  const pg = createPostgresIntegrationHarness()
  let dbAvailable = false
  let prisma: PrismaClient
  let escrowService: import('../../src/modules/open-settlement/escrow.service').EscrowService
  let identityService: typeof import('../../src/modules/open-identity/identity.service').identityService
  let liquidityRouter: typeof import('../../src/modules/open-liquidity/liquidity.service').liquidityRouter
  let tradeService: typeof import('../../src/modules/open-p2p/trade.service').tradeService
  let intentEngine: typeof import('../../src/core/intent-engine').intentEngine
  let OpenP2PTradeIntentHandler: any
  let getDisputeService: typeof import('../../src/modules/open-settlement/dispute.service').getDisputeService
  let payoutAddressService: typeof import('../../src/modules/open-settlement/payout-address.service').payoutAddressService
  let signAuthorityDecision: typeof import('../../src/modules/open-settlement/arbitration-authority').signAuthorityDecision
  let commitAuthoritativeDisputeRuling: typeof import('../../src/modules/open-settlement/dispute-outcome').commitAuthoritativeDisputeRuling
  let reconcileMissingDispatch: typeof import('../../src/modules/open-settlement/dispute-dispatch-recovery').reconcileMissingDispatch

  const ARBITER_ID = 'm9r-c4-test-arbiter'
  const arbiterKeypair = nacl.sign.keyPair()
  const arbiterPublicKeyHex = Buffer.from(arbiterKeypair.publicKey).toString('hex')

  const BUYER_PUBKEY = '021744d7bd3cd8e7f62e7aa8f7db8292680b745d09f8f40377c4bbbc0136d4e299'
  const SELLER_PUBKEY = '038e41e2cb09677fd4bde9f232871533925c4b628c25efdb9d572546293850ddd4'

  let realFetch: typeof fetch

  function mockExplorerForUtxo(txid: string, vout: number, valueSats: number): void {
    global.fetch = jest.fn(async (url: string) => {
      if (url.includes('/blocks/tip/height')) return { ok: true, text: async () => '100' } as any
      if (url.includes(`/tx/${txid}/status`)) return { ok: true, json: async () => ({ confirmed: true, block_height: 100 }) } as any
      if (url.includes('/v1/fees/recommended')) return { ok: true, json: async () => ({ halfHourFee: 5, fastestFee: 8 }) } as any
      return { ok: true, json: async () => [{ txid, vout, value: valueSats, status: { confirmed: true } }] } as any
    }) as any
  }

  beforeAll(async () => {
    process.env.MOCK_ESCROW = 'false'
    process.env.MULTISIG_SEED = process.env.MULTISIG_SEED || 'm9r-c4-test-seed'
    process.env.TRUSTED_ARBITRATORS = ARBITER_ID

    await pg.probe()
    dbAvailable = pg.isAvailable()
    if (!dbAvailable) return

    ;({ prisma } = require('../../src/common/database'))
    ;({ escrowService } = require('../../src/modules/open-settlement/escrow.service'))
    ;({ identityService } = require('../../src/modules/open-identity/identity.service'))
    ;({ liquidityRouter } = require('../../src/modules/open-liquidity/liquidity.service'))
    ;({ tradeService } = require('../../src/modules/open-p2p/trade.service'))
    ;({ intentEngine } = require('../../src/core/intent-engine'))
    ;({ OpenP2PTradeIntentHandler } = require('../../src/modules/open-p2p/intent-handler'))
    ;({ getDisputeService } = require('../../src/modules/open-settlement/dispute.service'))
    ;({ payoutAddressService } = require('../../src/modules/open-settlement/payout-address.service'))
    ;({ signAuthorityDecision } = require('../../src/modules/open-settlement/arbitration-authority'))
    ;({ commitAuthoritativeDisputeRuling } = require('../../src/modules/open-settlement/dispute-outcome'))
    ;({ reconcileMissingDispatch } = require('../../src/modules/open-settlement/dispute-dispatch-recovery'))
    intentEngine.registerHandler(OpenP2PTradeIntentHandler)

    await prisma.user.upsert({
      where: { id: ARBITER_ID },
      update: { publicKey: arbiterPublicKeyHex },
      create: { id: ARBITER_ID, publicKey: arbiterPublicKeyHex, displayName: 'M9-R C4 Test Arbiter' },
    })
  })

  afterAll(async () => {
    if (dbAvailable) await prisma.$disconnect()
  })

  function requirePostgres(name: string): void {
    pg.requirePostgres(name)
  }

  beforeEach(() => {
    realFetch = global.fetch
  })
  afterEach(() => {
    global.fetch = realFetch
  })

  async function makeUndispatchedDisputedEscrow(suffix: string, ruling: 'RELEASE' | 'REFUND' | 'SPLIT', buyerBps: number | null = null) {
    const seller = await identityService.register({ publicKey: `m9r-seller-${suffix}-${Date.now()}`, displayName: 'Seller' })
    const buyer = await identityService.register({ publicKey: `m9r-buyer-${suffix}-${Date.now()}`, displayName: 'Buyer' })
    const offer = await liquidityRouter.createOffer({
      userId: seller.id, asset: 'BTC', side: 'SELL', priceUsd: '60000', minAmount: '0.001', maxAmount: '0.001', paymentMethod: 'OTHER',
    })
    const trade = await tradeService.createTrade({ offerId: offer.id, counterpartyId: buyer.id, amount: '0.001' })
    const escrow = await escrowService.createEscrow({ tradeId: trade.id, type: 'MULTISIG', lockedAmount: '0.001', asset: 'BTC' }, seller.id)
    await prisma.trade.update({ where: { id: trade.id }, data: { escrowId: escrow.id } })
    await escrowService.submitParticipantKey(escrow.id, buyer.id, BUYER_PUBKEY, MULTISIG_CAPABILITY_PROFILE_V1)
    await escrowService.submitParticipantKey(escrow.id, seller.id, SELLER_PUBKEY, MULTISIG_CAPABILITY_PROFILE_V1)

    const txid = createHash('sha256').update(`m9r-txid-${suffix}-${Date.now()}`).digest('hex')
    mockExplorerForUtxo(txid, 0, 100_000)
    await escrowService.lockFunds(escrow.id, seller.id)

    const dispute = await getDisputeService().raiseDispute(trade.id, buyer.id, `M9-R C4 test — ${suffix}`)
    expect(dispute.arbiterId).toBe(ARBITER_ID)

    if (ruling === 'RELEASE' || ruling === 'SPLIT') {
      await payoutAddressService.setPayoutAddress(buyer.id, 'BTC', testnetAddress(`m9r-c4-${suffix}-buyer`))
    }
    if (ruling === 'REFUND' || ruling === 'SPLIT') {
      await payoutAddressService.setPayoutAddress(seller.id, 'BTC', testnetAddress(`m9r-c4-${suffix}-seller`))
    }

    // Reproduces C4 exactly: the atomic Outcome-commit transaction runs
    // and COMMITS (Dispute.status -> RESOLVED, SemanticTransitionRecord
    // inserted) — and nothing else. In the real
    // applyRulingCoreAuthoritative(), the very next lines would call
    // assertDisputeDispatchEligible() then initiateRelease/Refund/Split();
    // this test stops right after the commit, exactly reproducing "the
    // process died before dispatch ever persisted the unsigned PSBT."
    const issuedAt = new Date().toISOString()
    const payload: AuthorityDecisionPayload = { disputeId: dispute.id, escrowId: escrow.id, appealRound: 0, authorityId: ARBITER_ID, outcome: ruling, buyerBps, issuedAt }
    const signature = signAuthorityDecision(payload, arbiterKeypair.secretKey)
    const disputeRow = await prisma.dispute.findUnique({ where: { id: dispute.id } })
    const commitResult = await commitAuthoritativeDisputeRuling(
      { id: dispute.id, escrowId: escrow.id, status: disputeRow!.status, appealRound: 0 },
      payload, signature, arbiterPublicKeyHex, '100000', 'BTC', buyer.id, seller.id,
    )
    expect(commitResult.committed).toBe(true)

    return { escrowId: escrow.id, tradeId: trade.id, disputeId: dispute.id, buyerId: buyer.id, sellerId: seller.id }
  }

  it('R1: reproduces C4 — Outcome committed, Dispute RESOLVED, escrow non-terminal, NO pending transaction exists', async () => {
    requirePostgres('R1 reproduction')
    const { escrowId, disputeId } = await makeUndispatchedDisputedEscrow('r1', 'RELEASE')

    const escrowRow = await prisma.escrow.findUnique({ where: { id: escrowId } })
    expect(escrowRow!.status).not.toMatch(/COMPLETED|REFUNDED|SPLIT/)
    const disputeRow = await prisma.dispute.findUnique({ where: { id: disputeId } })
    expect(disputeRow!.status).toBe('RESOLVED')
    const record = await prisma.semanticTransitionRecord.findUnique({
      where: { interactionId_transitionType_appealRound: { interactionId: escrowId, transitionType: 'escrow.dispute.rule', appealRound: 0 } },
    })
    expect(record).not.toBeNull()
    const pending = await prisma.escrowPendingTransaction.findUnique({ where: { escrowId } })
    expect(pending).toBeNull()

    // The client cannot simply retry — resolveDispute()'s own top-level
    // guard rejects a RESOLVED dispute unconditionally.
    await expect(
      getDisputeService().resolveDispute(disputeId, ARBITER_ID, 'RELEASE', undefined, undefined, undefined, 'irrelevant', new Date().toISOString())
    ).rejects.toThrow(/already resolved/)
  })

  it('RESUME_AUTHORIZED_DISPATCH: RELEASE — resumes using the historical destination, never re-consults current PayoutAddress', async () => {
    requirePostgres('C4 RELEASE recovery')
    const { escrowId, buyerId } = await makeUndispatchedDisputedEscrow('release', 'RELEASE')
    const historicalRecord = await prisma.semanticTransitionRecord.findUnique({
      where: { interactionId_transitionType_appealRound: { interactionId: escrowId, transitionType: 'escrow.dispute.rule', appealRound: 0 } },
    })
    const historicalDestination = (historicalRecord!.outcomeDestinationBinding as any[])[0].destination

    // Rotate the buyer's CURRENT payout address AFTER the Outcome
    // committed — the resumed dispatch must still use the historical one.
    await payoutAddressService.setPayoutAddress(buyerId, 'BTC', testnetAddress('m9r-release-rotated-after'))

    const report = await reconcileMissingDispatch()

    expect(report.resumed).toEqual([{ escrowId, disputeId: expect.any(String), ruling: 'RELEASE' }])
    const pending = await prisma.escrowPendingTransaction.findUnique({ where: { escrowId } })
    expect(pending).not.toBeNull()
    expect(pending!.toAddress).toBe(historicalDestination)
    expect(pending!.toAddress).not.toBe('m9r-release-rotated-after')
  })

  // REAL, PRE-EXISTING FINDING (not an M9-R defect, not a test artifact):
  // multisig.provider.ts's buildUnsignedRefund() ALWAYS derives the
  // refund destination from the seller's own committed MULTISIG pubkey
  // (a real P2WPKH address, EscrowParticipantKey — see that function's
  // own `sellerRefundAddress` line) and NEVER accepts a destination
  // argument at all (`initiateRefund(escrowId, triggeredBy)` — no
  // toAddress parameter exists). dispute-outcome.ts's
  // `resolveBeneficiaryDestination()`, however, unconditionally resolves
  // EVERY ruling's beneficiary destination — REFUND included — from the
  // seller's registered PayoutAddress. These two are different addresses
  // in the overwhelming common case (a PayoutAddress is user-registered
  // independently of the multisig script's own pubkey), so the durable
  // Outcome's own destinationBinding for a REFUND ruling does not match
  // what the real translation will ever pay. This means
  // assertTranslationMatchesOutcome() — run identically by the LIVE
  // applyRulingCoreAuthoritative() path, not just by this recovery module
  // — would ALREADY reject every real MULTISIG REFUND dispute ruling
  // today, crash or no crash; nothing in this M9-R pass introduced or
  // worsened this. Confirmed here only as a byproduct of building a real
  // reproduction, not assumed. Correctly out of THIS mission's scope to
  // fix (a change to how buildUnsignedRefund()/resolveBeneficiaryDestination()
  // agree on a REFUND destination is a Tier-3 M8-R dispatch-semantics fix,
  // not a recovery concern) — reported prominently in the M9-R final
  // report instead of silently patched here.
  //
  // What THIS test actually proves: recovery's own re-run of the SAME
  // guard the live path uses correctly detects this mismatch and fails
  // closed (GUARD_FAILED, pending row deleted, zero signatures collected
  // — no fund-movement risk) rather than blindly dispatching a
  // translation that doesn't match its own durable Outcome. That is
  // exactly the safety property this module exists to provide, whether
  // the mismatch's root cause is a genuine attack or (as here) a
  // pre-existing upstream defect.
  it('GUARD_FAILED: REFUND currently exposes a real, pre-existing M8-R destination-resolution mismatch — recovery correctly fails closed rather than dispatching it', async () => {
    requirePostgres('C4 REFUND recovery — pre-existing mismatch')
    const { escrowId } = await makeUndispatchedDisputedEscrow('refund', 'REFUND')

    const report = await reconcileMissingDispatch()

    expect(report.resumed.find((r) => r.escrowId === escrowId)).toBeUndefined()
    expect(report.guardFailed.find((r) => r.escrowId === escrowId)).toBeDefined()
    // Never left collectible — the mismatched pending row is deleted, not
    // silently left for a signer to unknowingly sign.
    const pending = await prisma.escrowPendingTransaction.findUnique({ where: { escrowId } })
    expect(pending).toBeNull()
  })

  it('RESUME_AUTHORIZED_DISPATCH: SPLIT — resumes with the historical buyerBps, never a re-derived one', async () => {
    requirePostgres('C4 SPLIT recovery')
    const { escrowId } = await makeUndispatchedDisputedEscrow('split', 'SPLIT', 6500)

    const report = await reconcileMissingDispatch()

    expect(report.resumed).toEqual([{ escrowId, disputeId: expect.any(String), ruling: 'SPLIT' }])
    const pending = await prisma.escrowPendingTransaction.findUnique({ where: { escrowId } })
    expect(pending).not.toBeNull()
    expect(pending!.buyerBps).toBe(6500)
  })

  it('duplicate workers: two concurrent recovery runs never create two competing pending transactions for the same C4 escrow', async () => {
    requirePostgres('C4 duplicate workers')
    const { escrowId } = await makeUndispatchedDisputedEscrow('concurrent', 'RELEASE')

    const [reportA, reportB] = await Promise.all([reconcileMissingDispatch(), reconcileMissingDispatch()])

    const resumedTotal = reportA.resumed.length + reportB.resumed.length
    const concurrentTotal = reportA.alreadyResumedConcurrently.length + reportB.alreadyResumedConcurrently.length
    // Exactly one of the two runs actually created the pending row for
    // this escrow; the other observed either "already exists" (lost the
    // pre-check) or "concurrent initiate" (lost the P2002 race inside the
    // lock) — never two successful creations.
    expect(resumedTotal + concurrentTotal).toBeGreaterThanOrEqual(1)
    const pendingRows = await prisma.escrowPendingTransaction.findMany({ where: { escrowId } })
    expect(pendingRows).toHaveLength(1)
  })

  it('a dispute whose ruling took the LEGACY (non-Core-authoritative) path is not a candidate at all — no durable Outcome exists for it', async () => {
    requirePostgres('legacy dispute is not a C4 candidate')
    // A RESOLVED dispute with no SemanticTransitionRecord at all (never
    // went through commitAuthoritativeDisputeRuling()) must be silently
    // excluded — this module's candidate query itself checks
    // `row.outcomeContent`, not just `Dispute.status === 'RESOLVED'`.
    const seller = await identityService.register({ publicKey: `m9r-legacy-seller-${Date.now()}`, displayName: 'Seller' })
    const buyer = await identityService.register({ publicKey: `m9r-legacy-buyer-${Date.now()}`, displayName: 'Buyer' })
    const offer = await liquidityRouter.createOffer({ userId: seller.id, asset: 'BTC', side: 'SELL', priceUsd: '60000', minAmount: '0.001', maxAmount: '0.001', paymentMethod: 'OTHER' })
    const trade = await tradeService.createTrade({ offerId: offer.id, counterpartyId: buyer.id, amount: '0.001' })
    const escrow = await escrowService.createEscrow({ tradeId: trade.id, type: 'MOCK', lockedAmount: '0.001', asset: 'BTC' }, seller.id)
    await prisma.trade.update({ where: { id: trade.id }, data: { escrowId: escrow.id } })
    await prisma.dispute.create({
      data: { tradeId: trade.id, escrowId: escrow.id, openedBy: buyer.id, reason: 'legacy', arbiterId: seller.id, status: 'RESOLVED', ruling: 'RELEASE', resolvedAt: new Date() },
    })

    const report = await reconcileMissingDispatch()
    expect(report.resumed.find((r) => r.escrowId === escrow.id)).toBeUndefined()
    expect(report.notEligible.find((r) => r.escrowId === escrow.id)).toBeUndefined()
    expect(report.failed.find((r) => r.escrowId === escrow.id)).toBeUndefined()
  })
})
