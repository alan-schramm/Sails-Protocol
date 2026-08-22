// tests/integration/feePolicyImmutability.test.ts
//
// Missão 11 Fase 2.2 — real-Postgres proof of the two-layer FeePolicyVersion
// immutability guarantee (Fase 2.1 §1 decision D): (1) the repository's
// narrow surface, (2) a real BEFORE UPDATE trigger. tests/feePolicyService.test.ts
// covers the SERVICE-level structural validation (percentage sums, negative
// values) against a fake repository — this file covers the two things that
// can only be proven against a real database: whether a raw SQL UPDATE is
// actually rejected (mocked Prisma cannot prove this — a mock has no
// trigger), and whether the Escrow fee-snapshot columns get the same
// protection.
//
// Same skip-gracefully pattern as tests/integration/postgresProductionReadiness.test.ts.

import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://postgres:password@localhost:5433/sails_protocol'

describe('FeePolicyVersion / Escrow fee-snapshot immutability (Missão 11 Fase 2.2, real Postgres)', () => {
  jest.setTimeout(60_000)

  let dbAvailable = false
  let prisma: PrismaClient

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL
    const probe = new PrismaClient({ adapter: new PrismaPg({ connectionString: DATABASE_URL }) })
    try {
      await probe.$queryRaw`SELECT 1`
      dbAvailable = true
    } catch {
      dbAvailable = false
    } finally {
      await probe.$disconnect()
    }
    if (!dbAvailable) return
    ;({ prisma } = require('../../src/common/database'))
  })

  afterAll(async () => {
    if (dbAvailable) await prisma.$disconnect()
  })

  function skip(name: string): boolean {
    if (!dbAvailable) {
      console.warn(`Skipping "${name}" - no real Postgres reachable at ${DATABASE_URL}`)
      return true
    }
    return false
  }

  function fixturePolicyData(overrides: Record<string, any> = {}) {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    return {
      label: `test-fixture-${suffix}`,
      railScope: 'FIXTURE_RAIL_IMMUTABILITY_TEST',
      protocolFeeRate: '0.004',
      payerModel: 'SELLER_PAYS' as const,
      economicBasis: 'SELLER_DELIVERED_VALUE' as const,
      nodeOperatorPct: '30',
      treasuryPct: '25',
      walletRebatePct: '35',
      arbitratorReservePct: '10',
      createdBy: 'integration-test-fixture',
      ...overrides,
    }
  }

  // Test A: DRAFT economic fields CAN change (via raw SQL directly, proving
  // the trigger's own OLD.status <> 'DRAFT' condition genuinely gates on
  // status, not on some other property).
  it('Test A: a DRAFT policy\'s economic fields can be changed via raw SQL', async () => {
    if (skip('Test A')) return
    const draft = await prisma.feePolicyVersion.create({ data: fixturePolicyData() })

    await prisma.$executeRawUnsafe(`UPDATE fee_policy_versions SET "protocolFeeRate" = 0.01 WHERE id = $1`, draft.id)
    const updated = await prisma.feePolicyVersion.findUniqueOrThrow({ where: { id: draft.id } })
    // Prisma's Decimal.toString() normalizes trailing zeros away (unlike
    // psql's own NUMERIC(24,8) display) — compare numeric value, not string shape.
    expect(updated.protocolFeeRate.toString()).toBe('0.01')
  })

  // Test B: PUBLISHED economic fields cannot change via the repository (no
  // method exists) — proven at the type/interface level in
  // fee-policy-repository.ts itself (no update() member); reconfirmed here
  // behaviorally: publish() only ever writes status+publishedAt.
  it('Test B: FeePolicyService.publish() never touches economic columns, even though it has full row access', async () => {
    if (skip('Test B')) return
    const { FeePolicyService } = require('../../src/modules/open-settlement/fee-policy.service')
    const { feePolicyVersionRepository } = require('../../src/modules/open-settlement/fee-policy-repository')
    const service = new FeePolicyService(feePolicyVersionRepository)

    const draft = await prisma.feePolicyVersion.create({ data: fixturePolicyData() })
    const rateBefore = draft.protocolFeeRate.toString()

    const published = await service.publish(draft.id)
    expect(published.status).toBe('PUBLISHED')
    expect(published.protocolFeeRate.toString()).toBe(rateBefore)
  })

  // Test C: PUBLISHED economic fields CANNOT change via raw SQL — the core
  // proof the CTO explicitly required against a real database, not mocked
  // Prisma.
  it('Test C: a raw SQL UPDATE touching an economic column on a PUBLISHED policy is rejected by the database trigger', async () => {
    if (skip('Test C')) return
    const draft = await prisma.feePolicyVersion.create({ data: fixturePolicyData() })
    await prisma.feePolicyVersion.update({ where: { id: draft.id }, data: { status: 'PUBLISHED', publishedAt: new Date() } })

    await expect(
      prisma.$executeRawUnsafe(`UPDATE fee_policy_versions SET "protocolFeeRate" = 0.99 WHERE id = $1`, draft.id)
    ).rejects.toThrow(/economic\/identity fields are immutable/)

    const unchanged = await prisma.feePolicyVersion.findUniqueOrThrow({ where: { id: draft.id } })
    expect(unchanged.protocolFeeRate.toString()).toBe(draft.protocolFeeRate.toString())
  })

  // Test D: RETIRED stays exactly as locked as PUBLISHED.
  it('Test D: a raw SQL UPDATE touching an economic column on a RETIRED policy is also rejected', async () => {
    if (skip('Test D')) return
    const draft = await prisma.feePolicyVersion.create({ data: fixturePolicyData() })
    await prisma.feePolicyVersion.update({ where: { id: draft.id }, data: { status: 'PUBLISHED', publishedAt: new Date() } })
    await prisma.feePolicyVersion.update({ where: { id: draft.id }, data: { status: 'RETIRED', retiredAt: new Date() } })

    await expect(
      prisma.$executeRawUnsafe(`UPDATE fee_policy_versions SET "arbitratorReservePct" = 50 WHERE id = $1`, draft.id)
    ).rejects.toThrow(/economic\/identity fields are immutable/)

    // The status/retiredAt transition itself, done via the ORM one line
    // above, DID succeed — proving the trigger discriminates by COLUMN, not
    // by blanket-rejecting every update once status != DRAFT.
    const row = await prisma.feePolicyVersion.findUniqueOrThrow({ where: { id: draft.id } })
    expect(row.status).toBe('RETIRED')
    expect(row.retiredAt).not.toBeNull()
  })

  // Test E: Escrow's own thin fee-policy scalar snapshot is immutable once set.
  it('Test E: an Escrow\'s fee-policy snapshot cannot change once set, via raw SQL', async () => {
    if (skip('Test E')) return
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const buyer = await prisma.user.create({ data: { publicKey: `pk-buyer-fee-snap-${suffix}` } })
    const seller = await prisma.user.create({ data: { publicKey: `pk-seller-fee-snap-${suffix}` } })
    const offer = await prisma.offer.create({
      data: { userId: seller.id, asset: 'BTC', side: 'SELL', priceUsd: '65000', minAmount: '0.001', maxAmount: '1', paymentMethod: 'PIX' },
    })
    const trade = await prisma.trade.create({
      data: { offerId: offer.id, buyerId: buyer.id, sellerId: seller.id, asset: 'BTC', amount: '0.01', priceUsd: '65000', totalUsd: '650' },
    })
    const escrow = await prisma.escrow.create({ data: { tradeId: trade.id, type: 'MOCK', asset: 'BTC', lockedAmount: '0.01' } })

    const policy = await prisma.feePolicyVersion.create({
      data: { ...fixturePolicyData(), status: 'PUBLISHED', publishedAt: new Date() },
    })

    await prisma.escrow.update({
      where: { id: escrow.id },
      data: { feePolicyVersionId: policy.id, snapshotProtocolFeeRate: policy.protocolFeeRate, snapshotPayerModel: policy.payerModel, snapshotEconomicBasis: policy.economicBasis },
    })

    // First write succeeded — confirm, then attempt a second write, which must fail.
    const afterFirstWrite = await prisma.escrow.findUniqueOrThrow({ where: { id: escrow.id } })
    expect(afterFirstWrite.snapshotProtocolFeeRate?.toString()).toBe(policy.protocolFeeRate.toString())

    await expect(
      prisma.$executeRawUnsafe(`UPDATE escrows SET "snapshotProtocolFeeRate" = 0.99 WHERE id = $1`, escrow.id)
    ).rejects.toThrow(/fee policy snapshot is immutable/)

    // An unrelated Escrow column (status) must remain freely updatable —
    // the trigger must not lock the whole row, only the four fee-snapshot
    // columns.
    await expect(prisma.escrow.update({ where: { id: escrow.id }, data: { status: 'FUNDS_LOCKED' } })).resolves.toMatchObject({ status: 'FUNDS_LOCKED' })

    const finalRow = await prisma.escrow.findUniqueOrThrow({ where: { id: escrow.id } })
    expect(finalRow.snapshotProtocolFeeRate?.toString()).toBe(policy.protocolFeeRate.toString())
  })

  // Test I (repository/FK level, complementing feePolicyService.test.ts's
  // service-level assertPublished proof): a FeeObligation's FK constraint
  // itself has no opinion on DRAFT vs PUBLISHED — that guard is deliberately
  // application-level (fee-policy.service.ts's assertPublished()), since
  // Prisma's FK cannot express "must reference a row where status=X". This
  // test proves the FK DOES still work as a real referential-integrity
  // guarantee (a nonexistent policy id is rejected by Postgres), which is
  // the part of "must reference a valid, real policy" the database enforces
  // on its own.
  it('Test I (FK layer): a FeeObligation referencing a nonexistent FeePolicyVersion is rejected by Postgres', async () => {
    if (skip('Test I (FK layer)')) return
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const buyer = await prisma.user.create({ data: { publicKey: `pk-buyer-fk-${suffix}` } })
    const seller = await prisma.user.create({ data: { publicKey: `pk-seller-fk-${suffix}` } })
    const offer = await prisma.offer.create({
      data: { userId: seller.id, asset: 'BTC', side: 'SELL', priceUsd: '65000', minAmount: '0.001', maxAmount: '1', paymentMethod: 'PIX' },
    })
    const trade = await prisma.trade.create({
      data: { offerId: offer.id, buyerId: buyer.id, sellerId: seller.id, asset: 'BTC', amount: '0.01', priceUsd: '65000', totalUsd: '650' },
    })
    const escrow = await prisma.escrow.create({ data: { tradeId: trade.id, type: 'MOCK', asset: 'BTC', lockedAmount: '0.01' } })

    await expect(
      prisma.feeObligation.create({
        data: { escrowId: escrow.id, feePolicyVersionId: 'does-not-exist', economicDetermination: 'OWED', collectionStatus: 'PENDING_COLLECTION', computedFee: '1', basisAmount: '1', asset: 'BTC' },
      })
    ).rejects.toThrow(/Foreign key constraint/i)
  })
})
