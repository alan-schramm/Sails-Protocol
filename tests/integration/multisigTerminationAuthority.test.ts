// tests/integration/multisigTerminationAuthority.test.ts
//
// #235 R7G F8 — MULTISIG unfunded-but-fundable termination authority, on real PostgreSQL with real secp256k1 keys
// and signatures. EVIDENCE: no production code is changed by this file.
//
// What it establishes:
//   A. An addressed (fundable) MULTISIG escrow that is not yet funded has NO terminal path in the protocol: trade
//      cancellation is refused (R7G-B1), refund needs a recorded funding outpoint, expiry applies only to
//      FUNDS_LOCKED, reconciliation and the expiry sweep leave it CREATED. Late funding of the exact amount — after
//      every refused termination, an explorer outage and a fresh node — is recognized and refunds with a VALID spend.
//   B. Value that reaches the same valid script but is NOT the escrow's recognized funding outpoint — a deposit below
//      the required amount, or any deposit after the escrow is terminal — has no protocol authority at all: lock,
//      cancel and refund all refuse, nothing records it, and it stays on the script after the escrow ends. Only the
//      participants' own keys (2-of-3) can still move it, outside Sails. Who that value belongs to is not decided by
//      any frozen policy (STOP_FOR_CTO).
//
// The explorer is mocked address-faithfully (as in multisigScriptAuthority.test.ts); spends are checked by an
// independent P2WSH 2-of-3 validator (BIP141 program hash, BIP143 sighash, ordered CHECKMULTISIG).

import { PrismaClient } from '@prisma/client'
import * as bitcoin from 'bitcoinjs-lib'
import * as ecc from '@bitcoinerlab/secp256k1'
import { ECPairFactory } from 'ecpair'
import { createHash, randomBytes } from 'crypto'
import { MULTISIG_CAPABILITY_PROFILE_V1 } from '@satsails/p2p-schemas'
import { createPostgresIntegrationHarness } from './postgresTestHarness'
import { closeTestRedis } from './identityTestHelpers'

bitcoin.initEccLib(ecc)
const ECPair = ECPairFactory(ecc)
const NET = bitcoin.networks.testnet
const keyOf = (label: string) => ECPair.fromPrivateKey(createHash('sha256').update(`r7gf8-${label}`).digest(), { network: NET })
const hex = (k: { publicKey: Uint8Array }) => Buffer.from(k.publicKey).toString('hex')
const payout = (label: string) => bitcoin.payments.p2wpkh({ pubkey: Buffer.from(ecc.pointFromScalar(createHash('sha256').update(label).digest(), true)!), network: NET }).address!
const FUNDING = 100_000 // 0.001 BTC, the trade amount

// ─── address-faithful explorer with an outage switch, broadcast capture ─────────────────────────────────
const chain = new Map<string, Array<{ txid: string; vout: number; value: number }>>()
const known = new Set<string>()
const broadcasts: string[] = []
let outage = false
function explorer() {
  global.fetch = jest.fn(async (url: any, init?: any) => {
    const u = String(url)
    if (outage) return { ok: false, status: 503, text: async () => 'unavailable', json: async () => ({}) } as any
    if (u.includes('/blocks/tip/height')) return { ok: true, text: async () => '200' } as any
    if (u.includes('/fees/recommended')) return { ok: true, json: async () => ({ halfHourFee: 2, fastestFee: 3 }) } as any
    const st = u.match(/\/tx\/([0-9a-f]{64})\/status/)
    if (st) return known.has(st[1]) ? { ok: true, json: async () => ({ confirmed: true, block_height: 100 }) } as any : { ok: false, status: 404, text: async () => 'not found', json: async () => ({}) } as any
    const os = u.match(/\/tx\/([0-9a-f]{64})\/outspend\/(\d+)/)
    if (os) return { ok: true, json: async () => ({ spent: false }) } as any
    const m = u.match(/\/address\/([^/]+)\/utxo/)
    if (m) return { ok: true, json: async () => (chain.get(m[1]) ?? []).map((x) => ({ ...x, status: { confirmed: true } })) } as any
    if (u.endsWith('/tx') && init?.method === 'POST') {
      const raw = String(init.body)
      broadcasts.push(raw)
      const tx = bitcoin.Transaction.fromHex(raw)
      for (const input of tx.ins) { // a broadcast spend consumes its outpoint
        const spentTxid = Buffer.from(input.hash).reverse().toString('hex')
        for (const [addr, utxos] of chain) chain.set(addr, utxos.filter((x) => !(x.txid === spentTxid && x.vout === input.index)))
      }
      return { ok: true, status: 200, text: async () => tx.getId() } as any
    }
    return { ok: false, status: 404, text: async () => 'not found', json: async () => ({}) } as any
  }) as any
}
/** A confirmed deposit of `value` sats to `address` (appended: an address can receive any number of outputs). */
const deposit = (address: string, value: number) => {
  const txid = randomBytes(32).toString('hex')
  known.add(txid)
  chain.set(address, [...(chain.get(address) ?? []), { txid, vout: 0, value }])
  return { txid, vout: 0, value }
}

// ─── independent P2WSH 2-of-3 validation ─────────────────────────────────────────────────────────────────
function validateSpend(rawHex: string, fundedAddress: string, value: number): { valid: boolean; why: string } {
  const tx = bitcoin.Transaction.fromHex(rawHex)
  const w = tx.ins[0].witness
  if (w.length !== 4 || w[0].length !== 0) return { valid: false, why: 'witness shape' }
  const witnessScript = Buffer.from(w[3])
  const program = Buffer.from(bitcoin.address.toOutputScript(fundedAddress, NET)).subarray(2)
  if (!createHash('sha256').update(witnessScript).digest().equals(program)) return { valid: false, why: 'program mismatch' }
  const pubkeys = bitcoin.script.decompile(witnessScript)!.slice(1, 4).map((c) => Buffer.from(c as Uint8Array))
  let k = 0
  for (const sigBuf of [w[1], w[2]]) {
    const { signature, hashType } = bitcoin.script.signature.decode(Buffer.from(sigBuf))
    const hash = tx.hashForWitnessV0(0, witnessScript, BigInt(value), hashType)
    while (k < pubkeys.length && !ecc.verify(hash, pubkeys[k], signature)) k++
    if (k === pubkeys.length) return { valid: false, why: 'signature does not verify' }
    k++
  }
  return { valid: true, why: '2 valid ordered signatures' }
}

describe('#235 R7G F8 — MULTISIG unfunded-but-fundable termination authority (real PostgreSQL, real cryptography)', () => {
  jest.setTimeout(180_000)
  const pg = createPostgresIntegrationHarness()
  let prisma: PrismaClient
  let escrowService: any, tradeService: any, reconcile: any
  const extra: Array<{ prisma: any; redis?: any }> = []
  let realFetch: typeof fetch

  beforeAll(async () => {
    process.env.MOCK_ESCROW = 'false'
    process.env.MULTISIG_SEED = 'r7gf8-seed'
    process.env.TRUSTED_ARBITRATORS = 'r7gf8-arbiter'
    process.env.MULTISIG_NETWORK = 'testnet'
    process.env.MULTISIG_FUNDING_REQUIRED_CONFIRMATIONS = '1'
    await pg.probe()
    if (!pg.isAvailable()) return
    ;({ prisma } = require('../../src/common/database'))
    require('../../src/common/events/handlers').registerEventHandlers()
    ;({ escrowService } = require('../../src/modules/open-settlement/escrow.service'))
    ;({ tradeService } = require('../../src/modules/open-p2p/trade.service'))
    ;({ reconcilePendingSettlements: reconcile } = require('../../src/modules/open-settlement/escrow-settlement-reconciliation.service'))
    realFetch = global.fetch
    explorer()
  })

  afterAll(async () => {
    if (!pg.isAvailable()) return
    global.fetch = realFetch
    try {
      const users = (await prisma.user.findMany({ where: { displayName: { startsWith: 'r7gf8-' } }, select: { id: true } })).map((u) => u.id)
      const tradeIds = (await prisma.trade.findMany({ where: { OR: [{ buyerId: { in: users } }, { sellerId: { in: users } }] }, select: { id: true } })).map((t) => t.id)
      const escrowIds = (await prisma.escrow.findMany({ where: { tradeId: { in: tradeIds } }, select: { id: true } })).map((e) => e.id)
      const pendingIds = (await prisma.escrowPendingTransaction.findMany({ where: { escrowId: { in: escrowIds } }, select: { id: true } })).map((p) => p.id)
      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('ALTER TABLE escrow_participant_keys DISABLE TRIGGER escrow_participant_keys_arbiter_immutability_guard')
        await tx.$executeRawUnsafe('ALTER TABLE escrow_participant_keys DISABLE TRIGGER escrow_participant_keys_script_authority_guard')
        await tx.$executeRaw`DELETE FROM escrow_participant_keys WHERE "escrowId" = ANY(${escrowIds})`
        await tx.$executeRawUnsafe('ALTER TABLE escrow_participant_keys ENABLE TRIGGER escrow_participant_keys_script_authority_guard')
        await tx.$executeRawUnsafe('ALTER TABLE escrow_participant_keys ENABLE TRIGGER escrow_participant_keys_arbiter_immutability_guard')
      })
      const refs = await prisma.$queryRaw<Array<{ table_name: string; column_name: string }>>`
        SELECT table_name, column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND column_name IN ('tradeId', 'escrowId', 'interactionId', 'pendingTxId')
          AND table_name NOT IN ('trades', 'escrows', 'escrow_participant_keys')`
      for (let pass = 0; pass < 5; pass++) {
        for (const { table_name, column_name } of refs) {
          const ids = column_name === 'tradeId' ? tradeIds : column_name === 'pendingTxId' ? pendingIds : escrowIds
          await prisma.$executeRawUnsafe(`DELETE FROM "${table_name}" WHERE "${column_name}" = ANY($1)`, ids).catch(() => undefined)
        }
      }
      await prisma.$executeRaw`DELETE FROM event_projection_claims WHERE "subjectId" = ANY(${tradeIds}) OR "subjectId" = ANY(${escrowIds})`
      await prisma.durableEventRecord.deleteMany({ where: { correlationId: { in: tradeIds } } })
      await prisma.$executeRaw`UPDATE trades SET "escrowId" = NULL WHERE id = ANY(${tradeIds})`
      await prisma.$executeRaw`DELETE FROM escrows WHERE id = ANY(${escrowIds})`
      await prisma.$executeRaw`DELETE FROM trades WHERE id = ANY(${tradeIds})`
      await prisma.$executeRaw`DELETE FROM offers WHERE "userId" = ANY(${users})`
      await prisma.$executeRaw`DELETE FROM payout_addresses WHERE "participantId" = ANY(${users})`
      await prisma.$executeRaw`DELETE FROM users WHERE id = ANY(${users})`
    } finally {
      for (const n of extra) { await n.prisma.$disconnect().catch(() => undefined); await n.redis?.quit().catch(() => undefined) }
      await prisma.$disconnect()
      await closeTestRedis()
    }
  })

  // ─── fixtures ─────────────────────────────────────────────────────────────────────────────────────────

  function node() {
    let n!: { escrowService: any; prisma: any; redis?: any }
    jest.isolateModules(() => {
      n = { escrowService: require('../../src/modules/open-settlement/escrow.service').escrowService, prisma: require('../../src/common/database').prisma, redis: require('../../src/common/redis').redis }
    })
    extra.push(n)
    return n
  }
  /** A MULTISIG escrow whose two participant keys are submitted: its funding address exists (fundable). */
  async function addressed(label: string) {
    const mk = async (r: string) => prisma.user.create({ data: { publicKey: randomBytes(32).toString('hex'), displayName: `r7gf8-${label}-${r}-${randomBytes(3).toString('hex')}` } })
    const seller = await mk('s'), buyer = await mk('b')
    for (const p of [buyer, seller]) await prisma.payoutAddress.create({ data: { participantId: p.id, asset: 'BTC', address: payout(p.id) } })
    const offer = await prisma.offer.create({ data: { userId: seller.id, asset: 'BTC', side: 'SELL', priceUsd: '1', minAmount: '0.00000001', maxAmount: '100', paymentMethod: 'PIX' } })
    const t = await prisma.trade.create({ data: { offerId: offer.id, buyerId: buyer.id, sellerId: seller.id, asset: 'BTC', amount: '0.001', priceUsd: '1', totalUsd: '0.001', status: 'ACTIVE' } })
    const e = await escrowService.createEscrow({ tradeId: t.id, asset: 'BTC', lockedAmount: '0.001', type: 'MULTISIG' }, seller.id)
    const keys = { buyer: keyOf(`${label}-buyer`), seller: keyOf(`${label}-seller`) }
    await escrowService.submitParticipantKey(e.id, buyer.id, hex(keys.buyer), MULTISIG_CAPABILITY_PROFILE_V1)
    await escrowService.submitParticipantKey(e.id, seller.id, hex(keys.seller), MULTISIG_CAPABILITY_PROFILE_V1)
    const addr = (await prisma.escrow.findUniqueOrThrow({ where: { id: e.id } })).multisigAddr!
    return { t, e, buyer, seller, keys, addr }
  }
  type Fx = Awaited<ReturnType<typeof addressed>>
  const escrowRow = (id: string) => prisma.escrow.findUniqueOrThrow({ where: { id } })
  const outcome = async (p: Promise<unknown>) => { try { await p; return 'OK' } catch (e: any) { return String(e?.message ?? e) } }
  const signCopy = (b64: string, k: any) => { const p = bitcoin.Psbt.fromBase64(b64, { network: NET }); p.signInput(0, k); return p.toBase64() }
  async function snapshot(f: Fx) {
    const e = await escrowRow(f.e.id)
    return {
      escrow: [e.status, e.txLockId, e.multisigAddr], trade: (await prisma.trade.findUniqueOrThrow({ where: { id: f.t.id } })).status,
      pending: await prisma.escrowPendingTransaction.count({ where: { escrowId: f.e.id } }),
      events: await prisma.escrowEvent.count({ where: { escrowId: f.e.id } }),
      evidence: await prisma.escrowFundingEvidence.count({ where: { escrowId: f.e.id } }),
    }
  }
  /** Every protocol exit an addressed-but-unrecognized escrow could take, each refused with nothing changed. */
  async function everyTerminationRefused(f: Fx) {
    const before = await snapshot(f)
    const tries = {
      cancelByBuyer: await outcome(tradeService.updateStatus(f.t.id, 'CANCELLED', f.buyer.id)),
      cancelBySeller: await outcome(tradeService.updateStatus(f.t.id, 'CANCELLED', f.seller.id)),
      refundInitiation: await outcome(escrowService.initiateRefund(f.e.id, f.seller.id)),
      directRefund: await outcome(escrowService.refundFunds(f.e.id, f.seller.id)),
    }
    await escrowService.sweepExpiredEscrows()
    await reconcile({ projectionGraceMs: 0 })
    expect(tries.cancelByBuyer).toMatch(/funding address, which may already hold funds/)
    expect(tries.cancelBySeller).toMatch(/funding address, which may already hold funds/)
    expect(tries.refundInitiation).toMatch(/no recorded funding txid/)
    expect(tries.directRefund).not.toBe('OK')
    expect(await snapshot(f)).toEqual(before)
    return tries
  }

  // ─── A: unfunded but fundable — no destructive termination exists; late funding is recognized ─────────────

  it('A/L2-L10/R1-R7/C1-C5: every termination is refused while unfunded — observed absence, an explorer outage and a fresh node change nothing — and a late exact deposit is recognized and refunded with a VALID spend', async () => {
    pg.requirePostgres('A')
    const f = await addressed('a')
    await everyTerminationRefused(f)
    // the explorer is down: still nothing terminal, nothing recorded
    outage = true
    const down = await outcome(escrowService.lockFunds(f.e.id, f.seller.id))
    outage = false
    expect(down).not.toBe('OK')
    expect((await escrowRow(f.e.id)).status).toBe('CREATED')
    await everyTerminationRefused(f)
    // a long delay later, the exact deposit arrives; a fresh node recognizes it
    const funding = deposit(f.addr, FUNDING)
    await node().escrowService.lockFunds(f.e.id, f.seller.id)
    const e = await escrowRow(f.e.id)
    expect([e.status, e.txLockId, e.txLockVout]).toEqual(['FUNDS_LOCKED', funding.txid, 0])
    // the normal refund authority is intact: both participants sign, a VALID spend of that outpoint
    await escrowService.initiateRefund(f.e.id, f.seller.id)
    const pending = await prisma.escrowPendingTransaction.findUniqueOrThrow({ where: { escrowId: f.e.id } })
    await escrowService.submitTransactionSignature(f.e.id, f.buyer.id, signCopy(pending.unsignedPsbtBase64, f.keys.buyer))
    const before = broadcasts.length
    await escrowService.submitTransactionSignature(f.e.id, f.seller.id, signCopy(pending.unsignedPsbtBase64, f.keys.seller))
    expect((await escrowRow(f.e.id)).status).toBe('REFUNDED')
    expect(broadcasts.length).toBe(before + 1)
    expect(validateSpend(broadcasts[before], f.addr, FUNDING)).toEqual({ valid: true, why: '2 valid ordered signatures' })
    expect(await prisma.durableEventRecord.count({ where: { correlationId: f.t.id, eventName: 'settlement.escrow.refunded' } })).toBe(1)
  })

  // ─── B: value on the valid script that the protocol never recognizes ───────────────────────────────────

  it('B/L-wrong-amount: a deposit below the required amount is never recognized — lock, cancel and refund all refuse, nothing records it; the escrow can neither proceed nor end', async () => {
    pg.requirePostgres('B under')
    const f = await addressed('under')
    const stray = deposit(f.addr, FUNDING / 2)
    expect(await outcome(escrowService.lockFunds(f.e.id, f.seller.id))).toMatch(/No funding UTXO of at least 100000 sats/)
    await everyTerminationRefused(f)
    expect(await outcome(node().escrowService.lockFunds(f.e.id, f.seller.id))).toMatch(/No funding UTXO/)
    expect(chain.get(f.addr)).toEqual([stray]) // the value sits on the escrow's valid script
    // cryptographically it is not lost: the two participant keys spend it outside Sails (2-of-3)
    const p = new bitcoin.Psbt({ network: NET })
    const keys = await prisma.escrowParticipantKey.findMany({ where: { escrowId: f.e.id } })
    const pub = (r: string) => Buffer.from(keys.find((k) => k.role === r)!.pubkey, 'hex')
    const p2wsh = bitcoin.payments.p2wsh({ redeem: bitcoin.payments.p2ms({ m: 2, pubkeys: [pub('buyer'), pub('seller'), pub('arbiter')].sort(Buffer.compare), network: NET }), network: NET })
    expect(p2wsh.address).toBe(f.addr)
    p.addInput({ hash: stray.txid, index: 0, witnessUtxo: { script: p2wsh.output!, value: BigInt(stray.value) as any }, witnessScript: p2wsh.redeem!.output! })
    p.addOutput({ address: payout('anyone'), value: BigInt(stray.value - 500) as any })
    p.signInput(0, f.keys.buyer); p.signInput(0, f.keys.seller); p.finalizeAllInputs()
    expect(validateSpend(p.extractTransaction().toHex(), f.addr, stray.value)).toEqual({ valid: true, why: '2 valid ordered signatures' })
  })

  it('B/L11/L12: after the escrow is terminal, a further deposit to its address has no protocol authority — not locked, not recorded, still on the script', async () => {
    pg.requirePostgres('B post-terminal')
    const f = await addressed('post')
    deposit(f.addr, FUNDING)
    await escrowService.lockFunds(f.e.id, f.seller.id)
    await escrowService.initiateRefund(f.e.id, f.seller.id)
    const pending = await prisma.escrowPendingTransaction.findUniqueOrThrow({ where: { escrowId: f.e.id } })
    await escrowService.submitTransactionSignature(f.e.id, f.buyer.id, signCopy(pending.unsignedPsbtBase64, f.keys.buyer))
    await escrowService.submitTransactionSignature(f.e.id, f.seller.id, signCopy(pending.unsignedPsbtBase64, f.keys.seller))
    expect((await escrowRow(f.e.id)).status).toBe('REFUNDED')
    // the address is still a valid script: a late payer funds it again
    const late = deposit(f.addr, FUNDING)
    const evidenceBefore = await prisma.escrowFundingEvidence.count({ where: { escrowId: f.e.id } })
    expect(await outcome(escrowService.lockFunds(f.e.id, f.seller.id))).not.toBe('OK')
    expect(await outcome(escrowService.initiateRefund(f.e.id, f.seller.id))).not.toBe('OK')
    await escrowService.sweepExpiredEscrows()
    await reconcile({ projectionGraceMs: 0 })
    const e = await escrowRow(f.e.id)
    expect([e.status, e.txLockId === late.txid, await prisma.escrowFundingEvidence.count({ where: { escrowId: f.e.id } })]).toEqual(['REFUNDED', false, evidenceBefore])
    expect(chain.get(f.addr)).toEqual([late])
  })

  // ─── DB authority ─────────────────────────────────────────────────────────────────────────────────────

  it('DB: the funding surface cannot be erased or replaced by raw SQL once it exists', async () => {
    pg.requirePostgres('DB')
    const f = await addressed('db')
    await expect(prisma.$executeRawUnsafe(`UPDATE escrows SET "multisigAddr" = NULL WHERE id = $1`, f.e.id)).rejects.toThrow()
    await expect(prisma.$executeRawUnsafe(`UPDATE escrows SET "multisigAddr" = $1 WHERE id = $2`, payout('elsewhere'), f.e.id)).rejects.toThrow()
    await expect(prisma.$executeRawUnsafe(`DELETE FROM escrow_participant_keys WHERE "escrowId" = $1 AND role = 'buyer'`, f.e.id)).rejects.toThrow()
    expect((await escrowRow(f.e.id)).multisigAddr).toBe(f.addr)
  })
})
