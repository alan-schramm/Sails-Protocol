// #309 — real-Postgres evidence-generation integrity.
// Proves the database CAS itself: concurrent JSON aggregate writers cannot
// silently overwrite one another, and a stale evidence writer cannot move a
// dispute back into evidence gathering after a human/state transition.
import { PrismaClient } from '@prisma/client'
import { createPostgresIntegrationHarness } from './postgresTestHarness'
import { registerTestParticipant, closeTestRedis } from './identityTestHelpers'

describe('#309 dispute evidence generation — real Postgres', () => {
  jest.setTimeout(60_000)
  const pg = createPostgresIntegrationHarness()
  let dbAvailable = false
  let prisma: PrismaClient
  let escrowService: import('../../src/modules/open-settlement/escrow.service').EscrowService
  let identityService: typeof import('../../src/modules/open-identity/identity.service').identityService
  let liquidityRouter: typeof import('../../src/modules/open-liquidity/liquidity.service').liquidityRouter
  let tradeService: typeof import('../../src/modules/open-p2p/trade.service').tradeService
  let getDisputeService: typeof import('../../src/modules/open-settlement/dispute.service').getDisputeService
  let intentEngine: typeof import('../../src/core/intent-engine').intentEngine
  let OpenP2PTradeIntentHandler: typeof import('../../src/modules/open-p2p/intent-handler').OpenP2PTradeIntentHandler

  beforeAll(async () => {
    process.env.MOCK_ESCROW = 'true'
    process.env.TRUSTED_ARBITRATORS = process.env.TRUSTED_ARBITRATORS || 'evidence-generation-arbiter'
    await pg.probe()
    dbAvailable = pg.isAvailable()
    if (!dbAvailable) return
    ;({ prisma } = require('../../src/common/database'))
    ;({ escrowService } = require('../../src/modules/open-settlement/escrow.service'))
    ;({ identityService } = require('../../src/modules/open-identity/identity.service'))
    ;({ liquidityRouter } = require('../../src/modules/open-liquidity/liquidity.service'))
    ;({ tradeService } = require('../../src/modules/open-p2p/trade.service'))
    ;({ getDisputeService } = require('../../src/modules/open-settlement/dispute.service'))
    ;({ intentEngine } = require('../../src/core/intent-engine'))
    ;({ OpenP2PTradeIntentHandler } = require('../../src/modules/open-p2p/intent-handler'))
    intentEngine.registerHandler(OpenP2PTradeIntentHandler)
  })

  afterAll(async () => {
    if (dbAvailable) {
      await prisma.$disconnect()
      await closeTestRedis()
    }
  })

  function requirePostgres(name: string): void { pg.requirePostgres(name) }

  async function fixture(suffix: string) {
    const seller = await registerTestParticipant(identityService, 'Seller')
    const buyer = await registerTestParticipant(identityService, 'Buyer')
    const offer = await liquidityRouter.createOffer({
      userId: seller.id, asset: 'BTC', side: 'SELL', priceUsd: '60000',
      minAmount: '0.001', maxAmount: '0.001', paymentMethod: 'OTHER',
    })
    const trade = await tradeService.createTrade({ offerId: offer.id, counterpartyId: buyer.id, amount: '0.001' })
    const escrow = await escrowService.createEscrow({ tradeId: trade.id, type: 'MOCK', lockedAmount: '0.001', asset: 'BTC' }, seller.id)
    await prisma.trade.update({ where: { id: trade.id }, data: { escrowId: escrow.id } })
    const dispute = await prisma.dispute.create({
      data: {
        tradeId: trade.id, escrowId: escrow.id, openedBy: buyer.id,
        reason: `#309-${suffix}`, arbiterId: seller.id, status: 'OPENED',
      },
    })
    return { dispute, buyer, seller }
  }

  it('concurrent generation-0 writers cannot both commit the same stale JSON snapshot', async () => {
    requirePostgres('concurrent evidence CAS')
    const { dispute } = await fixture('concurrent')
    const entryA = [{ type: 'chat_log', submittedBy: 'a', submittedAt: new Date().toISOString() }]
    const entryB = [{ type: 'payment_receipt', submittedBy: 'b', submittedAt: new Date().toISOString() }]

    const [a, b] = await Promise.all([
      prisma.dispute.updateMany({
        where: { id: dispute.id, evidenceGeneration: 0, status: { in: ['OPENED', 'EVIDENCE_SUBMITTED'] } },
        data: { evidence: entryA, evidenceGeneration: { increment: 1 }, status: 'EVIDENCE_SUBMITTED' },
      }),
      prisma.dispute.updateMany({
        where: { id: dispute.id, evidenceGeneration: 0, status: { in: ['OPENED', 'EVIDENCE_SUBMITTED'] } },
        data: { evidence: entryB, evidenceGeneration: { increment: 1 }, status: 'EVIDENCE_SUBMITTED' },
      }),
    ])

    expect([a.count, b.count].sort()).toEqual([0, 1])
    const row = await prisma.dispute.findUniqueOrThrow({ where: { id: dispute.id } })
    expect(row.evidenceGeneration).toBe(1)
    expect(Array.isArray(row.evidence) ? row.evidence : []).toHaveLength(1)
  })

  it('ten concurrent legitimate submissions all survive bounded CAS retries', async () => {
    requirePostgres('concurrent evidence service retries')
    const { dispute, buyer, seller } = await fixture('ten')
    const service = getDisputeService()

    const submissions = Array.from({ length: 10 }, (_, i) =>
      service.submitEvidence(
        dispute.id,
        i % 2 === 0 ? buyer.id : seller.id,
        { type: 'chat_log', note: `concurrent-evidence-${i}` },
      )
    )
    await Promise.all(submissions)

    const row = await prisma.dispute.findUniqueOrThrow({ where: { id: dispute.id } })
    const evidence = Array.isArray(row.evidence) ? row.evidence as Array<{ note?: string }> : []
    expect(row.evidenceGeneration).toBe(10)
    expect(evidence).toHaveLength(10)
    expect(new Set(evidence.map((entry) => entry.note))).toEqual(
      new Set(Array.from({ length: 10 }, (_, i) => `concurrent-evidence-${i}`))
    )
  })

  it('one idempotency key produces one evidence generation under concurrent retries', async () => {
    requirePostgres('idempotent concurrent evidence')
    const { dispute, buyer } = await fixture('idempotent')
    const service = getDisputeService()
    const key = `#309-evidence-${dispute.id}`
    const descriptor = { type: 'chat_log' as const, note: 'one logical request' }

    const attempts = await Promise.allSettled([
      service.submitEvidence(dispute.id, buyer.id, descriptor, key),
      service.submitEvidence(dispute.id, buyer.id, descriptor, key),
    ])

    const fulfilled = attempts.filter((result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof service.submitEvidence>>> => result.status === 'fulfilled')
    const rejected = attempts.filter((result): result is PromiseRejectedResult => result.status === 'rejected')
    expect(fulfilled).toHaveLength(1)
    expect(fulfilled[0].value.id).toBe(dispute.id)
    expect(rejected).toHaveLength(1)
    expect(rejected[0].reason?.name).toBe('IdempotencyKeyConflictError')

    const row = await prisma.dispute.findUniqueOrThrow({ where: { id: dispute.id } })
    const evidence = Array.isArray(row.evidence) ? row.evidence as Array<{ note?: string }> : []
    expect(row.evidenceGeneration).toBe(1)
    expect(evidence.filter((entry) => entry.note === 'one logical request')).toHaveLength(1)
  })

  it('a stale evidence writer cannot restore EVIDENCE_SUBMITTED after human/state advancement', async () => {
    requirePostgres('stale evidence writer')
    const { dispute } = await fixture('stale')
    const staleGeneration = dispute.evidenceGeneration

    await prisma.dispute.update({
      where: { id: dispute.id },
      data: { status: 'RESOLVED', ruling: 'REFUND', resolvedAt: new Date() },
    })

    const stale = await prisma.dispute.updateMany({
      where: { id: dispute.id, evidenceGeneration: staleGeneration, status: { in: ['OPENED', 'EVIDENCE_SUBMITTED'] } },
      data: {
        evidence: [{ type: 'payment_receipt', submittedBy: 'stale', submittedAt: new Date().toISOString() }],
        evidenceGeneration: { increment: 1 },
        status: 'EVIDENCE_SUBMITTED',
      },
    })

    expect(stale.count).toBe(0)
    const row = await prisma.dispute.findUniqueOrThrow({ where: { id: dispute.id } })
    expect(row.status).toBe('RESOLVED')
    expect(row.ruling).toBe('REFUND')
    expect(row.evidenceGeneration).toBe(staleGeneration)
  })
})
