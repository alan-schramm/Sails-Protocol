/**
 * #246 — real PostgreSQL evidence for WDK generation ownership.
 * These tests intentionally use the real Prisma client/database. They prove
 * the database, not a Jest mock, arbitrates concurrent economic ownership.
 */
import { prisma } from '../src/common/database'
import { wdkTransferAttemptRepository } from '../src/modules/open-settlement/wdk-transfer-attempt-repository'

const escrowId = 'wdk-ownership-race-test'
const operationType = 'RELEASE' as const
const destination = '0x00000000000000000000000000000000000000aa'
const amount = '1'

describe('WDK active generation ownership — PostgreSQL', () => {
  beforeEach(async () => {
    await prisma.wdkTransferAttempt.deleteMany({ where: { escrowId } })
    await prisma.escrow.deleteMany({ where: { id: escrowId } })
    await prisma.trade.deleteMany({ where: { id: `${escrowId}-trade` } })
    await prisma.offer.deleteMany({ where: { id: `${escrowId}-offer` } })
    await prisma.user.deleteMany({ where: { id: { in: [`${escrowId}-buyer`, `${escrowId}-seller`] } } })

    await prisma.user.createMany({
      data: [
        { id: `${escrowId}-buyer`, publicKey: `${escrowId}-buyer-key` },
        { id: `${escrowId}-seller`, publicKey: `${escrowId}-seller-key` },
      ],
    })
    await prisma.offer.create({
      data: {
        id: `${escrowId}-offer`,
        userId: `${escrowId}-seller`,
        asset: 'USDT_ERC20',
        side: 'SELL',
        priceUsd: '1',
        minAmount: '1',
        maxAmount: '1',
        paymentMethod: 'CRYPTO_DIRECT',
      },
    })
    await prisma.trade.create({
      data: {
        id: `${escrowId}-trade`,
        offerId: `${escrowId}-offer`,
        buyerId: `${escrowId}-buyer`,
        sellerId: `${escrowId}-seller`,
        asset: 'USDT_ERC20',
        amount: '1',
        priceUsd: '1',
        totalUsd: '1',
      },
    })
    await prisma.escrow.create({
      data: {
        id: escrowId,
        tradeId: `${escrowId}-trade`,
        type: 'WDK_USDT_EVM',
        status: 'FUNDS_LOCKED',
        lockedAmount: '1',
        asset: 'USDT_ERC20',
      },
    })
  })

  afterAll(async () => {
    await prisma.wdkTransferAttempt.deleteMany({ where: { escrowId } })
    await prisma.escrow.deleteMany({ where: { id: escrowId } })
    await prisma.trade.deleteMany({ where: { id: `${escrowId}-trade` } })
    await prisma.offer.deleteMany({ where: { id: `${escrowId}-offer` } })
    await prisma.user.deleteMany({ where: { id: { in: [`${escrowId}-buyer`, `${escrowId}-seller`] } } })
  })

  it('allows at most one concurrent first-generation owner', async () => {
    const attempts = await Promise.allSettled([
      wdkTransferAttemptRepository.create({ escrowId, operationType, destination, amount }),
      wdkTransferAttemptRepository.create({ escrowId, operationType, destination, amount }),
    ])

    expect(attempts.filter((x) => x.status === 'fulfilled')).toHaveLength(1)
    expect(attempts.filter((x) => x.status === 'rejected')).toHaveLength(1)

    const active = await prisma.wdkTransferAttempt.findMany({
      where: { escrowId, operationType, activeKey: `${escrowId}:${operationType}` },
    })
    expect(active).toHaveLength(1)
  })

  it('refuses to replace an active generation from an unsafe predecessor state', async () => {
    for (const unsafeStatus of ['SUBMISSION_UNKNOWN', 'SUBMITTED', 'CONFIRMED'] as const) {
      await prisma.wdkTransferAttempt.deleteMany({ where: { escrowId } })
      const first = await wdkTransferAttemptRepository.create({ escrowId, operationType, destination, amount })
      await wdkTransferAttemptRepository.updateStatus(first.id, unsafeStatus, unsafeStatus === 'SUBMITTED' || unsafeStatus === 'CONFIRMED' ? { txHash: '0xabc' } : undefined, ['PREPARED'])

      await expect(
        wdkTransferAttemptRepository.replaceActive(first.id, ['REVERTED'], { escrowId, operationType, destination, amount })
      ).rejects.toThrow(/cannot relinquish active generation/)

      const active = await prisma.wdkTransferAttempt.findMany({
        where: { escrowId, operationType, activeKey: `${escrowId}:${operationType}` },
      })
      expect(active).toHaveLength(1)
      expect(active[0].id).toBe(first.id)
      expect(active[0].status).toBe(unsafeStatus)
    }
  })

  it('keeps RELEASE and SPLIT legs as independent ownership domains', async () => {
    const operationTypes = ['RELEASE', 'SPLIT_BUYER', 'SPLIT_SELLER'] as const
    const created = await Promise.all(
      operationTypes.map((op) =>
        wdkTransferAttemptRepository.create({ escrowId, operationType: op, destination, amount })
      )
    )

    expect(created).toHaveLength(3)
    const active = await prisma.wdkTransferAttempt.findMany({
      where: { escrowId, activeKey: { not: null } },
      orderBy: { operationType: 'asc' },
    })
    expect(active).toHaveLength(3)
    expect(new Set(active.map((x) => x.activeKey))).toEqual(
      new Set(operationTypes.map((op) => `${escrowId}:${op}`))
    )
  })

  it('allows at most one replacement generation under concurrent retry', async () => {
    const first = await wdkTransferAttemptRepository.create({ escrowId, operationType, destination, amount })
    await wdkTransferAttemptRepository.updateStatus(first.id, 'REVERTED', undefined, ['PREPARED'])

    const replacements = await Promise.allSettled([
      wdkTransferAttemptRepository.replaceActive(first.id, ['REVERTED'], { escrowId, operationType, destination, amount }),
      wdkTransferAttemptRepository.replaceActive(first.id, ['REVERTED'], { escrowId, operationType, destination, amount }),
    ])

    expect(replacements.filter((x) => x.status === 'fulfilled')).toHaveLength(1)
    expect(replacements.filter((x) => x.status === 'rejected')).toHaveLength(1)

    const active = await prisma.wdkTransferAttempt.findMany({
      where: { escrowId, operationType, activeKey: `${escrowId}:${operationType}` },
    })
    expect(active).toHaveLength(1)
  })
})
