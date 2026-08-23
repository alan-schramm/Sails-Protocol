// tests/integration/feeAccountingFoundation.test.ts
//
// Missão 11 Fase 2.2 — real-Postgres proofs that can't be honestly claimed
// against mocked Prisma: duplicate-obligation rejection (DB unique
// constraint), multi-policy-version provenance through a real transaction
// (fee-distribution-repository.ts's addObligationToBatch()), double-
// distribution rejection, legacy-escrow behavior, and the CTO-mandated
// revenue double-counting invariant.
//
// Missão 11 Fase 6.3B.1 — connectivity, authorization, and the fail-loud
// requirePostgres() contract come from the shared
// tests/integration/postgresTestHarness.ts (this file used to fall back
// to a stale, permanently-unreachable ":5433" connection string and
// silently report "passed" with zero assertions run — closed, not
// merely relocated).

import { PrismaClient, Prisma } from '@prisma/client'
import { createPostgresIntegrationHarness } from './postgresTestHarness'

describe('Fee accounting foundation — provenance, double-counting, legacy (Missão 11 Fase 2.2, real Postgres)', () => {
  jest.setTimeout(60_000)

  const pg = createPostgresIntegrationHarness()
  let dbAvailable = false
  let prisma: PrismaClient
  let feeObligationRepository: typeof import('../../src/modules/open-settlement/fee-obligation-repository').feeObligationRepository
  let feeDistributionRepository: typeof import('../../src/modules/open-settlement/fee-distribution-repository').feeDistributionRepository
  let getProtocolRevenueSummary: typeof import('../../src/modules/open-settlement/fee-revenue-reporting').getProtocolRevenueSummary

  beforeAll(async () => {
    await pg.probe()
    dbAvailable = pg.isAvailable()
    if (!dbAvailable) return
    ;({ prisma } = require('../../src/common/database'))
    ;({ feeObligationRepository } = require('../../src/modules/open-settlement/fee-obligation-repository'))
    ;({ feeDistributionRepository } = require('../../src/modules/open-settlement/fee-distribution-repository'))
    ;({ getProtocolRevenueSummary } = require('../../src/modules/open-settlement/fee-revenue-reporting'))
  })

  afterAll(async () => {
    if (dbAvailable) await prisma.$disconnect()
  })

  function requirePostgres(name: string): void {
    pg.requirePostgres(name)
  }

  async function createFixtureEscrow(suffix: string): Promise<{ escrowId: string }> {
    const buyer = await prisma.user.create({ data: { publicKey: `pk-buyer-fee-acct-${suffix}` } })
    const seller = await prisma.user.create({ data: { publicKey: `pk-seller-fee-acct-${suffix}` } })
    const offer = await prisma.offer.create({
      data: { userId: seller.id, asset: 'BTC', side: 'SELL', priceUsd: '65000', minAmount: '0.001', maxAmount: '1', paymentMethod: 'PIX' },
    })
    const trade = await prisma.trade.create({
      data: { offerId: offer.id, buyerId: buyer.id, sellerId: seller.id, asset: 'BTC', amount: '0.01', priceUsd: '65000', totalUsd: '650' },
    })
    const escrow = await prisma.escrow.create({ data: { tradeId: trade.id, type: 'MOCK', asset: 'BTC', lockedAmount: '0.01' } })
    return { escrowId: escrow.id }
  }

  async function createPublishedPolicy(overrides: Record<string, any> = {}) {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    return prisma.feePolicyVersion.create({
      data: {
        label: `fixture-${suffix}`,
        railScope: 'FIXTURE_RAIL_ACCOUNTING_TEST',
        status: 'PUBLISHED',
        protocolFeeRate: '0.004',
        payerModel: 'SELLER_PAYS',
        economicBasis: 'SELLER_DELIVERED_VALUE',
        nodeOperatorPct: '30',
        treasuryPct: '25',
        walletRebatePct: '35',
        arbitratorReservePct: '10',
        createdBy: 'integration-test-fixture',
        publishedAt: new Date(),
        ...overrides,
      },
    })
  }

  // Test J: legacy escrow (feePolicyVersionId NULL) remains fully valid —
  // no FeeObligation is required or created for it, and no error results
  // from its mere existence alongside the new tables.
  it('Test J: an escrow with feePolicyVersionId = NULL (legacy) is unaffected and requires no FeeObligation', async () => {
    requirePostgres('Test J')
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const { escrowId } = await createFixtureEscrow(`legacy-${suffix}`)

    const escrow = await prisma.escrow.findUniqueOrThrow({ where: { id: escrowId } })
    expect(escrow.feePolicyVersionId).toBeNull()
    expect(escrow.snapshotProtocolFeeRate).toBeNull()

    const obligation = await feeObligationRepository.findByEscrowId(escrowId)
    expect(obligation).toBeNull() // correctly absent — this escrow never entered the Fee Policy v1+ regime at all
  })

  // Test L: duplicate FeeObligation for the same escrow is rejected —
  // the real DB-level guarantee (escrowId @unique), not just an
  // application-level check.
  it('Test L: a second FeeObligation for the same escrow is rejected by the database', async () => {
    requirePostgres('Test L')
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const { escrowId } = await createFixtureEscrow(`dup-${suffix}`)
    const policy = await createPublishedPolicy()

    await feeObligationRepository.createOwed({
      escrowId, feePolicyVersionId: policy.id, economicDetermination: 'OWED',
      basisAmount: '100000', computedFee: '400', asset: 'BTC',
    })

    await expect(
      feeObligationRepository.createOwed({
        escrowId, feePolicyVersionId: policy.id, economicDetermination: 'OWED',
        basisAmount: '100000', computedFee: '400', asset: 'BTC',
      })
    ).rejects.toThrow(/already exists for escrow/)
  })

  // Test O: two different policy versions preserve different economics for
  // the obligations snapshotted against each — a later policy's rate must
  // never retroactively apply to an obligation created under an earlier one.
  it('Test O: two policy versions preserve independently correct economics for their own obligations', async () => {
    requirePostgres('Test O')
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const policyV1 = await createPublishedPolicy({ protocolFeeRate: '0.004', label: `v1-${suffix}` })
    const policyV2 = await createPublishedPolicy({ protocolFeeRate: '0.010', label: `v2-${suffix}` })

    const { escrowId: escrowUnderV1 } = await createFixtureEscrow(`v1-${suffix}`)
    const { escrowId: escrowUnderV2 } = await createFixtureEscrow(`v2-${suffix}`)

    const obligationV1 = await feeObligationRepository.createOwed({
      escrowId: escrowUnderV1, feePolicyVersionId: policyV1.id, economicDetermination: 'OWED',
      basisAmount: '100000', computedFee: '400', asset: 'BTC', // 0.4% of 100000
    })
    const obligationV2 = await feeObligationRepository.createOwed({
      escrowId: escrowUnderV2, feePolicyVersionId: policyV2.id, economicDetermination: 'OWED',
      basisAmount: '100000', computedFee: '1000', asset: 'BTC', // 1.0% of 100000
    })

    const rereadV1 = await feeObligationRepository.findById(obligationV1.id)
    const rereadV2 = await feeObligationRepository.findById(obligationV2.id)
    expect(rereadV1!.feePolicyVersionId).toBe(policyV1.id)
    expect(rereadV1!.computedFee!.toString()).toBe('400')
    expect(rereadV2!.feePolicyVersionId).toBe(policyV2.id)
    expect(rereadV2!.computedFee!.toString()).toBe('1000')
  })

  // Test P: a distribution batch spanning two policy versions preserves
  // correct per-obligation provenance — each item's bucket shares must be
  // computed from ITS OWN policy version, never the other one's.
  it('Test P: a mixed-version distribution batch computes each item\'s bucket shares from its own policy version', async () => {
    requirePostgres('Test P')
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    // v1: 30/25/35/10 split (the fixture default). v2: a deliberately
    // different split (50/20/20/10) so a provenance bug (applying v2's
    // split to a v1 obligation) is unambiguously detectable.
    const policyV1 = await createPublishedPolicy({ label: `distv1-${suffix}` })
    const policyV2 = await createPublishedPolicy({
      label: `distv2-${suffix}`, nodeOperatorPct: '50', treasuryPct: '20', walletRebatePct: '20', arbitratorReservePct: '10',
    })

    const { escrowId: escrowA } = await createFixtureEscrow(`pa-${suffix}`)
    const { escrowId: escrowB } = await createFixtureEscrow(`pb-${suffix}`)

    const obligationA = await feeObligationRepository.createOwed({
      escrowId: escrowA, feePolicyVersionId: policyV1.id, economicDetermination: 'OWED',
      basisAmount: '100000', computedFee: '1000', asset: 'BTC',
    })
    const obligationB = await feeObligationRepository.createOwed({
      escrowId: escrowB, feePolicyVersionId: policyV2.id, economicDetermination: 'OWED',
      basisAmount: '100000', computedFee: '1000', asset: 'BTC',
    })

    // Both must be COLLECTED before they can be distributed (Fase 2.1's
    // collection-status precondition) — walk the real transition graph.
    await prisma.feeObligation.update({ where: { id: obligationA.id }, data: { collectionStatus: 'IN_PROGRESS' } })
    await prisma.feeObligation.update({ where: { id: obligationA.id }, data: { collectionStatus: 'COLLECTED' } })
    await prisma.feeObligation.update({ where: { id: obligationB.id }, data: { collectionStatus: 'IN_PROGRESS' } })
    await prisma.feeObligation.update({ where: { id: obligationB.id }, data: { collectionStatus: 'COLLECTED' } })

    const batch = await feeDistributionRepository.createBatch('BTC', '2000')
    const itemA = await feeDistributionRepository.addObligationToBatch(batch.id, obligationA.id)
    const itemB = await feeDistributionRepository.addObligationToBatch(batch.id, obligationB.id)

    expect(itemA.feePolicyVersionId).toBe(policyV1.id)
    expect(itemA.nodeOperatorShare.toString()).toBe('300') // 30% of 1000
    expect(itemA.walletRebateShare.toString()).toBe('350') // 35% of 1000

    expect(itemB.feePolicyVersionId).toBe(policyV2.id)
    expect(itemB.nodeOperatorShare.toString()).toBe('500') // 50% of 1000 — proves v2's own split, not v1's, was used
    expect(itemB.walletRebateShare.toString()).toBe('200') // 20% of 1000

    const subtotals = await feeDistributionRepository.sumDistributedByPolicyVersion(batch.id)
    const v1Subtotal = subtotals.find((s) => s.feePolicyVersionId === policyV1.id)
    const v2Subtotal = subtotals.find((s) => s.feePolicyVersionId === policyV2.id)
    expect(v1Subtotal!.total.toString()).toBe('1000')
    expect(v2Subtotal!.total.toString()).toBe('1000')
  })

  // Test Q: the same obligation cannot be distributed twice — the real
  // DB-level guarantee (@@unique on FeeDistributionBatchItem.feeObligationId).
  it('Test Q: distributing the same FeeObligation twice is rejected', async () => {
    requirePostgres('Test Q')
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const policy = await createPublishedPolicy({ label: `dup-dist-${suffix}` })
    const { escrowId } = await createFixtureEscrow(`qdist-${suffix}`)

    const obligation = await feeObligationRepository.createOwed({
      escrowId, feePolicyVersionId: policy.id, economicDetermination: 'OWED',
      basisAmount: '100000', computedFee: '400', asset: 'BTC',
    })
    await prisma.feeObligation.update({ where: { id: obligation.id }, data: { collectionStatus: 'IN_PROGRESS' } })
    await prisma.feeObligation.update({ where: { id: obligation.id }, data: { collectionStatus: 'COLLECTED' } })

    const batch1 = await feeDistributionRepository.createBatch('BTC', '400')
    await feeDistributionRepository.addObligationToBatch(batch1.id, obligation.id)

    // Real finding while writing this test (not assumed): in this
    // sequential, non-concurrent scenario, the collectionStatus precondition
    // check fires BEFORE the DB's unique-constraint create() is ever
    // attempted, since the first call already moved the obligation to
    // DISTRIBUTED — so the second call is correctly rejected by the
    // precondition check, not by the P2002 constraint. The unique
    // constraint remains the deeper, independent guarantee for the genuine
    // race case (two concurrent calls both observing collectionStatus =
    // COLLECTED before either commits) — see the "already been distributed"
    // message and P2002 handling in fee-distribution-repository.ts, which
    // this sequential test cannot exercise without simulating real
    // concurrency.
    const batch2 = await feeDistributionRepository.createBatch('BTC', '400')
    await expect(feeDistributionRepository.addObligationToBatch(batch2.id, obligation.id)).rejects.toThrow(/is not COLLECTED/)

    // Confirm the failed second attempt left no partial state — the
    // obligation is still DISTRIBUTED into batch1 only, not batch2.
    const finalObligation = await prisma.feeObligation.findUniqueOrThrow({ where: { id: obligation.id } })
    expect(finalObligation.collectionStatus).toBe('DISTRIBUTED')
    expect(finalObligation.distributedInBatchId).toBe(batch1.id)
    const batch2Items = await feeDistributionRepository.listItemsForBatch(batch2.id)
    expect(batch2Items).toHaveLength(0)
  })

  // Test Q (concurrency): the real race the DB-level unique constraint
  // exists for — two callers both see collectionStatus = COLLECTED and both
  // attempt addObligationToBatch() at the same time. Exactly one must
  // succeed; the other must fail with the P2002-derived "already been
  // distributed" message, and the obligation must end up DISTRIBUTED into
  // exactly one batch, never both.
  it('Test Q (concurrency): two concurrent distribution attempts for the same obligation — exactly one wins', async () => {
    requirePostgres('Test Q concurrency')
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const policy = await createPublishedPolicy({ label: `race-${suffix}` })
    const { escrowId } = await createFixtureEscrow(`race-${suffix}`)

    const obligation = await feeObligationRepository.createOwed({
      escrowId, feePolicyVersionId: policy.id, economicDetermination: 'OWED',
      basisAmount: '100000', computedFee: '400', asset: 'BTC',
    })
    await prisma.feeObligation.update({ where: { id: obligation.id }, data: { collectionStatus: 'IN_PROGRESS' } })
    await prisma.feeObligation.update({ where: { id: obligation.id }, data: { collectionStatus: 'COLLECTED' } })

    const raceBatchA = await feeDistributionRepository.createBatch('BTC', '400')
    const raceBatchB = await feeDistributionRepository.createBatch('BTC', '400')

    const results = await Promise.allSettled([
      feeDistributionRepository.addObligationToBatch(raceBatchA.id, obligation.id),
      feeDistributionRepository.addObligationToBatch(raceBatchB.id, obligation.id),
    ])

    const fulfilled = results.filter((r) => r.status === 'fulfilled')
    const rejected = results.filter((r) => r.status === 'rejected')
    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    expect((rejected[0] as PromiseRejectedResult).reason.message).toMatch(/already been distributed|not COLLECTED/)

    const final = await prisma.feeObligation.findUniqueOrThrow({ where: { id: obligation.id } })
    expect(final.collectionStatus).toBe('DISTRIBUTED')
    expect([raceBatchA.id, raceBatchB.id]).toContain(final.distributedInBatchId)

    const itemsA = await feeDistributionRepository.listItemsForBatch(raceBatchA.id)
    const itemsB = await feeDistributionRepository.listItemsForBatch(raceBatchB.id)
    expect(itemsA.length + itemsB.length).toBe(1) // exactly one item was ever created, in exactly one batch
  })

  // Test Q (continued): attempting to distribute an obligation that isn't
  // COLLECTED yet is also rejected.
  it('Test Q (precondition): distributing an obligation that is not COLLECTED is rejected', async () => {
    requirePostgres('Test Q precondition')
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const policy = await createPublishedPolicy({ label: `precond-${suffix}` })
    const { escrowId } = await createFixtureEscrow(`precond-${suffix}`)

    const obligation = await feeObligationRepository.createOwed({
      escrowId, feePolicyVersionId: policy.id, economicDetermination: 'OWED',
      basisAmount: '100000', computedFee: '400', asset: 'BTC',
    }) // still PENDING_COLLECTION

    const batch = await feeDistributionRepository.createBatch('BTC', '400')
    await expect(feeDistributionRepository.addObligationToBatch(batch.id, obligation.id)).rejects.toThrow(/is not COLLECTED/)
  })

  // Test R: the CTO-mandated revenue double-counting invariant —
  // grossCollected must equal undistributedCollected + alreadyDistributed,
  // never SUM(COLLECTED) + SUM(DISTRIBUTED) computed as if they were two
  // independent revenue pools.
  it('Test R: gross/undistributed/distributed never double-count the same obligation', async () => {
    requirePostgres('Test R')
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const policy = await createPublishedPolicy({ label: `revenue-${suffix}` })

    const { escrowId: escrowCollectedOnly } = await createFixtureEscrow(`rc-${suffix}`)
    const { escrowId: escrowDistributed } = await createFixtureEscrow(`rd-${suffix}`)

    const before = await getProtocolRevenueSummary('BTC')

    const obligationCollected = await feeObligationRepository.createOwed({
      escrowId: escrowCollectedOnly, feePolicyVersionId: policy.id, economicDetermination: 'OWED',
      basisAmount: '100000', computedFee: '111', asset: 'BTC',
    })
    await prisma.feeObligation.update({ where: { id: obligationCollected.id }, data: { collectionStatus: 'IN_PROGRESS' } })
    await prisma.feeObligation.update({ where: { id: obligationCollected.id }, data: { collectionStatus: 'COLLECTED' } })

    const obligationDistributed = await feeObligationRepository.createOwed({
      escrowId: escrowDistributed, feePolicyVersionId: policy.id, economicDetermination: 'OWED',
      basisAmount: '100000', computedFee: '222', asset: 'BTC',
    })
    await prisma.feeObligation.update({ where: { id: obligationDistributed.id }, data: { collectionStatus: 'IN_PROGRESS' } })
    await prisma.feeObligation.update({ where: { id: obligationDistributed.id }, data: { collectionStatus: 'COLLECTED' } })
    const batch = await feeDistributionRepository.createBatch('BTC', '222')
    await feeDistributionRepository.addObligationToBatch(batch.id, obligationDistributed.id)

    const after = await getProtocolRevenueSummary('BTC')

    const deltaUndistributed = new Prisma.Decimal(after.undistributedCollected).minus(before.undistributedCollected)
    const deltaDistributed = new Prisma.Decimal(after.alreadyDistributed).minus(before.alreadyDistributed)
    const deltaGross = new Prisma.Decimal(after.grossCollected).minus(before.grossCollected)

    expect(deltaUndistributed.toString()).toBe('111') // only the still-COLLECTED one
    expect(deltaDistributed.toString()).toBe('222') // only the DISTRIBUTED one
    // The invariant: gross == undistributed + distributed, exactly — never
    // 111 + 222 counted again as a third figure, and never 222 appearing in
    // both undistributed AND distributed.
    expect(deltaGross.toString()).toBe(deltaUndistributed.plus(deltaDistributed).toString())
    expect(deltaGross.toString()).toBe('333')
  })
})
