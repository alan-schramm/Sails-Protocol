// #239B (R3) — real-Postgres EVIDENCE for the fully-signed / disputed / never-broadcast boundary.
// Analysis only: this suite asserts the CURRENT behavior (no production code changed) so the CTO decision
// rests on reproduced facts, not inference. Real MULTISIG escrow, real secp256k1 keys, real PSBT signatures.
//
// The explorer is mocked: it records every broadcast attempt and answers existence/UTXO queries from a
// controlled model. That proves Sails' own state machine and what it does or does not submit — it does
// NOT prove mempool propagation, provider disagreement or chain behavior (REQUIRES_LIVE_ECONOMIC_REHEARSAL).
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

describe('#239B fully-signed cooperative round, disputed, never broadcast — real Postgres (evidence)', () => {
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

  const ARBITER_ID = 'r3-239b-test-arbiter'
  const arbiterKeypair = nacl.sign.keyPair()
  const arbiterPublicKeyHex = Buffer.from(arbiterKeypair.publicKey).toString('hex')
  const buyerKey = ECPair.fromPrivateKey(createHash('sha256').update('r3-239b-buyer').digest(), { network: NETWORK })
  const sellerKey = ECPair.fromPrivateKey(createHash('sha256').update('r3-239b-seller').digest(), { network: NETWORK })
  const createdEscrowIds: string[] = []
  let realFetch: typeof fetch

  /** Controlled explorer model: what the "network" knows, and every broadcast Sails attempts. */
  const chain = { fundingTxid: '', known: new Set<string>(), broadcasts: [] as string[] }
  function mockExplorer(): void {
    global.fetch = jest.fn(async (url: string, init?: { method?: string; body?: string }) => {
      if (init?.method === 'POST' && url.endsWith('/tx')) {
        chain.broadcasts.push(init.body!)
        return { ok: true, status: 200, text: async () => bitcoin.Transaction.fromHex(init.body!).getId() } as any
      }
      if (url.includes('/blocks/tip/height')) return { ok: true, status: 200, text: async () => '100' } as any
      if (url.includes('/v1/fees/recommended')) return { ok: true, status: 200, json: async () => ({ halfHourFee: 5, fastestFee: 8 }) } as any
      const status = url.match(/\/tx\/([0-9a-f]{64})\/status/)
      if (status) {
        return status[1] === chain.fundingTxid || chain.known.has(status[1])
          ? { ok: true, status: 200, json: async () => ({ confirmed: true, block_height: 100 }) } as any
          : { ok: false, status: 404, text: async () => 'Transaction not found', json: async () => ({}) } as any
      }
      return { ok: true, status: 200, json: async () => [{ txid: chain.fundingTxid, vout: 0, value: 100_000, status: { confirmed: true } }] } as any
    }) as any
  }

  beforeAll(async () => {
    process.env.MOCK_ESCROW = 'false'
    process.env.MULTISIG_SEED = process.env.MULTISIG_SEED || 'r3-239b-test-seed'
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
      create: { id: ARBITER_ID, publicKey: arbiterPublicKeyHex, displayName: 'R3 #239B Test Arbiter' },
    })
  })

  beforeEach(() => { realFetch = global.fetch; chain.known.clear(); chain.broadcasts = [] })
  afterEach(() => { global.fetch = realFetch })

  afterAll(async () => {
    if (dbAvailable) {
      // A fully signed, unclaimed round is a PASS 0 candidate for every later suite: remove the ones this suite created.
      await prisma.escrowPendingTransaction.deleteMany({ where: { escrowId: { in: createdEscrowIds } } })
      await prisma.$disconnect()
      await closeTestRedis()
    }
  })

  /** Funded MULTISIG escrow; the seller opens a cooperative REFUND (required: seller, buyer) and signs it for real. */
  async function fundedEscrowWithSellerSignedRefund(suffix: string) {
    const seller = await registerTestParticipant(identityService, 'Seller')
    const buyer = await registerTestParticipant(identityService, 'Buyer')
    const offer = await liquidityRouter.createOffer({ userId: seller.id, asset: 'BTC', side: 'SELL', priceUsd: '60000', minAmount: '0.001', maxAmount: '0.001', paymentMethod: 'OTHER' })
    const trade = await tradeService.createTrade({ offerId: offer.id, counterpartyId: buyer.id, amount: '0.001' })
    const escrow = await escrowService.createEscrow({ tradeId: trade.id, type: 'MULTISIG', lockedAmount: '0.001', asset: 'BTC' }, seller.id)
    createdEscrowIds.push(escrow.id)
    await prisma.trade.update({ where: { id: trade.id }, data: { escrowId: escrow.id } })
    await escrowService.submitParticipantKey(escrow.id, buyer.id, Buffer.from(buyerKey.publicKey).toString('hex'), MULTISIG_CAPABILITY_PROFILE_V1)
    await escrowService.submitParticipantKey(escrow.id, seller.id, Buffer.from(sellerKey.publicKey).toString('hex'), MULTISIG_CAPABILITY_PROFILE_V1)
    chain.fundingTxid = createHash('sha256').update(`r3-239b-${suffix}-${Date.now()}-${Math.random()}`).digest('hex')
    mockExplorer()
    await escrowService.lockFunds(escrow.id, seller.id)
    await payoutAddressService.setPayoutAddress(seller.id, 'BTC', bitcoin.payments.p2wpkh({ pubkey: Buffer.from(sellerKey.publicKey), network: NETWORK }).address!)
    await payoutAddressService.setPayoutAddress(buyer.id, 'BTC', bitcoin.payments.p2wpkh({ pubkey: Buffer.from(buyerKey.publicKey), network: NETWORK }).address!)

    const round = await escrowService.initiateRefund(escrow.id, seller.id)
    expect(round.requiredSigners).toEqual([seller.id, buyer.id])
    const sign = (key: typeof buyerKey) => { const copy = bitcoin.Psbt.fromBase64(round.unsignedPsbtBase64, { network: NETWORK }); copy.signInput(0, key); return copy.toBase64() }
    await escrowService.submitTransactionSignature(escrow.id, seller.id, sign(sellerKey))
    return { escrowId: escrow.id, tradeId: trade.id, roundId: round.id, buyerId: buyer.id, sellerId: seller.id, buyerSigned: sign(buyerKey), unsignedPsbtBase64: round.unsignedPsbtBase64 }
  }

  /** Runs PASS 0 until this escrow's round has been taken by C8 (the shared queue may hold older rows). */
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

  it('T0 the residual is reachable through the public path: dispute, then the last signature — fully signed, never broadcast, and no exit for cooperative execution, the ruling, or C8', async () => {
    pg.requirePostgres('T0')
    const f = await fundedEscrowWithSellerSignedRefund('t0')

    // H2: the dispute opens (#238), THEN the last required signer submits.
    const dispute = await getDisputeService().raiseDispute(f.tradeId, f.buyerId, '#239B T0')
    await expect(escrowService.submitTransactionSignature(f.escrowId, f.buyerId, f.buyerSigned))
      .rejects.toThrow(/carries no recorded Economic Disposition Authority provenance/)
    const round = await prisma.escrowPendingTransaction.findUniqueOrThrow({ where: { id: f.roundId }, include: { signatures: true } })
    expect(round.signatures.map((s) => s.participantId).sort()).toEqual([f.buyerId, f.sellerId].sort()) // fully signed
    expect(chain.broadcasts).toEqual([]) // and Sails never broadcast it
    expect((await prisma.escrow.findUniqueOrThrow({ where: { id: f.escrowId } })).status).toBe('DISPUTED')

    // The ruling cannot dispatch over it (#239A deliberately never supersedes a fully signed round).
    const issuedAt = new Date().toISOString()
    const payload: AuthorityDecisionPayload = { disputeId: dispute.id, escrowId: f.escrowId, appealRound: 0, authorityId: ARBITER_ID, outcome: 'RELEASE', buyerBps: null, issuedAt }
    await expect(getDisputeService().resolveDispute(dispute.id, ARBITER_ID, 'RELEASE', undefined, undefined, undefined, signAuthorityDecision(payload, arbiterKeypair.secretKey), issuedAt))
      .rejects.toThrow(/Dispatch eligibility check failed/)
    expect((await prisma.dispute.findUniqueOrThrow({ where: { id: dispute.id } })).status).not.toBe('RESOLVED')
    expect((await prisma.escrowPendingTransaction.findMany({ where: { escrowId: f.escrowId } })).map((r) => r.id)).toEqual([f.roundId])

    // C8 asks the chain (404 + funding UTXO unspent), then refuses at the ADR-005 gate — every lap, never broadcasting.
    for (let lap = 0; lap < 2; lap++) {
      const mine = await c8Until(f.escrowId)
      expect(mine.resumed).toEqual([])
      expect(mine.failed).toEqual([{ escrowId: f.escrowId, error: expect.stringMatching(/carries no recorded Economic Disposition Authority provenance/) }])
    }
    expect(chain.broadcasts).toEqual([])
    expect((await prisma.escrow.findUniqueOrThrow({ where: { id: f.escrowId } })).status).toBe('DISPUTED')
  })

  it('T0b the complete set is a bearer authorization: what the pending-transaction read returns to a party is enough to build the exact spend without Sails', async () => {
    pg.requirePostgres('T0b')
    const f = await fundedEscrowWithSellerSignedRefund('t0b')
    await getDisputeService().raiseDispute(f.tradeId, f.buyerId, '#239B T0b')
    await expect(escrowService.submitTransactionSignature(f.escrowId, f.buyerId, f.buyerSigned)).rejects.toThrow()

    // GET /v1/settlement/escrow/:id/pending-transaction returns this to buyer, seller and assigned arbiter.
    const visible = await escrowService.getPendingTransaction(f.escrowId)
    const signed = visible.signatures.map((s: { signedPsbtBase64: string }) => bitcoin.Psbt.fromBase64(s.signedPsbtBase64, { network: NETWORK }))
    const offline = bitcoin.Psbt.fromBase64(visible.unsignedPsbtBase64, { network: NETWORK }).combine(...signed)
    offline.finalizeAllInputs()
    const tx = offline.extractTransaction() // a complete, valid spend of the funding outpoint, built with bitcoinjs only

    expect(tx.ins).toHaveLength(1)
    expect(Buffer.from(tx.ins[0].hash).reverse().toString('hex')).toBe(chain.fundingTxid)
    // ...and it is exactly the transaction Sails' own C8 reconstruction recognizes.
    const sailsTx = multisigProvider.buildFinalizedTransaction(f.tradeId, f.unsignedPsbtBase64, visible.signatures.map((s: { signedPsbtBase64: string }) => s.signedPsbtBase64))
    expect(tx.getId()).toBe(sailsTx.getId())
  })

  it('T0c the existing exit: once that exact transaction is on the network (anyone broadcast it), C8 converges the escrow from chain truth despite the dispute — and the dispute is left open', async () => {
    pg.requirePostgres('T0c')
    const f = await fundedEscrowWithSellerSignedRefund('t0c')
    const dispute = await getDisputeService().raiseDispute(f.tradeId, f.buyerId, '#239B T0c')
    await expect(escrowService.submitTransactionSignature(f.escrowId, f.buyerId, f.buyerSigned)).rejects.toThrow()
    const visible = await escrowService.getPendingTransaction(f.escrowId)
    const txid = multisigProvider.buildFinalizedTransaction(f.tradeId, f.unsignedPsbtBase64, visible.signatures.map((s: { signedPsbtBase64: string }) => s.signedPsbtBase64)).getId()

    chain.known.add(txid) // a party broadcast it themselves (outside Sails)
    const mine = await c8Until(f.escrowId)

    expect(mine.resumed).toEqual([{ escrowId: f.escrowId, txId: txid, outcome: 'ALREADY_BROADCAST' }])
    expect(chain.broadcasts).toEqual([]) // Sails submitted nothing; it converged to observed truth
    const escrow = await prisma.escrow.findUniqueOrThrow({ where: { id: f.escrowId } })
    expect([escrow.status, escrow.txReleaseId]).toEqual(['REFUNDED', txid])
    expect((await prisma.dispute.findUniqueOrThrow({ where: { id: dispute.id } })).status).toBe('OPENED') // finding: dispute not closed
  })
})
