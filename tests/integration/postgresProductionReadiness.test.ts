// tests/integration/postgresProductionReadiness.test.ts
//
// Missao 06 (Production Readiness) - real integration test against a live
// Postgres, not the in-memory-fake-array mocks tests/postgresEventStore.test.ts
// and tests/escrowEventHashChain.test.ts use. This is the one thing those
// two files structurally cannot prove: whether pg_advisory_xact_lock
// actually serializes concurrent writers at the database level, whether
// the hand-written migrations (Missao 05.5/05.7) apply and behave
// correctly against a real Postgres instance, and whether data survives
// being read back through a totally independent PrismaClient/connection
// (the closest thing to a real process restart this test harness can
// prove).
//
// Requires this repo's own docker-compose Postgres, reachable via
// DATABASE_URL passed to this specific Jest invocation (not the default
// mocked suite) - see docker-compose.override.yml (local-only, gitignored)
// for the host port mapping used to run this from outside Docker. Skips
// gracefully, same pattern tests/integration/redisStreamsEventStore.test.ts
// and tests/integration/docker.test.ts already use, rather than failing
// the whole suite when no real Postgres is reachable (the default case
// for `npm test`).

import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://postgres:password@localhost:5433/sails_protocol'

describe('Postgres production readiness (Missao 06, real Postgres)', () => {
  jest.setTimeout(60_000)

  let dbAvailable = false
  let prisma: PrismaClient
  let eventBus: import('../../src/common/events/event-bus').SailsEventBus
  let getTimeline: typeof import('../../src/core/timeline').getTimeline
  let emitEscrowTransition: typeof import('../../src/modules/open-settlement/escrow-lifecycle').emitEscrowTransition
  let verifyEscrowEventChain: typeof import('../../src/modules/open-settlement/escrow-lifecycle').verifyEscrowEventChain
  let SailsEventBus: typeof import('../../src/common/events/event-bus').SailsEventBus
  let PostgresEventStore: typeof import('../../src/common/events/event-store').PostgresEventStore
  let GENESIS_HASH: string
  let computeEntryHash: typeof import('../../src/common/events/event-store').computeEntryHash

  beforeAll(async () => {
    // Set BEFORE any app module is imported - src/common/database/index.ts
    // constructs its PrismaClient singleton eagerly at import time, reading
    // config.database.url (which reads DATABASE_URL) at that moment. This
    // is the one env var every real-Postgres-backed module in this
    // codebase (eventBus's default PostgresEventStore, escrow-lifecycle.ts,
    // intent-engine.ts, ...) transitively depends on - exactly the
    // production wiring this test wants to exercise, not a reimplementation.
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

    // Imported only once availability is confirmed, and only after
    // DATABASE_URL is set - these pull in the real app singletons.
    ;({ prisma } = require('../../src/common/database'))
    ;({ eventBus, SailsEventBus } = require('../../src/common/events/event-bus'))
    ;({ getTimeline } = require('../../src/core/timeline'))
    ;({ emitEscrowTransition, verifyEscrowEventChain } = require('../../src/modules/open-settlement/escrow-lifecycle'))
    ;({ PostgresEventStore, GENESIS_HASH, computeEntryHash } = require('../../src/common/events/event-store'))
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

  // ─── durable_events / PostgresEventStore, against real Postgres ───────

  describe('PostgresEventStore + durable_events (real Postgres)', () => {
    it('publish() writes a real row, getEvents()/verifyChain() read it back correctly', async () => {
      if (skip('durable_events round-trip')) return
      const correlationId = `real-pg-${Date.now()}-a`

      await eventBus.emit('openp2p.message.sent', {
        messageId: 'm1', tradeId: correlationId, senderId: 'u1', content: 'real postgres', msgType: 'TEXT', timestamp: new Date().toISOString(),
      }, correlationId)
      await eventBus.emit('openp2p.message.sent', {
        messageId: 'm2', tradeId: correlationId, senderId: 'u2', content: 'second message', msgType: 'TEXT', timestamp: new Date().toISOString(),
      }, correlationId)

      const row = await prisma.durableEventRecord.findFirst({ where: { correlationId } })
      expect(row).not.toBeNull()
      expect(row!.entryHash).toMatch(/^[0-9a-f]{64}$/)

      const result = await getTimeline(correlationId).verifyChain()
      expect(result).toEqual({ valid: true })
    })

    // Section 1's own explicit ask: real concurrency, real advisory locks.
    // Unlike tests/postgresEventStore.test.ts's mocked mutex queue, this
    // uses REAL, independently-constructed PrismaClient connections
    // talking to the REAL Postgres server - pg_advisory_xact_lock is
    // enforced by the server itself, not simulated in JS.
    it('real concurrent writers for the SAME correlationId, across independent connections, never fork - pg_advisory_xact_lock proven at the database level', async () => {
      if (skip('real concurrent same-correlationId writers')) return
      const correlationId = `real-pg-concurrent-${Date.now()}`

      const clients = Array.from({ length: 5 }, () => new PrismaClient({ adapter: new PrismaPg({ connectionString: DATABASE_URL }) }))
      const stores = clients.map((c: PrismaClient) => new PostgresEventStore(c as any))

      try {
        await Promise.all(
          stores.map((store: InstanceType<typeof PostgresEventStore>, i: number) =>
            store.publish('openp2p.message.sent', {
              messageId: `m${i}`, tradeId: correlationId, senderId: 'u1', content: `concurrent-${i}`, msgType: 'TEXT', timestamp: new Date().toISOString(),
            }, correlationId)
          )
        )

        const rows = await prisma.durableEventRecord.findMany({ where: { correlationId }, orderBy: { publishedAt: 'asc' } })
        expect(rows).toHaveLength(5)
        // Exactly one genesis root, no matter how many real, independent
        // connections raced for the same correlationId's lock.
        expect(rows.filter((r: any) => r.prevHash === GENESIS_HASH)).toHaveLength(1)

        const result = await getTimeline(correlationId).verifyChain()
        expect(result).toEqual({ valid: true })
      } finally {
        await Promise.all(clients.map((c: PrismaClient) => c.$disconnect()))
      }
    })

    // Different correlationIds must still run in parallel against a real
    // Postgres, not serialize against each other - proven by timing, not
    // just by inspecting the resulting rows.
    it('real concurrent writers for DIFFERENT correlationIds complete without waiting on each other', async () => {
      if (skip('real concurrent different-correlationId writers')) return
      const ids = Array.from({ length: 5 }, (_, i) => `real-pg-iso-${Date.now()}-${i}`)

      const start = Date.now()
      await Promise.all(
        ids.map((correlationId) =>
          eventBus.emit('openp2p.message.sent', {
            messageId: 'm1', tradeId: correlationId, senderId: 'u1', content: 'iso', msgType: 'TEXT', timestamp: new Date().toISOString(),
          }, correlationId)
        )
      )
      const elapsedMs = Date.now() - start

      // Generous bound (not a tight perf assertion) - if correlationIds
      // were accidentally serialized against each other (e.g. a bug that
      // widened the lock key), 5 sequential round-trips to a real DB would
      // still likely finish under this, so this is a sanity ceiling, not
      // proof by itself; the per-correlationId chain check below is the
      // real proof of correctness (not speed).
      expect(elapsedMs).toBeLessThan(10_000)

      for (const correlationId of ids) {
        const result = await getTimeline(correlationId).verifyChain()
        expect(result).toEqual({ valid: true })
      }
    })

    // "processo morrendo durante operação" (Missao 06 Section 2), proven
    // against the real database: a transaction that acquires the advisory
    // lock and then aborts (simulating a crash before commit) must (a)
    // leave no partial row behind, and (b) release the lock promptly, so
    // a subsequent real publish() for the same correlationId is neither
    // corrupted nor stuck.
    it('a transaction that acquires the advisory lock and then aborts leaves no row and does not leak the lock', async () => {
      if (skip('abort/rollback leaves no row, no leaked lock')) return
      const correlationId = `real-pg-abort-${Date.now()}`

      await expect(
        prisma.$transaction(async (tx: any) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${correlationId})::bigint)`
          await tx.durableEventRecord.findFirst({ where: { correlationId } })
          throw new Error('simulated crash mid-transaction')
        })
      ).rejects.toThrow('simulated crash mid-transaction')

      const rowsAfterAbort = await prisma.durableEventRecord.findMany({ where: { correlationId } })
      expect(rowsAfterAbort).toHaveLength(0)

      // If the lock leaked, this would hang until Jest's own timeout.
      await eventBus.emit('openp2p.message.sent', {
        messageId: 'm1', tradeId: correlationId, senderId: 'u1', content: 'after-abort', msgType: 'TEXT', timestamp: new Date().toISOString(),
      }, correlationId)

      const rows = await prisma.durableEventRecord.findMany({ where: { correlationId } })
      expect(rows).toHaveLength(1)
      expect(rows[0].prevHash).toBe(GENESIS_HASH) // genesis-rooted, not chained off a phantom aborted write
    })

    // The closest thing to a real process restart this harness can prove:
    // a totally independent PrismaClient/connection/SailsEventBus/
    // PostgresEventStore - sharing no JS object, no connection, nothing
    // but the real Postgres database itself - reads back the exact same
    // data with a valid chain.
    it('an independently-constructed PrismaClient/SailsEventBus reads back the same events with a valid chain (real restart proof)', async () => {
      if (skip('real restart proof')) return
      const correlationId = `real-pg-restart-${Date.now()}`

      await eventBus.emit('openp2p.message.sent', {
        messageId: 'm1', tradeId: correlationId, senderId: 'u1', content: 'before-restart-1', msgType: 'TEXT', timestamp: new Date().toISOString(),
      }, correlationId)
      await eventBus.emit('openp2p.message.sent', {
        messageId: 'm2', tradeId: correlationId, senderId: 'u2', content: 'before-restart-2', msgType: 'TEXT', timestamp: new Date().toISOString(),
      }, correlationId)
      const beforeRestart = await eventBus.getEvents(correlationId)

      const revivedClient = new PrismaClient({ adapter: new PrismaPg({ connectionString: DATABASE_URL }) })
      const revivedBus = new SailsEventBus(new PostgresEventStore(revivedClient as any))
      try {
        const afterRestart = await revivedBus.getEvents(correlationId)
        expect(afterRestart).toEqual(beforeRestart)
        expect(afterRestart).toHaveLength(2)

        let expectedPrevHash = GENESIS_HASH
        for (const event of afterRestart) {
          const recomputed = computeEntryHash(event.eventName, event.publishedAt, event.payload, event.prevHash)
          expect(event.prevHash).toBe(expectedPrevHash)
          expect(event.entryHash).toBe(recomputed)
          expectedPrevHash = event.entryHash
        }
      } finally {
        await revivedClient.$disconnect()
      }
    })
  })

  // ─── EscrowEvent hash chain (Missao 05.5), against real Postgres ──────

  describe('EscrowEvent hash chain (real Postgres)', () => {
    async function createFixtureEscrow(): Promise<{ escrowId: string; tradeId: string }> {
      const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const buyer = await prisma.user.create({ data: { publicKey: `pk-buyer-${suffix}` } })
      const seller = await prisma.user.create({ data: { publicKey: `pk-seller-${suffix}` } })
      const offer = await prisma.offer.create({
        data: {
          userId: seller.id, asset: 'BTC', side: 'SELL',
          priceUsd: '65000', minAmount: '0.001', maxAmount: '1',
          paymentMethod: 'PIX',
        },
      })
      const trade = await prisma.trade.create({
        data: {
          offerId: offer.id, buyerId: buyer.id, sellerId: seller.id,
          asset: 'BTC', amount: '0.01', priceUsd: '65000', totalUsd: '650',
        },
      })
      const escrow = await prisma.escrow.create({
        data: { tradeId: trade.id, type: 'MOCK', asset: 'BTC', lockedAmount: '0.01' },
      })
      return { escrowId: escrow.id, tradeId: trade.id }
    }

    it('a real chain of transitions verifies valid against real Postgres', async () => {
      if (skip('EscrowEvent real chain')) return
      const { escrowId, tradeId } = await createFixtureEscrow()

      await emitEscrowTransition(escrowId, tradeId, 'CREATED', 'FUNDS_LOCKED', 'seller-1', 'settlement.escrow.locked')
      await emitEscrowTransition(escrowId, tradeId, 'FUNDS_LOCKED', 'PAYMENT_PENDING', 'buyer-1', 'settlement.escrow.payment_pending')
      await emitEscrowTransition(escrowId, tradeId, 'PAYMENT_PENDING', 'COMPLETED', 'seller-1', 'settlement.escrow.released')

      const events = await prisma.escrowEvent.findMany({ where: { escrowId }, orderBy: { createdAt: 'asc' } })
      expect(events).toHaveLength(3)
      expect(events[0].prevHash).toBe('genesis')
      expect(events[1].prevHash).toBe(events[0].entryHash)
      expect(events[2].prevHash).toBe(events[1].entryHash)

      const result = await verifyEscrowEventChain(escrowId)
      expect(result).toEqual({ valid: true })
    })

    it('a real tampered row (direct SQL UPDATE, simulating DB-level access) is caught by verifyEscrowEventChain()', async () => {
      if (skip('EscrowEvent real tamper detection')) return
      const { escrowId, tradeId } = await createFixtureEscrow()

      await emitEscrowTransition(escrowId, tradeId, 'CREATED', 'FUNDS_LOCKED', 'seller-1', 'settlement.escrow.locked')
      await emitEscrowTransition(escrowId, tradeId, 'FUNDS_LOCKED', 'PAYMENT_PENDING', 'buyer-1', 'settlement.escrow.payment_pending')

      // A real UPDATE statement against the real table - not a mock array
      // mutation - simulating an operator/attacker with direct DB access.
      await prisma.$executeRaw`UPDATE escrow_events SET "triggeredBy" = 'attacker' WHERE "escrowId" = ${escrowId} AND "fromStatus" = 'FUNDS_LOCKED'`

      const result = await verifyEscrowEventChain(escrowId)
      expect(result.valid).toBe(false)
    })
  })

  // ─── Claim.tradeId (Missão 07.6.1, R1) — real Postgres, real migrations ──
  // The exact regression this exists to catch: schema.prisma declaring a
  // field/index that the committed migration history never actually
  // creates. A mocked prisma.claim.create() would never surface this —
  // only a database built solely from prisma/migrations/ can.
  describe('Claim.tradeId (real Postgres, real migration history)', () => {
    it('the claims table has a tradeId column with an index, exactly as prisma/migrations/20260817000000_add_claim_trade_id/migration.sql adds', async () => {
      if (skip('claims.tradeId column presence')) return
      const columns = await prisma.$queryRaw<Array<{ column_name: string; is_nullable: string }>>`
        SELECT column_name, is_nullable FROM information_schema.columns
        WHERE table_name = 'claims' AND column_name = 'tradeId'
      `
      expect(columns).toHaveLength(1)
      expect(columns[0].is_nullable).toBe('YES')

      const indexes = await prisma.$queryRaw<Array<{ indexname: string }>>`
        SELECT indexname FROM pg_indexes WHERE tablename = 'claims' AND indexname = 'claims_tradeId_idx'
      `
      expect(indexes).toHaveLength(1)
    })

    it('prisma.claim.create() with a real tradeId persists and round-trips through an independent connection', async () => {
      if (skip('Claim.tradeId create + round-trip')) return
      const tradeId = `real-pg-claim-${Date.now()}`

      const created = await prisma.claim.create({
        data: { claimedBy: 'participant-real-pg', claimType: 'PAYMENT_CONFIRMATION', assertion: { note: 'real Postgres proof' }, tradeId },
      })
      expect(created.tradeId).toBe(tradeId)

      // Independent connection — the closest thing to "did this actually
      // persist" this harness can prove, same discipline the rest of this
      // file already uses for durable_events/escrow_events.
      const independent = new PrismaClient({ adapter: new PrismaPg({ connectionString: DATABASE_URL }) })
      try {
        const reread = await independent.claim.findUnique({ where: { id: created.id } })
        expect(reread?.tradeId).toBe(tradeId)
      } finally {
        await independent.$disconnect()
      }
    })
  })
})
