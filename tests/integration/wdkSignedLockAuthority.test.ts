// tests/integration/wdkSignedLockAuthority.test.ts
//
// #235 R7G-F6B — WDK signed LOCK authority on real PostgreSQL: nonce lane, sign + persist before broadcast,
// rebroadcast of the same bytes only, receipt/finality classification, projection, reconciliation,
// guards (payment claim, DF2, outbound gate, cancellation), chain pinning, foreign nonce consumption,
// legacy attempts. Independent module graphs and Prisma pools stand in for separate nodes.
//
// Boundaries: @tetherto/wdk-wallet-evm is ESM-only, so a fake WalletManager signs with the real ethers
// HD wallet of the same mnemonic and derivation paths (real secp256k1 signatures, real raw bytes);
// wdk-rpc.ts is served by an in-memory chain double (tests/helpers/wdkChainDouble.ts) that decodes every
// raw transaction with ethers. The real WDK + real EVM proof is the local-EVM evidence script.

const TEST_MNEMONIC = 'test test test test test test test test test test test junk'
process.env.WDK_SEED_PHRASE = TEST_MNEMONIC
process.env.WDK_CHAIN_ID = '31337'
process.env.WDK_FINALITY_CONFIRMATIONS = '2' // explicit TEST policy (production N is not frozen)
process.env.WDK_USDT_CONTRACT = '0x5FbDB2315678afecb367f032d93F642f64180aa3'
process.env.WDK_RECEIPT_POLL_ATTEMPTS = '1'
process.env.WDK_RECEIPT_POLL_INTERVAL_MS = '1'

import { WdkChainDouble } from '../helpers/wdkChainDouble'

const mockState: { chain: WdkChainDouble | null; transferCalls: number; sendTransactionCalls: number; signFailures: number } = { chain: null, transferCalls: 0, sendTransactionCalls: 0, signFailures: 0 }
// Delegates at call time, so every node (and every test) talks to the current chain double.
jest.mock('../../src/modules/open-settlement/wdk-rpc', () => ({
  createWdkRpc: () => new Proxy({}, { get: (_t, method: string) => (...args: unknown[]) => (mockState.chain!.rpc() as any)[method](...args) }),
}))
jest.mock('@tetherto/wdk-wallet-evm', () => {
  const { HDNodeWallet } = require('ethers')
  const wallets = new Map<string, any>()
  const wallet = (path: string) => {
    if (!wallets.has(path)) wallets.set(path, HDNodeWallet.fromPhrase('test test test test test test test test test test test junk', undefined, `m/44'/60'/${path}`))
    return wallets.get(path)
  }
  const account = (path: string) => ({
    getAddress: async () => wallet(path).address,
    signTransaction: async (tx: any) => {
      if (mockState.signFailures > 0) { mockState.signFailures--; throw new Error('signer unavailable (injected)') }
      return wallet(path).signTransaction(tx)
    },
    transfer: async () => { mockState.transferCalls++; throw new Error('WDK transfer() must never be used for LOCK') },
    sendTransaction: async () => { mockState.sendTransactionCalls++; throw new Error('WDK sendTransaction() must never be used for LOCK') },
    getTransactionReceipt: async () => null,
  })
  return {
    __esModule: true,
    default: class FakeWalletManagerEvm {
      async getAccount(i: number) { return account(`0'/0/${i}`) }
      async getAccountByPath(p: string) { return account(p) }
    },
  }
})

import { PrismaClient } from '@prisma/client'
import { HDNodeWallet, Transaction } from 'ethers'
import { randomBytes } from 'crypto'
import { createPostgresIntegrationHarness } from './postgresTestHarness'
import { closeTestRedis } from './identityTestHelpers'

const TREASURY = HDNodeWallet.fromPhrase(TEST_MNEMONIC, undefined, "m/44'/60'/0'/0/0").address
const TOKEN = process.env.WDK_USDT_CONTRACT as string

type Node = { prisma: PrismaClient; escrowService: any; tradeService: any; reconcile: any; redis?: { quit(): Promise<unknown> } }

describe('#235 R7G-F6B — WDK signed LOCK authority (real PostgreSQL)', () => {
  jest.setTimeout(240_000)
  const pg = createPostgresIntegrationHarness()
  let A: Node
  let prisma: PrismaClient
  const extra: Node[] = []
  let chain: WdkChainDouble

  function load(isolated: boolean): Node {
    let n!: Node
    const body = () => {
      n = {
        prisma: require('../../src/common/database').prisma,
        escrowService: require('../../src/modules/open-settlement/escrow.service').escrowService,
        tradeService: require('../../src/modules/open-p2p/trade.service').tradeService,
        reconcile: require('../../src/modules/open-settlement/escrow-settlement-reconciliation.service').reconcilePendingSettlements,
        redis: isolated ? require('../../src/common/redis').redis : undefined,
      }
    }
    if (isolated) jest.isolateModules(body); else body()
    return n
  }
  const node = () => { const n = load(true); extra.push(n); return n }

  async function withTriggersOff(fn: (tx: any) => Promise<void>) {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('ALTER TABLE wdk_transfer_attempts DISABLE TRIGGER wdk_transfer_attempts_signed_identity_guard')
      await tx.$executeRawUnsafe('ALTER TABLE wdk_nonce_lanes DISABLE TRIGGER wdk_nonce_lanes_guard')
      await fn(tx)
      await tx.$executeRawUnsafe('ALTER TABLE wdk_nonce_lanes ENABLE TRIGGER wdk_nonce_lanes_guard')
      await tx.$executeRawUnsafe('ALTER TABLE wdk_transfer_attempts ENABLE TRIGGER wdk_transfer_attempts_signed_identity_guard')
    })
  }
  const resetLane = () => withTriggersOff(async (tx) => { await tx.$executeRaw`DELETE FROM wdk_nonce_lanes WHERE "chainId" = 31337 AND account = ${TREASURY}` })

  beforeAll(async () => {
    await pg.probe()
    if (!pg.isAvailable()) return
    A = load(false)
    prisma = A.prisma
    require('../../src/common/events/handlers').registerEventHandlers()
    await resetLane()
  })

  afterAll(async () => {
    if (!pg.isAvailable()) return
    try {
      const users = (await prisma.user.findMany({ where: { displayName: { startsWith: 'f6b-' } }, select: { id: true } })).map((u) => u.id)
      const trades = (await prisma.trade.findMany({ where: { OR: [{ buyerId: { in: users } }, { sellerId: { in: users } }] }, select: { id: true, intentId: true } }))
      const tradeIds = trades.map((t) => t.id)
      const escrows = (await prisma.escrow.findMany({ where: { tradeId: { in: tradeIds } }, select: { id: true } })).map((e) => e.id)
      await withTriggersOff(async (tx) => {
        await tx.$executeRaw`DELETE FROM wdk_transfer_attempts WHERE "escrowId" = ANY(${escrows})`
        await tx.$executeRaw`DELETE FROM wdk_nonce_lanes WHERE "chainId" = 31337 AND account = ${TREASURY}`
      })
      const events = (await prisma.escrowEvent.findMany({ where: { escrowId: { in: escrows } }, select: { id: true } })).map((e) => e.id)
      await prisma.$executeRaw`DELETE FROM event_projection_claims WHERE "subjectId" = ANY(${tradeIds}) OR "subjectId" = ANY(${escrows}) OR "subjectId" = ANY(${events}) OR "eventId" = ANY(${events})`
      await prisma.durableEventRecord.deleteMany({ where: { correlationId: { in: tradeIds } } })
      const refs = await prisma.$queryRaw<Array<{ table_name: string; column_name: string }>>`
        SELECT table_name, column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND column_name IN ('tradeId', 'escrowId') AND table_name NOT IN ('trades', 'escrows')`
      for (let pass = 0; pass < 3; pass++) {
        for (const { table_name, column_name } of refs) {
          await prisma.$executeRawUnsafe(`DELETE FROM "${table_name}" WHERE "${column_name}" = ANY($1)`, column_name === 'tradeId' ? tradeIds : escrows).catch(() => undefined)
        }
      }
      await prisma.$executeRaw`UPDATE trades SET "escrowId" = NULL WHERE id = ANY(${tradeIds})`
      await prisma.$executeRaw`DELETE FROM escrows WHERE id = ANY(${escrows})`
      await prisma.$executeRaw`DELETE FROM trades WHERE id = ANY(${tradeIds})`
      const intents = trades.map((t) => t.intentId).filter(Boolean) as string[]
      await prisma.$executeRaw`DELETE FROM intent_events WHERE "intentId" = ANY(${intents})`.catch(() => undefined)
      await prisma.$executeRaw`DELETE FROM intents WHERE id = ANY(${intents})`.catch(() => undefined)
      await prisma.$executeRaw`DELETE FROM offers WHERE "userId" = ANY(${users})`
      await prisma.$executeRaw`DELETE FROM payout_addresses WHERE "participantId" = ANY(${users})`
      await prisma.$executeRaw`DELETE FROM users WHERE id = ANY(${users})`
    } finally {
      for (const n of extra) { await n.prisma.$disconnect().catch(() => undefined); await n.redis?.quit().catch(() => undefined) }
      await prisma.$disconnect()
      await closeTestRedis()
    }
  })

  // Every test's LOCK attempts are removed after it, so reconciliation in a later test never rebroadcasts an
  // earlier test's transactions into that test's fresh chain.
  let testEscrows: string[] = []
  beforeEach(async () => {
    testEscrows = []
    if (!pg.isAvailable()) return
    // Each test starts from a fresh chain and a fresh lane: the lane is the durable authority over the
    // chain the test runs against.
    chain = new WdkChainDouble(TOKEN)
    chain.fund(TREASURY, 10n ** 15n)
    mockState.chain = chain
    mockState.transferCalls = 0
    mockState.sendTransactionCalls = 0
    mockState.signFailures = 0
    await resetLane()
  })

  afterEach(async () => {
    if (!pg.isAvailable()) return
    // WDK transfer() / sendTransaction(raw) are never the LOCK submission path (M1/M2).
    expect(mockState.transferCalls).toBe(0)
    expect(mockState.sendTransactionCalls).toBe(0)
    await withTriggersOff(async (tx) => { await tx.$executeRaw`DELETE FROM wdk_transfer_attempts WHERE "escrowId" = ANY(${testEscrows})` })
  })

  async function fx(label: string, amount = '5') {
    const tag = randomBytes(4).toString('hex')
    const seller = await prisma.user.create({ data: { publicKey: randomBytes(32).toString('hex'), displayName: `f6b-${label}-s-${tag}` } })
    const buyer = await prisma.user.create({ data: { publicKey: randomBytes(32).toString('hex'), displayName: `f6b-${label}-b-${tag}` } })
    const offer = await prisma.offer.create({ data: { userId: seller.id, asset: 'USDT_ERC20', side: 'SELL', priceUsd: '1', minAmount: '0.00000001', maxAmount: '100000', paymentMethod: 'PIX' } })
    const t = await prisma.trade.create({ data: { offerId: offer.id, buyerId: buyer.id, sellerId: seller.id, asset: 'USDT_ERC20', amount, priceUsd: '1', totalUsd: amount, status: 'ACTIVE' } })
    const e = await A.escrowService.createEscrow({ tradeId: t.id, type: 'WDK_USDT_EVM', asset: 'USDT_ERC20', lockedAmount: amount }, seller.id)
    const escrowAddress = HDNodeWallet.fromPhrase(TEST_MNEMONIC, undefined, `m/44'/60'/${e.wdkAccountPath}`).address
    testEscrows.push(e.id)
    return { t, e, seller, buyer, escrowAddress }
  }
  type Fx = Awaited<ReturnType<typeof fx>>
  const settle = <T>(p: Promise<T>) => p.then((v) => ({ ok: true as const, v }), (err: Error) => ({ ok: false as const, err: String(err.message) }))
  const lock = (n: Node, f: Fx) => settle(n.escrowService.lockFunds(f.e.id, f.seller.id))
  const attempts = (f: Fx) => prisma.wdkTransferAttempt.findMany({ where: { escrowId: f.e.id, operationType: 'LOCK' }, orderBy: { createdAt: 'asc' } })
  const escrowOf = (f: Fx) => prisma.escrow.findUniqueOrThrow({ where: { id: f.e.id } })
  const lane = async () => (await prisma.wdkNonceLane.findUnique({ where: { chainId_account: { chainId: 31337, account: TREASURY } } }))
  const lockedEvents = (f: Fx) => prisma.escrowEvent.count({ where: { escrowId: f.e.id, toStatus: 'FUNDS_LOCKED' } })
  const cancel = (f: Fx) => settle(A.tradeService.updateStatus(f.t.id, 'CANCELLED', f.buyer.id))
  const reconcile = (n: Node = A) => n.reconcile({ projectionGraceMs: 0 })
  const signedHashes = async (f: Fx) => (await attempts(f)).filter((a) => a.signedRawTx).map((a) => a.txHash)

  // ── golden path + exactly one transaction ────────────────────────────────────────────────────────

  it('J/X: sign, persist, broadcast; CREATED until final; projected FUNDS_LOCKED once; retries add no transaction', async () => {
    pg.requirePostgres('golden')
    const f = await fx('golden')
    const first = await lock(A, f)
    expect(first.ok).toBe(false)
    expect((first as any).err).toMatch(/signed and not yet final/)
    const [a] = await attempts(f)
    expect([a.authority, a.status, Number(a.nonce), a.chainId, a.fromAddress, a.tokenContract, a.destination]).toEqual(['SIGNED_RAW_V1', 'SUBMITTED', 0, 31337, TREASURY, TOKEN, f.escrowAddress])
    const decoded = Transaction.from(a.signedRawTx!)
    expect([decoded.hash, decoded.from, decoded.nonce, decoded.chainId, decoded.to]).toEqual([a.txHash, TREASURY, 0, 31337n, TOKEN])
    expect((await escrowOf(f)).status).toBe('CREATED')
    expect(Number((await lane())!.nextNonce)).toBe(1)

    chain.mine(1) // mined, 1 confirmation: candidate only (test policy 2)
    const candidate = await lock(A, f)
    expect((candidate as any).err).toMatch(/not final: 1\/2 confirmations/)
    expect((await escrowOf(f)).status).toBe('CREATED')
    await expect(A.escrowService.markPaymentSent(f.e.id, f.buyer.id)).rejects.toThrow(/Invalid escrow transition: CREATED/)

    chain.mine(1)
    const final = await lock(A, f)
    expect(final.ok).toBe(true)
    const e = await escrowOf(f)
    expect([e.status, e.txLockId, e.multisigAddr, !!e.lockedAt, !!e.expiresAt]).toEqual(['FUNDS_LOCKED', a.txHash, f.escrowAddress, true, true])
    const [confirmed] = await attempts(f)
    expect(confirmed.status).toBe('CONFIRMED')
    // #235 R7G-F6B-P (D9/D10): the evidence and rule that authorized FUNDS_LOCKED, immutable
    const mined = chain.mined.get(a.txHash!)!
    expect([confirmed.receiptBlockNumber, confirmed.receiptBlockHash, confirmed.finalityHeadBlock, confirmed.finalityRule, !!confirmed.finalizedAt])
      .toEqual([BigInt(mined.blockNumber), mined.blockHash, BigInt(chain.head), 'CONFIRMATIONS:2', true])
    expect(await lockedEvents(f)).toBe(1)
    expect(chain.balance(f.escrowAddress)).toBe(5_000_000n)
    expect(chain.distinctBroadcastHashes()).toEqual(new Set([a.txHash]))

    // retries / other nodes never add a transaction or an event
    expect((await lock(A, f)).ok).toBe(false)
    expect((await lock(node(), f)).ok).toBe(false)
    await reconcile()
    expect(await lockedEvents(f)).toBe(1)
    expect(chain.distinctBroadcastHashes().size).toBe(1)
    expect(chain.balance(f.escrowAddress)).toBe(5_000_000n)

    // PAYMENT_CLAIM_REQUIRES_PROVEN_FUNDING_V1: accepted only now
    await A.escrowService.markPaymentSent(f.e.id, f.buyer.id)
    expect((await escrowOf(f)).status).toBe('PAYMENT_PENDING')
  })

  // ── crash matrix ───────────────────────────────────────────────────────────────────────────────────

  it('R1/R2/NF5: a failing gas quote is FAILED_BEFORE_SUBMISSION — no nonce, nothing signed, cancellable; a retry signs nonce 0', async () => {
    pg.requirePostgres('R1')
    const f = await fx('r1')
    chain.hooks.estimateGas = () => { throw new Error('execution reverted: insufficient balance (estimate)') }
    expect((await lock(A, f) as any).err).toMatch(/could not be prepared \(nothing was signed or broadcast\)/)
    expect((await attempts(f)).map((a) => [a.status, a.signedRawTx])).toEqual([['FAILED_BEFORE_SUBMISSION', null]])
    expect(await lane()).toBeNull()
    expect(chain.sendCalls).toHaveLength(0)
    chain.hooks.estimateGas = undefined
    await lock(A, f)
    const all = await attempts(f)
    expect(all.map((a) => a.status)).toEqual(['FAILED_BEFORE_SUBMISSION', 'SUBMITTED'])
    expect(Number(all[1].nonce)).toBe(0)
    expect((await cancel(f)).ok).toBe(false) // signed now: committed
  })

  it('R3/R4: a signing failure inside the allocation transaction rolls the nonce back — FAILED_BEFORE_SUBMISSION, lane unchanged', async () => {
    pg.requirePostgres('R3')
    const [f1, f2] = [await fx('r3a'), await fx('r3b')]
    await lock(A, f1) // lane -> 1
    mockState.signFailures = 1
    expect((await lock(A, f2) as any).err).toMatch(/signer unavailable/)
    expect((await attempts(f2)).map((a) => [a.status, a.nonce])).toEqual([['FAILED_BEFORE_SUBMISSION', null]])
    expect(Number((await lane())!.nextNonce)).toBe(1)
    expect((await cancel(f2)).ok).toBe(true) // nothing signed: no economic commitment
  })

  it('R5/S6/Q: committed but never broadcast (RPC down) is SIGNED — not cancellable, not refundable; a fresh node broadcasts the SAME bytes', async () => {
    pg.requirePostgres('R5')
    const f = await fx('r5')
    chain.hooks.beforeSend = () => { throw new Error('ECONNREFUSED') }
    await lock(A, f)
    const [a] = await attempts(f)
    expect([a.status, chain.mempool.size]).toEqual(['SIGNED', 0])
    expect((await cancel(f) as any).err).toMatch(/SIGNED transfer attempt/)
    expect((await settle(A.escrowService.refundFunds(f.e.id, f.seller.id)) as any).err).toMatch(/may hold or move funds/)
    chain.hooks.beforeSend = undefined
    const B = node()
    await lock(B, f)
    expect(chain.mempool.has(a.txHash!)).toBe(true)
    expect(new Set(chain.sendCalls)).toEqual(new Set([a.signedRawTx]))
    expect((await attempts(f)).length).toBe(1)
    chain.mine(2)
    expect((await lock(node(), f)).ok).toBe(true)
    expect(chain.distinctBroadcastHashes().size).toBe(1)
  })

  it('R6/R7/S5: the node accepts and the response is lost — the attempt stays SIGNED; reconciliation on another node converges the same tx', async () => {
    pg.requirePostgres('R7')
    const f = await fx('r7')
    chain.hooks.beforeSend = () => 'ACCEPT_THEN_THROW'
    await lock(A, f)
    const [a] = await attempts(f)
    expect(a.status).toBe('SIGNED')
    chain.hooks.beforeSend = undefined
    const B = node()
    let report = await reconcile(B) // receipt none -> rebroadcast -> "already known" -> stays SIGNED
    expect(report.locksAdvanced.find((x: any) => x.escrowId === f.e.id)?.outcome).toBe('PENDING')
    chain.mine(2)
    report = await reconcile(B)
    expect(report.locksAdvanced.find((x: any) => x.escrowId === f.e.id)?.outcome).toBe('PROJECTED')
    expect((await escrowOf(f)).status).toBe('FUNDS_LOCKED')
    expect(chain.distinctBroadcastHashes()).toEqual(new Set([a.txHash]))
    expect(await lockedEvents(f)).toBe(1)
  })

  it('R8/K: dropped from the mempool, receipt null — the same raw is rebroadcast (same hash), one economic effect', async () => {
    pg.requirePostgres('R8')
    const f = await fx('r8')
    await lock(A, f)
    const [a] = await attempts(f)
    chain.drop(a.txHash!)
    await reconcile()
    expect(chain.mempool.has(a.txHash!)).toBe(true)
    chain.mine(2)
    await reconcile()
    expect((await escrowOf(f)).status).toBe('FUNDS_LOCKED')
    expect(chain.balance(f.escrowAddress)).toBe(5_000_000n)
    expect(chain.distinctBroadcastHashes()).toEqual(new Set([a.txHash]))
  })

  it('R10/R11: a final CONFIRMED attempt under a CREATED escrow (crash before projection) is projected by reconciliation, once', async () => {
    pg.requirePostgres('R10')
    const f = await fx('r10')
    await lock(A, f)
    chain.mine(2)
    const [a] = await attempts(f)
    // CONFIRMED with its finality evidence but no projection (a pre-F6B-P row, or a hand-written one: the
    // database refuses CONFIRMED without evidence that satisfies its rule).
    const m = chain.mined.get(a.txHash!)!
    await prisma.wdkTransferAttempt.update({ where: { id: a.id }, data: { status: 'CONFIRMED', receiptBlockNumber: BigInt(m.blockNumber), receiptBlockHash: m.blockHash, finalityHeadBlock: BigInt(chain.head), finalityRule: 'CONFIRMATIONS:2', finalizedAt: new Date() } })
    const [r1, r2] = await Promise.all([reconcile(), reconcile(node())])
    const outcomes = [...r1.locksAdvanced, ...r2.locksAdvanced].filter((x: any) => x.escrowId === f.e.id).map((x: any) => x.outcome).sort()
    expect(outcomes.filter((o: string) => o === 'PROJECTED')).toHaveLength(1)
    expect(await lockedEvents(f)).toBe(1)
    expect((await escrowOf(f)).txLockId).toBe(a.txHash)
  })

  it('R12/R13: the publish fails after projection — FUNDS_LOCKED and its claimed transition are durable; PASS 3 republishes', async () => {
    pg.requirePostgres('R12')
    const f = await fx('r12')
    await lock(A, f)
    chain.mine(2)
    const lifecycle = require('../../src/modules/open-settlement/escrow-lifecycle')
    const spy = jest.spyOn(lifecycle, 'publishEscrowTransition').mockRejectedValueOnce(new Error('event bus down (injected)'))
    try {
      expect((await lock(A, f) as any).err).toMatch(/event bus down/)
    } finally {
      spy.mockRestore()
    }
    expect((await escrowOf(f)).status).toBe('FUNDS_LOCKED')
    expect(await lockedEvents(f)).toBe(1)
    // The projection is owed durably: PASS 3's 'transition.claimed' marker, committed with FUNDS_LOCKED.
    const transition = await prisma.escrowEvent.findFirstOrThrow({ where: { escrowId: f.e.id, toStatus: 'FUNDS_LOCKED' } })
    expect(await prisma.eventProjectionClaim.count({ where: { eventId: transition.id, projectionKey: 'transition.claimed' } })).toBe(1)
    await reconcile()
    expect(await lockedEvents(f)).toBe(1)
    expect((await lock(A, f) as any).err).toMatch(/Invalid escrow transition: FUNDS_LOCKED/)
  })

  it('O/S11/M19/M20: an escrow at FUNDS_LOCKED without a final LOCK (legacy / forced state) refuses the payment claim', async () => {
    pg.requirePostgres('payment claim')
    const f = await fx('pay')
    await lock(A, f) // SUBMITTED, not final
    await prisma.escrow.update({ where: { id: f.e.id }, data: { status: 'FUNDS_LOCKED' } })
    await expect(A.escrowService.markPaymentSent(f.e.id, f.buyer.id)).rejects.toThrow(/funding is not proven \(escrow FUNDS_LOCKED, LOCK SIGNED_RAW_V1\/SUBMITTED\)/)
    chain.mine(1) // candidate, still not final
    await reconcile()
    await expect(node().escrowService.markPaymentSent(f.e.id, f.buyer.id)).rejects.toThrow(/funding is not proven/)
    expect((await escrowOf(f)).status).toBe('FUNDS_LOCKED')
  })

  // ── multi-node ─────────────────────────────────────────────────────────────────────────────────────

  it('S1/S7: two nodes lock the same escrow concurrently — one signed transaction, one nonce', async () => {
    pg.requirePostgres('S1')
    const f = await fx('s1')
    await Promise.all([lock(A, f), lock(node(), f)])
    const all = await attempts(f)
    expect(all.filter((a) => a.signedRawTx)).toHaveLength(1)
    expect(Number((await lane())!.nextNonce)).toBe(1)
    await Promise.all([reconcile(), reconcile(node())])
    expect(chain.distinctBroadcastHashes().size).toBe(1)
  })

  it('S2/S3/C4/C9: 24 escrows locked concurrently from three nodes — 24 distinct contiguous nonces, 24 transactions, all final', async () => {
    pg.requirePostgres('S3')
    const fs = await Promise.all(Array.from({ length: 24 }, (_, i) => fx(`s3-${i}`)))
    const nodes = [A, node(), node()]
    await Promise.all(fs.map((f, i) => lock(nodes[i % 3], f)))
    const signed = (await Promise.all(fs.map(attempts))).flat().filter((a) => a.signedRawTx)
    expect(signed).toHaveLength(24)
    expect(signed.map((a) => Number(a.nonce)).sort((x, y) => x - y)).toEqual(Array.from({ length: 24 }, (_, i) => i))
    expect(new Set(signed.map((a) => a.txHash)).size).toBe(24)
    expect(Number((await lane())!.nextNonce)).toBe(24)
    chain.mine(2)
    await reconcile()
    expect((await Promise.all(fs.map(escrowOf))).every((e) => e.status === 'FUNDS_LOCKED')).toBe(true)
    expect(fs.every((f) => chain.balance(f.escrowAddress) === 5_000_000n)).toBe(true)
  })

  it('C7/S8/M25: a stale RPC reporting a lower pending nonce never moves the lane backward', async () => {
    pg.requirePostgres('C7')
    const [f1, f2, f3] = [await fx('c7a'), await fx('c7b'), await fx('c7c')]
    await lock(A, f1)
    await lock(A, f2)
    chain.hooks.pendingNonce = () => 0
    await lock(node(), f3)
    expect((await attempts(f3)).map((a) => Number(a.nonce))).toEqual([2])
    expect(Number((await lane())!.nextNonce)).toBe(3)
    await expect(prisma.$executeRaw`UPDATE wdk_nonce_lanes SET "nextNonce" = 0 WHERE "chainId" = 31337 AND account = ${TREASURY}`).rejects.toThrow(/never decreases|only moves by one allocation/)
  })

  // ── receipt classification ─────────────────────────────────────────────────────────────────────────

  it.each([
    ['null status', { status: null, blockNumber: '0x1' }],
    ['undefined status', { blockNumber: '0x1' }],
    ['status 0x2', { status: '0x2', blockNumber: '0x1' }],
    ['numeric status 1', { status: 1, blockNumber: '0x1' }],
    ['no block number', { status: '0x1' }],
    ['malformed', 'garbage'],
  ])('H/M14-M16/M31: a receipt with %s is unresolved — no REVERTED, no projection, no new transaction', async (_label, receipt) => {
    pg.requirePostgres('receipt shapes')
    const f = await fx('rcpt')
    await lock(A, f)
    chain.mine(3)
    chain.hooks.receipt = () => receipt
    await reconcile()
    await lock(A, f)
    const all = await attempts(f)
    expect(all.map((a) => a.status)).toEqual(['SUBMITTED'])
    expect((await escrowOf(f)).status).toBe('CREATED')
    expect(chain.distinctBroadcastHashes().size).toBe(1)
  })

  it('K: a final status-0 receipt is REVERTED; only then may a new LOCK be signed (new nonce), and cancellation is allowed', async () => {
    pg.requirePostgres('revert')
    const f = await fx('rev', '5')
    chain.tokenBalances.set(TREASURY, 1n) // the transfer reverts on-chain
    await lock(A, f)
    chain.mine(2)
    await reconcile()
    expect((await attempts(f)).map((a) => a.status)).toEqual(['REVERTED'])
    expect((await escrowOf(f)).status).toBe('CREATED')
    expect((await settle(A.escrowService.refundFunds(f.e.id, f.seller.id)) as any).err).toMatch(/no transaction authority yet/) // DF2 satisfied; outbound gate
    chain.fund(TREASURY, 10n ** 12n)
    await lock(A, f)
    const all = await attempts(f)
    expect(all.map((a) => [a.status, Number(a.nonce)])).toEqual([['REVERTED', 0], ['SUBMITTED', 1]])
    chain.mine(2)
    expect((await lock(A, f)).ok).toBe(true)
  })

  it('Q/K3: a trade whose only LOCK reverted with finality can be cancelled; one with an unmined signed LOCK cannot', async () => {
    pg.requirePostgres('cancel after revert')
    const f = await fx('rev-cancel')
    chain.tokenBalances.set(TREASURY, 1n)
    await lock(A, f)
    expect((await cancel(f)).ok).toBe(false) // SUBMITTED: may still move funds
    chain.mine(1)
    await reconcile()
    expect((await cancel(f)).ok).toBe(false) // reverted but not final
    chain.mine(1)
    await reconcile()
    expect((await attempts(f)).map((a) => a.status)).toEqual(['REVERTED'])
    expect((await cancel(f)).ok).toBe(true)
  })

  // ── chain pinning ──────────────────────────────────────────────────────────────────────────────────

  it('U2/U3/U4: an RPC serving another chain refuses LOCK before any attempt, nonce or broadcast; reconciliation broadcasts nothing', async () => {
    pg.requirePostgres('chain')
    const f = await fx('chain')
    chain.chainIdValue = 1n
    expect((await lock(A, f) as any).err).toMatch(/serves chain 1, but WDK_CHAIN_ID is 31337/)
    expect(await attempts(f)).toHaveLength(0)
    expect(await lane()).toBeNull()
    chain.chainIdValue = 31337n
    await lock(A, f)
    chain.chainIdValue = 5n // failover to a different chain after signing
    const before = chain.sendCalls.length
    const report = await reconcile()
    expect(report.failed.some((x: any) => x.escrowId === f.e.id && /serves chain 5/.test(x.error))).toBe(true)
    expect(chain.sendCalls.length).toBe(before)
  })

  // ── foreign treasury activity ──────────────────────────────────────────────────────────────────────

  it('V1-V7: a transaction Sails did not sign halts the lane — refused, nothing signed, operator-visible, not concealed later', async () => {
    pg.requirePostgres('V')
    const [f1, f2] = [await fx('v1'), await fx('v2')]
    await lock(A, f1)
    chain.mine(2)
    await lock(A, f1) // final, lane next = 1
    chain.external(TREASURY) // consumes nonce 1
    chain.mine(1)
    expect((await lock(A, f2) as any).err).toMatch(/a transaction Sails did not sign used the treasury/)
    expect((await attempts(f2)).filter((a) => a.signedRawTx)).toHaveLength(0)
    const l = (await lane())!
    expect([Number(l.nextNonce), !!l.haltedAt]).toEqual([1, true])
    expect((await lock(A, f2) as any).err).toMatch(/halted/)
    const report = await reconcile()
    expect(report.requiresManualReview.some((m: any) => m.escrowId === `wdk-nonce-lane:31337:${TREASURY}`)).toBe(true)
  })

  it('K/V5/U10/U11 (#235 R7G-F6B-P): one RPC showing the nonce consumed by another transaction only halts the lane — the attempt is not made terminal, no retry, not cancellable', async () => {
    pg.requirePostgres('NCE')
    const f = await fx('nce')
    chain.hooks.beforeSend = () => { throw new Error('ECONNRESET') }
    await lock(A, f) // SIGNED with nonce 0, never reached the chain
    chain.hooks.beforeSend = undefined
    chain.external(TREASURY) // a foreign transaction takes nonce 0
    chain.mine(1)
    let report = await reconcile() // not final yet (1 confirmation): stays SIGNED
    expect((await attempts(f)).map((a) => a.status)).toEqual(['SIGNED'])
    chain.mine(1)
    report = await reconcile()
    expect((await attempts(f)).map((a) => a.status)).toEqual(['SIGNED']) // never terminal on one RPC's view
    expect(report.requiresManualReview.some((m: any) => m.escrowId === f.e.id && /suspected external nonce consumption \(single RPC observation/.test(m.reason))).toBe(true)
    const l = (await lane())!
    expect([!!l.haltedAt, /suspected external nonce consumption/.test(l.haltedReason ?? '')]).toEqual([true, true])
    expect((await lock(A, f) as any).err).toMatch(/lane is halted for operator review/)
    expect((await cancel(f)).ok).toBe(false)
    const g = await fx('nce-other')
    expect((await lock(A, g) as any).err).toMatch(/halted/) // no new transaction identity while halted
    expect((await attempts(g)).filter((a) => a.signedRawTx)).toHaveLength(0)
    // U12/M14: the terminal state itself is refused without corroborated evidence (K7)
    const [a] = await attempts(f)
    await expect(prisma.wdkTransferAttempt.update({ where: { id: a.id }, data: { status: 'NONCE_CONSUMED_ELSEWHERE' } })).rejects.toThrow(/needs corroborated evidence/)
    expect(chain.distinctBroadcastHashes().size).toBe(1)
  })

  // ── guards ─────────────────────────────────────────────────────────────────────────────────────────

  it('N/P: WDK release/refund/split are refused before any claim or provider call; DF2 refuses refund-from-CREATED while a LOCK may hold funds', async () => {
    pg.requirePostgres('gates')
    const f = await fx('gate')
    const refused = /WDK outbound settlement has no transaction authority yet/
    expect((await settle(A.escrowService.refundFunds(f.e.id, f.seller.id)) as any).err).toMatch(refused) // no LOCK: the outbound gate
    await lock(A, f)
    expect((await settle(A.escrowService.refundFunds(f.e.id, f.seller.id)) as any).err).toMatch(/may hold or move funds/) // DF2
    chain.mine(2)
    await lock(A, f)
    await A.escrowService.markPaymentSent(f.e.id, f.buyer.id)
    expect((await settle(A.escrowService.releaseFunds(f.e.id, undefined, f.seller.id)) as any).err).toMatch(refused)
    const e = await escrowOf(f)
    expect([e.status, e.txReleaseId, e.cooperativeDisposition]).toEqual(['PAYMENT_PENDING', null, null])
    expect(chain.distinctBroadcastHashes().size).toBe(1)
  })

  it('W: legacy transfer() LOCK attempts are never re-signed — unresolved ones fail closed and are surfaced; a legacy REVERTED blocks cancellation', async () => {
    pg.requirePostgres('legacy')
    const f = await fx('legacy')
    await prisma.wdkTransferAttempt.create({ data: { escrowId: f.e.id, operationType: 'LOCK', status: 'SUBMISSION_UNKNOWN', destination: f.escrowAddress, amount: '5', activeKey: `${f.e.id}:LOCK` } })
    expect((await lock(A, f) as any).err).toMatch(/legacy WDK transfer\(\) LOCK attempt .* SUBMISSION_UNKNOWN/)
    expect(await lane()).toBeNull()
    const report = await reconcile()
    expect(report.requiresManualReview.some((m: any) => m.escrowId === f.e.id && /legacy WDK transfer\(\) LOCK/.test(m.reason))).toBe(true)
    const g = await fx('legacy-rev')
    await prisma.wdkTransferAttempt.create({ data: { escrowId: g.e.id, operationType: 'LOCK', status: 'REVERTED', destination: g.escrowAddress, amount: '5', txHash: '0xlegacy' } })
    expect((await cancel(g) as any).err).toMatch(/REVERTED transfer attempt/)
    expect(chain.sendCalls).toHaveLength(0)
  })

  it('NF1: an amount with more precision than USDT is refused before any attempt; a 6-decimal amount is encoded exactly', async () => {
    pg.requirePostgres('NF1')
    const f = await fx('nf1', '1.12345678')
    expect((await lock(A, f) as any).err).toMatch(/more precision than the token's 6 decimals/)
    expect(await attempts(f)).toHaveLength(0)
    const g = await fx('nf1b', '1.5')
    await lock(A, g)
    const [a] = await attempts(g)
    const { Interface } = require('ethers')
    const args = new Interface(['function transfer(address,uint256)']).parseTransaction({ data: Transaction.from(a.signedRawTx!).data }).args
    expect([args[0], args[1]]).toEqual([g.escrowAddress, 1_500_000n])
  })

  it('B/M8-M12/M32/M33: the signed identity cannot be changed, deleted or replaced in the database', async () => {
    pg.requirePostgres('immutability')
    const f = await fx('imm')
    await lock(A, f)
    const [a] = await attempts(f)
    const other = Transaction.from(a.signedRawTx!)
    const refuse = /immutable|cannot be deleted|not a signed-raw transition/
    for (const data of [{ signedRawTx: other.unsignedSerialized }, { nonce: 9n }, { txHash: '0x' + 'ab'.repeat(32) }, { destination: TREASURY }, { amount: '6' }, { tokenContract: TREASURY }, { chainId: 1 }]) {
      await expect(prisma.wdkTransferAttempt.update({ where: { id: a.id }, data: data as any })).rejects.toThrow(refuse)
    }
    await expect(prisma.wdkTransferAttempt.update({ where: { id: a.id }, data: { status: 'PREPARED' } })).rejects.toThrow(refuse)
    await expect(prisma.wdkTransferAttempt.delete({ where: { id: a.id } })).rejects.toThrow(refuse)
    await expect(prisma.wdkTransferAttempt.create({ data: { escrowId: f.e.id, operationType: 'LOCK', authority: 'SIGNED_RAW_V1', status: 'SIGNED', destination: f.escrowAddress, amount: '5', signedRawTx: a.signedRawTx, txHash: a.txHash, nonce: 0n } })).rejects.toThrow(/starts PREPARED/)
  })

  it('E/M13/M32: bytes swapped in the database (guards bypassed) are refused before broadcast and surfaced', async () => {
    pg.requirePostgres('swap')
    const [f, g] = [await fx('swap-a'), await fx('swap-b')]
    chain.hooks.beforeSend = () => { throw new Error('ECONNREFUSED') }
    await lock(A, f)
    await lock(A, g)
    chain.hooks.beforeSend = undefined
    const [a] = await attempts(f)
    const [b] = await attempts(g)
    // An attacker with SQL access swaps f's bytes for g's (a valid Sails signature, another escrow's intent).
    await withTriggersOff(async (tx) => {
      await tx.$executeRaw`UPDATE wdk_transfer_attempts SET "signedRawTx" = ${b.signedRawTx} WHERE id = ${a.id}`
    })
    const before = chain.sendCalls.length
    const report = await reconcile()
    expect(report.requiresManualReview.some((m: any) => m.escrowId === f.e.id && /refusing to broadcast it/.test(m.reason))).toBe(true)
    expect(chain.sendCalls.slice(before)).toEqual([b.signedRawTx]) // g's own rebroadcast only; f's swapped bytes never sent
    expect((await lock(A, f) as any).err).toMatch(/refusing to broadcast it/)
  })
  // ── #235 R7G-F6B-P — finality boundary, reorgs, lane governance ─────────────────────────────────────

  it('T1/T2/T3: below the threshold nothing is final; exactly at it and above it the same evidence rule applies', async () => {
    pg.requirePostgres('threshold')
    const [f1, f2] = [await fx('t2'), await fx('t3')]
    await lock(A, f1)
    chain.mine(1) // T1: 1/2
    await reconcile()
    expect((await escrowOf(f1)).status).toBe('CREATED')
    chain.mine(1) // T2: exactly 2/2
    await reconcile()
    const [a1] = await attempts(f1)
    expect([a1.status, Number(a1.finalityHeadBlock! - a1.receiptBlockNumber!) + 1]).toEqual(['CONFIRMED', 2])
    await lock(A, f2)
    chain.mine(3) // T3: 3/2
    await reconcile()
    const [a2] = await attempts(f2)
    expect([a2.status, Number(a2.finalityHeadBlock! - a2.receiptBlockNumber!) + 1, a2.finalityRule]).toEqual(['CONFIRMED', 3, 'CONFIRMATIONS:2'])
  })

  it('E1/E2/E5/T6: a candidate receipt that disappears in a reorg is not projected; the same bytes are rebroadcast and become final on the new fork', async () => {
    pg.requirePostgres('reorg disappear')
    const f = await fx('reorg')
    await lock(A, f)
    const [a] = await attempts(f)
    chain.mine(1)
    await reconcile() // candidate 1/2
    expect((await escrowOf(f)).status).toBe('CREATED')
    chain.reorg(1)
    chain.drop(a.txHash!) // the new fork does not carry it (E2/E5)
    await reconcile() // receipt null -> same raw rebroadcast, nothing new signed
    expect((await attempts(f)).map((x) => [x.status, x.signedRawTx])).toEqual([['SUBMITTED', a.signedRawTx]])
    expect(chain.mempool.has(a.txHash!)).toBe(true)
    chain.mine(2)
    await reconcile()
    expect((await escrowOf(f)).status).toBe('FUNDS_LOCKED')
    expect(chain.distinctBroadcastHashes()).toEqual(new Set([a.txHash]))
    expect(chain.balance(f.escrowAddress)).toBe(5_000_000n)
  })

  it('E3/E4/T7: the transaction moves to another block before finality — the evidence records the block it is final in', async () => {
    pg.requirePostgres('reorg move')
    const f = await fx('reorg-move')
    await lock(A, f)
    const [a] = await attempts(f)
    chain.mine(1)
    const firstHash = chain.mined.get(a.txHash!)!.blockHash
    await reconcile()
    chain.reorg(1) // the tx returns to the mempool and is mined again on the new fork
    chain.mine(1)
    const secondHash = chain.mined.get(a.txHash!)!.blockHash
    expect(secondHash).not.toBe(firstHash)
    chain.mine(1)
    await reconcile()
    const [c] = await attempts(f)
    expect([c.status, c.receiptBlockHash]).toEqual(['CONFIRMED', secondHash])
  })

  it('T8: an unavailable receipt endpoint is unresolved — nothing final, nothing new signed', async () => {
    pg.requirePostgres('rpc down')
    const f = await fx('rpc-down')
    await lock(A, f)
    chain.mine(3)
    chain.hooks.receipt = () => { throw new Error('ETIMEDOUT') }
    const report = await reconcile()
    expect(report.locksAdvanced.find((x: any) => x.escrowId === f.e.id)?.outcome).toBe('PENDING')
    expect((await attempts(f)).map((x) => x.status)).toEqual(['SUBMITTED'])
    expect((await escrowOf(f)).status).toBe('CREATED')
  })

  it('U1/I1-I3: with nonce n stuck, a later LOCK is still signed and broadcast as n+1, and cannot mine before n', async () => {
    pg.requirePostgres('stuck n')
    const [f1, f2] = [await fx('stuck-a'), await fx('stuck-b')]
    chain.hooks.beforeSend = (raw) => { if (Transaction.from(raw).nonce === 0) throw new Error('fee too low to propagate (stuck)') }
    await lock(A, f1)
    chain.hooks.beforeSend = undefined
    chain.hooks.beforeSend = (raw) => { if (Transaction.from(raw).nonce === 0) throw new Error('fee too low to propagate (stuck)') }
    await lock(A, f2)
    chain.mine(5)
    expect((await attempts(f1)).map((x) => [x.status, Number(x.nonce)])).toEqual([['SIGNED', 0]])
    expect((await attempts(f2)).map((x) => [x.status, Number(x.nonce)])).toEqual([['SUBMITTED', 1]])
    expect(chain.mempool.size).toBe(1) // n+1 waits behind the missing n
    expect((await cancel(f2)).ok).toBe(false) // both trades are committed while n is stuck (finding I4)
    chain.hooks.beforeSend = undefined
    await reconcile() // same raw for n is rebroadcast; both mine
    chain.mine(2)
    await reconcile()
    expect([(await escrowOf(f1)).status, (await escrowOf(f2)).status]).toEqual(['FUNDS_LOCKED', 'FUNDS_LOCKED'])
  })

  it('U5/U6/U7/M8-M10: a halted lane refuses new transaction identities on every node, after a restart too', async () => {
    pg.requirePostgres('halt nodes')
    const [f1, f2] = [await fx('halt-a'), await fx('halt-b')]
    await lock(A, f1)
    chain.mine(2)
    await lock(A, f1)
    await prisma.wdkNonceLane.update({ where: { chainId_account: { chainId: 31337, account: TREASURY } }, data: { haltedAt: new Date(), haltedReason: 'operator pause (test)' } })
    for (const n of [A, node(), node()]) {
      expect((await lock(n, f2) as any).err).toMatch(/halted/)
    }
    expect((await attempts(f2)).filter((a) => a.signedRawTx)).toHaveLength(0)
  })

  it('U13/U14/M5-M7: hand-made economic truth is refused — nonce advance, terminal states without evidence', async () => {
    pg.requirePostgres('operator refusals')
    const f = await fx('op')
    await lock(A, f)
    const [a] = await attempts(f)
    const laneKey = { chainId_account: { chainId: 31337, account: TREASURY } }
    await expect(prisma.wdkNonceLane.update({ where: laneKey, data: { nextNonce: 5n } })).rejects.toThrow(/only moves by one allocation/)
    await expect(prisma.wdkNonceLane.update({ where: laneKey, data: { nextNonce: 2n } })).rejects.toThrow(/released without a signed transaction/)
    expect(Number((await lane())!.nextNonce)).toBe(1)
    await expect(prisma.wdkTransferAttempt.update({ where: { id: a.id }, data: { status: 'CONFIRMED' } })).rejects.toThrow(/finality_evidence_check/)
    await expect(prisma.wdkTransferAttempt.update({ where: { id: a.id }, data: { status: 'REVERTED' } })).rejects.toThrow(/finality_evidence_check/)
    await expect(prisma.wdkTransferAttempt.update({ where: { id: a.id }, data: { status: 'CONFIRMED', receiptBlockNumber: 1n, receiptBlockHash: '0x' + 'ab'.repeat(32), finalityHeadBlock: 1n, finalityRule: 'CONFIRMATIONS:2', finalizedAt: new Date() } })).rejects.toThrow(/finality_evidence_check/) // evidence that does not satisfy its own rule
    chain.mine(2)
    await reconcile()
    const [c] = await attempts(f)
    expect(c.status).toBe('CONFIRMED')
    await expect(prisma.wdkTransferAttempt.update({ where: { id: a.id }, data: { finalityRule: 'CONFIRMATIONS:1' } })).rejects.toThrow(/finality evidence is immutable/)
    await expect(prisma.wdkTransferAttempt.update({ where: { id: a.id }, data: { receiptBlockHash: '0x' + 'ef'.repeat(32) } })).rejects.toThrow(/finality evidence is immutable/)
  })
})
