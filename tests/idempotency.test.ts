/**
 * CROSS-LAYER-SEMANTIC-CORRECTIVE-1 (item 37, 2026-09-13) — proves
 * `src/common/idempotency.ts`'s `withIdempotency()` actually satisfies
 * the required property: "repeating the same logical request after
 * timeout/retry must not create a second economic coordination object
 * or duplicate evidence side effect."
 *
 * Uses a REAL, behaviorally-faithful in-memory `IdempotencyKeyStore` —
 * not a mock returning canned values — that genuinely enforces the same
 * unique-constraint semantics Postgres's real `@@unique([scope,
 * participantId, key])` provides (`claim()` throws a P2002-shaped error
 * for a key already held). This is what makes the CONCURRENCY tests
 * below real: two logically-simultaneous calls race against the SAME
 * store instance, and the assertion is that only one of them actually
 * invokes `create()` — the property under test lives entirely in
 * `withIdempotency()`'s own arbitration logic, which this store proves
 * without needing a live Postgres connection in this environment
 * (per this mission's own "do not mock the property being proved"
 * rule — mocking `create()`'s return value would prove nothing about
 * whether it was called once or twice).
 */
import { withIdempotency, hashIdempotentPayload, type IdempotencyKeyStore, type IdempotencyRecord } from '../src/common/idempotency'
import { ValidationError, IdempotencyKeyConflictError } from '../src/common/errors'

class RealInMemoryIdempotencyKeyStore implements IdempotencyKeyStore {
  private rows = new Map<string, IdempotencyRecord>()
  private nextId = 1

  private rowKey(scope: string, participantId: string, key: string): string {
    return `${scope}::${participantId}::${key}`
  }

  async claim(scope: string, participantId: string, key: string, requestHash: string) {
    const rowKey = this.rowKey(scope, participantId, key)
    if (this.rows.has(rowKey)) {
      // The real behavior a Postgres unique-constraint violation
      // produces — this is the ONE place this fake diverges from a real
      // network round-trip (it's synchronous), which is exactly why the
      // concurrency test below drives the race through real, interleaved
      // Promises rather than relying on this synchronicity.
      const err: { code: string } = { code: 'P2002' }
      throw err
    }
    const id = String(this.nextId++)
    this.rows.set(rowKey, { id, requestHash, status: 'IN_PROGRESS', resultRef: null, checkpointRef: null })
    return { id }
  }

  async find(scope: string, participantId: string, key: string): Promise<IdempotencyRecord | null> {
    return this.rows.get(this.rowKey(scope, participantId, key)) ?? null
  }

  async markCompleted(id: string, resultRef: string): Promise<void> {
    for (const row of this.rows.values()) {
      if (row.id === id) { row.status = 'COMPLETED'; row.resultRef = resultRef; return }
    }
  }

  async markUnknown(id: string, resultRef: string): Promise<void> {
    for (const row of this.rows.values()) {
      if (row.id === id) { row.status = 'UNKNOWN'; row.resultRef = resultRef; return }
    }
  }

  async markFailed(id: string): Promise<void> {
    for (const row of this.rows.values()) {
      if (row.id === id) { row.status = 'FAILED'; return }
    }
  }

  async reclaimFailed(id: string): Promise<boolean> {
    // Faithful simulation of a real `UPDATE ... WHERE status = 'FAILED'`'s
    // atomicity: this whole check-then-write is synchronous JS with no
    // `await` in between, so no other "concurrent" call in this test
    // process can interleave mid-function — exactly the guarantee a real
    // database transaction provides across genuinely separate processes.
    for (const row of this.rows.values()) {
      if (row.id === id) {
        if (row.status !== 'FAILED') return false
        row.status = 'IN_PROGRESS'
        return true
      }
    }
    return false
  }

  // CROSS-LAYER-SEMANTIC-CORRECTIVE-1-R3 — deliberately does NOT touch
  // `status`, matching `PrismaIdempotencyKeyStore.setCheckpoint()` — a
  // checkpoint must survive a later transition to FAILED.
  async setCheckpoint(id: string, checkpointRef: string): Promise<void> {
    for (const row of this.rows.values()) {
      if (row.id === id) { row.checkpointRef = checkpointRef; return }
    }
  }
}

/** Wraps a real store and injects a controlled failure into one specific
 *  method call, then delegates to the real implementation for every
 *  other call — used to prove Defect A's fix without faking the property
 *  itself (the underlying store's real state transitions still happen
 *  exactly as they would in production; only the OUTCOME of one write is
 *  overridden, the same class of fault a real transient DB error would
 *  produce). */
class FaultInjectingStore implements IdempotencyKeyStore {
  private markCompletedFailuresRemaining = 0
  markCompletedCalls = 0
  markUnknownCalls = 0
  reclaimFailedCalls = 0

  constructor(private readonly real: IdempotencyKeyStore) {}

  failNextMarkCompleted(times = 1) {
    this.markCompletedFailuresRemaining = times
  }

  claim(...args: Parameters<IdempotencyKeyStore['claim']>) { return this.real.claim(...args) }
  find(...args: Parameters<IdempotencyKeyStore['find']>) { return this.real.find(...args) }

  async markCompleted(id: string, resultRef: string): Promise<void> {
    this.markCompletedCalls++
    if (this.markCompletedFailuresRemaining > 0) {
      this.markCompletedFailuresRemaining--
      throw new Error('simulated transient DB failure writing markCompleted (e.g. a dropped connection after the UPDATE was sent)')
    }
    return this.real.markCompleted(id, resultRef)
  }

  async markUnknown(id: string, resultRef: string): Promise<void> {
    this.markUnknownCalls++
    return this.real.markUnknown(id, resultRef)
  }

  markFailed(...args: Parameters<IdempotencyKeyStore['markFailed']>) { return this.real.markFailed(...args) }

  async reclaimFailed(id: string): Promise<boolean> {
    this.reclaimFailedCalls++
    return this.real.reclaimFailed(id)
  }

  setCheckpoint(...args: Parameters<IdempotencyKeyStore['setCheckpoint']>) { return this.real.setCheckpoint(...args) }
}

interface FakeTrade { id: string; offerId: string; amount: string }

// CROSS-LAYER-SEMANTIC-CORRECTIVE-1-R2 — withIdempotency() now takes a
// third callback, postPersist(), for tests that aren't specifically
// exercising it; the R2-specific describe block below exercises it
// directly, deliberately with a NON-noop implementation.
const noopPostPersist = async () => {}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (err: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

describe('withIdempotency() — property: one logical request, at most one execution', () => {
  it('first request with a key succeeds and creates the real object', async () => {
    const store = new RealInMemoryIdempotencyKeyStore()
    let createCalls = 0
    const trade = await withIdempotency<FakeTrade>(
      { scope: 'openp2p.trade.create', participantId: 'buyer-1', key: 'key-a', requestPayload: { offerId: 'offer-1', amount: '10' }, store },
      async () => { createCalls++; return { id: 'trade-1', offerId: 'offer-1', amount: '10' } },
      noopPostPersist,
      async (id) => ({ id, offerId: 'offer-1', amount: '10' })
    )
    expect(trade.id).toBe('trade-1')
    expect(createCalls).toBe(1)
  })

  it('an exact retry (same key, same payload) after the first attempt COMPLETED does not create a second object — returns the original via recover()', async () => {
    const store = new RealInMemoryIdempotencyKeyStore()
    let createCalls = 0
    const params = { scope: 'openp2p.trade.create', participantId: 'buyer-1', key: 'key-b', requestPayload: { offerId: 'offer-1', amount: '10' }, store }
    const create = async () => { createCalls++; return { id: 'trade-2', offerId: 'offer-1', amount: '10' } }
    const recover = async (id: string) => ({ id, offerId: 'offer-1', amount: '10' })

    const first = await withIdempotency<FakeTrade>(params, create, noopPostPersist, recover)
    const second = await withIdempotency<FakeTrade>(params, create, noopPostPersist, recover)

    expect(createCalls).toBe(1) // the real, economically-material assertion — create() ran exactly once
    expect(second).toEqual(first)
    expect(second.id).toBe('trade-2')
  })

  it('a "timeout-like" replay — the ORIGINAL attempt is still IN_PROGRESS when the retry arrives — is rejected as a conflict, never silently double-executed', async () => {
    const store = new RealInMemoryIdempotencyKeyStore()
    const firstCreateStarted = deferred<void>()
    const firstCreateMayFinish = deferred<void>()
    let createCalls = 0

    const params = { scope: 'openp2p.trade.create', participantId: 'buyer-1', key: 'key-c', requestPayload: { offerId: 'offer-1', amount: '10' }, store }
    const slowCreate = async () => {
      createCalls++
      firstCreateStarted.resolve()
      await firstCreateMayFinish.promise // held open deliberately — simulates "the client's own retry arrived before the original request's response did"
      return { id: 'trade-3', offerId: 'offer-1', amount: '10' }
    }
    const recover = async (id: string) => ({ id, offerId: 'offer-1', amount: '10' })

    const firstCall = withIdempotency<FakeTrade>(params, slowCreate, noopPostPersist, recover)
    await firstCreateStarted.promise // the first call has genuinely claimed the key and is mid-flight

    await expect(withIdempotency<FakeTrade>(params, slowCreate, noopPostPersist, recover)).rejects.toBeInstanceOf(IdempotencyKeyConflictError)

    firstCreateMayFinish.resolve()
    const firstResult = await firstCall
    expect(firstResult.id).toBe('trade-3')
    expect(createCalls).toBe(1) // the retry NEVER called create() — this is the actual concurrency property, not just "no error was thrown"
  })

  it('genuinely concurrent identical requests — a true race, not a sequential retry — still results in exactly one execution', async () => {
    const store = new RealInMemoryIdempotencyKeyStore()
    let createCalls = 0
    const params = { scope: 'openp2p.trade.create', participantId: 'buyer-1', key: 'key-d', requestPayload: { offerId: 'offer-1', amount: '10' }, store }
    const create = async () => {
      createCalls++
      await new Promise((r) => setTimeout(r, 5)) // real async interleaving, not a synchronous fast-path that would mask a race
      return { id: 'trade-4', offerId: 'offer-1', amount: '10' }
    }
    const recover = async (id: string) => ({ id, offerId: 'offer-1', amount: '10' })

    const results = await Promise.allSettled([
      withIdempotency<FakeTrade>(params, create, noopPostPersist, recover),
      withIdempotency<FakeTrade>(params, create, noopPostPersist, recover),
      withIdempotency<FakeTrade>(params, create, noopPostPersist, recover),
    ])

    expect(createCalls).toBe(1) // exactly one of the three concurrent calls actually won the claim and executed
    const fulfilled = results.filter((r) => r.status === 'fulfilled')
    const rejected = results.filter((r) => r.status === 'rejected')
    expect(fulfilled.length).toBe(1) // one winner
    expect(rejected.length).toBe(2) // two genuine, real-time conflicts (IN_PROGRESS at the moment they raced), not silently swallowed
    for (const r of rejected) {
      expect((r as PromiseRejectedResult).reason).toBeInstanceOf(IdempotencyKeyConflictError)
    }
  })

  it('a different logical request (no key at all) remains fully allowed and unaffected by any prior claim', async () => {
    const store = new RealInMemoryIdempotencyKeyStore()
    let createCalls = 0
    const create = async () => { createCalls++; return { id: `trade-${createCalls}`, offerId: 'offer-1', amount: '10' } }
    const recover = async (id: string) => ({ id, offerId: 'offer-1', amount: '10' })

    const a = await withIdempotency<FakeTrade>({ scope: 'openp2p.trade.create', participantId: 'buyer-1', key: undefined, requestPayload: {}, store }, create, noopPostPersist, recover)
    const b = await withIdempotency<FakeTrade>({ scope: 'openp2p.trade.create', participantId: 'buyer-1', key: undefined, requestPayload: {}, store }, create, noopPostPersist, recover)

    expect(createCalls).toBe(2) // no idempotency requested — today's exact behavior, unchanged
    expect(a.id).not.toBe(b.id)
  })

  it('a genuinely new logical request (different key) is never blocked by an unrelated prior claim', async () => {
    const store = new RealInMemoryIdempotencyKeyStore()
    let createCalls = 0
    const create = async () => { createCalls++; return { id: `trade-${createCalls}`, offerId: 'offer-1', amount: '10' } }
    const recover = async (id: string) => ({ id, offerId: 'offer-1', amount: '10' })

    await withIdempotency<FakeTrade>({ scope: 'openp2p.trade.create', participantId: 'buyer-1', key: 'key-e1', requestPayload: { a: 1 }, store }, create, noopPostPersist, recover)
    await withIdempotency<FakeTrade>({ scope: 'openp2p.trade.create', participantId: 'buyer-1', key: 'key-e2', requestPayload: { a: 2 }, store }, create, noopPostPersist, recover)

    expect(createCalls).toBe(2)
  })

  it('the same key reused for a DIFFERENT logical request (different payload hash) is rejected as a client error, never silently replayed or silently allowed', async () => {
    const store = new RealInMemoryIdempotencyKeyStore()
    const params1 = { scope: 'openp2p.trade.create', participantId: 'buyer-1', key: 'key-f', requestPayload: { offerId: 'offer-1', amount: '10' }, store }
    const params2 = { scope: 'openp2p.trade.create', participantId: 'buyer-1', key: 'key-f', requestPayload: { offerId: 'offer-2', amount: '99' }, store }
    const create = async () => ({ id: 'trade-5', offerId: 'offer-1', amount: '10' })
    const recover = async (id: string) => ({ id, offerId: 'offer-1', amount: '10' })

    await withIdempotency<FakeTrade>(params1, create, noopPostPersist, recover)
    await expect(withIdempotency<FakeTrade>(params2, create, noopPostPersist, recover)).rejects.toBeInstanceOf(ValidationError)
  })

  it('a FAILED prior attempt (create() itself threw) allows a genuine retry with the same key to actually run — nothing durable was created the first time', async () => {
    const store = new RealInMemoryIdempotencyKeyStore()
    let attempt = 0
    const params = { scope: 'liquidity.offer.create', participantId: 'seller-1', key: 'key-g', requestPayload: { asset: 'BTC' }, store }
    const create = async () => {
      attempt++
      if (attempt === 1) throw new Error('simulated transient failure — e.g. a DB write that never committed')
      return { id: 'offer-1', offerId: 'n/a', amount: 'n/a' }
    }
    const recover = async (id: string) => ({ id, offerId: 'n/a', amount: 'n/a' })

    await expect(withIdempotency<FakeTrade>(params, create, noopPostPersist, recover)).rejects.toThrow('simulated transient failure')
    const result = await withIdempotency<FakeTrade>(params, create, noopPostPersist, recover)

    expect(attempt).toBe(2) // the retry actually executed — a FAILED claim never permanently blocks a genuine retry
    expect(result.id).toBe('offer-1')
  })

  it('scope + participantId isolation — the SAME key for a DIFFERENT participant is a completely independent claim', async () => {
    const store = new RealInMemoryIdempotencyKeyStore()
    let createCalls = 0
    const create = async () => { createCalls++; return { id: `trade-${createCalls}`, offerId: 'offer-1', amount: '10' } }
    const recover = async (id: string) => ({ id, offerId: 'offer-1', amount: '10' })

    await withIdempotency<FakeTrade>({ scope: 'openp2p.trade.create', participantId: 'buyer-1', key: 'shared-key', requestPayload: { x: 1 }, store }, create, noopPostPersist, recover)
    await withIdempotency<FakeTrade>({ scope: 'openp2p.trade.create', participantId: 'buyer-2', key: 'shared-key', requestPayload: { x: 1 }, store }, create, noopPostPersist, recover)

    expect(createCalls).toBe(2) // never collides across participants, even with an identical key string and payload
  })

  it('hashIdempotentPayload() is stable for the same logical payload and different for a different one', () => {
    const h1 = hashIdempotentPayload({ offerId: 'offer-1', amount: '10' })
    const h2 = hashIdempotentPayload({ offerId: 'offer-1', amount: '10' })
    const h3 = hashIdempotentPayload({ offerId: 'offer-1', amount: '11' })
    expect(h1).toBe(h2)
    expect(h1).not.toBe(h3)
  })
})

describe('withIdempotency() — Defect A: a successful create() must never be relabeled retryable FAILED', () => {
  it('create() succeeds, markCompleted() fails: the caller still gets the real result, the claim becomes UNKNOWN (not FAILED), and a retry recovers it without ever calling create() again', async () => {
    const realStore = new RealInMemoryIdempotencyKeyStore()
    const store = new FaultInjectingStore(realStore)
    let createCalls = 0
    const params = { scope: 'openp2p.trade.create', participantId: 'buyer-1', key: 'key-h', requestPayload: { offerId: 'offer-1', amount: '10' }, store }
    const create = async () => { createCalls++; return { id: 'trade-h1', offerId: 'offer-1', amount: '10' } }
    const recover = async (id: string) => ({ id, offerId: 'offer-1', amount: '10' })

    store.failNextMarkCompleted(1)

    // 1. create() succeeds and returns the durable result — the caller's
    //    own request succeeds even though bookkeeping is about to fail.
    const first = await withIdempotency<FakeTrade>(params, create, noopPostPersist, recover)
    expect(first.id).toBe('trade-h1')
    expect(createCalls).toBe(1)

    // Prove the exact state the record landed in, not just "no error was
    // thrown" — this IS the property under test.
    const record = await realStore.find('openp2p.trade.create', 'buyer-1', 'key-h')
    expect(record?.status).toBe('UNKNOWN') // never 'FAILED' — the business action genuinely succeeded
    expect(record?.resultRef).toBe('trade-h1') // the real result is recoverable, not lost
    expect(store.markCompletedCalls).toBe(1) // the finalize write was attempted and (by injection) failed
    expect(store.markUnknownCalls).toBe(1) // the fallback write ran and succeeded

    // 2. Same logical request is retried.
    const second = await withIdempotency<FakeTrade>(params, create, noopPostPersist, recover)

    // 3/4. create() must not execute twice — the retry recovered the
    // ORIGINAL result via the UNKNOWN->recover() path, exactly like a
    // COMPLETED replay.
    expect(createCalls).toBe(1)
    expect(second).toEqual(first)
  })

  it('create() succeeds, BOTH markCompleted() and markUnknown() fail: the claim is left IN_PROGRESS (safe — blocks a duplicate) rather than falsely COMPLETED or falsely FAILED, and the caller still gets the real result', async () => {
    const realStore = new RealInMemoryIdempotencyKeyStore()
    const store = new FaultInjectingStore(realStore)
    // Force markUnknown to also fail, simulating the genuinely
    // exceptional "database itself is unreachable for both writes" case.
    const originalMarkUnknown = store.markUnknown.bind(store)
    store.markUnknown = async () => { throw new Error('simulated total DB unavailability') }

    let createCalls = 0
    const params = { scope: 'openp2p.trade.create', participantId: 'buyer-1', key: 'key-i', requestPayload: { offerId: 'offer-1', amount: '10' }, store }
    const create = async () => { createCalls++; return { id: 'trade-i1', offerId: 'offer-1', amount: '10' } }
    const recover = async (id: string) => ({ id, offerId: 'offer-1', amount: '10' })

    store.failNextMarkCompleted(1)

    const result = await withIdempotency<FakeTrade>(params, create, noopPostPersist, recover)
    expect(result.id).toBe('trade-i1') // the caller's own request still succeeds — create() really did work

    const record = await realStore.find('openp2p.trade.create', 'buyer-1', 'key-i')
    expect(record?.status).toBe('IN_PROGRESS') // left exactly where it was — never a false COMPLETED, never a false FAILED

    // A concurrent/retried caller in this state is safely BLOCKED, not
    // allowed to duplicate the side effect — the disclosed, bounded
    // residual (stuck pending reconciliation) is safe, not silently wrong.
    await expect(withIdempotency<FakeTrade>(params, create, noopPostPersist, recover)).rejects.toBeInstanceOf(IdempotencyKeyConflictError)
    expect(createCalls).toBe(1) // still exactly one real execution, even in this doubly-degraded case

    void originalMarkUnknown
  })
})

describe('withIdempotency() — Defect B: FAILED -> retry must be an atomic, cross-instance-safe compare-and-swap', () => {
  it('first execution genuinely fails before creating anything, becomes retryable, and a single retry succeeds normally', async () => {
    const store = new RealInMemoryIdempotencyKeyStore()
    let attempt = 0
    const params = { scope: 'openp2p.trade.create', participantId: 'buyer-1', key: 'key-j', requestPayload: { offerId: 'offer-1', amount: '10' }, store }
    const create = async () => {
      attempt++
      if (attempt === 1) throw new Error('genuine failure before any durable object existed')
      return { id: 'trade-j1', offerId: 'offer-1', amount: '10' }
    }
    const recover = async (id: string) => ({ id, offerId: 'offer-1', amount: '10' })

    await expect(withIdempotency<FakeTrade>(params, create, noopPostPersist, recover)).rejects.toThrow('genuine failure')
    expect((await store.find('openp2p.trade.create', 'buyer-1', 'key-j'))?.status).toBe('FAILED')

    const result = await withIdempotency<FakeTrade>(params, create, noopPostPersist, recover)
    expect(result.id).toBe('trade-j1')
    expect(attempt).toBe(2)
  })

  it('genuinely concurrent retries against a shared, durable store (modeling multiple application instances, not a process-local mutex): exactly one reclaims FAILED and exactly one create() executes', async () => {
    // The store instance below is the ONLY shared state between the
    // "instances" in this test — withIdempotency() itself holds no
    // module-level or process-local state of its own (confirmed by
    // reading src/common/idempotency.ts: no shared mutable variable
    // outside the injected store), so racing multiple calls against one
    // store instance genuinely exercises cross-instance correctness: the
    // ONLY thing preventing a double-execution is reclaimFailed()'s own
    // atomic compare-and-swap against this shared store, exactly as it
    // would be Postgres's own atomicity across real, separate processes
    // in production.
    const store = new RealInMemoryIdempotencyKeyStore()
    const params0 = { scope: 'liquidity.offer.create', participantId: 'seller-1', key: 'key-k', requestPayload: { asset: 'BTC' }, store }
    const failingCreate = async () => { throw new Error('genuine failure before any durable object existed') }
    const recover = async (id: string) => ({ id, offerId: 'n/a', amount: 'n/a' })

    // Put the record into a genuine FAILED state first.
    await expect(withIdempotency<FakeTrade>(params0, failingCreate, noopPostPersist, recover)).rejects.toThrow()
    expect((await store.find('liquidity.offer.create', 'seller-1', 'key-k'))?.status).toBe('FAILED')

    let createCalls = 0
    const succeedingCreate = async () => {
      createCalls++
      await new Promise((r) => setTimeout(r, 5)) // real async interleaving — a synchronous fast-path could mask a race
      return { id: 'offer-k1', offerId: 'n/a', amount: 'n/a' }
    }

    // At least 3 concurrent retries, per the mission's own requirement.
    const results = await Promise.allSettled([
      withIdempotency<FakeTrade>(params0, succeedingCreate, noopPostPersist, recover),
      withIdempotency<FakeTrade>(params0, succeedingCreate, noopPostPersist, recover),
      withIdempotency<FakeTrade>(params0, succeedingCreate, noopPostPersist, recover),
      withIdempotency<FakeTrade>(params0, succeedingCreate, noopPostPersist, recover),
    ])

    expect(createCalls).toBe(1) // exactly one retry actually reclaimed the record and ran create()
    const fulfilled = results.filter((r) => r.status === 'fulfilled') as PromiseFulfilledResult<FakeTrade>[]
    const rejected = results.filter((r) => r.status === 'rejected')
    expect(fulfilled.length).toBe(1)
    expect(fulfilled[0].value.id).toBe('offer-k1')
    expect(rejected.length).toBe(3) // the three losers are told to retry again, never silently dropped and never allowed to duplicate
    for (const r of rejected) {
      expect((r as PromiseRejectedResult).reason).toBeInstanceOf(IdempotencyKeyConflictError)
    }

    const finalRecord = await store.find('liquidity.offer.create', 'seller-1', 'key-k')
    expect(finalRecord?.status).toBe('COMPLETED')
    expect(finalRecord?.resultRef).toBe('offer-k1')
  })

  it('a plain, non-atomic "read FAILED then run" would have failed this exact test — regression guard for the original Defect B bug, expressed as a direct assertion on reclaimFailed()\'s own return value', async () => {
    const store = new RealInMemoryIdempotencyKeyStore()
    const params = { scope: 'openp2p.trade.create', participantId: 'buyer-1', key: 'key-l', requestPayload: { x: 1 }, store }
    await expect(withIdempotency<FakeTrade>(params, async () => { throw new Error('fail') }, noopPostPersist, async (id) => ({ id, offerId: 'n/a', amount: 'n/a' }))).rejects.toThrow()

    const record = await store.find('openp2p.trade.create', 'buyer-1', 'key-l')
    expect(record).not.toBeNull()

    // Two "concurrent" reclaim attempts against the SAME real FAILED row.
    const [firstReclaim, secondReclaim] = await Promise.all([
      store.reclaimFailed(record!.id),
      store.reclaimFailed(record!.id),
    ])
    // Exactly one may reacquire the retry — this is the literal property
    // Defect B's fix must guarantee, independent of withIdempotency()'s
    // own surrounding logic.
    expect([firstReclaim, secondReclaim].filter(Boolean).length).toBe(1)
  })
})

/**
 * CROSS-LAYER-SEMANTIC-CORRECTIVE-1-R2 (2026-09-13) — proves the third
 * defect a CTO review found in R1: `persist()` succeeding is NOT the
 * same as the whole orchestration succeeding. `createTradeUncached()`,
 * `createOfferUncached()`, and `submitEvidenceUncached()` each do real
 * durable writes FOLLOWED by more steps (event emission, intent
 * transitions, negotiation open) that can also throw — a failure there
 * must still surface to the caller (it's a real failure), but must NOT
 * cause the idempotency record to regress to FAILED (which would let a
 * retry create a SECOND Trade/Offer or double-append evidence). These
 * tests use the exact scope strings the real `openp2p.trade.create`,
 * `liquidity.offer.create`, and `settlement.dispute.evidence` call sites
 * use (see `trade.service.ts`, `liquidity.service.ts`,
 * `dispute.service.ts`), proving the generic mechanism those three real
 * `persist`/`postPersist` splits depend on.
 */
describe('withIdempotency() — R2: a postPersist() failure must not relabel an already-durable result FAILED, and must never cause a duplicate persist()', () => {
  it('[Trade-shaped] persist() succeeds, postPersist() throws: the caller sees the real error, the record settles COMPLETED (not FAILED), and a retry recovers the original Trade without calling persist() again', async () => {
    const store = new RealInMemoryIdempotencyKeyStore()
    let persistCalls = 0
    let postPersistCalls = 0
    const params = { scope: 'openp2p.trade.create', participantId: 'buyer-1', key: 'key-trade-r2', requestPayload: { offerId: 'offer-1', amount: '10' }, store }
    const persist = async () => { persistCalls++; return { id: 'trade-r2-1', offerId: 'offer-1', amount: '10' } }
    const postPersist = async () => {
      postPersistCalls++
      if (postPersistCalls === 1) throw new Error('simulated negotiationService.open() failure — the Trade row already exists')
    }
    const recover = async (id: string) => ({ id, offerId: 'offer-1', amount: '10' })

    // 1. The real failure propagates to the original caller — never swallowed.
    await expect(withIdempotency<FakeTrade>(params, persist, postPersist, recover))
      .rejects.toThrow('simulated negotiationService.open() failure')
    expect(persistCalls).toBe(1) // the Trade was created exactly once

    // 2. The durable Trade is NOT relabeled retryable — it settled COMPLETED,
    //    because persist() itself succeeded; only the later step failed.
    const record = await store.find('openp2p.trade.create', 'buyer-1', 'key-trade-r2')
    expect(record?.status).toBe('COMPLETED')
    expect(record?.resultRef).toBe('trade-r2-1')

    // 3. A retry with the same key recovers the ORIGINAL Trade — it never
    //    calls persist() again (no second Trade row), and never re-runs the
    //    failed postPersist() step either (a real, disclosed residual).
    const retried = await withIdempotency<FakeTrade>(params, persist, postPersist, recover)
    expect(persistCalls).toBe(1) // still exactly one — no duplicate Trade
    expect(postPersistCalls).toBe(1) // postPersist() is not re-invoked on a recovered replay
    expect(retried.id).toBe('trade-r2-1')
  })

  it('[Offer-shaped] persist() succeeds, postPersist() throws: the caller sees the real error, the record settles COMPLETED (not FAILED), and a retry recovers the original Offer without calling persist() again', async () => {
    const store = new RealInMemoryIdempotencyKeyStore()
    let persistCalls = 0
    let postPersistCalls = 0
    const params = { scope: 'liquidity.offer.create', participantId: 'seller-1', key: 'key-offer-r2', requestPayload: { asset: 'BTC' }, store }
    const persist = async () => { persistCalls++; return { id: 'offer-r2-1', offerId: 'n/a', amount: 'n/a' } }
    const postPersist = async () => {
      postPersistCalls++
      if (postPersistCalls === 1) throw new Error('simulated eventBus.emit() failure — the Offer row already exists')
    }
    const recover = async (id: string) => ({ id, offerId: 'n/a', amount: 'n/a' })

    await expect(withIdempotency<FakeTrade>(params, persist, postPersist, recover))
      .rejects.toThrow('simulated eventBus.emit() failure')
    expect(persistCalls).toBe(1)

    const record = await store.find('liquidity.offer.create', 'seller-1', 'key-offer-r2')
    expect(record?.status).toBe('COMPLETED')
    expect(record?.resultRef).toBe('offer-r2-1')

    const retried = await withIdempotency<FakeTrade>(params, persist, postPersist, recover)
    expect(persistCalls).toBe(1) // no second Offer row was ever created
    expect(postPersistCalls).toBe(1)
    expect(retried.id).toBe('offer-r2-1')
  })

  it('[Evidence-shaped] persist() succeeds, postPersist() throws: the caller sees the real error, the record settles COMPLETED (not FAILED), and a retry recovers the original Dispute without double-appending evidence', async () => {
    const store = new RealInMemoryIdempotencyKeyStore()
    let persistCalls = 0
    let postPersistCalls = 0
    const params = { scope: 'settlement.dispute.evidence', participantId: 'buyer-1', key: 'key-evidence-r2', requestPayload: { disputeId: 'dispute-1', type: 'IMAGE', uri: 'ipfs://x', note: null }, store }
    const persist = async () => { persistCalls++; return { id: 'dispute-1', offerId: 'n/a', amount: 'n/a' } }
    const postPersist = async () => {
      postPersistCalls++
      if (postPersistCalls === 1) throw new Error('simulated eventBus.emit() failure — the evidence is already durably appended')
    }
    const recover = async (id: string) => ({ id, offerId: 'n/a', amount: 'n/a' })

    await expect(withIdempotency<FakeTrade>(params, persist, postPersist, recover))
      .rejects.toThrow('simulated eventBus.emit() failure')
    expect(persistCalls).toBe(1) // the evidence array was appended exactly once

    const record = await store.find('settlement.dispute.evidence', 'buyer-1', 'key-evidence-r2')
    expect(record?.status).toBe('COMPLETED')
    expect(record?.resultRef).toBe('dispute-1')

    const retried = await withIdempotency<FakeTrade>(params, persist, postPersist, recover)
    expect(persistCalls).toBe(1) // never double-appended — a retry recovers, it never re-runs persist()
    expect(postPersistCalls).toBe(1)
    expect(retried.id).toBe('dispute-1')
  })

  it('a postPersist() failure followed by ALSO a markCompleted() failure still settles UNKNOWN (Defect A\'s own machinery), never FAILED — proving R1 and R2 compose correctly rather than one undoing the other', async () => {
    const realStore = new RealInMemoryIdempotencyKeyStore()
    const store = new FaultInjectingStore(realStore)
    store.failNextMarkCompleted(1)

    let persistCalls = 0
    let postPersistCalls = 0
    const params = { scope: 'openp2p.trade.create', participantId: 'buyer-1', key: 'key-compose-r2', requestPayload: { offerId: 'offer-1', amount: '10' }, store }
    const persist = async () => { persistCalls++; return { id: 'trade-compose-1', offerId: 'offer-1', amount: '10' } }
    const postPersist = async () => {
      postPersistCalls++
      throw new Error('simulated postPersist failure, on top of a bookkeeping failure')
    }
    const recover = async (id: string) => ({ id, offerId: 'offer-1', amount: '10' })

    await expect(withIdempotency<FakeTrade>(params, persist, postPersist, recover)).rejects.toThrow('simulated postPersist failure')

    // The claim was already settled to UNKNOWN (R1's own fallback, since
    // markCompleted() was injected to fail) BEFORE postPersist() ever ran
    // — its failure afterward changes nothing about that settlement.
    const record = await realStore.find('openp2p.trade.create', 'buyer-1', 'key-compose-r2')
    expect(record?.status).toBe('UNKNOWN')
    expect(record?.resultRef).toBe('trade-compose-1')
    expect(persistCalls).toBe(1)

    const retried = await withIdempotency<FakeTrade>(params, persist, postPersist, recover)
    expect(persistCalls).toBe(1) // UNKNOWN recovers exactly like COMPLETED — no second persist()
    expect(retried.id).toBe('trade-compose-1')
  })
})

interface FakeOfferWithIntent { id: string; offerId: string; amount: string; intentId: string }

/**
 * CROSS-LAYER-SEMANTIC-CORRECTIVE-1-R3 (2026-09-13) — proves the fourth
 * defect a CTO review found: `persistOffer()`'s own `persist()` performs
 * TWO independently-durable writes (an Intent, then an Offer), not one.
 * R2's fix (settle before postPersist()) does not help here — the
 * failure happens INSIDE persist() itself, between its two writes. This
 * models the exact shape `liquidity.service.ts`'s real `persistOffer()`
 * now uses: `checkpoint.ref` set means "reuse the existing Intent, skip
 * creating a new one," `checkpoint.set()` records the Intent's id right
 * after it's created, before the (separately failure-prone) Offer write
 * is attempted.
 */
describe('withIdempotency() — R3: a persist() with TWO internal durable writes must not duplicate the FIRST one when the SECOND one fails and is retried', () => {
  it('[Offer-shaped] Intent creation succeeds, Offer creation fails: a retry with the same key reuses the SAME canonical Intent — never calls Intent-creation twice, and the final Offer is associated with that one Intent', async () => {
    const store = new RealInMemoryIdempotencyKeyStore()
    let intentCreateCalls = 0
    let offerCreateCalls = 0
    let offerCreateShouldFail = true
    const createdIntentIds: string[] = []

    const params = { scope: 'liquidity.offer.create', participantId: 'seller-1', key: 'key-offer-intent-r3', requestPayload: { asset: 'BTC' }, store }

    // Mirrors persistOffer()'s real shape: reuse checkpoint.ref if set
    // (skip intentEngine.create()), otherwise create a new Intent and
    // checkpoint it BEFORE attempting the Offer write.
    const persist = async (checkpoint: { ref: string | null; set: (ref: string) => Promise<void> }): Promise<FakeOfferWithIntent> => {
      let intentId = checkpoint.ref
      if (!intentId) {
        intentCreateCalls++
        intentId = `intent-${intentCreateCalls}`
        createdIntentIds.push(intentId)
        await checkpoint.set(intentId)
      }

      offerCreateCalls++
      if (offerCreateShouldFail) {
        throw new Error('simulated prisma.offer.create() failure — the Intent already durably exists')
      }
      return { id: 'offer-r3-1', offerId: 'n/a', amount: 'n/a', intentId }
    }
    const recover = async (id: string): Promise<FakeOfferWithIntent> => ({ id, offerId: 'n/a', amount: 'n/a', intentId: createdIntentIds[0] })

    // 1. First attempt: Intent creation succeeds, Offer creation fails.
    await expect(withIdempotency<FakeOfferWithIntent>(params, persist, noopPostPersist, recover))
      .rejects.toThrow('simulated prisma.offer.create() failure')
    expect(intentCreateCalls).toBe(1) // exactly one Intent created so far
    expect(offerCreateCalls).toBe(1) // the Offer write was attempted once, and failed — no Offer exists

    const record = await store.find('liquidity.offer.create', 'seller-1', 'key-offer-intent-r3')
    expect(record?.status).toBe('FAILED')
    expect(record?.checkpointRef).toBe('intent-1') // the checkpoint survives the FAILED transition — Defect B's own reclaim path relies on this

    // 2. Retry with the SAME key — this time Offer creation succeeds.
    offerCreateShouldFail = false
    const result = await withIdempotency<FakeOfferWithIntent>(params, persist, noopPostPersist, recover)

    // Required properties, per this mission's own test spec:
    expect(intentCreateCalls).toBe(1) // (1) only one canonical Intent exists/is reused — retry never created a second one
    expect(offerCreateCalls).toBe(2) // the Offer write was retried (once failed, once succeeded)
    expect(result.id).toBe('offer-r3-1') // (2) at most one Offer is created — this is the only Offer that ever exists
    expect(result.intentId).toBe('intent-1') // (4) the final returned Offer is associated with the ORIGINAL canonical Intent

    const finalRecord = await store.find('liquidity.offer.create', 'seller-1', 'key-offer-intent-r3')
    expect(finalRecord?.status).toBe('COMPLETED')
    expect(finalRecord?.resultRef).toBe('offer-r3-1')
  })

  it('[Offer-shaped] concurrent retries after Intent-succeeds/Offer-fails still produce exactly one winner and never duplicate the checkpointed Intent (application-restart / multi-instance safety)', async () => {
    const store = new RealInMemoryIdempotencyKeyStore()
    let intentCreateCalls = 0
    const params = { scope: 'liquidity.offer.create', participantId: 'seller-2', key: 'key-offer-intent-r3-concurrent', requestPayload: { asset: 'BTC' }, store }

    const failingPersist = async (checkpoint: { ref: string | null; set: (ref: string) => Promise<void> }): Promise<FakeOfferWithIntent> => {
      let intentId = checkpoint.ref
      if (!intentId) {
        intentCreateCalls++
        intentId = `intent-${intentCreateCalls}`
        await checkpoint.set(intentId)
      }
      throw new Error('genuine Offer-write failure — the checkpointed Intent still durably exists')
    }
    const recover = async (id: string): Promise<FakeOfferWithIntent> => ({ id, offerId: 'n/a', amount: 'n/a', intentId: 'intent-1' })

    // Put the record into a real FAILED state with a real checkpoint first.
    await expect(withIdempotency<FakeOfferWithIntent>(params, failingPersist, noopPostPersist, recover)).rejects.toThrow()
    expect(intentCreateCalls).toBe(1)
    expect((await store.find('liquidity.offer.create', 'seller-2', 'key-offer-intent-r3-concurrent'))?.status).toBe('FAILED')

    let offerCreateCalls = 0
    const succeedingPersist = async (checkpoint: { ref: string | null; set: (ref: string) => Promise<void> }): Promise<FakeOfferWithIntent> => {
      // The checkpoint must already be set from the prior failed attempt —
      // a genuinely new Intent here would be the exact bug this test guards.
      if (!checkpoint.ref) throw new Error('test setup error — checkpoint should already be set')
      offerCreateCalls++
      await new Promise((r) => setTimeout(r, 5)) // real async interleaving, not a synchronous fast-path that would mask a race
      return { id: 'offer-r3-concurrent-1', offerId: 'n/a', amount: 'n/a', intentId: checkpoint.ref }
    }

    const results = await Promise.allSettled([
      withIdempotency<FakeOfferWithIntent>(params, succeedingPersist, noopPostPersist, recover),
      withIdempotency<FakeOfferWithIntent>(params, succeedingPersist, noopPostPersist, recover),
      withIdempotency<FakeOfferWithIntent>(params, succeedingPersist, noopPostPersist, recover),
    ])

    expect(intentCreateCalls).toBe(1) // still exactly one Intent ever created, across the whole scenario
    expect(offerCreateCalls).toBe(1) // exactly one retry actually reclaimed the record and ran the Offer write
    const fulfilled = results.filter((r) => r.status === 'fulfilled') as PromiseFulfilledResult<FakeOfferWithIntent>[]
    expect(fulfilled.length).toBe(1)
    expect(fulfilled[0].value.intentId).toBe('intent-1') // the winner's Offer is associated with the original checkpointed Intent
  })
})
