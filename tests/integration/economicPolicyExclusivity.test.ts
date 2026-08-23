// tests/integration/economicPolicyExclusivity.test.ts
//
// Missão 11 Fase 7.2 §R (items 11-15) — behavioral proof that the two
// exclusivity guards added in migration
// 20260823182951_collected_time_distribution_freeze_and_policy_exclusivity
// (fee_policy_versions_single_published_per_rail_key,
// distribution_policy_versions_single_published_key) actually reject a
// second simultaneously-PUBLISHED row, INCLUDING when the attempt bypasses
// this application entirely via raw SQL — not just that
// FeePolicyService.publish()/DistributionPolicyService.publish() happen to
// refuse it. Same division of labor
// tests/integration/dbNativeInvariants.test.ts's own header comment
// establishes for triggers: that file proves the DB objects EXIST; this
// file proves they actually DO something, at the real Postgres level, that
// no amount of correct application code could be relied on alone to
// guarantee (a direct psql session, a different service, a future bug in
// this application's own code all bypass application-level checks the same
// way raw SQL does here).

import { PrismaClient } from '@prisma/client'
import { createPostgresIntegrationHarness } from './postgresTestHarness'

describe('Economic policy exclusivity — raw-SQL bypass proofs (Missão 11 Fase 7.2 §R, real Postgres)', () => {
  jest.setTimeout(60_000)

  const pg = createPostgresIntegrationHarness()
  let dbAvailable = false
  let prisma: PrismaClient

  beforeAll(async () => {
    await pg.probe()
    dbAvailable = pg.isAvailable()
    if (dbAvailable) {
      ;({ prisma } = require('../../src/common/database'))
    }
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

  // ─── R11/R12: FeePolicyVersion exclusivity ───────────────────────────────
  it('R11: a second PUBLISHED FeePolicyVersion for the same rail is rejected', async () => {
    requirePostgres('R11')
    const rail = `FIXTURE_RAIL_EXCLUSIVITY_TEST-${suffix()}`
    await prisma.feePolicyVersion.create({
      data: {
        label: `first-${suffix()}`, railScope: rail, status: 'PUBLISHED', publishedAt: new Date(),
        protocolFeeRate: '0.004', payerModel: 'SELLER_PAYS', economicBasis: 'SELLER_DELIVERED_VALUE',
        requiredConfirmations: 1, createdBy: 'fase7-2-exclusivity-test',
      },
    })
    await expect(
      prisma.feePolicyVersion.create({
        data: {
          label: `second-${suffix()}`, railScope: rail, status: 'PUBLISHED', publishedAt: new Date(),
          protocolFeeRate: '0.004', payerModel: 'SELLER_PAYS', economicBasis: 'SELLER_DELIVERED_VALUE',
          requiredConfirmations: 1, createdBy: 'fase7-2-exclusivity-test',
        },
      })
    ).rejects.toThrow(/unique constraint|duplicate key/i)
  })

  it('R12: raw SQL cannot bypass FeePolicyVersion single-PUBLISHED-per-rail exclusivity', async () => {
    requirePostgres('R12')
    const rail = `FIXTURE_RAIL_EXCLUSIVITY_TEST-${suffix()}`
    const first = await prisma.feePolicyVersion.create({
      data: {
        label: `first-${suffix()}`, railScope: rail, status: 'PUBLISHED', publishedAt: new Date(),
        protocolFeeRate: '0.004', payerModel: 'SELLER_PAYS', economicBasis: 'SELLER_DELIVERED_VALUE',
        requiredConfirmations: 1, createdBy: 'fase7-2-exclusivity-test',
      },
    })
    const second = await prisma.feePolicyVersion.create({
      data: {
        label: `second-${suffix()}`, railScope: rail, status: 'DRAFT',
        protocolFeeRate: '0.004', payerModel: 'SELLER_PAYS', economicBasis: 'SELLER_DELIVERED_VALUE',
        requiredConfirmations: 1, createdBy: 'fase7-2-exclusivity-test',
      },
    })

    await expect(
      prisma.$executeRawUnsafe(`UPDATE fee_policy_versions SET status = 'PUBLISHED', "publishedAt" = now() WHERE id = $1`, second.id)
    ).rejects.toThrow(/unique constraint|duplicate key/i)

    const reread = await prisma.feePolicyVersion.findUnique({ where: { id: first.id } })
    expect(reread!.status).toBe('PUBLISHED')
    const secondReread = await prisma.feePolicyVersion.findUnique({ where: { id: second.id } })
    expect(secondReread!.status).toBe('DRAFT')
  })

  // ─── R15 (FeePolicyVersion side): retirement permits a successor ────────
  it('R15a: retiring a FeePolicyVersion permits a successor to publish for the same rail', async () => {
    requirePostgres('R15a')
    const rail = `FIXTURE_RAIL_EXCLUSIVITY_TEST-${suffix()}`
    const first = await prisma.feePolicyVersion.create({
      data: {
        label: `first-${suffix()}`, railScope: rail, status: 'PUBLISHED', publishedAt: new Date(),
        protocolFeeRate: '0.004', payerModel: 'SELLER_PAYS', economicBasis: 'SELLER_DELIVERED_VALUE',
        requiredConfirmations: 1, createdBy: 'fase7-2-exclusivity-test',
      },
    })
    await prisma.feePolicyVersion.update({ where: { id: first.id }, data: { status: 'RETIRED', retiredAt: new Date() } })

    const second = await prisma.feePolicyVersion.create({
      data: {
        label: `second-${suffix()}`, railScope: rail, status: 'PUBLISHED', publishedAt: new Date(),
        protocolFeeRate: '0.004', payerModel: 'SELLER_PAYS', economicBasis: 'SELLER_DELIVERED_VALUE',
        requiredConfirmations: 1, createdBy: 'fase7-2-exclusivity-test',
      },
    })
    expect(second.status).toBe('PUBLISHED')
  })

  // ─── R13/R14: DistributionPolicyVersion exclusivity ──────────────────────
  it('R13: a second globally-PUBLISHED DistributionPolicyVersion is rejected', async () => {
    requirePostgres('R13')
    const live = await prisma.distributionPolicyVersion.findFirst({ where: { status: 'PUBLISHED' } })
    if (live) await prisma.distributionPolicyVersion.update({ where: { id: live.id }, data: { status: 'RETIRED', retiredAt: new Date() } })

    await prisma.distributionPolicyVersion.create({ data: { label: `first-${suffix()}`, status: 'PUBLISHED', createdBy: 'fase7-2-exclusivity-test', publishedAt: new Date() } })
    await expect(
      prisma.distributionPolicyVersion.create({ data: { label: `second-${suffix()}`, status: 'PUBLISHED', createdBy: 'fase7-2-exclusivity-test', publishedAt: new Date() } })
    ).rejects.toThrow(/unique constraint|duplicate key/i)
  })

  it('R14: raw SQL cannot bypass DistributionPolicyVersion single-PUBLISHED-globally exclusivity', async () => {
    requirePostgres('R14')
    const live = await prisma.distributionPolicyVersion.findFirst({ where: { status: 'PUBLISHED' } })
    if (live) await prisma.distributionPolicyVersion.update({ where: { id: live.id }, data: { status: 'RETIRED', retiredAt: new Date() } })

    const first = await prisma.distributionPolicyVersion.create({ data: { label: `first-${suffix()}`, status: 'PUBLISHED', createdBy: 'fase7-2-exclusivity-test', publishedAt: new Date() } })
    const second = await prisma.distributionPolicyVersion.create({ data: { label: `second-${suffix()}`, status: 'DRAFT', createdBy: 'fase7-2-exclusivity-test' } })

    await expect(
      prisma.$executeRawUnsafe(`UPDATE distribution_policy_versions SET status = 'PUBLISHED', "publishedAt" = now() WHERE id = $1`, second.id)
    ).rejects.toThrow(/unique constraint|duplicate key/i)

    const reread = await prisma.distributionPolicyVersion.findUnique({ where: { id: first.id } })
    expect(reread!.status).toBe('PUBLISHED')
    const secondReread = await prisma.distributionPolicyVersion.findUnique({ where: { id: second.id } })
    expect(secondReread!.status).toBe('DRAFT')

    await prisma.distributionPolicyVersion.update({ where: { id: first.id }, data: { status: 'RETIRED', retiredAt: new Date() } })
  })

  // ─── R15 (DistributionPolicyVersion side) ────────────────────────────────
  it('R15b: retiring a DistributionPolicyVersion permits a global successor to publish', async () => {
    requirePostgres('R15b')
    const live = await prisma.distributionPolicyVersion.findFirst({ where: { status: 'PUBLISHED' } })
    if (live) await prisma.distributionPolicyVersion.update({ where: { id: live.id }, data: { status: 'RETIRED', retiredAt: new Date() } })

    const first = await prisma.distributionPolicyVersion.create({ data: { label: `first-${suffix()}`, status: 'PUBLISHED', createdBy: 'fase7-2-exclusivity-test', publishedAt: new Date() } })
    await prisma.distributionPolicyVersion.update({ where: { id: first.id }, data: { status: 'RETIRED', retiredAt: new Date() } })

    const second = await prisma.distributionPolicyVersion.create({ data: { label: `second-${suffix()}`, status: 'PUBLISHED', createdBy: 'fase7-2-exclusivity-test', publishedAt: new Date() } })
    expect(second.status).toBe('PUBLISHED')

    await prisma.distributionPolicyVersion.update({ where: { id: second.id }, data: { status: 'RETIRED', retiredAt: new Date() } })
  })
})
