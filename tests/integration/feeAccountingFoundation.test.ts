// tests/integration/feeAccountingFoundation.test.ts
//
// Missão 11 Fase 2.2 — real-Postgres proofs that can't be honestly claimed
// against mocked Prisma: duplicate-obligation rejection (DB unique
// constraint), multi-policy-version provenance, and legacy-escrow
// behavior for FeeObligation itself.
//
// Missão 11 Fase 6.3B.1 — connectivity, authorization, and the fail-loud
// requirePostgres() contract come from the shared
// tests/integration/postgresTestHarness.ts (this file used to fall back
// to a stale, permanently-unreachable ":5433" connection string and
// silently report "passed" with zero assertions run — closed, not
// merely relocated).
//
// Missão 11 Fase 6.5.2 — the distribution-mechanics tests this file used
// to carry (Tests P/Q/R, exercising the now-retired
// feeDistributionRepository.createBatch()/addObligationToBatch()) were
// removed — see the comment at the bottom of this file for exactly why.

import { PrismaClient } from '@prisma/client'
import { createPostgresIntegrationHarness } from './postgresTestHarness'

describe('Fee accounting foundation — provenance, double-counting, legacy (Missão 11 Fase 2.2, real Postgres)', () => {
  jest.setTimeout(60_000)

  const pg = createPostgresIntegrationHarness()
  let dbAvailable = false
  let prisma: PrismaClient
  let feeObligationRepository: typeof import('../../src/modules/open-settlement/fee-obligation-repository').feeObligationRepository

  beforeAll(async () => {
    await pg.probe()
    dbAvailable = pg.isAvailable()
    if (!dbAvailable) return
    ;({ prisma } = require('../../src/common/database'))
    ;({ feeObligationRepository } = require('../../src/modules/open-settlement/fee-obligation-repository'))
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

  // Tests P, Q, Q (concurrency), Q (precondition), and R used to live here,
  // exercising feeDistributionRepository.createBatch()/addObligationToBatch()
  // (Mechanism 2's own provenance, double-distribution rejection,
  // concurrency, and revenue-double-counting guarantees). Missão 11 Fase
  // 6.5.2's single-economic-authority cutover formally retired that
  // mechanism — fee_distribution_batches/fee_distribution_batch_items are
  // now DB-natively write-frozen (prisma/migrations/
  // 20260823020000_legacy_fee_distribution_write_freeze), so every one of
  // those tests would now correctly fail by calling a repository method
  // that can never succeed again. Removed rather than converted into
  // rejection assertions, to avoid duplicating
  // tests/integration/legacyFeeDistributionWriteFreeze.test.ts, which
  // already covers the freeze itself (including
  // addObligationToBatch()'s own end-to-end rejection) — this file's
  // remaining tests (J, L, O above) cover what's still live:
  // FeeObligation's own provenance and uniqueness guarantees, independent
  // of the now-retired distribution mechanism.
})
