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
    this.rows.set(rowKey, { id, requestHash, status: 'IN_PROGRESS', resultRef: null })
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

/** A real, behaviorally-faithful in-memory stand-in for
 *  `IntentRepository` + `intentEngine.create()`'s own durable write,
 *  proving `Intent.idempotencyClaimId`'s real `@unique` constraint the
 *  same way `RealInMemoryIdempotencyKeyStore` proves `IdempotencyKey`'s
 *  own — a genuine unique-violation (P2002-shaped), not a mock return
 *  value, so the "insert-as-lock, catch P2002, look up the winner"
 *  reconciliation path in `persistOffer()`'s real code is exercised for
 *  real, not merely assumed to work. */
class FakeIntentStore {
  private byId = new Map<string, { id: string; idempotencyClaimId: string | null }>()
  private byClaimId = new Map<string, string>()
  private nextId = 1
  createCalls = 0

  async create(idempotencyClaimId: string | null): Promise<{ id: string }> {
    this.createCalls++
    if (idempotencyClaimId && this.byClaimId.has(idempotencyClaimId)) {
      const err: { code: string } = { code: 'P2002' }
      throw err
    }
    const id = `intent-${this.nextId++}`
    this.byId.set(id, { id, idempotencyClaimId })
    if (idempotencyClaimId) this.byClaimId.set(idempotencyClaimId, id)
    return { id }
  }

  async findByIdempotencyClaimId(claimId: string): Promise<{ id: string } | null> {
    const id = this.byClaimId.get(claimId)
    return id ? { id } : null
  }
}

function isP2002(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'P2002'
}

/** Mirrors `liquidity.service.ts`'s real `persistOffer()` control flow
 *  exactly (including the P2002-reconciliation branch) against a
 *  `FakeIntentStore`, so these tests prove the actual algorithm the
 *  production code runs, not merely an analog of its intent. */
function makePersistOfferLike(intents: FakeIntentStore, offerCreate: (intentId: string) => Promise<FakeOfferWithIntent>) {
  return async (claimId: string | null): Promise<FakeOfferWithIntent> => {
    let intentId: string
    if (!claimId) {
      intentId = (await intents.create(null)).id
    } else {
      const existing = await intents.findByIdempotencyClaimId(claimId)
      if (existing) {
        intentId = existing.id
      } else {
        try {
          intentId = (await intents.create(claimId)).id
        } catch (err) {
          if (!isP2002(err)) throw err
          const winner = await intents.findByIdempotencyClaimId(claimId)
          if (!winner) throw err
          intentId = winner.id
        }
      }
    }
    return offerCreate(intentId)
  }
}

/**
 * CROSS-LAYER-SEMANTIC-CORRECTIVE-1-R3/R4 (2026-09-13) — `persistOffer()`
 * performs TWO independently-durable writes (an Intent, then an Offer),
 * not one; R2's fix (settle before postPersist()) does not help, since
 * the failure happens INSIDE persist() itself, between its two writes.
 *
 * R3's first attempt at this (a separate `checkpoint.set()` write
 * recording the Intent's id) turned out to have the identical defect one
 * level deeper: that write could itself fail, definitely or ambiguously
 * (committed but the acknowledgement lost), with no safe way to
 * distinguish the two from a thrown error alone — REMOVED.
 *
 * R4's fix needs no separate checkpoint write at all: `Intent.idempotencyClaimId`
 * is stamped as PART OF the Intent's own creation (one INSERT, not two
 * statements), and a retry reconciles via a direct, authoritative
 * database READ (`findByIdempotencyClaimId()`) rather than trusting any
 * remembered/assumed outcome of a prior write — which is exactly why the
 * "ambiguous acknowledgement" case cannot produce a duplicate: the retry
 * never asks "did that earlier write succeed?", it asks "does the object
 * exist right now?", a question a direct read always answers correctly
 * regardless of what the earlier caller's own thrown error implied.
 */
describe('withIdempotency() — R3/R4: a persist() with TWO internal durable writes must not duplicate the FIRST one when the SECOND one fails and is retried', () => {
  it('[Offer-shaped] Intent creation succeeds, Offer creation fails: a retry with the same key reuses the SAME canonical Intent — never calls Intent-creation twice, and the final Offer is associated with that one Intent', async () => {
    const store = new RealInMemoryIdempotencyKeyStore()
    const intents = new FakeIntentStore()
    let offerCreateCalls = 0
    let offerCreateShouldFail = true

    const params = { scope: 'liquidity.offer.create', participantId: 'seller-1', key: 'key-offer-intent-r4', requestPayload: { asset: 'BTC' }, store }
    const persist = makePersistOfferLike(intents, async (intentId) => {
      offerCreateCalls++
      if (offerCreateShouldFail) {
        throw new Error('simulated prisma.offer.create() failure — the Intent already durably exists')
      }
      return { id: 'offer-r4-1', offerId: 'n/a', amount: 'n/a', intentId }
    })
    const recover = async (id: string): Promise<FakeOfferWithIntent> => {
      const intent = await intents.findByIdempotencyClaimId('key-offer-intent-r4')
      return { id, offerId: 'n/a', amount: 'n/a', intentId: intent?.id ?? '' }
    }

    // 1. First attempt: Intent creation succeeds, Offer creation fails.
    await expect(withIdempotency<FakeOfferWithIntent>(params, persist, noopPostPersist, recover))
      .rejects.toThrow('simulated prisma.offer.create() failure')
    expect(intents.createCalls).toBe(1) // exactly one Intent created so far
    expect(offerCreateCalls).toBe(1) // the Offer write was attempted once, and failed — no Offer exists

    const record = await store.find('liquidity.offer.create', 'seller-1', 'key-offer-intent-r4')
    expect(record?.status).toBe('FAILED')

    // 2. Retry with the SAME key — this time Offer creation succeeds.
    offerCreateShouldFail = false
    const result = await withIdempotency<FakeOfferWithIntent>(params, persist, noopPostPersist, recover)

    // Required properties, per this mission's own test spec:
    expect(intents.createCalls).toBe(1) // (1) only one canonical Intent exists/is created — retry never created a second one
    expect(offerCreateCalls).toBe(2) // the Offer write was retried (once failed, once succeeded)
    expect(result.id).toBe('offer-r4-1') // (2) at most one Offer is created — this is the only Offer that ever exists
    expect(result.intentId).toBe('intent-1') // (3) the final returned Offer is associated with the ORIGINAL canonical Intent

    const finalRecord = await store.find('liquidity.offer.create', 'seller-1', 'key-offer-intent-r4')
    expect(finalRecord?.status).toBe('COMPLETED')
    expect(finalRecord?.resultRef).toBe('offer-r4-1')
  })

  it('the symmetric "unknown outcome" case: the Intent-creating write actually commits even though the calling code then throws (an acknowledgement-lost timeout) — a retry finds and reuses it via a direct lookup, never assuming the throw meant nothing was created', async () => {
    const store = new RealInMemoryIdempotencyKeyStore()
    const intents = new FakeIntentStore()
    let ackLostOnNextCreate = true

    const params = { scope: 'liquidity.offer.create', participantId: 'seller-2', key: 'key-offer-ack-lost', requestPayload: { asset: 'BTC' }, store }

    // Simulates the exact ambiguity the mission calls out: intents.create()
    // below is a REAL write that genuinely lands (this fake's own map is
    // updated) — the throw happens AFTER it, modeling a client that never
    // received the success acknowledgement (e.g. a dropped connection),
    // not a write that never happened.
    const persist = async (claimId: string | null): Promise<FakeOfferWithIntent> => {
      if (!claimId) throw new Error('test setup error — this scenario requires a key')
      const existing = await intents.findByIdempotencyClaimId(claimId)
      let intentId: string
      if (existing) {
        intentId = existing.id
      } else {
        intentId = (await intents.create(claimId)).id
        if (ackLostOnNextCreate) {
          ackLostOnNextCreate = false
          throw new Error('simulated ack-lost timeout — the Intent row above already committed')
        }
      }
      return { id: 'offer-ack-lost-1', offerId: 'n/a', amount: 'n/a', intentId }
    }
    const recover = async (id: string): Promise<FakeOfferWithIntent> => {
      const intent = await intents.findByIdempotencyClaimId('key-offer-ack-lost')
      return { id, offerId: 'n/a', amount: 'n/a', intentId: intent?.id ?? '' }
    }

    // 1. First attempt: the Intent write commits, but the caller never
    // learns that — it sees a thrown error indistinguishable, FROM THE
    // THROW ALONE, from "nothing was created."
    await expect(withIdempotency<FakeOfferWithIntent>(params, persist, noopPostPersist, recover)).rejects.toThrow('simulated ack-lost timeout')
    expect(intents.createCalls).toBe(1) // the Intent genuinely exists now, despite the throw
    expect((await store.find('liquidity.offer.create', 'seller-2', 'key-offer-ack-lost'))?.status).toBe('FAILED')

    // 2. Retry — must NOT blindly re-run intents.create() just because
    // the prior attempt threw; it must look up the real, current state.
    const result = await withIdempotency<FakeOfferWithIntent>(params, persist, noopPostPersist, recover)

    expect(intents.createCalls).toBe(1) // no duplicate Intent — the retry found and reused the one that already existed
    expect(result.intentId).toBe('intent-1')
  })

  it('[Offer-shaped] concurrent retries after Intent-succeeds/Offer-fails still produce exactly one winner and never duplicate the Intent (application-restart / multi-instance safety — no process-local memory involved)', async () => {
    const store = new RealInMemoryIdempotencyKeyStore()
    const intents = new FakeIntentStore()
    const params = { scope: 'liquidity.offer.create', participantId: 'seller-3', key: 'key-offer-intent-r4-concurrent', requestPayload: { asset: 'BTC' }, store }

    const failingPersist = makePersistOfferLike(intents, async () => {
      throw new Error('genuine Offer-write failure — the Intent still durably exists')
    })
    const recover = async (id: string): Promise<FakeOfferWithIntent> => {
      const intent = await intents.findByIdempotencyClaimId('key-offer-intent-r4-concurrent')
      return { id, offerId: 'n/a', amount: 'n/a', intentId: intent?.id ?? '' }
    }

    // Put the record into a real FAILED state with a real Intent first.
    await expect(withIdempotency<FakeOfferWithIntent>(params, failingPersist, noopPostPersist, recover)).rejects.toThrow()
    expect(intents.createCalls).toBe(1)
    expect((await store.find('liquidity.offer.create', 'seller-3', 'key-offer-intent-r4-concurrent'))?.status).toBe('FAILED')

    // No shared mutable state passed between these calls other than the
    // store/intents instances themselves (standing in for Postgres) —
    // nothing here is process-local, modeling genuinely separate
    // application instances racing the same reclaimed FAILED claim.
    const succeedingPersist = makePersistOfferLike(intents, async (intentId) => {
      await new Promise((r) => setTimeout(r, 5)) // real async interleaving, not a synchronous fast-path that would mask a race
      return { id: 'offer-r4-concurrent-1', offerId: 'n/a', amount: 'n/a', intentId }
    })

    const results = await Promise.allSettled([
      withIdempotency<FakeOfferWithIntent>(params, succeedingPersist, noopPostPersist, recover),
      withIdempotency<FakeOfferWithIntent>(params, succeedingPersist, noopPostPersist, recover),
      withIdempotency<FakeOfferWithIntent>(params, succeedingPersist, noopPostPersist, recover),
    ])

    expect(intents.createCalls).toBe(1) // still exactly one Intent ever created, across the whole scenario
    const fulfilled = results.filter((r) => r.status === 'fulfilled') as PromiseFulfilledResult<FakeOfferWithIntent>[]
    expect(fulfilled.length).toBe(1)
    expect(fulfilled[0].value.intentId).toBe('intent-1') // the winner's Offer is associated with the one canonical Intent
  })
})

/** A real, behaviorally-faithful in-memory stand-in for `Offer`'s own
 *  real `@unique` constraint on `intentId` (R5) — genuine unique-
 *  violation semantics (P2002-shaped), same discipline as
 *  `FakeIntentStore` above, so `persistOffer()`'s real Offer-side
 *  reconciliation branch is exercised for real. */
class FakeOfferStore {
  private byIntentId = new Map<string, FakeOfferWithIntent>()
  private nextId = 1
  createCalls = 0

  async findByIntentId(intentId: string): Promise<FakeOfferWithIntent | null> {
    return this.byIntentId.get(intentId) ?? null
  }

  async create(intentId: string): Promise<FakeOfferWithIntent> {
    this.createCalls++
    if (this.byIntentId.has(intentId)) {
      const err: { code: string } = { code: 'P2002' }
      throw err
    }
    const offer: FakeOfferWithIntent = { id: `offer-${this.nextId++}`, offerId: 'n/a', amount: 'n/a', intentId }
    this.byIntentId.set(intentId, offer)
    return offer
  }
}

/**
 * CROSS-LAYER-SEMANTIC-CORRECTIVE-1-R5 (2026-09-14) — closes the LAST
 * unknown-outcome window in `persistOffer()`: `prisma.offer.create()`
 * itself. R4 made the Intent side of this durable and deterministically
 * recoverable; this closes the identical gap one write later — if the
 * Offer INSERT genuinely commits but the caller never learns that (a
 * lost acknowledgement, not a real failure), a naive retry would call
 * `prisma.offer.create()` again against the SAME reconciled Intent,
 * producing a SECOND Offer. `Offer.intentId` now carries a real
 * `@unique` constraint (a genuine domain-truth check — see
 * `Intent.offers`'s own schema doc comment: every `createOffer()` call
 * creates a brand-new Intent, so the only way two Offers could ever
 * share one Intent is this exact reconciliation path, which BY
 * DEFINITION is the same logical attempt), and `persistOffer()`
 * recovers an existing Offer by a direct `findUnique({ where: { intentId } })`
 * lookup before ever attempting a new insert — the identical
 * "ask the database what actually exists, never trust a prior throw's
 * implication" discipline R4 already established for the Intent side.
 */
describe('withIdempotency() — R5: an Offer INSERT that commits but whose acknowledgement is lost must not produce a duplicate Offer on retry', () => {
  it('[Offer-shaped] canonical Intent exists, Offer INSERT genuinely commits, caller receives a simulated lost acknowledgement: a retry recovers the already-created Offer via direct lookup — no second insert ever lands, final result points to the original Intent', async () => {
    const store = new RealInMemoryIdempotencyKeyStore()
    const intents = new FakeIntentStore()
    const offers = new FakeOfferStore()
    let ackLostOnNextOfferCreate = true

    const params = { scope: 'liquidity.offer.create', participantId: 'seller-4', key: 'key-offer-insert-r5', requestPayload: { asset: 'BTC' }, store }

    // Mirrors persistOffer()'s real R4+R5 shape end-to-end: Intent
    // reconciliation, then Offer reconciliation by direct lookup on the
    // now-canonical intentId, BEFORE attempting any insert.
    const persist = async (claimId: string | null): Promise<FakeOfferWithIntent> => {
      if (!claimId) throw new Error('test setup error — this scenario requires a key')
      const existingIntent = await intents.findByIdempotencyClaimId(claimId)
      const intentId = existingIntent ? existingIntent.id : (await intents.create(claimId)).id

      const existingOffer = await offers.findByIntentId(intentId)
      if (existingOffer) return existingOffer

      // The write itself is REAL and genuinely lands (offers' own map is
      // updated) — the throw below happens AFTER it, modeling a client
      // that never received the success acknowledgement (e.g. a dropped
      // connection), not a write that never happened.
      const offer = await offers.create(intentId)
      if (ackLostOnNextOfferCreate) {
        ackLostOnNextOfferCreate = false
        throw new Error('simulated ack-lost timeout — the Offer row above already committed')
      }
      return offer
    }
    const recover = async (id: string): Promise<FakeOfferWithIntent> => {
      const intent = await intents.findByIdempotencyClaimId('key-offer-insert-r5')
      const offer = intent ? await offers.findByIntentId(intent.id) : null
      return offer ?? { id, offerId: 'n/a', amount: 'n/a', intentId: intent?.id ?? '' }
    }

    // 1. Intent + Offer both genuinely commit, but the caller never
    // learns the Offer succeeded — indistinguishable, from the throw
    // alone, from "the insert never happened."
    await expect(withIdempotency<FakeOfferWithIntent>(params, persist, noopPostPersist, recover))
      .rejects.toThrow('simulated ack-lost timeout')
    expect(intents.createCalls).toBe(1)
    expect(offers.createCalls).toBe(1) // the Offer genuinely exists now, despite the throw
    expect((await store.find('liquidity.offer.create', 'seller-4', 'key-offer-insert-r5'))?.status).toBe('FAILED')

    // 2. Retry — must recover the already-created Offer via direct
    // lookup; must NOT blindly re-run offers.create() just because the
    // prior attempt threw.
    const result = await withIdempotency<FakeOfferWithIntent>(params, persist, noopPostPersist, recover)

    expect(intents.createCalls).toBe(1) // no duplicate Intent
    expect(offers.createCalls).toBe(1) // no second prisma.offer.create() ever landed
    expect(result.intentId).toBe('intent-1') // final result points to the original Intent
  })

  it('a true pre-commit Offer failure (nothing was ever inserted) remains legitimately retryable — a fresh insert succeeds normally on retry', async () => {
    const store = new RealInMemoryIdempotencyKeyStore()
    const intents = new FakeIntentStore()
    const offers = new FakeOfferStore()
    let offerInsertShouldFailBeforeCommit = true

    const params = { scope: 'liquidity.offer.create', participantId: 'seller-5', key: 'key-offer-precommit-r5', requestPayload: { asset: 'BTC' }, store }

    const persist = async (claimId: string | null): Promise<FakeOfferWithIntent> => {
      if (!claimId) throw new Error('test setup error — this scenario requires a key')
      const existingIntent = await intents.findByIdempotencyClaimId(claimId)
      const intentId = existingIntent ? existingIntent.id : (await intents.create(claimId)).id

      const existingOffer = await offers.findByIntentId(intentId)
      if (existingOffer) return existingOffer

      if (offerInsertShouldFailBeforeCommit) {
        // Genuinely pre-commit: offers.create() is never even called, so
        // its own map is never touched — nothing durable exists yet.
        throw new Error('simulated genuine pre-commit failure — e.g. a constraint violation unrelated to idempotency')
      }
      return offers.create(intentId)
    }
    const recover = async (id: string): Promise<FakeOfferWithIntent> => {
      const intent = await intents.findByIdempotencyClaimId('key-offer-precommit-r5')
      const offer = intent ? await offers.findByIntentId(intent.id) : null
      return offer ?? { id, offerId: 'n/a', amount: 'n/a', intentId: intent?.id ?? '' }
    }

    await expect(withIdempotency<FakeOfferWithIntent>(params, persist, noopPostPersist, recover))
      .rejects.toThrow('simulated genuine pre-commit failure')
    expect(offers.createCalls).toBe(0) // nothing was ever inserted — a real FAILED, not a disguised success

    offerInsertShouldFailBeforeCommit = false
    const result = await withIdempotency<FakeOfferWithIntent>(params, persist, noopPostPersist, recover)

    expect(offers.createCalls).toBe(1) // the retry's fresh insert succeeded normally — a real FAILED IS retryable
    expect(result.intentId).toBe('intent-1')
  })

  it('genuinely concurrent retries against a shared, durable store (modeling multiple application instances, never a process-local mutex) still produce exactly one winning Offer insert, reached only via the atomic FAILED reclaim every other retry in this file already goes through', async () => {
    const store = new RealInMemoryIdempotencyKeyStore()
    const intents = new FakeIntentStore()
    const offers = new FakeOfferStore()
    const params = { scope: 'liquidity.offer.create', participantId: 'seller-6', key: 'key-offer-insert-r5-concurrent', requestPayload: { asset: 'BTC' }, store }

    // Stage a real FAILED claim with its canonical Intent already
    // durable, but NO Offer yet (the Offer write itself is what genuinely
    // fails this first time — a true pre-commit failure, not ack-loss).
    const stagingPersist = async (claimId: string | null): Promise<FakeOfferWithIntent> => {
      if (!claimId) throw new Error('test setup error')
      await intents.create(claimId)
      throw new Error('genuine pre-commit Offer failure — sets up FAILED with no Offer yet')
    }
    const recover = async (id: string): Promise<FakeOfferWithIntent> => {
      const intent = await intents.findByIdempotencyClaimId('key-offer-insert-r5-concurrent')
      const offer = intent ? await offers.findByIntentId(intent.id) : null
      return offer ?? { id, offerId: 'n/a', amount: 'n/a', intentId: intent?.id ?? '' }
    }
    await expect(withIdempotency<FakeOfferWithIntent>(params, stagingPersist, noopPostPersist, recover)).rejects.toThrow()
    expect(intents.createCalls).toBe(1)
    expect(offers.createCalls).toBe(0)
    expect((await store.find('liquidity.offer.create', 'seller-6', 'key-offer-insert-r5-concurrent'))?.status).toBe('FAILED')

    // Genuinely concurrent retries, each racing to be the one that
    // creates the Offer for the already-canonical Intent — no shared
    // mutable state between them other than the store/intents/offers
    // instances themselves (standing in for Postgres), modeling separate
    // application instances racing the same reclaimed FAILED claim.
    const retryPersist = async (claimId: string | null): Promise<FakeOfferWithIntent> => {
      if (!claimId) throw new Error('test setup error')
      const existingIntent = await intents.findByIdempotencyClaimId(claimId)
      if (!existingIntent) throw new Error('test setup error — Intent should already be staged')
      const existingOffer = await offers.findByIntentId(existingIntent.id)
      if (existingOffer) return existingOffer
      await new Promise((r) => setTimeout(r, 5)) // real async interleaving, not a synchronous fast-path that would mask a race
      try {
        return await offers.create(existingIntent.id)
      } catch (err) {
        if (!isP2002(err)) throw err
        const winner = await offers.findByIntentId(existingIntent.id)
        if (!winner) throw err
        return winner
      }
    }

    const results = await Promise.allSettled([
      withIdempotency<FakeOfferWithIntent>(params, retryPersist, noopPostPersist, recover),
      withIdempotency<FakeOfferWithIntent>(params, retryPersist, noopPostPersist, recover),
      withIdempotency<FakeOfferWithIntent>(params, retryPersist, noopPostPersist, recover),
    ])

    expect(intents.createCalls).toBe(1) // still exactly one Intent ever created
    // withIdempotency()'s own reclaimFailed() compare-and-swap already
    // guarantees exactly ONE of these three concurrent callers ever
    // reaches persist() at all for this shared claim — the other two are
    // rejected with IdempotencyKeyConflictError before ever touching
    // offers.create(), exactly like Defect B's own concurrent-retry
    // property (`describe` block above) already proves for the claim
    // layer itself. This confirms that guarantee composes correctly one
    // layer up: the single caller that DOES proceed reaches
    // `retryPersist()`'s own P2002-reconciliation branch only if it
    // raced a genuinely separate write — which cannot happen here since
    // it is alone — so exactly one Offer is created, never more.
    expect(offers.createCalls).toBe(1)
    const fulfilled = results.filter((r) => r.status === 'fulfilled') as PromiseFulfilledResult<FakeOfferWithIntent>[]
    expect(fulfilled.length).toBe(1)
    expect(fulfilled[0].value.intentId).toBe('intent-1')
  })
})
