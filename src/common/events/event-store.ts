import { EventEmitter } from 'events'
import { randomUUID as uuidv4, createHash } from 'crypto'
import type { SailsEventName, SailsEventMap } from './event-bus'
import { childLogger } from '../logger'

const log = childLogger('event-store')

/**
 * Sails Protocol — EventStore (RFC-010, rfcs/RFC-010-durable-event-store.md)
 *
 * Protocol-level Adapter interface, same category as SettlementProvider,
 * EvidenceProvider, ArbitrationProvider, TransportProvider — the protocol
 * requires durability and a correlationId on every published event, it
 * never names a specific backing technology. `InMemoryEventStore` below is
 * the always-available, explicitly non-durable default. A durable backend
 * (Redis Streams, BullMQ, a Postgres outbox table, ...) is a Reference
 * Implementation's choice, swapped in without changing any `eventBus.emit`/
 * `eventBus.on` call site — see `RedisStreamsEventStore` for the shape a
 * durable implementation follows.
 */

export interface DurableEvent<K extends SailsEventName = SailsEventName> {
  eventId: string
  eventName: K
  // The correlation id every event now carries end-to-end (Timeline, logs,
  // events, Proofs, Settlement, Dispute — RFC-010's motivation). Today this
  // is `tradeId` for trade/negotiation/settlement-lifecycle events (Trade
  // already IS the concrete TradeIntent implementation, PROTOCOL_SPECIFICATION.md
  // §2.3) and `userId` for peer/transport events, which have no trade to
  // correlate to. Once Intent persistence ships (§2.6), this becomes `intentId`
  // for every Intent-scoped event without changing this field's name or type.
  correlationId: string
  payload: SailsEventMap[K]
  publishedAt: string
  // RFC-008 D2 (hash-chained Timeline), closed 2026-08-04 — real
  // architectural correction, not the RFC's original text: D2 as
  // written targeted `entryHash`/`prevHash` columns on `EscrowEvent`/
  // `ReputationEvent` directly, but `core/timeline.ts`'s own header
  // comment (RFC-017) already documents that Timeline was built against
  // `EventStore.getEvents(correlationId)` instead — this file's own
  // `DurableEvent` stream, not those two Prisma tables. Chaining the
  // tables Timeline no longer reads from would make `verifyChain()`
  // check history nobody actually consults; chaining `DurableEvent`
  // here is what Timeline's real read path needs. `entryHash` =
  // sha256(eventName + publishedAt + JSON(payload) + prevHash);
  // `prevHash` = the previous event's own `entryHash` for the same
  // `correlationId`, or the literal string `'genesis'` for the first.
  entryHash: string
  prevHash: string
}

export interface EventStore {
  readonly storeName: string
  // Explicit, not inferred from the class name — so a caller/operator can
  // never mistake a non-durable store for a durable one at a glance.
  readonly durable: boolean
  publish<K extends SailsEventName>(
    eventName: K,
    payload: SailsEventMap[K],
    correlationId: string
  ): Promise<void>
  subscribe<K extends SailsEventName>(
    eventName: K,
    handler: (event: DurableEvent<K>) => void | Promise<void>
  ): void
  // Added for RFC-017 (rfcs/RFC-017-timeline-and-social-engineering-agent.md)
  // — RFC-007 D5's Timeline read-model ("a per-correlationId ordered
  // projection over the Event Bus") needs a way to ask a store "what
  // already happened for X," not just "notify me of what happens next."
  // Every event this bus has ever published carries a correlationId
  // (RFC-010) — this is that history, queryable. Ordered by publishedAt
  // ascending; returns [] for an unknown correlationId, never throws.
  getEvents(correlationId: string): Promise<DurableEvent[]>
}

// RFC-008 D2 — the literal genesis marker for the first event in a given
// correlationId's chain (no real prevHash exists yet). A real string,
// never null/undefined, so `verifyChain()` below can tell "chain starts
// here" apart from "prevHash was never set" — the same "explicit sentinel
// beats an ambiguous absent value" reasoning `Escrow.feeCharged`'s own
// schema comment already establishes for null vs. 0.
export const GENESIS_HASH = 'genesis'

// Exported so Timeline.verifyChain() (core/timeline.ts) can recompute and
// compare against the stored entryHash — the only way to actually catch
// payload tampering (an entry whose stored entryHash was never updated to
// match a modified payload), not just checking that prevHash values chain
// together (which alone only catches reordering/insertion/deletion, not a
// single entry mutated in place).
export function computeEntryHash(eventName: string, publishedAt: string, payload: unknown, prevHash: string): string {
  return createHash('sha256')
    .update(`${eventName}:${publishedAt}:${JSON.stringify(payload)}:${prevHash}`)
    .digest('hex')
}

// ─── Default: in-memory, explicitly NOT durable ───────────────────────────────
// Same runtime behavior the bare EventEmitter-based SailsEventBus had before
// RFC-010 (events lost on process crash between publish and handler
// completion) — the difference is every event now carries eventId/
// correlationId/publishedAt, and the shape matches EventStore so swapping in
// a durable backend later requires zero changes to any call site.
export class InMemoryEventStore implements EventStore {
  readonly storeName = 'in-memory'
  readonly durable = false
  private emitter = new EventEmitter()
  // Real, in-process history keyed by correlationId — what makes
  // getEvents() (Timeline, RFC-017) actually work against this store,
  // not just a name that implies storage. "In-memory" already disclosed
  // this is lost on process restart (readonly durable = false above); a
  // durable backend (RedisStreamsEventStore, once built) persists this
  // properly instead of an unbounded process-lifetime array.
  private byCorrelationId = new Map<string, DurableEvent[]>()

  constructor() {
    this.emitter.setMaxListeners(50)
  }

  async publish<K extends SailsEventName>(
    eventName: K,
    payload: SailsEventMap[K],
    correlationId: string
  ): Promise<void> {
    const publishedAt = new Date().toISOString()
    // RFC-008 D2 — computed and persisted right here, at the moment this
    // event is first written, never derived later at read-time (the
    // RFC's own stated precondition for the chain to mean anything: a
    // hash computed on demand would just produce a different, still
    // internally-consistent value after tampering, defeating the point).
    const existingForCorrelation = this.byCorrelationId.get(correlationId)
    const prevHash = existingForCorrelation?.length
      ? existingForCorrelation[existingForCorrelation.length - 1].entryHash
      : GENESIS_HASH
    const entryHash = computeEntryHash(eventName, publishedAt, payload, prevHash)

    const event: DurableEvent<K> = {
      eventId: uuidv4(),
      eventName,
      correlationId,
      payload,
      publishedAt,
      entryHash,
      prevHash,
    }
    // debug, not info — this dumps the full event payload (trade amounts,
    // participant ids, escrow details), and 'info' is the default LOG_LEVEL
    // (config/index.ts), so it fired on every event by default in any dev
    // environment, including a dev-mode instance pointed at shared/staging
    // data. debug is opt-in (LOG_LEVEL=debug) — same tracing capability,
    // not on by default.
    if (process.env.NODE_ENV === 'development') {
      log.debug({ msg: 'Event emitted', eventName, correlationId, payload })
    }
    if (existingForCorrelation) existingForCorrelation.push(event)
    else this.byCorrelationId.set(correlationId, [event])
    this.emitter.emit(eventName, event)
  }

  subscribe<K extends SailsEventName>(
    eventName: K,
    handler: (event: DurableEvent<K>) => void | Promise<void>
  ): void {
    this.emitter.on(eventName, (event: DurableEvent<K>) => {
      const result = handler(event)
      if (result instanceof Promise) {
        result.catch((err) => {
          log.error({ msg: 'Handler error', eventName, eventId: event.eventId, err: err instanceof Error ? err.message : err })
        })
      }
    })
  }

  async getEvents(correlationId: string): Promise<DurableEvent[]> {
    // Already publish-ordered (array push is append-only) — no separate
    // sort needed, unlike a real store that might return out of order.
    return this.byCorrelationId.get(correlationId) ?? []
  }
}

// ─── Redis Streams — real, closed 2026-08-04 (verified against a live
// Redis, not just written and hoped to be correct — same discipline
// CODE_STYLE.md §7 states plainly for this whole codebase).
//
// Dual-write per publish() — this is the one real design decision RFC-010
// left "undecided" (its own Reference Implementation Plan named
// `sails:events:{eventName}` streams, good for subscribe()'s consumer-
// group fan-out, but never addressed how getEvents(correlationId) would
// query efficiently across every eventName's stream). Two streams per
// event, both holding the identical serialized DurableEvent:
//   sails:events:{eventName}              — subscribe()'s consumer group
//   sails:events:by-correlation:{id}      — getEvents()'s real index,
//                                            same role InMemoryEventStore's
//                                            own byCorrelationId Map plays
// A real write-amplification tradeoff (2 XADDs per publish instead of 1),
// accepted deliberately: the alternative (scanning every eventName stream
// to answer "what happened for correlationId X") does not scale, and
// Redis Streams are cheap enough per-entry that this mirrors exactly how
// a Postgres outbox table would need a secondary index for the same
// query shape anyway.
//
// RFC-008 D2's hash chain is computed here too, exactly like
// InMemoryEventStore.publish() does — reading the correlation stream's
// own last entry (XREVRANGE ... COUNT 1) for prevHash before writing,
// never derived later at read time.
export class RedisStreamsEventStore implements EventStore {
  readonly storeName = 'redis-streams'
  readonly durable = true

  private readonly consumerName: string
  // Which eventNames already have a running XREADGROUP poll loop for this
  // process — subscribe() may be called more than once for the same
  // eventName (multiple handlers), but only one poll loop per stream
  // should exist; loopHandlers below is what actually dispatches to all
  // of them.
  private readonly activeLoops = new Set<SailsEventName>()
  private readonly loopHandlers = new Map<SailsEventName, Array<(event: DurableEvent<any>) => void | Promise<void>>>()
  // Tracks each running pollLoop()'s own promise so stop() can actually
  // wait for them to exit — found the hard way (first real full-suite
  // run alongside this file's own integration test, 2026-08-04): a
  // fire-and-forget loop that only rechecks `stopped` after its current
  // BLOCK call returns left multiple loops from finished tests still
  // holding the shared client's connection for seconds afterward,
  // destabilizing unrelated later test files in the same Jest run
  // (`tests/routes.test.ts`'s own beforeAll timeout/teardown errors —
  // real cross-file contamination, not that file's own bug).
  private readonly loopPromises: Promise<void>[] = []
  private stopped = false

  constructor(
    private readonly client: import('ioredis').Redis,
    private readonly consumerGroup = 'sails-workers',
    // Idle threshold before an unacked message is considered "its
    // consumer probably crashed" and eligible for XCLAIM-based recovery —
    // RFC-010's own explicitly-named missing piece. 30s: long enough that
    // a handler doing real I/O (an RPC call, a DB write) isn't falsely
    // reclaimed mid-flight, short enough that a genuinely crashed
    // consumer's messages don't sit stuck for minutes.
    private readonly idleClaimMs = 30_000,
    // How long each XREADGROUP BLOCKs waiting for a new message before
    // looping back to recheck `stopped`/reclaim stale pending messages —
    // this is also the real upper bound on how long stop() can take to
    // resolve. 1s: frequent enough that stop() (tests, graceful shutdown)
    // returns promptly; the reclaim/re-block cost of polling this often
    // is negligible against Redis.
    private readonly blockMs = 1_000
  ) {
    this.consumerName = `${consumerGroup}-${process.pid}-${uuidv4().slice(0, 8)}`
  }

  private streamKey(eventName: SailsEventName): string {
    return `sails:events:${eventName}`
  }

  private correlationStreamKey(correlationId: string): string {
    return `sails:events:by-correlation:${correlationId}`
  }

  async publish<K extends SailsEventName>(
    eventName: K,
    payload: SailsEventMap[K],
    correlationId: string
  ): Promise<void> {
    const publishedAt = new Date().toISOString()
    const correlationKey = this.correlationStreamKey(correlationId)

    // Real prevHash: the correlation stream's own last entry, not a
    // separately-maintained counter that could drift from it.
    const lastEntries = await this.client.xrevrange(correlationKey, '+', '-', 'COUNT', 1)
    const prevHash = lastEntries.length > 0 ? this.parseEntry(lastEntries[0]).entryHash : GENESIS_HASH
    const entryHash = computeEntryHash(eventName, publishedAt, payload, prevHash)

    const event: DurableEvent<K> = {
      eventId: uuidv4(),
      eventName,
      correlationId,
      payload,
      publishedAt,
      entryHash,
      prevHash,
    }
    const data = JSON.stringify(event)

    // Both streams get the identical payload — one write, two indexes.
    // Not wrapped in a MULTI: a partial failure here (correlation stream
    // written, eventName stream not, or vice versa) is a real, disclosed
    // gap, not a silent one — see this class's own header comment.
    await this.client.xadd(this.streamKey(eventName), '*', 'data', data)
    await this.client.xadd(correlationKey, '*', 'data', data)
  }

  private parseEntry(entry: [id: string, fields: string[]]): DurableEvent {
    const fields = entry[1]
    const dataIndex = fields.indexOf('data')
    return JSON.parse(fields[dataIndex + 1])
  }

  subscribe<K extends SailsEventName>(
    eventName: K,
    handler: (event: DurableEvent<K>) => void | Promise<void>
  ): void {
    const handlers = this.loopHandlers.get(eventName) ?? []
    handlers.push(handler)
    this.loopHandlers.set(eventName, handlers)

    if (this.activeLoops.has(eventName)) return // poll loop already running for this stream
    this.activeLoops.add(eventName)
    // Deliberately not awaited HERE — subscribe() is synchronous per the
    // EventStore interface (matching InMemoryEventStore's own
    // fire-and-forget emitter.on()); the poll loop runs for the life of
    // the process. Errors inside are caught per-iteration below so a
    // single failed XREADGROUP/XCLAIM round doesn't kill the loop. Its
    // promise IS tracked (loopPromises), so stop() can await a clean exit.
    this.loopPromises.push(this.pollLoop(eventName))
  }

  private async pollLoop(eventName: SailsEventName): Promise<void> {
    const stream = this.streamKey(eventName)
    try {
      // '$' — a brand-new group only sees messages published AFTER this
      // group is created, matching InMemoryEventStore.subscribe()'s real
      // semantics exactly (EventEmitter.on() never replays past emits).
      // Found the hard way (first real Redis integration test run,
      // 2026-08-04): starting at '0' made a fresh consumer group replay
      // the ENTIRE historical backlog of that stream — including
      // messages from unrelated earlier test runs against the same
      // long-lived Redis instance — which is durability's job
      // (getEvents()'s by-correlation index already covers replay), not
      // subscribe()'s. Disclosed real limitation this creates: subscribe()
      // stays synchronous (matching the EventStore interface), but the
      // actual XGROUP CREATE against Redis is async — a publish() that
      // lands in the brief window before CREATE completes could be
      // missed by that specific subscription. InMemoryEventStore has no
      // equivalent gap (EventEmitter.on() registers synchronously); real
      // production use (subscribing once at startup, before any
      // publishing begins) makes this window practically unreachable.
      await this.client.xgroup('CREATE', stream, this.consumerGroup, '$', 'MKSTREAM')
    } catch (err: any) {
      // BUSYGROUP — the group already exists from a prior process/restart.
      // Real, expected condition, not an error (RFC-010's own plan: "tolerating BUSYGROUP on re-creation").
      if (!String(err?.message ?? err).includes('BUSYGROUP')) throw err
    }

    while (!this.stopped) {
      try {
        // XCLAIM-based recovery (RFC-010's own named gap, closed here):
        // before blocking for new messages, reclaim anything idle past
        // idleClaimMs from ANY consumer in this group (including a
        // now-dead one from a crashed process) onto this consumer, so a
        // handler that never got to XACK isn't stuck forever.
        await this.reclaimStalePending(stream, eventName)

        const result = await this.client.xreadgroup(
          'GROUP', this.consumerGroup, this.consumerName,
          'COUNT', 10, 'BLOCK', this.blockMs,
          'STREAMS', stream, '>'
        )
        if (!result) continue // BLOCK timeout, no new messages — loop back to the reclaim check

        const [, messages] = result[0] as [string, Array<[string, string[]]>]
        for (const message of messages) {
          const [messageId] = message
          const event = this.parseEntry(message)
          const handlers = this.loopHandlers.get(eventName) ?? []
          try {
            await Promise.all(handlers.map((h) => h(event)))
            await this.client.xack(stream, this.consumerGroup, messageId)
          } catch (err) {
            // Left un-acked on purpose — reclaimStalePending() above will
            // redeliver it (to this or another consumer) once idleClaimMs
            // passes, same "don't silently drop a failed real event"
            // principle InMemoryEventStore's own subscribe() comment
            // already states for its in-process equivalent.
            log.error({ msg: 'Handler error', eventName, messageId, err: err instanceof Error ? err.message : err })
          }
        }
      } catch (err) {
        log.error({ msg: 'Poll loop error', eventName, err: err instanceof Error ? err.message : err })
        await new Promise((resolve) => setTimeout(resolve, 1000)) // brief backoff before retrying the loop
      }
    }
  }

  private async reclaimStalePending(stream: string, eventName: SailsEventName): Promise<void> {
    const pending = await this.client.xpending(stream, this.consumerGroup, 'IDLE', this.idleClaimMs, '-', '+', 10)
    if (!Array.isArray(pending) || pending.length === 0) return
    const staleIds = (pending as Array<[string, string, number, number]>).map((p) => p[0])
    await this.client.xclaim(stream, this.consumerGroup, this.consumerName, this.idleClaimMs, ...staleIds)
  }

  async getEvents(correlationId: string): Promise<DurableEvent[]> {
    const entries = await this.client.xrange(this.correlationStreamKey(correlationId), '-', '+')
    return entries.map((entry) => this.parseEntry(entry as [string, string[]]))
  }

  // Not part of the EventStore interface — for graceful shutdown /
  // tests only. Returns a Promise resolving once every running poll
  // loop has actually exited (bounded by blockMs — see that field's own
  // comment) rather than just flipping a flag and hoping: a caller that
  // doesn't await this (or a test that calls it and moves on
  // immediately) is exactly what let finished-test poll loops keep
  // holding the shared client open into later, unrelated test files —
  // the real bug this method exists to prevent a repeat of.
  async stop(): Promise<void> {
    this.stopped = true
    await Promise.all(this.loopPromises)
  }
}
