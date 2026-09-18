// tests/integration/economicDispositionAuthorityConcurrency.test.ts
//
// ADR-005 / #218 — real-Postgres evidence for the Economic Disposition
// Authority serialization domain. This deliberately tests the database
// primitive itself with independent Prisma clients/connections: mocks
// cannot prove pg_advisory_xact_lock ordering or restart durability.

import { PrismaClient, DisputeRuling } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { createHash } from 'crypto'
import { createPostgresIntegrationHarness } from './postgresTestHarness'
import {
  authorizeDisputedPendingExecution,
  economicDispositionLockKey,
} from '../../src/modules/open-settlement/economic-disposition-authority'

describe('ADR-005 Economic Disposition Authority — real Postgres', () => {
  jest.setTimeout(60_000)
  const pg = createPostgresIntegrationHarness()
  let dbAvailable = false
  let prisma: PrismaClient

  beforeAll(async () => {
    await pg.probe()
    dbAvailable = pg.isAvailable()
    if (!dbAvailable) return
    ;({ prisma } = require('../../src/common/database'))
  })

  afterAll(async () => {
    if (dbAvailable) await prisma.$disconnect()
  })

  function requirePostgres(name: string) { pg.requirePostgres(name) }
  function suffix() { return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }
  function tick(ms = 20) { return new Promise((resolve) => setTimeout(resolve, ms)) }

  async function fixture() {
    const s = suffix()
    const buyer = await prisma.user.create({ data: { publicKey: `eda-buyer-${s}` } })
    const seller = await prisma.user.create({ data: { publicKey: `eda-seller-${s}` } })
    const offer = await prisma.offer.create({ data: { userId: seller.id, asset: 'BTC', side: 'SELL', priceUsd: '65000', minAmount: '0.001', maxAmount: '1', paymentMethod: 'PIX' } })
    const trade = await prisma.trade.create({ data: { offerId: offer.id, buyerId: buyer.id, sellerId: seller.id, asset: 'BTC', amount: '0.001', priceUsd: '65000', totalUsd: '65' } })
    const escrow = await prisma.escrow.create({ data: { tradeId: trade.id, type: 'MOCK', status: 'DISPUTED', asset: 'BTC', lockedAmount: '0.001' } })
    const issuedAt = new Date()
    const dispute = await prisma.dispute.create({
      data: {
        tradeId: trade.id, escrowId: escrow.id, openedBy: buyer.id, reason: 'ADR-005 concurrency fixture',
        arbiterId: `arbiter-0-${s}`, status: 'RESOLVED', ruling: 'RELEASE',
        resolvedAt: issuedAt, appealRound: 0, authoritySignature: `sig-0-${s}`, authorityIssuedAt: issuedAt,
      },
    })
    const pending = await prisma.escrowPendingTransaction.create({
      data: {
        escrowId: escrow.id, kind: 'release', toAddress: `destination-${s}`,
        unsignedPsbtBase64: Buffer.from(`psbt-${s}`).toString('base64'),
        requiredSigners: [buyer.id], triggeredBy: dispute.arbiterId!,
        disputeId: dispute.id, rulingAppealRound: 0, rulingArbiterId: dispute.arbiterId,
        rulingOutcome: 'RELEASE', rulingAuthoritySignature: dispute.authoritySignature,
        rulingAuthorityIssuedAt: dispute.authorityIssuedAt,
      },
    })
    return { dispute, pending }
  }

  async function client() {
    return new PrismaClient({ adapter: new PrismaPg({ connectionString: pg.getUrl() }) })
  }

  it('execution commit wins the real advisory-lock race; authorization survives a later appeal and restart/reload reuses the same generation', async () => {
    requirePostgres('execution-wins + restart')
    const { dispute, pending } = await fixture()
    const blocker = await client()

    let release!: () => void
    const held = new Promise<void>((resolve) => { release = resolve })
    let acquired!: () => void
    const hasLock = new Promise<void>((resolve) => { acquired = resolve })

    const lockTx = blocker.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${economicDispositionLockKey(dispute.id)})::bigint)`
      acquired()
      await held
    })
    await hasLock

    const commitAttempt = authorizeDisputedPendingExecution(pending)
    await tick(50)
    expect(await prisma.economicDispositionAuthorization.findUnique({ where: { pendingOperationId: pending.id } })).toBeNull()

    release()
    await lockTx
    const committed = await commitAttempt
    expect(committed).not.toBeNull()

    await prisma.dispute.update({
      where: { id: dispute.id },
      data: { status: 'APPEALED', appealRound: 1, previousRuling: 'RELEASE', previousArbiterId: dispute.arbiterId, arbiterId: `arbiter-1-${suffix()}`, ruling: null, resolvedAt: null },
    })

    // Simulated process restart: a fresh Prisma client reloads both durable
    // rows; the gate then receives only that reloaded pending state.
    const restarted = await client()
    const reloadedPending = await restarted.escrowPendingTransaction.findUniqueOrThrow({ where: { id: pending.id } })
    const persistedAuth = await restarted.economicDispositionAuthorization.findUniqueOrThrow({ where: { pendingOperationId: pending.id } })
    await restarted.$disconnect()

    const retried = await authorizeDisputedPendingExecution(reloadedPending)
    expect(retried).not.toBeNull()
    expect(retried!.id).toBe(persistedAuth.id)
    expect(retried!.appealRound).toBe(0)
    await blocker.$disconnect()
  })

  it('appeal generation wins the real advisory-lock race; stale pending cannot newly commit afterward', async () => {
    requirePostgres('appeal-wins')
    const { dispute, pending } = await fixture()
    const winner = await client()

    let release!: () => void
    const held = new Promise<void>((resolve) => { release = resolve })
    let acquired!: () => void
    const hasLock = new Promise<void>((resolve) => { acquired = resolve })

    const appealTx = winner.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${economicDispositionLockKey(dispute.id)})::bigint)`
      acquired()
      await tx.dispute.update({
        where: { id: dispute.id },
        data: { status: 'APPEALED', appealRound: 1, previousRuling: 'RELEASE', previousArbiterId: dispute.arbiterId, arbiterId: `arbiter-1-${suffix()}`, ruling: null, resolvedAt: null },
      })
      await held
    })
    await hasLock

    const staleCommit = authorizeDisputedPendingExecution(pending)
    await tick(50)
    release()
    await appealTx

    await expect(staleCommit).rejects.toThrow(/no longer current/)
    expect(await prisma.economicDispositionAuthorization.findUnique({ where: { pendingOperationId: pending.id } })).toBeNull()

    const current = await prisma.dispute.findUniqueOrThrow({ where: { id: dispute.id } })
    expect(current.status).toBe('APPEALED')
    expect(current.appealRound).toBe(1)
    await winner.$disconnect()
  })
})
