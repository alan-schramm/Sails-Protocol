// Issue #244 — real PostgreSQL proof for stale-cleanup vs signature arrival.
import { PrismaClient } from '@prisma/client'
import { randomUUID } from 'crypto'
import { createPostgresIntegrationHarness } from './postgresTestHarness'

describe('#244 signed pending cleanup race (real Postgres)', () => {
  jest.setTimeout(120_000)
  const pg = createPostgresIntegrationHarness()
  let prisma: PrismaClient

  beforeAll(async () => {
    await pg.probe()
    if (!pg.isAvailable()) return
    ;({ prisma } = require('../../src/common/database'))
  })

  afterAll(async () => {
    if (pg.isAvailable()) await prisma.$disconnect()
  })

  async function fixture() {
    const tag = randomUUID()
    const seller = await prisma.user.create({ data: { publicKey: `cleanup-seller-${tag}` } })
    const buyer = await prisma.user.create({ data: { publicKey: `cleanup-buyer-${tag}` } })
    const offer = await prisma.offer.create({
      data: { userId: seller.id, asset: 'BTC', side: 'SELL', priceUsd: '1', minAmount: '1', maxAmount: '2', paymentMethod: 'OTHER' },
    })
    const trade = await prisma.trade.create({
      data: { offerId: offer.id, buyerId: buyer.id, sellerId: seller.id, asset: 'BTC', amount: '1', priceUsd: '1', totalUsd: '1' },
    })
    const escrow = await prisma.escrow.create({
      data: { tradeId: trade.id, type: 'MULTISIG', status: 'DISPUTED', lockedAmount: '1', asset: 'BTC', timelockHours: 24 },
    })
    await prisma.trade.update({ where: { id: trade.id }, data: { escrowId: escrow.id } })
    const pending = await prisma.escrowPendingTransaction.create({
      data: {
        escrowId: escrow.id, kind: 'release', unsignedPsbtBase64: 'unsigned',
        requiredSigners: [buyer.id, seller.id], triggeredBy: buyer.id,
      },
    })
    return { escrow, pending, buyer }
  }

  it('cannot delete the pending generation after a signature wins the escrow lock', async () => {
    pg.requirePostgres('signature-wins')
    const f = await fixture()

    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${f.escrow.id})::bigint)`
      await tx.escrowTransactionSignature.create({
        data: { pendingTxId: f.pending.id, participantId: f.buyer.id, signedPsbtBase64: 'signed' },
      })
    })

    const deleted = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${f.escrow.id})::bigint)`
      return tx.$executeRaw`
        DELETE FROM "escrow_pending_transactions" p
        WHERE p.id = ${f.pending.id}
          AND p."escrowId" = ${f.escrow.id}
          AND NOT EXISTS (
            SELECT 1 FROM "escrow_transaction_signatures" s
            WHERE s."pendingTxId" = p.id
          )
      `
    })

    expect(deleted).toBe(0)
    expect(await prisma.escrowPendingTransaction.findUnique({ where: { id: f.pending.id } })).not.toBeNull()
    expect(await prisma.escrowTransactionSignature.count({ where: { pendingTxId: f.pending.id } })).toBe(1)
  })

  it('deletes a genuinely unsigned pending generation and remains idempotent', async () => {
    pg.requirePostgres('unsigned-delete')
    const f = await fixture()

    const cleanup = () => prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${f.escrow.id})::bigint)`
      return tx.$executeRaw`
        DELETE FROM "escrow_pending_transactions" p
        WHERE p.id = ${f.pending.id}
          AND p."escrowId" = ${f.escrow.id}
          AND NOT EXISTS (
            SELECT 1 FROM "escrow_transaction_signatures" s
            WHERE s."pendingTxId" = p.id
          )
      `
    })

    expect(await cleanup()).toBe(1)
    expect(await cleanup()).toBe(0)
    expect(await prisma.escrowPendingTransaction.findUnique({ where: { id: f.pending.id } })).toBeNull()
  })
})
