import { EventEmitter } from 'events'
import { randomUUID as uuidv4 } from 'crypto'
import type { SailsEventName, SailsEventMap } from './event-bus'

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
    const event: DurableEvent<K> = {
      eventId: uuidv4(),
      eventName,
      correlationId,
      payload,
      publishedAt: new Date().toISOString(),
    }
    if (process.env.NODE_ENV === 'development') {
      console.log(`[EventStore:in-memory] ${eventName} correlationId=${correlationId}`, JSON.stringify(payload))
    }
    const existing = this.byCorrelationId.get(correlationId)
    if (existing) existing.push(event)
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
          console.error(`[EventStore:in-memory] handler error on "${eventName}" (eventId=${event.eventId}):`, err)
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

// ─── Redis Streams — designed, NOT wired as the default (RFC-010 Reference
// Implementation Plan). Deliberately throws rather than shipping unverified
// command sequences as if tested — no live Redis was available to verify
// XADD/XGROUP/XREADGROUP/XACK/XCLAIM semantics against, matching how
// LightningHodlProvider/LiquidCovenantProvider (escrow.service.ts) throw
// "not yet implemented" instead of faking a working provider. The shape
// below is the real target: same EventStore interface, so adopting it is a
// one-line swap (`new SailsEventBus(new RedisStreamsEventStore(redis))`),
// not a call-site rewrite. Missing before this can be enabled: XCLAIM-based
// recovery of messages whose consumer crashed mid-handler (currently a
// failed handler just leaves the message pending, unacked, undelivered
// again until a claim mechanism exists), and integration-testing against a
// real Redis instance. ────────────────────────────────────────────────────
export class RedisStreamsEventStore implements EventStore {
  readonly storeName = 'redis-streams'
  readonly durable = true

  async publish<K extends SailsEventName>(
    _eventName: K,
    _payload: SailsEventMap[K],
    _correlationId: string
  ): Promise<void> {
    throw new Error(
      'RedisStreamsEventStore not yet implemented — see RFC-010 §Reference Implementation Plan ' +
      '(rfcs/RFC-010-durable-event-store.md) for the XADD/XGROUP/XREADGROUP/XACK design. ' +
      'Use InMemoryEventStore (the default) until this is built and verified against a live Redis instance.'
    )
  }

  subscribe<K extends SailsEventName>(
    _eventName: K,
    _handler: (event: DurableEvent<K>) => void | Promise<void>
  ): void {
    throw new Error(
      'RedisStreamsEventStore not yet implemented — see RFC-010 §Reference Implementation Plan ' +
      '(rfcs/RFC-010-durable-event-store.md).'
    )
  }

  async getEvents(_correlationId: string): Promise<DurableEvent[]> {
    throw new Error(
      'RedisStreamsEventStore not yet implemented — see RFC-010 §Reference Implementation Plan ' +
      '(rfcs/RFC-010-durable-event-store.md). getEvents() would use XRANGE per correlationId-keyed ' +
      'stream, or a secondary index if events stay in one shared stream — undecided, same "designed, ' +
      'not verified against live Redis" status as publish()/subscribe() above.'
    )
  }
}
