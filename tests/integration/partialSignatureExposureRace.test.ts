// #239C (R3) — real-Postgres EVIDENCE for the partial-signature exposure race (P1) and the H2 history.
// Analysis only: asserts CURRENT behavior, no production change. Real MULTISIG escrow (2-of-3 P2WSH), real
// secp256k1 keys, real PSBT signatures, real bitcoinjs assembly of both competing spends.
//
// The chain is a controlled MODEL (mocked explorer): it decides which of two conflicting spends of the
// funding outpoint "wins" and rejects the other, as a node would. That shows what Sails does in each case;
// it does NOT prove mempool/propagation/race behavior (REQUIRES_LIVE_ECONOMIC_REHEARSAL).
import { PrismaClient } from '@prisma/client'
import * as bitcoin from 'bitcoinjs-lib'
import * as ecc from '@bitcoinerlab/secp256k1'
import { ECPairFactory } from 'ecpair'
import { createHash } from 'crypto'
import nacl from 'tweetnacl'
import { createPostgresIntegrationHarness } from './postgresTestHarness'
import { registerTestParticipant, closeTestRedis } from './identityTestHelpers'
import { MULTISIG_CAPABILITY_PROFILE_V1 } from '@satsails/p2p-schemas'
import type { AuthorityDecisionPayload } from '../../src/modules/open-settlement/arbitration-authority'

bitcoin.initEccLib(ecc)
const ECPair = ECPairFactory(ecc)
const NETWORK = bitcoin.networks.testnet

describe('#239C partial-signature exposure: a superseded cooperative spend stays completable and races the ruling — real Postgres (evidence)', () => {
  jest.setTimeout(180_000)
  const pg = createPostgresIntegrationHarness()
  let dbAvailable = false
  let prisma: PrismaClient
  let escrowService: import('../../src/modules/open-settlement/escrow.service').EscrowService
  let identityService: typeof import('../../src/modules/open-identity/identity.service').identityService
  let liquidityRouter: typeof import('../../src/modules/open-liquidity/liquidity.service').liquidityRouter
  let tradeService: typeof import('../../src/modules/open-p2p/trade.service').tradeService
  let getDisputeService: typeof import('../../src/modules/open-settlement/dispute.service').getDisputeService
  let payoutAddressService: typeof import('../../src/modules/open-settlement/payout-address.service').payoutAddressService
  let signAuthorityDecision: typeof import('../../src/modules/open-settlement/arbitration-authority').signAuthorityDecision
  let reconcilePendingSettlements: typeof import('../../src/modules/open-settlement/escrow-settlement-reconciliation.service').reconcilePendingSettlements
  let multisigProvider: any

  const ARBITER_ID = 'r3-239c-test-arbiter'
  const arbiterKeypair = nacl.sign.keyPair()
  const arbiterPublicKeyHex = Buffer.from(arbiterKeypair.publicKey).toString('hex')
  const buyerKey = ECPair.fromPrivateKey(createHash('sha256').update('r3-239c-buyer').digest(), { network: NETWORK })
  const sellerKey = ECPair.fromPrivateKey(createHash('sha256').update('r3-239c-seller').digest(), { network: NETWORK })
  const createdEscrowIds: string[] = []
  let realFetch: typeof fetch

  /** Controlled chain model: one funding outpoint; the first accepted spend of it wins, a conflicting one is rejected. */
  const chain = { fundingTxid: '', known: new Set<string>(), spentBy: null as string | null, sailsBroadcasts: [] as string[] }
  function mockExplorer(): void {
    global.fetch = jest.fn(async (url: string, init?: { method?: string; body?: string }) => {
      if (init?.method === 'POST' && url.endsWith('/tx')) {
        const txid = bitcoin.Transaction.fromHex(init.body!).getId()
        chain.sailsBroadcasts.push(txid)
        if (chain.spentBy && chain.spentBy !== txid) return { ok: false, status: 400, text: async () => 'sendrawtransaction RPC error: bad-txns-inputs-missingorspent' } as any
        chain.spentBy = txid
        chain.known.add(txid)
        return { ok: true, status: 200, text: async () => txid } as any
      }
      if (url.includes('/blocks/tip/height')) return { ok: true, status: 200, text: async () => '100' } as any
      if (url.includes('/v1/fees/recommended')) return { ok: true, status: 200, json: async () => ({ halfHourFee: 5, fastestFee: 8 }) } as any
      const status = url.match(/\/tx\/([0-9a-f]{64})\/status/)
      if (status) {
        return status[1] === chain.fundingTxid || chain.known.has(status[1])
          ? { ok: true, status: 200, json: async () => ({ confirmed: true, block_height: 100 }) } as any
          : { ok: false, status: 404, text: async () => 'Transaction not found', json: async () => ({}) } as any
      }
      return { ok: true, status: 200, json: async () => (chain.spentBy ? [] : [{ txid: chain.fundingTxid, vout: 0, value: 100_000, status: { confirmed: true } }]) } as any
    }) as any
  }
  /** Someone outside Sails broadcasts a spend; the model accepts it if the outpoint is still unspent. */
  const externalBroadcast = (tx: bitcoin.Transaction) => {
    if (chain.spentBy && chain.spentBy !== tx.getId()) return false
    chain.spentBy = tx.getId()
    chain.known.add(tx.getId())
    return true
  }

  beforeAll(async () => {
    process.env.MOCK_ESCROW = 'false'
    process.env.MULTISIG_SEED = process.env.MULTISIG_SEED || 'r3-239c-test-seed'
    process.env.TRUSTED_ARBITRATORS = ARBITER_ID
    await pg.probe()
    dbAvailable = pg.isAvailable()
    if (!dbAvailable) return
    ;({ prisma } = require('../../src/common/database'))
    ;({ escrowService } = require('../../src/modules/open-settlement/escrow.service'))
    ;({ identityService } = require('../../src/modules/open-identity/identity.service'))
    ;({ liquidityRouter } = require('../../src/modules/open-liquidity/liquidity.service'))
    ;({ tradeService } = require('../../src/modules/open-p2p/trade.service'))
    ;({ getDisputeService } = require('../../src/modules/open-settlement/dispute.service'))
    ;({ payoutAddressService } = require('../../src/modules/open-settlement/payout-address.service'))
    ;({ signAuthorityDecision } = require('../../src/modules/open-settlement/arbitration-authority'))
    ;({ reconcilePendingSettlements } = require('../../src/modules/open-settlement/escrow-settlement-reconciliation.service'))
    ;({ multisigProvider } = require('../../src/modules/open-settlement/multisig.provider'))
    const { intentEngine } = require('../../src/core/intent-engine')
    intentEngine.registerHandler(require('../../src/modules/open-p2p/intent-handler').OpenP2PTradeIntentHandler)
    require('../../src/common/events/handlers').registerEventHandlers()
    await prisma.user.upsert({
      where: { id: ARBITER_ID },
      update: { publicKey: arbiterPublicKeyHex },
      create: { id: ARBITER_ID, publicKey: arbiterPublicKeyHex, displayName: 'R3 #239C Test Arbiter' },
    })
  })

  beforeEach(() => { realFetch = global.fetch; chain.known.clear(); chain.spentBy = null; chain.sailsBroadcasts = [] })
  afterEach(() => { global.fetch = realFetch })

  afterAll(async () => {
    if (dbAvailable) {
      // Fully signed, unclaimed MULTISIG rounds are PASS 0 candidates for every later suite: remove this suite's own.
      await prisma.escrowPendingTransaction.deleteMany({ where: { escrowId: { in: createdEscrowIds } } })
      await prisma.$disconnect()
      await closeTestRedis()
    }
  })

  const signPsbt = (unsignedPsbtBase64: string, key: typeof buyerKey) => {
    const copy = bitcoin.Psbt.fromBase64(unsignedPsbtBase64, { network: NETWORK })
    copy.signInput(0, key)
    return copy.toBase64()
  }
  /** What any holder does outside Sails: combine the signed copies, finalize, extract. bitcoinjs only. */
  const assembleOffline = (unsignedPsbtBase64: string, signedCopies: string[]) => {
    const psbt = bitcoin.Psbt.fromBase64(unsignedPsbtBase64, { network: NETWORK }).combine(...signedCopies.map((s) => bitcoin.Psbt.fromBase64(s, { network: NETWORK })))
    psbt.finalizeAllInputs()
    return psbt.extractTransaction()
  }
  const outputsOf = (tx: bitcoin.Transaction) => tx.outs.map((o) => ({ address: bitcoin.address.fromOutputScript(o.script, NETWORK), value: Number(o.value) }))

  /**
   * Funded MULTISIG escrow; the buyer marks the fiat payment sent (PAYMENT_PENDING); the SELLER (the payer of
   * a release) opens a cooperative RELEASE to the buyer and signs it. The buyer - the release's beneficiary and
   * its only missing signer - reads the round as GET /v1/settlement/escrow/:id/pending-transaction returns it.
   */
  async function sellerSignedRelease(suffix: string) {
    const seller = await registerTestParticipant(identityService, 'Seller')
    const buyer = await registerTestParticipant(identityService, 'Buyer')
    const offer = await liquidityRouter.createOffer({ userId: seller.id, asset: 'BTC', side: 'SELL', priceUsd: '60000', minAmount: '0.001', maxAmount: '0.001', paymentMethod: 'OTHER' })
    const trade = await tradeService.createTrade({ offerId: offer.id, counterpartyId: buyer.id, amount: '0.001' })
    const escrow = await escrowService.createEscrow({ tradeId: trade.id, type: 'MULTISIG', lockedAmount: '0.001', asset: 'BTC' }, seller.id)
    createdEscrowIds.push(escrow.id)
    await prisma.trade.update({ where: { id: trade.id }, data: { escrowId: escrow.id } })
    await escrowService.submitParticipantKey(escrow.id, buyer.id, Buffer.from(buyerKey.publicKey).toString('hex'), MULTISIG_CAPABILITY_PROFILE_V1)
    await escrowService.submitParticipantKey(escrow.id, seller.id, Buffer.from(sellerKey.publicKey).toString('hex'), MULTISIG_CAPABILITY_PROFILE_V1)
    chain.fundingTxid = createHash('sha256').update(`r3-239c-${suffix}-${Date.now()}-${Math.random()}`).digest('hex')
    mockExplorer()
    await escrowService.lockFunds(escrow.id, seller.id)
    await payoutAddressService.setPayoutAddress(seller.id, 'BTC', bitcoin.payments.p2wpkh({ pubkey: Buffer.from(sellerKey.publicKey), network: NETWORK }).address!)
    await payoutAddressService.setPayoutAddress(buyer.id, 'BTC', bitcoin.payments.p2wpkh({ pubkey: Buffer.from(buyerKey.publicKey), network: NETWORK }).address!)
    await escrowService.markPaymentSent(escrow.id, buyer.id)

    const round = await escrowService.initiateRelease(escrow.id, undefined, seller.id)
    expect(round.requiredSigners.slice().sort()).toEqual([buyer.id, seller.id].sort())
    await escrowService.submitTransactionSignature(escrow.id, seller.id, signPsbt(round.unsignedPsbtBase64, sellerKey))
    const readByBuyer = await escrowService.getPendingTransaction(escrow.id) // the API response the buyer is entitled to
    return { escrowId: escrow.id, tradeId: trade.id, roundId: round.id, buyerId: buyer.id, sellerId: seller.id, readByBuyer }
  }

  async function ruleRefund(disputeId: string, escrowId: string) {
    const issuedAt = new Date().toISOString()
    const payload: AuthorityDecisionPayload = { disputeId, escrowId, appealRound: 0, authorityId: ARBITER_ID, outcome: 'REFUND', buyerBps: null, issuedAt }
    return getDisputeService().resolveDispute(disputeId, ARBITER_ID, 'REFUND', undefined, undefined, undefined, signAuthorityDecision(payload, arbiterKeypair.secretKey), issuedAt)
  }

  async function c8Until(escrowId: string) {
    for (let lap = 0; lap < 60; lap++) {
      const report = await reconcilePendingSettlements()
      const mine = {
        resumed: report.resumedUnclaimed.filter((r) => r.escrowId === escrowId),
        failed: report.failed.filter((r) => r.escrowId === escrowId),
        manual: report.requiresManualReview.filter((r) => r.escrowId === escrowId),
      }
      if (mine.resumed.length + mine.failed.length + mine.manual.length > 0) return mine
    }
    throw new Error(`C8 never took escrow ${escrowId}`)
  }

  it('P1 the payer\'s one exposed signature lets the beneficiary complete the superseded cooperative spend alone; it conflicts with the ruling, and if it wins the ruling cannot execute and Sails lands in ANOMALY', async () => {
    pg.requirePostgres('P1')
    const f = await sellerSignedRelease('p1')
    const sellerReleaseSig = f.readByBuyer.signatures.find((s: { participantId: string }) => s.participantId === f.sellerId)!.signedPsbtBase64

    // The payer disputes; the arbiter rules REFUND; #239A supersedes the partial cooperative release.
    const dispute = await getDisputeService().raiseDispute(f.tradeId, f.sellerId, 'buyer reversed the fiat payment')
    const resolved = await ruleRefund(dispute.id, f.escrowId)
    expect(resolved).toMatchObject({ status: 'RESOLVED', ruling: 'REFUND' })
    const rulingRound = await prisma.escrowPendingTransaction.findUniqueOrThrow({ where: { escrowId: f.escrowId } })
    expect(rulingRound.id).not.toBe(f.roundId)
    expect(await prisma.escrowTransactionSignature.count({ where: { pendingTxId: f.roundId } })).toBe(0) // gone from Sails

    // Outside Sails: the buyer signs the OLD release with their own key and combines it with the seller's
    // signature they read earlier. 2-of-3 satisfied: a complete, valid spend of the funding outpoint.
    const oldRelease = assembleOffline(f.readByBuyer.unsignedPsbtBase64, [sellerReleaseSig, signPsbt(f.readByBuyer.unsignedPsbtBase64, buyerKey)])
    // The ruling's spend: arbiter pre-signed by Sails, the seller adds their signature.
    const rulingRefund = multisigProvider.buildFinalizedTransaction(f.tradeId, rulingRound.unsignedPsbtBase64, [signPsbt(rulingRound.unsignedPsbtBase64, sellerKey)])
    const buyerPayout = bitcoin.payments.p2wpkh({ pubkey: Buffer.from(buyerKey.publicKey), network: NETWORK }).address!
    const sellerPayout = bitcoin.payments.p2wpkh({ pubkey: Buffer.from(sellerKey.publicKey), network: NETWORK }).address!

    const spends = [oldRelease, rulingRefund].map((tx) => Buffer.from(tx.ins[0].hash).reverse().toString('hex') + ':' + tx.ins[0].index)
    expect(spends).toEqual([`${chain.fundingTxid}:0`, `${chain.fundingTxid}:0`]) // the same outpoint: mutually exclusive
    expect(outputsOf(oldRelease).map((o) => o.address)).toContain(buyerPayout) // pays the buyer...
    expect(outputsOf(rulingRefund).map((o) => o.address)).toContain(sellerPayout) // ...the ruling pays the seller
    expect(outputsOf(oldRelease).map((o) => o.address)).not.toContain(sellerPayout)

    // The model: the buyer's broadcast reaches the network first.
    expect(externalBroadcast(oldRelease)).toBe(true)

    // The ruling cannot execute: the seller's signature completes it, the broadcast is rejected as a double spend,
    // the claim is reverted.
    await expect(escrowService.submitTransactionSignature(f.escrowId, f.sellerId, signPsbt(rulingRound.unsignedPsbtBase64, sellerKey)))
      .rejects.toThrow(/bad-txns-inputs-missingorspent/)
    expect((await prisma.escrow.findUniqueOrThrow({ where: { id: f.escrowId } })).status).toBe('DISPUTED')

    // C8 on the (now fully signed) ruling round: its txid unknown, the outpoint spent by something else -> ANOMALY.
    const mine = await c8Until(f.escrowId)
    expect(mine.resumed).toEqual([])
    expect(mine.manual).toEqual([{ escrowId: f.escrowId, reason: expect.stringMatching(/no longer unspent, but no transaction matching the expected reconstructed txid/) }])
    // Durable result: the ruling says REFUND, the money went to the buyer, Sails cannot converge either way.
    expect((await prisma.dispute.findUniqueOrThrow({ where: { id: dispute.id } })).ruling).toBe('REFUND')
    expect((await prisma.escrow.findUniqueOrThrow({ where: { id: f.escrowId } })).status).toBe('DISPUTED')
  })

  it('P1b if the ruling reaches the network first instead, the buyer\'s old release is the one rejected - the outcome is decided by the race, not by authority', async () => {
    pg.requirePostgres('P1b')
    const f = await sellerSignedRelease('p1b')
    const sellerReleaseSig = f.readByBuyer.signatures.find((s: { participantId: string }) => s.participantId === f.sellerId)!.signedPsbtBase64
    const dispute = await getDisputeService().raiseDispute(f.tradeId, f.sellerId, 'buyer reversed the fiat payment')
    await ruleRefund(dispute.id, f.escrowId)
    const rulingRound = await prisma.escrowPendingTransaction.findUniqueOrThrow({ where: { escrowId: f.escrowId } })

    const result = await escrowService.submitTransactionSignature(f.escrowId, f.sellerId, signPsbt(rulingRound.unsignedPsbtBase64, sellerKey))
    expect(result).toMatchObject({ complete: true })
    expect((await prisma.escrow.findUniqueOrThrow({ where: { id: f.escrowId } })).status).toBe('REFUNDED')

    const oldRelease = assembleOffline(f.readByBuyer.unsignedPsbtBase64, [sellerReleaseSig, signPsbt(f.readByBuyer.unsignedPsbtBase64, buyerKey)])
    expect(externalBroadcast(oldRelease)).toBe(false) // still a valid transaction; it simply lost the race
  })

  it('H2 after the dispute opens, the beneficiary still completes the payer-signed round - through Sails (accepted, not executed) or alone (always)', async () => {
    pg.requirePostgres('H2')
    const f = await sellerSignedRelease('h2')
    await getDisputeService().raiseDispute(f.tradeId, f.sellerId, 'dispute before the beneficiary signs')

    const buyerSig = signPsbt(f.readByBuyer.unsignedPsbtBase64, buyerKey)
    // Through Sails: the signature is accepted into the round (#244), ADR-005 refuses execution -> the #239B residual.
    await expect(escrowService.submitTransactionSignature(f.escrowId, f.buyerId, buyerSig)).rejects.toThrow(/carries no recorded Economic Disposition Authority provenance/)
    expect(await prisma.escrowTransactionSignature.count({ where: { pendingTxId: f.roundId } })).toBe(2)
    // Alone: no Sails acceptance is needed at all - the same complete spend exists either way.
    const sellerReleaseSig = f.readByBuyer.signatures.find((s: { participantId: string }) => s.participantId === f.sellerId)!.signedPsbtBase64
    const alone = assembleOffline(f.readByBuyer.unsignedPsbtBase64, [sellerReleaseSig, buyerSig])
    const viaSails = multisigProvider.buildFinalizedTransaction(f.tradeId, f.readByBuyer.unsignedPsbtBase64, [buyerSig, sellerReleaseSig])
    expect(alone.getId()).toBe(viaSails.getId())
  })
})
