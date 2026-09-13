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

  async markFailed(id: string): Promise<void> {
    for (const row of this.rows.values()) {
      if (row.id === id) { row.status = 'FAILED'; return }
    }
  }
}

interface FakeTrade { id: string; offerId: string; amount: string }

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

    const first = await withIdempotency<FakeTrade>(params, create, recover)
    const second = await withIdempotency<FakeTrade>(params, create, recover)

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

    const firstCall = withIdempotency<FakeTrade>(params, slowCreate, recover)
    await firstCreateStarted.promise // the first call has genuinely claimed the key and is mid-flight

    await expect(withIdempotency<FakeTrade>(params, slowCreate, recover)).rejects.toBeInstanceOf(IdempotencyKeyConflictError)

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
      withIdempotency<FakeTrade>(params, create, recover),
      withIdempotency<FakeTrade>(params, create, recover),
      withIdempotency<FakeTrade>(params, create, recover),
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

    const a = await withIdempotency<FakeTrade>({ scope: 'openp2p.trade.create', participantId: 'buyer-1', key: undefined, requestPayload: {}, store }, create, recover)
    const b = await withIdempotency<FakeTrade>({ scope: 'openp2p.trade.create', participantId: 'buyer-1', key: undefined, requestPayload: {}, store }, create, recover)

    expect(createCalls).toBe(2) // no idempotency requested — today's exact behavior, unchanged
    expect(a.id).not.toBe(b.id)
  })

  it('a genuinely new logical request (different key) is never blocked by an unrelated prior claim', async () => {
    const store = new RealInMemoryIdempotencyKeyStore()
    let createCalls = 0
    const create = async () => { createCalls++; return { id: `trade-${createCalls}`, offerId: 'offer-1', amount: '10' } }
    const recover = async (id: string) => ({ id, offerId: 'offer-1', amount: '10' })

    await withIdempotency<FakeTrade>({ scope: 'openp2p.trade.create', participantId: 'buyer-1', key: 'key-e1', requestPayload: { a: 1 }, store }, create, recover)
    await withIdempotency<FakeTrade>({ scope: 'openp2p.trade.create', participantId: 'buyer-1', key: 'key-e2', requestPayload: { a: 2 }, store }, create, recover)

    expect(createCalls).toBe(2)
  })

  it('the same key reused for a DIFFERENT logical request (different payload hash) is rejected as a client error, never silently replayed or silently allowed', async () => {
    const store = new RealInMemoryIdempotencyKeyStore()
    const params1 = { scope: 'openp2p.trade.create', participantId: 'buyer-1', key: 'key-f', requestPayload: { offerId: 'offer-1', amount: '10' }, store }
    const params2 = { scope: 'openp2p.trade.create', participantId: 'buyer-1', key: 'key-f', requestPayload: { offerId: 'offer-2', amount: '99' }, store }
    const create = async () => ({ id: 'trade-5', offerId: 'offer-1', amount: '10' })
    const recover = async (id: string) => ({ id, offerId: 'offer-1', amount: '10' })

    await withIdempotency<FakeTrade>(params1, create, recover)
    await expect(withIdempotency<FakeTrade>(params2, create, recover)).rejects.toBeInstanceOf(ValidationError)
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

    await expect(withIdempotency<FakeTrade>(params, create, recover)).rejects.toThrow('simulated transient failure')
    const result = await withIdempotency<FakeTrade>(params, create, recover)

    expect(attempt).toBe(2) // the retry actually executed — a FAILED claim never permanently blocks a genuine retry
    expect(result.id).toBe('offer-1')
  })

  it('scope + participantId isolation — the SAME key for a DIFFERENT participant is a completely independent claim', async () => {
    const store = new RealInMemoryIdempotencyKeyStore()
    let createCalls = 0
    const create = async () => { createCalls++; return { id: `trade-${createCalls}`, offerId: 'offer-1', amount: '10' } }
    const recover = async (id: string) => ({ id, offerId: 'offer-1', amount: '10' })

    await withIdempotency<FakeTrade>({ scope: 'openp2p.trade.create', participantId: 'buyer-1', key: 'shared-key', requestPayload: { x: 1 }, store }, create, recover)
    await withIdempotency<FakeTrade>({ scope: 'openp2p.trade.create', participantId: 'buyer-2', key: 'shared-key', requestPayload: { x: 1 }, store }, create, recover)

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
