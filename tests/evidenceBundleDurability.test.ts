/**
 * Missão 05 — evidence-integrity finding, proven rather than asserted.
 * Missão 05.7 (2026-08-15) closed the gap this file originally documented:
 * the default EventStore is now PostgresEventStore (`durable = true`),
 * not InMemoryEventStore — every part of the bundle (claims, proofs,
 * verifications, externalReferences, and now the timeline too) is
 * Postgres-backed and survives a restart. Before Missão 05 the bundle
 * exposed no way to tell a durable timeline apart from a non-durable one
 * at all; these tests still pin the disclosure fields themselves (so the
 * ambiguity that motivated them can't silently come back if a future
 * change swaps the default again), updated to assert the new, true
 * default rather than the old one.
 */
export {} // same reasoning as fullTradeLifecycle.test.ts/chatUnification.test.ts's
// identical comment — forces this file to be a module so its top-level
// consts (mockDurableEventRecordDelegate, mockTransaction, added in
// Missão 05.8) don't leak into the shared global scope and collide with
// another test file's identically-named ones.
const mockClaimFindMany = jest.fn().mockResolvedValue([])
let durableEvents: any[] = []
const mockDurableCreate = jest.fn(async (args: any) => {
  const row = { ...args.data }
  durableEvents.push(row)
  return row
})
const mockDurableFindFirst = jest.fn(async (args: any) => {
  const matching = durableEvents.filter((e) => e.correlationId === args.where.correlationId)
  return matching.length === 0 ? null : matching[matching.length - 1]
})
const mockDurableFindMany = jest.fn(async (args: any) => {
  return durableEvents.filter((e) => e.correlationId === args.where.correlationId)
})
const mockDurableEventRecordDelegate = {
  create: (...args: unknown[]) => mockDurableCreate(...(args as [any])),
  findFirst: (...args: unknown[]) => mockDurableFindFirst(...(args as [any])),
  findMany: (...args: unknown[]) => mockDurableFindMany(...(args as [any])),
}
// PostgresEventStore.publish() (Missão 05.8) wraps its write in a real
// Postgres transaction (pg_advisory_xact_lock-serialized per
// correlationId) — a trivial passthrough is enough here since this file
// doesn't test concurrency, only the durability-disclosure fields.
const mockTransaction = jest.fn(async (callback: (tx: any) => Promise<unknown>) =>
  callback({ durableEventRecord: mockDurableEventRecordDelegate, $executeRaw: jest.fn().mockResolvedValue(0) })
)
jest.mock('../src/common/database', () => ({
  prisma: {
    claim: { findMany: (...args: unknown[]) => mockClaimFindMany(...args) },
    durableEventRecord: mockDurableEventRecordDelegate,
    $transaction: (...args: unknown[]) => mockTransaction(...(args as [any])),
  },
}))
jest.mock('../src/common/redis', () => ({ redis: { get: jest.fn(), set: jest.fn(), del: jest.fn() } }))

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { proofService } = require('../src/modules/open-proof/proof.service')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { eventBus } = require('../src/common/events/event-bus')

describe('Evidence Bundle — timeline durability disclosure (Missão 05)', () => {
  beforeEach(() => {
    mockClaimFindMany.mockClear()
    mockClaimFindMany.mockResolvedValue([])
    durableEvents = []
  })

  it('reports the real durability posture of the timeline it returns, never leaving it implicit', async () => {
    const bundle = await proofService.getEvidenceBundleForTrade('trade-1')

    expect(bundle).toHaveProperty('timelineDurable')
    expect(bundle).toHaveProperty('timelineStore')
    // Reports whatever the wired store actually is — not a hardcoded
    // assumption. This must track eventBus for real, so that swapping in
    // a durable backend flips it automatically rather than needing a
    // second place to remember to update.
    expect(bundle.timelineDurable).toBe(eventBus.durable)
    expect(bundle.timelineStore).toBe(eventBus.storeName)
  })

  it('documents the current default posture explicitly: the default store is durable (Missão 05.7), so an empty timeline really does mean "nothing happened," not "history lost to a restart"', async () => {
    // This is the finding this file was written to guard, updated for the
    // fix rather than the gap: if a future change swaps the default back
    // to a non-durable store, this test fails loudly and should be
    // updated deliberately — the durability posture of dispute evidence
    // should never change silently either direction.
    expect(eventBus.durable).toBe(true)
    expect(eventBus.storeName).toBe('postgres')

    const bundle = await proofService.getEvidenceBundleForTrade('trade-with-no-events')
    expect(bundle.timeline).toEqual([])
    expect(bundle.timelineDurable).toBe(true)
  })

  it('the Postgres-backed halves of the bundle are still returned independently of timeline durability', async () => {
    mockClaimFindMany.mockResolvedValueOnce([
      {
        id: 'claim-1', tradeId: 'trade-1', claimType: 'payment_sent',
        proofs: [{ id: 'proof-1', evidenceHash: 'abc', verifications: [], evidenceReferences: [] }],
      },
    ])

    const bundle = await proofService.getEvidenceBundleForTrade('trade-1')

    // Durable evidence survives regardless of the ephemeral timeline —
    // the distinction this disclosure exists to make legible.
    expect(bundle.claims).toHaveLength(1)
    expect(bundle.proofs).toHaveLength(1)
    expect(bundle.proofs[0].evidenceHash).toBe('abc')
  })
})
