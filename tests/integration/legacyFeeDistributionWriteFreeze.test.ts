// tests/integration/legacyFeeDistributionWriteFreeze.test.ts
//
// Missão 11 Fase 6.5.2 — CTO-authorized single-economic-authority cutover.
// FeeCollectionEvidence(CONFIRMED) -> FeeObligation -> a frozen
// DistributionPolicyVersion -> EntitlementLedgerEntry is now the sole
// normative economic allocation authority. Mechanism 1
// (chargeProtocolFee()/FeeDistribution) and Mechanism 2
// (FeeDistributionBatch/FeeDistributionBatchItem) are HISTORICAL /
// SUPERSEDED / WRITE-FROZEN — this file is the real-Postgres behavioral
// proof that the DB-native freeze (prisma/migrations/
// 20260823020000_legacy_fee_distribution_write_freeze) actually rejects
// new writes, at both the Prisma/application level and via raw SQL
// bypassing the application entirely, while historical reads keep
// working exactly as before. tests/integration/dbNativeInvariants.test.ts
// covers the catalog-presence half (trigger exists, attached, enabled) —
// this file covers the behavioral half that a catalog query cannot prove.

import { PrismaClient } from '@prisma/client'
import { createPostgresIntegrationHarness } from './postgresTestHarness'

describe('Legacy fee-distribution write freeze — Mechanism 1/2 (Missão 11 Fase 6.5.2, real Postgres)', () => {
  jest.setTimeout(60_000)

  const pg = createPostgresIntegrationHarness()
  let dbAvailable = false
  let prisma: PrismaClient
  let feeObligationRepository: typeof import('../../src/modules/open-settlement/fee-obligation-repository').feeObligationRepository
  let feeDistributionRepository: typeof import('../../src/modules/open-settlement/fee-distribution-repository').feeDistributionRepository

  beforeAll(async () => {
    await pg.probe()
    dbAvailable = pg.isAvailable()
    if (!dbAvailable) return
    ;({ prisma } = require('../../src/common/database'))
    ;({ feeObligationRepository } = require('../../src/modules/open-settlement/fee-obligation-repository'))
    ;({ feeDistributionRepository } = require('../../src/modules/open-settlement/fee-distribution-repository'))
  })

  afterAll(async () => {
    if (dbAvailable) await prisma.$disconnect()
  })

  function requirePostgres(name: string): void {
    pg.requirePostgres(name)
  }

  function suffix() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  }

  async function createFixtureEscrow() {
    const s = suffix()
    const buyer = await prisma.user.create({ data: { publicKey: `pk-buyer-frz-${s}` } })
    const seller = await prisma.user.create({ data: { publicKey: `pk-seller-frz-${s}` } })
    const offer = await prisma.offer.create({
      data: { userId: seller.id, asset: 'BTC', side: 'SELL', priceUsd: '65000', minAmount: '0.001', maxAmount: '1', paymentMethod: 'PIX' },
    })
    const trade = await prisma.trade.create({
      data: { offerId: offer.id, buyerId: buyer.id, sellerId: seller.id, asset: 'BTC', amount: '0.01', priceUsd: '65000', totalUsd: '650' },
    })
    const escrow = await prisma.escrow.create({ data: { tradeId: trade.id, type: 'MOCK', asset: 'BTC', lockedAmount: '0.01' } })
    return { escrowId: escrow.id }
  }

  async function createPublishedPolicy() {
    const s = suffix()
    return prisma.feePolicyVersion.create({
      data: {
        label: `frz-policy-${s}`,
        // Missão 11 Fase 7.2 — fee_policy_versions_single_published_per_rail_key
        // (migration 20260823182951) allows at most one PUBLISHED row per
        // railScope. Unique per call — no downstream lookup in this file
        // depends on the literal string (confirmed by grep).
        railScope: `FIXTURE_RAIL_WRITE_FREEZE_TEST-${s}`,
        status: 'PUBLISHED',
        protocolFeeRate: '0.004',
        payerModel: 'SELLER_PAYS',
        economicBasis: 'SELLER_DELIVERED_VALUE',
        nodeOperatorPct: '30',
        treasuryPct: '25',
        walletRebatePct: '35',
        arbitratorReservePct: '10',
        createdBy: 'legacy-write-freeze-fixture',
        publishedAt: new Date(),
      },
    })
  }

  // Seeds a row directly, bypassing the freeze trigger — the only way to
  // put a row in these tables at all after the cutover, standing in for
  // "a row written before the freeze existed" (the trigger has no notion
  // of *when* a row was created, so this is equivalent proof).
  async function seedBypassingFreeze(table: string, triggerName: string, insertSql: string) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "${table}" DISABLE TRIGGER ${triggerName}`)
    await prisma.$executeRawUnsafe(insertSql)
    await prisma.$executeRawUnsafe(`ALTER TABLE "${table}" ENABLE TRIGGER ${triggerName}`)
  }

  describe('fee_distributions (Mechanism 1)', () => {
    it('rejects a raw SQL INSERT with a clear HISTORICAL/SUPERSEDED/WRITE-FROZEN message', async () => {
      requirePostgres('fee_distributions raw INSERT rejected')
      const { escrowId } = await createFixtureEscrow()
      await expect(
        prisma.$executeRawUnsafe(
          `INSERT INTO fee_distributions (id, "escrowId", "totalFee", asset, "nodeOperatorShare", "treasuryShare", "walletRebateShare", "arbitratorReserveShare") VALUES ('frz-${suffix()}', '${escrowId}', 1, 'BTC', 0.3, 0.25, 0.35, 0.1)`
        )
      ).rejects.toThrow(/HISTORICAL \/ SUPERSEDED \/ WRITE-FROZEN/)
    })

    it('rejects a Prisma-level .create() call the exact way the retired chargeProtocolFee() used to write', async () => {
      requirePostgres('fee_distributions Prisma create rejected')
      const { escrowId } = await createFixtureEscrow()
      await expect(
        prisma.feeDistribution.create({
          data: { escrowId, totalFee: 1, asset: 'BTC', nodeOperatorShare: 0.3, treasuryShare: 0.25, walletRebateShare: 0.35, arbitratorReserveShare: 0.1 },
        })
      ).rejects.toThrow(/HISTORICAL \/ SUPERSEDED \/ WRITE-FROZEN/)
    })

    it('rejects UPDATE and DELETE against an existing (seeded/"historical") row, and the row remains unchanged', async () => {
      requirePostgres('fee_distributions UPDATE/DELETE rejected')
      const { escrowId } = await createFixtureEscrow()
      const id = `frz-hist-${suffix()}`
      await seedBypassingFreeze(
        'fee_distributions',
        'fee_distributions_write_freeze_guard',
        `INSERT INTO fee_distributions (id, "escrowId", "totalFee", asset, "nodeOperatorShare", "treasuryShare", "walletRebateShare", "arbitratorReserveShare") VALUES ('${id}', '${escrowId}', 1, 'BTC', 0.3, 0.25, 0.35, 0.1)`
      )

      await expect(prisma.$executeRawUnsafe(`UPDATE fee_distributions SET "totalFee" = 999 WHERE id = '${id}'`)).rejects.toThrow(
        /HISTORICAL \/ SUPERSEDED \/ WRITE-FROZEN/
      )
      await expect(prisma.$executeRawUnsafe(`DELETE FROM fee_distributions WHERE id = '${id}'`)).rejects.toThrow(
        /HISTORICAL \/ SUPERSEDED \/ WRITE-FROZEN/
      )

      // Historical-read proof: the row is still there, unchanged, readable
      // through ordinary Prisma exactly as any pre-cutover row would be.
      const row = await prisma.feeDistribution.findUnique({ where: { id } })
      expect(row).not.toBeNull()
      expect(row!.totalFee.toString()).toBe('1')
    })
  })

  describe('fee_distribution_batches (Mechanism 2)', () => {
    it('rejects a raw SQL INSERT, and rejects feeDistributionRepository.createBatch() the same way', async () => {
      requirePostgres('fee_distribution_batches rejected')
      await expect(
        prisma.$executeRawUnsafe(`INSERT INTO fee_distribution_batches (id, asset, "totalAmount") VALUES ('frz-batch-${suffix()}', 'BTC', 1)`)
      ).rejects.toThrow(/HISTORICAL \/ SUPERSEDED \/ WRITE-FROZEN/)

      await expect(feeDistributionRepository.createBatch('BTC', '1')).rejects.toThrow(/HISTORICAL \/ SUPERSEDED \/ WRITE-FROZEN/)
    })

    it('historical read-back still works for a pre-existing ("historical") batch row', async () => {
      requirePostgres('fee_distribution_batches historical read')
      const id = `frz-batch-hist-${suffix()}`
      await seedBypassingFreeze(
        'fee_distribution_batches',
        'fee_distribution_batches_write_freeze_guard',
        `INSERT INTO fee_distribution_batches (id, asset, "totalAmount") VALUES ('${id}', 'BTC', 1)`
      )
      const row = await prisma.feeDistributionBatch.findUnique({ where: { id } })
      expect(row).not.toBeNull()
    })
  })

  describe('fee_distribution_batch_items (Mechanism 2)', () => {
    it('rejects feeDistributionRepository.addObligationToBatch() end-to-end, against a real COLLECTED FeeObligation and a real (seeded) batch', async () => {
      requirePostgres('fee_distribution_batch_items addObligationToBatch rejected')
      const { escrowId } = await createFixtureEscrow()
      const policy = await createPublishedPolicy()
      const obligation = await feeObligationRepository.createOwed({
        escrowId, feePolicyVersionId: policy.id, economicDetermination: 'OWED',
        basisAmount: '100000', computedFee: '400', asset: 'BTC',
      })
      // collectionStatus must be COLLECTED for addObligationToBatch()'s own
      // precondition to be satisfied — its own check must pass so that the
      // ONLY thing standing between it and success is the DB-native freeze
      // this test exists to prove, not an unrelated precondition failure.
      await prisma.feeObligation.update({ where: { id: obligation.id }, data: { collectionStatus: 'COLLECTED' } })

      const batchId = `frz-batch-live-${suffix()}`
      await seedBypassingFreeze(
        'fee_distribution_batches',
        'fee_distribution_batches_write_freeze_guard',
        `INSERT INTO fee_distribution_batches (id, asset, "totalAmount") VALUES ('${batchId}', 'BTC', 1)`
      )

      await expect(feeDistributionRepository.addObligationToBatch(batchId, obligation.id)).rejects.toThrow(
        /HISTORICAL \/ SUPERSEDED \/ WRITE-FROZEN/
      )

      // The whole transaction must have rolled back — the obligation must
      // NOT have advanced to DISTRIBUTED, since the write it depended on
      // never actually committed. This is the concrete proof that the
      // freeze cannot be partially bypassed by a transaction that fails
      // partway through.
      const reread = await prisma.feeObligation.findUniqueOrThrow({ where: { id: obligation.id } })
      expect(reread.collectionStatus).toBe('COLLECTED')
      expect(reread.distributedInBatchId).toBeNull()
    })

    it('historical read-back still works for a pre-existing ("historical") batch item row', async () => {
      requirePostgres('fee_distribution_batch_items historical read')
      const { escrowId } = await createFixtureEscrow()
      const policy = await createPublishedPolicy()
      const obligation = await feeObligationRepository.createOwed({
        escrowId, feePolicyVersionId: policy.id, economicDetermination: 'OWED',
        basisAmount: '100000', computedFee: '400', asset: 'BTC',
      })
      const batchId = `frz-batch-hist2-${suffix()}`
      await seedBypassingFreeze(
        'fee_distribution_batches',
        'fee_distribution_batches_write_freeze_guard',
        `INSERT INTO fee_distribution_batches (id, asset, "totalAmount") VALUES ('${batchId}', 'BTC', 1)`
      )
      const itemId = `frz-item-hist-${suffix()}`
      await seedBypassingFreeze(
        'fee_distribution_batch_items',
        'fee_distribution_batch_items_write_freeze_guard',
        `INSERT INTO fee_distribution_batch_items (id, "batchId", "feeObligationId", "feePolicyVersionId", amount, "nodeOperatorShare", "treasuryShare", "walletRebateShare", "arbitratorReserveShare") VALUES ('${itemId}', '${batchId}', '${obligation.id}', '${policy.id}', 400, 120, 100, 140, 40)`
      )

      const row = await prisma.feeDistributionBatchItem.findUnique({ where: { id: itemId } })
      expect(row).not.toBeNull()
      expect(row!.amount.toString()).toBe('400')
    })
  })
})
