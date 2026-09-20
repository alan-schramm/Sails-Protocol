import { PrismaClient } from '@prisma/client'
import { createPostgresIntegrationHarness } from './integration/postgresTestHarness'

describe('#253 durable event projection claims — real Postgres', () => {
  jest.setTimeout(60_000)
  const pg = createPostgresIntegrationHarness()
  let dbAvailable = false
  let prisma: PrismaClient
  let applyEventProjectionOnce: typeof import('../src/common/events/event-projection').applyEventProjectionOnce
  const suffix = Date.now() + '-' + Math.random().toString(36).slice(2)
  const eventId = 'projection-event-' + suffix
  const projectionKey = 'trade-completion-volume'
  let userId: string

  beforeAll(async () => {
    await pg.probe(); dbAvailable = pg.isAvailable(); if (!dbAvailable) return
    ;({ prisma } = require('../src/common/database'))
    ;({ applyEventProjectionOnce } = require('../src/common/events/event-projection'))
    const user = await prisma.user.create({ data: { publicKey: 'projection-user-' + suffix } })
    userId = user.id
  })
  afterAll(async () => {
    if (!dbAvailable) return
    await prisma.eventProjectionClaim.deleteMany({ where: { eventId: { startsWith: 'projection-event-' + suffix } } })
    if (userId) await prisma.user.delete({ where: { id: userId } })
    await prisma.$disconnect()
  })
  function requirePostgres(name: string): void { pg.requirePostgres(name) }

  it('replay increments exactly once', async () => {
    requirePostgres('projection replay')
    const apply = async (tx: any) => tx.user.update({ where: { id: userId }, data: { totalTrades: { increment: 1 }, totalVolumeBtc: { increment: '0.01' } } })
    await expect(applyEventProjectionOnce(eventId, projectionKey, userId, apply)).resolves.toBe(true)
    await expect(applyEventProjectionOnce(eventId, projectionKey, userId, apply)).resolves.toBe(false)
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } })
    expect(user.totalTrades).toBe(1); expect(String(user.totalVolumeBtc)).toBe('0.01')
    expect(await prisma.eventProjectionClaim.count({ where: { eventId, projectionKey, subjectId: userId } })).toBe(1)
  })

  it('rolls claim and mutation back together, then recovery replay succeeds', async () => {
    requirePostgres('projection rollback')
    const rollbackEvent = eventId + '-rollback'
    await expect(applyEventProjectionOnce(rollbackEvent, projectionKey, userId, async (tx: any) => {
      await tx.user.update({ where: { id: userId }, data: { totalTrades: { increment: 1 } } })
      throw new Error('fault-injected-after-mutation')
    })).rejects.toThrow('fault-injected-after-mutation')
    expect(await prisma.eventProjectionClaim.count({ where: { eventId: rollbackEvent } })).toBe(0)
    const before = await prisma.user.findUniqueOrThrow({ where: { id: userId } })
    await expect(applyEventProjectionOnce(rollbackEvent, projectionKey, userId, async (tx: any) => {
      await tx.user.update({ where: { id: userId }, data: { totalTrades: { increment: 1 } } })
    })).resolves.toBe(true)
    const after = await prisma.user.findUniqueOrThrow({ where: { id: userId } })
    expect(after.totalTrades).toBe(before.totalTrades + 1)
  })

  it('serializes concurrent delivery of the same semantic projection', async () => {
    requirePostgres('projection concurrency')
    const concurrentEvent = eventId + '-concurrent'
    const before = await prisma.user.findUniqueOrThrow({ where: { id: userId } })
    const results = await Promise.all(Array.from({ length: 8 }, () =>
      applyEventProjectionOnce(concurrentEvent, projectionKey, userId, async (tx: any) => {
        await tx.user.update({ where: { id: userId }, data: { totalTrades: { increment: 1 } } })
      })
    ))
    expect(results.filter(Boolean)).toHaveLength(1)
    const after = await prisma.user.findUniqueOrThrow({ where: { id: userId } })
    expect(after.totalTrades).toBe(before.totalTrades + 1)
    expect(await prisma.eventProjectionClaim.count({ where: { eventId: concurrentEvent } })).toBe(1)
  })

  it('keeps two subjects independently recoverable for one event', async () => {
    requirePostgres('projection subject independence')
    const pairEvent = eventId + '-pair'
    const second = await prisma.user.create({ data: { publicKey: 'projection-user-2-' + suffix } })
    try {
      await applyEventProjectionOnce(pairEvent, projectionKey, userId, async (tx: any) => {
        await tx.user.update({ where: { id: userId }, data: { totalTrades: { increment: 1 } } })
      })
      await expect(applyEventProjectionOnce(pairEvent, projectionKey, second.id, async () => { throw new Error('fault-injected-second-subject') })).rejects.toThrow('fault-injected-second-subject')
      expect(await prisma.eventProjectionClaim.count({ where: { eventId: pairEvent, subjectId: userId } })).toBe(1)
      expect(await prisma.eventProjectionClaim.count({ where: { eventId: pairEvent, subjectId: second.id } })).toBe(0)
      await applyEventProjectionOnce(pairEvent, projectionKey, second.id, async (tx: any) => {
        await tx.user.update({ where: { id: second.id }, data: { totalTrades: { increment: 1 } } })
      })
      expect((await prisma.user.findUniqueOrThrow({ where: { id: second.id } })).totalTrades).toBe(1)
    } finally {
      await prisma.eventProjectionClaim.deleteMany({ where: { subjectId: second.id } })
      await prisma.user.delete({ where: { id: second.id } })
    }
  })

  it('atomically burns a vouch and penalizes its voucher exactly once across replay', async () => {
    requirePostgres('vouch burn replay')
    const burnEvent = eventId + '-vouch-burn'
    const voucher = await prisma.user.create({ data: { publicKey: 'projection-voucher-' + suffix, reputationScore: 10 } })
    const vouchee = await prisma.user.create({ data: { publicKey: 'projection-vouchee-' + suffix } })
    const vouch = await prisma.vouch.create({ data: { voucherId: voucher.id, voucheeId: vouchee.id } })
    const applyBurn = async () => applyEventProjectionOnce(burnEvent, 'reputation-vouch-burn', vouch.id, async (tx: any) => {
      const updated = await tx.vouch.updateMany({ where: { id: vouch.id, burnedAt: null }, data: { burnedAt: new Date() } })
      if (updated.count === 0) return
      await tx.user.update({ where: { id: voucher.id }, data: { reputationScore: { increment: -5 } } })
    })
    try {
      await expect(applyBurn()).resolves.toBe(true)
      await expect(applyBurn()).resolves.toBe(false)
      const [storedVouch, storedVoucher] = await Promise.all([
        prisma.vouch.findUniqueOrThrow({ where: { id: vouch.id } }),
        prisma.user.findUniqueOrThrow({ where: { id: voucher.id } }),
      ])
      expect(storedVouch.burnedAt).not.toBeNull()
      expect(storedVoucher.reputationScore).toBe(5)
      expect(await prisma.eventProjectionClaim.count({ where: { eventId: burnEvent, projectionKey: 'reputation-vouch-burn', subjectId: vouch.id } })).toBe(1)
    } finally {
      await prisma.eventProjectionClaim.deleteMany({ where: { eventId: burnEvent } })
      await prisma.vouch.deleteMany({ where: { id: vouch.id } })
      await prisma.user.deleteMany({ where: { id: { in: [voucher.id, vouchee.id] } } })
    }
  })

  it('rolls back both vouch burn and penalty on an injected transactional failure, then recovers', async () => {
    requirePostgres('vouch burn rollback')
    const burnEvent = eventId + '-vouch-burn-rollback'
    const voucher = await prisma.user.create({ data: { publicKey: 'projection-voucher-rb-' + suffix, reputationScore: 10 } })
    const vouchee = await prisma.user.create({ data: { publicKey: 'projection-vouchee-rb-' + suffix } })
    const vouch = await prisma.vouch.create({ data: { voucherId: voucher.id, voucheeId: vouchee.id } })
    try {
      await expect(applyEventProjectionOnce(burnEvent, 'reputation-vouch-burn', vouch.id, async (tx: any) => {
        await tx.vouch.updateMany({ where: { id: vouch.id, burnedAt: null }, data: { burnedAt: new Date() } })
        await tx.user.update({ where: { id: voucher.id }, data: { reputationScore: { increment: -5 } } })
        throw new Error('fault-injected-after-vouch-penalty')
      })).rejects.toThrow('fault-injected-after-vouch-penalty')
      expect((await prisma.vouch.findUniqueOrThrow({ where: { id: vouch.id } })).burnedAt).toBeNull()
      expect((await prisma.user.findUniqueOrThrow({ where: { id: voucher.id } })).reputationScore).toBe(10)
      expect(await prisma.eventProjectionClaim.count({ where: { eventId: burnEvent } })).toBe(0)

      await applyEventProjectionOnce(burnEvent, 'reputation-vouch-burn', vouch.id, async (tx: any) => {
        const updated = await tx.vouch.updateMany({ where: { id: vouch.id, burnedAt: null }, data: { burnedAt: new Date() } })
        if (updated.count === 0) return
        await tx.user.update({ where: { id: voucher.id }, data: { reputationScore: { increment: -5 } } })
      })
      expect((await prisma.vouch.findUniqueOrThrow({ where: { id: vouch.id } })).burnedAt).not.toBeNull()
      expect((await prisma.user.findUniqueOrThrow({ where: { id: voucher.id } })).reputationScore).toBe(5)
    } finally {
      await prisma.eventProjectionClaim.deleteMany({ where: { eventId: burnEvent } })
      await prisma.vouch.deleteMany({ where: { id: vouch.id } })
      await prisma.user.deleteMany({ where: { id: { in: [voucher.id, vouchee.id] } } })
    }
  })


  it('counts each participant dispute exactly once across replay', async () => {
    requirePostgres('dispute count replay')
    const disputeEvent = eventId + '-dispute-count'
    const buyer = await prisma.user.create({ data: { publicKey: 'projection-dispute-buyer-' + suffix, disputeCount: 0 } })
    const seller = await prisma.user.create({ data: { publicKey: 'projection-dispute-seller-' + suffix, disputeCount: 0 } })
    const applyCount = async (participantId: string) => applyEventProjectionOnce(
      disputeEvent, 'trade-dispute-count', participantId,
      async (tx: any) => {
        await tx.user.update({ where: { id: participantId }, data: { disputeCount: { increment: 1 } } })
      }
    )
    try {
      await expect(applyCount(buyer.id)).resolves.toBe(true)
      await expect(applyCount(seller.id)).resolves.toBe(true)
      await expect(applyCount(buyer.id)).resolves.toBe(false)
      await expect(applyCount(seller.id)).resolves.toBe(false)
      const [storedBuyer, storedSeller] = await Promise.all([
        prisma.user.findUniqueOrThrow({ where: { id: buyer.id } }),
        prisma.user.findUniqueOrThrow({ where: { id: seller.id } }),
      ])
      expect(storedBuyer.disputeCount).toBe(1)
      expect(storedSeller.disputeCount).toBe(1)
      expect(await prisma.eventProjectionClaim.count({ where: { eventId: disputeEvent, projectionKey: 'trade-dispute-count' } })).toBe(2)
    } finally {
      await prisma.eventProjectionClaim.deleteMany({ where: { eventId: disputeEvent } })
      await prisma.user.deleteMany({ where: { id: { in: [buyer.id, seller.id] } } })
    }
  })

})
