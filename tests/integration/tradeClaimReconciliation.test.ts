// tests/integration/tradeClaimReconciliation.test.ts
//
// #235 R7H-NF-E3C-5 (contract D8) — conservative reconciliation of LEGACY `openp2p.trade.create` claims, on real
// PostgreSQL. A claim is resolved only when exactly one trade is independently attributable to it; every other case
// stays UNRESOLVED (never FAILED, never a new trade), every decision is audited, workers are concurrency-safe, and
// the replay path answers 409 IDEMPOTENCY_OUTCOME_UNKNOWN instead of guessing.
//
// The legacy world is built by direct inserts (the shape the pre-B2 code left behind): a trade row without
// tradeIntentId, and a claim row left IN_PROGRESS.

import { randomUUID } from 'crypto'
import type { PrismaClient } from '@prisma/client'
import { createPostgresIntegrationHarness } from './postgresTestHarness'
import { closeTestRedis } from './identityTestHelpers'
import { type Party, participant, boundSellOffer, takeOffer, call, idemKey, cleanupFixtures } from './tradeIntentFixtures'

describe('#235 R7H-NF-E3C-5 D8 — legacy idempotency-claim reconciliation (real PostgreSQL)', () => {
  jest.setTimeout(240_000)

  const pg = createPostgresIntegrationHarness()
  let prisma: PrismaClient
  let app: any
  let rec: typeof import('../../src/modules/open-p2p/trade-claim-reconciliation')
  let hashIdempotentPayload: (p: unknown) => string
  const users: string[] = []

  beforeAll(async () => {
    await pg.probe()
    if (!pg.isAvailable()) return
    ;({ prisma } = require('../../src/common/database'))
    require('../../src/common/events/handlers').registerEventHandlers()
    rec = require('../../src/modules/open-p2p/trade-claim-reconciliation')
    ;({ hashIdempotentPayload } = require('../../src/common/idempotency'))
    app = await require('../../src/app').buildApp({ registerSwaggerUi: false })
    await app.ready()
  })

  afterAll(async () => {
    if (!pg.isAvailable()) return
    try {
      await prisma.$executeRaw`ALTER TABLE idempotency_reconciliation_audit DISABLE TRIGGER idempotency_reconciliation_audit_append_only`
      await prisma.$executeRaw`DELETE FROM idempotency_reconciliation_audit WHERE "participantId" = ANY(${users})`
      await prisma.$executeRaw`ALTER TABLE idempotency_reconciliation_audit ENABLE TRIGGER idempotency_reconciliation_audit_append_only`
      await cleanupFixtures(prisma, users)
    } finally {
      await app.close()
      await prisma.$disconnect()
      await closeTestRedis()
    }
  })

  const who = async (label: string): Promise<Party> => { const p = await participant(label); users.push(p.id); return p }

  /** A legacy trade: the row the pre-B2 service committed (no tradeIntentId), taken by `taker` from `offer`. */
  async function legacyTrade(offer: { id: string; userId: string; intentId: string }, takerId: string, accountId: string, amount = '0.0005', createdAt?: Date) {
    return prisma.trade.create({
      data: {
        offerId: offer.id, buyerId: takerId, sellerId: offer.userId, asset: 'BTC', amount, priceUsd: '65000', totalUsd: '32.5',
        intentId: offer.intentId, sellerPaymentAccountId: accountId, ...(createdAt ? { createdAt } : {}),
      },
    })
  }
  /** A claim left IN_PROGRESS for the request { offerId, amount }, created `msBefore` before `trade` (default: 50 ms). */
  async function stuckClaim(takerId: string, offerId: string, requestAmount: string, trade: { createdAt: Date } | null, msBefore = 50, status = 'IN_PROGRESS') {
    const id = randomUUID()
    const createdAt = trade ? new Date(trade.createdAt.getTime() - msBefore) : new Date(Date.now() - 3_600_000)
    await prisma.$executeRaw`
      INSERT INTO idempotency_keys (id, scope, "participantId", key, "requestHash", status, "createdAt")
      VALUES (${id}, 'openp2p.trade.create', ${takerId}, ${'lk-' + id.slice(0, 8)}, ${hashIdempotentPayload({ offerId, amount: requestAmount })},
              ${status}::"IdempotencyKeyStatus", ${createdAt})`
    const [row] = await prisma.$queryRaw<Array<{ key: string }>>`SELECT key FROM idempotency_keys WHERE id = ${id}`
    return { id, key: row.key }
  }
  const claimRow = async (id: string) => (await prisma.$queryRaw<Array<{ status: string; resultRef: string | null }>>`SELECT status::text AS status, "resultRef" FROM idempotency_keys WHERE id = ${id}`)[0]
  const audit = (claimId: string) => prisma.$queryRaw<Array<{ decision: string; candidateTradeIds: string[]; decidedBy: string; evidence: any }>>`
    SELECT decision, "candidateTradeIds", "decidedBy", evidence FROM idempotency_reconciliation_audit WHERE "claimId" = ${claimId} ORDER BY "decidedAt"`

  async function world(label: string) {
    const seller = await who(`${label}-s`)
    const { offer, account } = await boundSellOffer(seller)
    const taker = await who(`${label}-t`)
    return { seller, offer, account, taker }
  }

  it('ONE ATTRIBUTABLE TRADE → MATCHED: the claim is completed with that trade, and the decision is audited with its evidence', async () => {
    pg.requirePostgres('D8-one')
    const { offer, account, taker } = await world('one')
    const trade = await legacyTrade(offer, taker.id, account.id)
    const claim = await stuckClaim(taker.id, offer.id, '0.0005', trade)
    const outcome = await rec.reconcileLegacyTradeClaim(claim.id, 'test-worker')
    expect([outcome.decision, outcome.tradeId, outcome.candidateTradeIds]).toEqual(['MATCHED', trade.id, [trade.id]])
    expect(await claimRow(claim.id)).toEqual({ status: 'COMPLETED', resultRef: trade.id })
    const rows = await audit(claim.id)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ decision: 'MATCHED', candidateTradeIds: [trade.id], decidedBy: 'test-worker' })
    expect(rows[0].evidence).toMatchObject({ windowSeconds: rec.ATTRIBUTION_WINDOW_SECONDS })
    // No trade, event or Intent was created by the reconciliation.
    expect(await prisma.trade.count({ where: { offerId: offer.id } })).toBe(1)
  })

  it('ZERO MATCHES → UNRESOLVED, never FAILED: nothing committed and "committed but hashed differently" are indistinguishable, so neither is concluded', async () => {
    pg.requirePostgres('D8-zero')
    const { offer, account, taker } = await world('zero')
    // (a) nothing was ever committed.
    const none = await stuckClaim(taker.id, offer.id, '0.0005', null)
    // (b) a trade DID commit, but the client hashed its amount as "0.00050" — no recomputed hash matches.
    const trade = await legacyTrade(offer, taker.id, account.id)
    const differently = await stuckClaim(taker.id, offer.id, '0.00050', trade)
    for (const c of [none, differently]) {
      const outcome = await rec.reconcileLegacyTradeClaim(c.id, 'test-worker')
      expect([outcome.decision, outcome.tradeId]).toEqual(['NO_ATTRIBUTABLE_TRADE', undefined])
      expect((await claimRow(c.id)).status).toBe('IN_PROGRESS')              // untouched: not COMPLETED, not FAILED
      expect((await audit(c.id)).map((a) => a.decision)).toEqual(['NO_ATTRIBUTABLE_TRADE'])
    }
    expect(await prisma.trade.count({ where: { offerId: offer.id } })).toBe(1) // and no trade was fabricated
  })

  it('MULTIPLE MATCHES → AMBIGUOUS: indistinguishable trades are never guessed between', async () => {
    pg.requirePostgres('D8-many')
    const { offer, account, taker } = await world('many')
    const t1 = await legacyTrade(offer, taker.id, account.id)
    const t2 = await legacyTrade(offer, taker.id, account.id)
    const claim = await stuckClaim(taker.id, offer.id, '0.0005', t1, 50)
    const outcome = await rec.reconcileLegacyTradeClaim(claim.id, 'test-worker')
    expect(outcome.decision).toBe('AMBIGUOUS')
    expect([...outcome.candidateTradeIds].sort()).toEqual([t1.id, t2.id].sort())
    expect((await claimRow(claim.id)).status).toBe('IN_PROGRESS')
    expect((await audit(claim.id))[0].decision).toBe('AMBIGUOUS')
  })

  it('NO MISATTRIBUTION: a trade already attributed to another claim, a later keyless trade, and a B2 trade are never candidates', async () => {
    pg.requirePostgres('D8-misattribution')
    const { offer, account, taker } = await world('mis')
    // (1) the trade belongs to ANOTHER claim already.
    const owned = await legacyTrade(offer, taker.id, account.id)
    const ownedClaim = await stuckClaim(taker.id, offer.id, '0.0005', owned, 50, 'COMPLETED')
    await prisma.$executeRaw`UPDATE idempotency_keys SET "resultRef" = ${owned.id} WHERE id = ${ownedClaim.id}`
    const second = await stuckClaim(taker.id, offer.id, '0.0005', owned, 40)
    expect((await rec.reconcileLegacyTradeClaim(second.id, 'w')).decision).toBe('NO_ATTRIBUTABLE_TRADE')
    // (2) a keyless trade made long after the claim is another logical attempt, not this one.
    const old = await stuckClaim(taker.id, offer.id, '0.0005', null)                          // claim an hour old, nothing committed
    await legacyTrade(offer, taker.id, account.id)                                              // an unrelated trade, created now
    expect((await rec.reconcileLegacyTradeClaim(old.id, 'w')).decision).toBe('NO_ATTRIBUTABLE_TRADE')
    // And another participant's trade with identical parameters is never attributed to this owner's claim.
    const other = await who('mis-o')
    await legacyTrade(offer, other.id, account.id)
    const mine = await stuckClaim(taker.id, offer.id, '0.0005', null)
    expect((await rec.reconcileLegacyTradeClaim(mine.id, 'w')).decision).toBe('NO_ATTRIBUTABLE_TRADE')
  })

  it('NO MISATTRIBUTION (B2): a trade admitted by B2 (its own Intent) is never a legacy claim\'s product, whatever its timing and hash', async () => {
    pg.requirePostgres('D8-b2')
    const { offer, taker } = await world('b2')
    // Keyless on purpose: a B2 trade admitted WITH a key is already shielded by "attributed to another claim"; one
    // admitted without a key has no claim at all, so only the legacy-trade (tradeIntentId IS NULL) rule excludes it.
    expect((await takeOffer(app, taker, offer.id, null)).statusCode).toBe(201)
    const b2 = await prisma.trade.findFirstOrThrow({ where: { offerId: offer.id, tradeIntentId: { not: null } } })
    const stuck = await stuckClaim(taker.id, offer.id, '0.0005', b2, 50) // created right before it, identical request
    const outcome = await rec.reconcileLegacyTradeClaim(stuck.id, 'w')
    expect([outcome.decision, outcome.candidateTradeIds]).toEqual(['NO_ATTRIBUTABLE_TRADE', []])
    expect((await claimRow(stuck.id)).status).toBe('IN_PROGRESS')
  })

  it('CONCURRENT WORKERS: exactly one decides a claim; the others are SKIPPED; one audit row; restart is idempotent', async () => {
    pg.requirePostgres('D8-workers')
    const { offer, account, taker } = await world('wk')
    const trade = await legacyTrade(offer, taker.id, account.id)
    const claim = await stuckClaim(taker.id, offer.id, '0.0005', trade)
    const outcomes = await Promise.all(Array.from({ length: 6 }, (_, i) => rec.reconcileLegacyTradeClaim(claim.id, `worker-${i}`)))
    expect(outcomes.map((o) => o.decision).sort()).toEqual(['MATCHED', 'SKIPPED', 'SKIPPED', 'SKIPPED', 'SKIPPED', 'SKIPPED'])
    expect(await audit(claim.id)).toHaveLength(1)
    expect(await claimRow(claim.id)).toEqual({ status: 'COMPLETED', resultRef: trade.id })
    // A "restarted" worker finds nothing to do and decides nothing.
    expect((await rec.reconcileLegacyTradeClaim(claim.id, 'worker-restarted')).decision).toBe('SKIPPED')
    expect(await audit(claim.id)).toHaveLength(1)
    // An undecidable claim re-evaluates to the same decision and adds an audit row each time, never changing the claim.
    const stuck = await stuckClaim(taker.id, offer.id, '0.0011', null)
    const [d1, d2] = [await rec.reconcileLegacyTradeClaim(stuck.id, 'w'), await rec.reconcileLegacyTradeClaim(stuck.id, 'w')]
    expect([d1.decision, d2.decision]).toEqual(['NO_ATTRIBUTABLE_TRADE', 'NO_ATTRIBUTABLE_TRADE'])
    expect(await audit(stuck.id)).toHaveLength(2)
  })

  it('BULK WORKER: only IN_PROGRESS claims of this scope older than the cutoff are decided, oldest first', async () => {
    pg.requirePostgres('D8-bulk')
    const { offer, account, taker } = await world('bk')
    const t = await legacyTrade(offer, taker.id, account.id, '0.0005', new Date(Date.now() - 2 * 3_600_000)) // a trade from 2h ago
    const matchable = await stuckClaim(taker.id, offer.id, '0.0005', t)                  // its claim, 50ms before it: old enough
    const fresh = randomUUID()
    await prisma.$executeRaw`
      INSERT INTO idempotency_keys (id, scope, "participantId", key, "requestHash", status, "createdAt")
      VALUES (${fresh}, 'openp2p.trade.create', ${taker.id}, ${'bk-' + fresh.slice(0, 8)}, ${hashIdempotentPayload({ offerId: offer.id, amount: '0.0009' })}, 'IN_PROGRESS'::"IdempotencyKeyStatus", now())`
    const done = await rec.reconcileLegacyTradeClaims({ olderThanMs: 60_000, limit: 500, decidedBy: 'bulk' })
    const decidedIds = done.map((d) => d.claimId)
    expect(decidedIds).toContain(matchable.id)
    expect(decidedIds).not.toContain(fresh)                                               // too young: its request may still be in flight
    expect((await claimRow(fresh)).status).toBe('IN_PROGRESS')
    expect((await claimRow(matchable.id)).status).toBe('COMPLETED')
  })

  it('REPLAY: a matched legacy claim is recovered (201, same trade); an unresolved one is 409 IDEMPOTENCY_OUTCOME_UNKNOWN naming only the caller\'s own candidates, and creates nothing', async () => {
    pg.requirePostgres('D8-replay')
    const { offer, account, taker } = await world('rp')
    const trade = await legacyTrade(offer, taker.id, account.id)
    const matched = await stuckClaim(taker.id, offer.id, '0.0005', trade)
    const replay = await call(app, taker, 'POST', '/v1/openp2p/trades', { offerId: offer.id, amount: '0.0005', idempotencyKey: matched.key })
    expect([replay.statusCode, JSON.parse(replay.body).data.id]).toEqual([201, trade.id])
    expect((await claimRow(matched.id)).status).toBe('COMPLETED')

    // Unresolved: two indistinguishable legacy trades.
    const taker2 = await who('rp-t2')
    const a = await legacyTrade(offer, taker2.id, account.id)
    const b = await legacyTrade(offer, taker2.id, account.id)
    const ambiguous = await stuckClaim(taker2.id, offer.id, '0.0005', a)
    const before = await prisma.trade.count({ where: { offerId: offer.id } })
    const res = await call(app, taker2, 'POST', '/v1/openp2p/trades', { offerId: offer.id, amount: '0.0005', idempotencyKey: ambiguous.key })
    const body = JSON.parse(res.body)
    expect([res.statusCode, body.error]).toEqual([409, 'IDEMPOTENCY_OUTCOME_UNKNOWN'])
    expect([...body.details.candidateTradeIds].sort()).toEqual([a.id, b.id].sort())
    expect(JSON.stringify(body)).not.toContain(taker.id)                                  // no other participant's data
    expect(await prisma.trade.count({ where: { offerId: offer.id } })).toBe(before)       // nothing created
    expect((await claimRow(ambiguous.id)).status).toBe('IN_PROGRESS')                     // and nothing concluded
  })

  it('AUDIT IS APPEND-ONLY: the database refuses to update or delete a reconciliation decision', async () => {
    pg.requirePostgres('D8-audit')
    const { offer, taker } = await world('au')
    const claim = await stuckClaim(taker.id, offer.id, '0.0005', null)
    await rec.reconcileLegacyTradeClaim(claim.id, 'w')
    await expect(prisma.$executeRaw`UPDATE idempotency_reconciliation_audit SET decision = 'MATCHED' WHERE "claimId" = ${claim.id}`).rejects.toThrow(/append-only/)
    await expect(prisma.$executeRaw`DELETE FROM idempotency_reconciliation_audit WHERE "claimId" = ${claim.id}`).rejects.toThrow(/append-only/)
    await expect(prisma.$executeRaw`INSERT INTO idempotency_reconciliation_audit (id, "claimId", scope, "participantId", decision, "candidateTradeIds", evidence, "decidedBy")
      VALUES (${randomUUID()}, ${claim.id}, 's', 'p', 'FAILED', '[]'::jsonb, '{}'::jsonb, 'x')`).rejects.toThrow(/decision_check/)
    expect(await audit(claim.id)).toHaveLength(1)
  })
})
