// Issue #238 — real PostgreSQL proof that opening a dispute cannot durably freeze
// an Escrow without the corresponding Dispute and recoverable transition claim.
import { PrismaClient } from '@prisma/client'
import { randomUUID } from 'crypto'
import { createPostgresIntegrationHarness } from './postgresTestHarness'
import { closeTestRedis } from './identityTestHelpers'

describe('#238 dispute opening atomicity (real Postgres)', () => {
  jest.setTimeout(120_000)
  const pg = createPostgresIntegrationHarness()
  let prisma: PrismaClient
  let DisputeService: typeof import('../../src/modules/open-settlement/dispute.service').DisputeService
  let TrustedArbitratorProvider: typeof import('../../src/modules/open-settlement/arbitration-provider').TrustedArbitratorProvider

  beforeAll(async () => {
    await pg.probe()
    if (!pg.isAvailable()) return
    ;({ prisma } = require('../../src/common/database'))
    ;({ DisputeService } = require('../../src/modules/open-settlement/dispute.service'))
    ;({ TrustedArbitratorProvider } = require('../../src/modules/open-settlement/arbitration-provider'))
  })

  afterAll(async () => {
    if (pg.isAvailable()) {
      await prisma.$disconnect()
      await closeTestRedis()
    }
  })

  async function fixture() {
    const tag = randomUUID()
    const seller = await prisma.user.create({ data: { publicKey: `atomic-seller-${tag}` } })
    const buyer = await prisma.user.create({ data: { publicKey: `atomic-buyer-${tag}` } })
    const arbiter = await prisma.user.create({ data: { publicKey: `atomic-arbiter-${tag}` } })
    const offer = await prisma.offer.create({
      data: {
        userId: seller.id, asset: 'BTC', side: 'SELL',
        priceUsd: '65000', minAmount: '0.001', maxAmount: '1', paymentMethod: 'OTHER',
      },
    })
    const trade = await prisma.trade.create({
      data: {
        offerId: offer.id, buyerId: buyer.id, sellerId: seller.id,
        asset: 'BTC', amount: '0.001', priceUsd: '65000', totalUsd: '65',
      },
    })
    const escrow = await prisma.escrow.create({
      data: {
        tradeId: trade.id, type: 'MOCK', status: 'FUNDS_LOCKED',
        lockedAmount: '0.001', asset: 'BTC', timelockHours: 24,
      },
    })
    await prisma.trade.update({ where: { id: trade.id }, data: { escrowId: escrow.id } })
    const service = new DisputeService(new TrustedArbitratorProvider([arbiter.id]))
    return { seller, buyer, arbiter, trade, escrow, service }
  }

  it('rolls the escrow freeze back when Dispute creation fails', async () => {
    pg.requirePostgres('rollback')
    const f = await fixture()
    await prisma.dispute.create({
      data: {
        tradeId: f.trade.id, escrowId: f.escrow.id, openedBy: f.seller.id,
        reason: 'pre-existing row forces P2002', evidence: [], status: 'OPENED',
      },
    })

    await expect(f.service.raiseDispute(f.trade.id, f.buyer.id, 'must rollback', []))
      .rejects.toThrow(/already been raised/)

    const escrow = await prisma.escrow.findUniqueOrThrow({ where: { id: f.escrow.id } })
    expect(escrow.status).toBe('FUNDS_LOCKED')
    expect(await prisma.escrowEvent.count({ where: { escrowId: f.escrow.id, toStatus: 'DISPUTED' } })).toBe(0)
    expect(await prisma.eventProjectionClaim.count({
      where: { subjectId: f.escrow.id, projectionKey: 'transition.claimed' },
    })).toBe(0)
  })

  it('commits DISPUTED + one Dispute + one recoverable transition claim together', async () => {
    pg.requirePostgres('commit')
    const f = await fixture()

    const opened = await f.service.raiseDispute(f.trade.id, f.buyer.id, 'atomic open', [])
    expect(opened.tradeId).toBe(f.trade.id)

    const escrow = await prisma.escrow.findUniqueOrThrow({ where: { id: f.escrow.id } })
    expect(escrow.status).toBe('DISPUTED')
    expect(await prisma.dispute.count({ where: { tradeId: f.trade.id } })).toBe(1)

    const transitions = await prisma.escrowEvent.findMany({
      where: { escrowId: f.escrow.id, toStatus: 'DISPUTED' },
    })
    expect(transitions).toHaveLength(1)
    expect(await prisma.eventProjectionClaim.count({
      where: {
        eventId: transitions[0].id,
        subjectId: f.escrow.id,
        projectionKey: 'transition.claimed',
      },
    })).toBe(1)
  })
})
