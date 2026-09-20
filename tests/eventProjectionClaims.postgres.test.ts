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
})
