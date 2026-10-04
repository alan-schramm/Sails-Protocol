// Issue #244 — real PostgreSQL concurrency proof for stale cleanup vs signature arrival.
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { randomUUID } from 'crypto'
import { createPostgresIntegrationHarness } from './postgresTestHarness'

describe('#244 stale cleanup vs signature arrival (real Postgres)', () => {
  jest.setTimeout(120_000)
  const pg = createPostgresIntegrationHarness()
  let prisma: PrismaClient

  beforeAll(async () => {
    await pg.probe()
    if (!pg.isAvailable()) return
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: pg.getUrl() }) })
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
      data: { escrowId: escrow.id, kind: 'release', unsignedPsbtBase64: 'unsigned', toAddress: 'tb1qcleanupfixture0000000000000000000000000', requiredSigners: [buyer.id, seller.id], triggeredBy: buyer.id },
    })
    return { escrow, pending, buyer }
  }

  async function conditionalCleanup(client: PrismaClient, pendingId: string, escrowId: string) {
    return client.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${escrowId})::bigint)`
      return tx.$executeRaw`
        DELETE FROM "escrow_pending_transactions" p
        WHERE p.id = ${pendingId}
          AND p."escrowId" = ${escrowId}
          AND NOT EXISTS (
            SELECT 1 FROM "escrow_transaction_signatures" s
            WHERE s."pendingTxId" = p.id
          )
      `
    })
  }

  it('SIGNER WINS: cleanup blocks on the same escrow lock and cannot delete the newly signed generation', async () => {
    pg.requirePostgres('signer wins cleanup race')
    const f = await fixture()
    const signer = new PrismaClient({ adapter: new PrismaPg({ connectionString: pg.getUrl() }) })
    const cleaner = new PrismaClient({ adapter: new PrismaPg({ connectionString: pg.getUrl() }) })
    let releaseSigner!: () => void
    const holdSigner = new Promise<void>((resolve) => { releaseSigner = resolve })
    let signatureInserted!: () => void
    const inserted = new Promise<void>((resolve) => { signatureInserted = resolve })

    try {
      const signerTx = signer.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${f.escrow.id})::bigint)`
        await tx.escrowTransactionSignature.create({
          data: { pendingTxId: f.pending.id, participantId: f.buyer.id, signedPsbtBase64: 'signed' },
        })
        signatureInserted()
        await holdSigner
      })
      await inserted

      let cleanupSettled = false
      const cleanup = conditionalCleanup(cleaner, f.pending.id, f.escrow.id).then((n) => {
        cleanupSettled = true
        return n
      })
      await new Promise((resolve) => setTimeout(resolve, 100))
      expect(cleanupSettled).toBe(false)

      releaseSigner()
      await signerTx
      expect(await cleanup).toBe(0)
      expect(await prisma.escrowPendingTransaction.findUnique({ where: { id: f.pending.id } })).not.toBeNull()
      expect(await prisma.escrowTransactionSignature.count({ where: { pendingTxId: f.pending.id } })).toBe(1)
    } finally {
      releaseSigner?.()
      await Promise.allSettled([signer.$disconnect(), cleaner.$disconnect()])
    }
  })

  it('CLEANUP WINS: a signer waiting behind deletion cannot persist a signature into the removed generation', async () => {
    pg.requirePostgres('cleanup wins signature race')
    const f = await fixture()
    const cleaner = new PrismaClient({ adapter: new PrismaPg({ connectionString: pg.getUrl() }) })
    const signer = new PrismaClient({ adapter: new PrismaPg({ connectionString: pg.getUrl() }) })
    let releaseCleanup!: () => void
    const holdCleanup = new Promise<void>((resolve) => { releaseCleanup = resolve })
    let deletedInsideTx!: () => void
    const deleted = new Promise<void>((resolve) => { deletedInsideTx = resolve })

    try {
      const cleanupTx = cleaner.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${f.escrow.id})::bigint)`
        const n = await tx.$executeRaw`
          DELETE FROM "escrow_pending_transactions" p
          WHERE p.id = ${f.pending.id} AND p."escrowId" = ${f.escrow.id}
            AND NOT EXISTS (SELECT 1 FROM "escrow_transaction_signatures" s WHERE s."pendingTxId" = p.id)
        `
        expect(n).toBe(1)
        deletedInsideTx()
        await holdCleanup
      })
      await deleted

      let signerSettled = false
      const signerTx = signer.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${f.escrow.id})::bigint)`
        const live = await tx.escrowPendingTransaction.findUnique({ where: { id: f.pending.id } })
        if (!live) throw new Error('pending generation disappeared before signature commit')
        await tx.escrowTransactionSignature.create({
          data: { pendingTxId: f.pending.id, participantId: f.buyer.id, signedPsbtBase64: 'late' },
        })
      }).then(() => { signerSettled = true })
      await new Promise((resolve) => setTimeout(resolve, 100))
      expect(signerSettled).toBe(false)

      releaseCleanup()
      await cleanupTx
      await expect(signerTx).rejects.toThrow('pending generation disappeared before signature commit')
      expect(await prisma.escrowPendingTransaction.findUnique({ where: { id: f.pending.id } })).toBeNull()
      expect(await prisma.escrowTransactionSignature.count({ where: { pendingTxId: f.pending.id } })).toBe(0)
    } finally {
      releaseCleanup?.()
      await Promise.allSettled([cleaner.$disconnect(), signer.$disconnect()])
    }
  })

  it('two concurrent cleanups are idempotent: exactly one owns the delete', async () => {
    pg.requirePostgres('concurrent cleanup idempotency')
    const f = await fixture()
    const a = new PrismaClient({ adapter: new PrismaPg({ connectionString: pg.getUrl() }) })
    const b = new PrismaClient({ adapter: new PrismaPg({ connectionString: pg.getUrl() }) })
    try {
      const results = await Promise.all([
        conditionalCleanup(a, f.pending.id, f.escrow.id),
        conditionalCleanup(b, f.pending.id, f.escrow.id),
      ])
      expect(results.sort()).toEqual([0, 1])
      expect(await prisma.escrowPendingTransaction.findUnique({ where: { id: f.pending.id } })).toBeNull()
    } finally {
      await Promise.allSettled([a.$disconnect(), b.$disconnect()])
    }
  })

  it('fresh client after signer victory sees the durable pending generation and signature', async () => {
    pg.requirePostgres('restart durability')
    const f = await fixture()
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${f.escrow.id})::bigint)`
      await tx.escrowTransactionSignature.create({
        data: { pendingTxId: f.pending.id, participantId: f.buyer.id, signedPsbtBase64: 'signed' },
      })
    })
    const fresh = new PrismaClient({ adapter: new PrismaPg({ connectionString: pg.getUrl() }) })
    try {
      expect(await fresh.escrowPendingTransaction.findUnique({ where: { id: f.pending.id } })).not.toBeNull()
      expect(await fresh.escrowTransactionSignature.count({ where: { pendingTxId: f.pending.id } })).toBe(1)
      expect(await conditionalCleanup(fresh, f.pending.id, f.escrow.id)).toBe(0)
    } finally {
      await fresh.$disconnect()
    }
  })
})
