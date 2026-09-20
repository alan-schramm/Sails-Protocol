/**
 * #236 — authoritative Escrow -> Trade projection, real PostgreSQL.
 *
 * Delivery order is not economic authority. These tests deliberately call
 * the repository boundary with stale/reordered event claims and prove the
 * persisted Escrow state wins.
 */
import { prisma } from '../src/common/database'
import { tradeRepository } from '../src/modules/open-p2p/trade-repository'

const RUN = process.env.DATABASE_URL ? describe : describe.skip

RUN('#236 Trade projection monotonicity (PostgreSQL)', () => {
  const suffix = () => Math.random().toString(36).slice(2)
  let buyerId: string
  let sellerId: string
  let offerId: string
  let tradeId: string
  let escrowId: string

  beforeEach(async () => {
    const x = suffix()
    buyerId = 'p236-buyer-' + x
    sellerId = 'p236-seller-' + x
    await prisma.user.createMany({ data: [
      { id: buyerId, publicKey: 'p236-buyer-pk-' + x },
      { id: sellerId, publicKey: 'p236-seller-pk-' + x },
    ]})
    const offer = await prisma.offer.create({
      data: {
        userId: sellerId, asset: 'BTC', side: 'SELL', priceUsd: '1',
        minAmount: '1', maxAmount: '2', paymentMethod: 'PIX',
      },
    })
    offerId = offer.id
    const trade = await prisma.trade.create({
      data: {
        offerId, buyerId, sellerId, asset: 'BTC', amount: '1',
        priceUsd: '1', totalUsd: '1', status: 'ACTIVE',
      },
    })
    tradeId = trade.id
    const escrow = await prisma.escrow.create({
      data: {
        tradeId, type: 'MOCK', status: 'FUNDS_LOCKED',
        lockedAmount: '1', asset: 'BTC',
      },
    })
    escrowId = escrow.id
  })

  afterEach(async () => {
    await prisma.escrow.deleteMany({ where: { id: escrowId } })
    await prisma.trade.deleteMany({ where: { id: tradeId } })
    await prisma.offer.deleteMany({ where: { id: offerId } })
    await prisma.user.deleteMany({ where: { id: { in: [buyerId, sellerId] } } })
  })

  it('rejects delayed LOCKED after authoritative RELEASE', async () => {
    await prisma.escrow.update({ where: { id: escrowId }, data: { status: 'COMPLETED' } })
    await prisma.trade.update({ where: { id: tradeId }, data: { status: 'COMPLETED', completedAt: new Date() } })

    const projected = await tradeRepository.projectEscrowStatus(tradeId, escrowId, 'FUNDS_LOCKED', 'ACTIVE')
    expect(projected).toBeNull()
    expect((await prisma.trade.findUniqueOrThrow({ where: { id: tradeId } })).status).toBe('COMPLETED')
  })

  it('rejects stale RELEASE after authoritative REFUND', async () => {
    await prisma.escrow.update({ where: { id: escrowId }, data: { status: 'REFUNDED' } })
    await prisma.trade.update({ where: { id: tradeId }, data: { status: 'CANCELLED', cancelledAt: new Date() } })

    const projected = await tradeRepository.projectEscrowStatus(tradeId, escrowId, 'COMPLETED', 'COMPLETED', { completedAt: new Date() })
    expect(projected).toBeNull()
    expect((await prisma.trade.findUniqueOrThrow({ where: { id: tradeId } })).status).toBe('CANCELLED')
  })

  it('rejects stale REFUND after authoritative RELEASE', async () => {
    await prisma.escrow.update({ where: { id: escrowId }, data: { status: 'COMPLETED' } })
    await prisma.trade.update({ where: { id: tradeId }, data: { status: 'COMPLETED', completedAt: new Date() } })

    const projected = await tradeRepository.projectEscrowStatus(tradeId, escrowId, 'REFUNDED', 'CANCELLED', { cancelledAt: new Date() })
    expect(projected).toBeNull()
    expect((await prisma.trade.findUniqueOrThrow({ where: { id: tradeId } })).status).toBe('COMPLETED')
  })

  it('projects SPLIT only while SPLIT remains authoritative', async () => {
    await prisma.escrow.update({ where: { id: escrowId }, data: { status: 'SPLIT' } })
    await prisma.trade.update({ where: { id: tradeId }, data: { status: 'DISPUTED' } })

    const projected = await tradeRepository.projectEscrowStatus(tradeId, escrowId, 'SPLIT', 'COMPLETED', { completedAt: new Date() })
    expect(projected?.status).toBe('COMPLETED')
    expect((await prisma.trade.findUniqueOrThrow({ where: { id: tradeId } })).status).toBe('COMPLETED')
  })

  it('fails closed when escrow does not belong to the supplied trade', async () => {
    const projected = await tradeRepository.projectEscrowStatus('not-this-trade', escrowId, 'FUNDS_LOCKED', 'ACTIVE')
    expect(projected).toBeNull()
  })
})
