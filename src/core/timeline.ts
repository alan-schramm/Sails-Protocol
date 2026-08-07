/**
 * Timeline — Sails Protocol Core read-model
 * RFC-007 D5 (rfcs/RFC-007-real-world-p2p-requirements.md), made real by
 * RFC-017 (rfcs/RFC-017-timeline-and-social-engineering-agent.md).
 *
 * D5's own interface names the id `intentId` — a per-Intent projection.
 * That's the aspirational shape once Intent persistence fully replaces
 * today's Trade-based flow (event-store.ts's own DurableEvent doc comment
 * already anticipates this: "Once Intent persistence ships, this becomes
 * intentId... without changing this field's name or type"). Today, the
 * events a Social Engineering Agent actually needs to see — chat
 * messages, escrow status changes, negotiation events — all carry
 * `tradeId` as their correlationId (RFC-010), not `intentId`; only
 * `core/intent-engine.ts`'s own narrow Intent-lifecycle events use
 * `intentId`. Building Timeline strictly around `intentId` today would
 * make it correct per the RFC's literal words and useless for D7's
 * actual purpose. This implementation is honest about that: it queries
 * by `correlationId` (whatever id a given event stream actually uses),
 * and callers pass `tradeId` for OpenP2P trades — the real, useful case
 * today. No code change will be needed when Intent-to-Trade correlation
 * exists and `intentId` becomes the natural correlationId to pass instead.
 */
import { eventBus } from '../common/events/event-bus'
import { GENESIS_HASH, computeEntryHash, type DurableEvent } from '../common/events/event-store'

export interface TimelineEntry {
  eventType: string
  occurredAt: string
  payload: unknown
  // Not in D5's original interface — added because a Timeline consumer
  // (SocialEngineeringAgent) needs to reference which entry a RiskSignal
  // came from (SocialEngineeringRiskDetectedEvent.sourceEventId).
  eventId: string
  // RFC-008 D2, closed 2026-08-04 — computed once, at write time, by
  // EventStore.publish() (event-store.ts's own header comment on
  // DurableEvent has the full rationale for why this chains DurableEvent
  // rather than EscrowEvent/ReputationEvent as the RFC's original text
  // assumed). Read-only here: getEvents() surfaces the already-computed
  // hashes, it never (re)computes them.
  entryHash: string
  prevHash: string
}

export interface Timeline {
  correlationId: string
  getEvents(): Promise<TimelineEntry[]>
  // RFC-008 D2 — walks the chain and reports the first broken link
  // (an inserted, reordered, or deleted entry) rather than a bare
  // yes/no, so a Dispute UI or ArbitrationProvider can point at exactly
  // where tampering occurred.
  verifyChain(): Promise<{ valid: boolean; brokenAtIndex?: number }>
}

function toTimelineEntry(event: DurableEvent): TimelineEntry {
  return {
    eventId: event.eventId,
    eventType: event.eventName,
    occurredAt: event.publishedAt,
    payload: event.payload,
    entryHash: event.entryHash,
    prevHash: event.prevHash,
  }
}

// Factory, not a class a caller `new`s directly — Timeline has no state
// of its own beyond the id it was asked about; this mirrors D5's own
// "Core-level query surface, not a new domain object participants act
// on" framing.
export function getTimeline(correlationId: string): Timeline {
  return {
    correlationId,
    async getEvents(): Promise<TimelineEntry[]> {
      const events = await eventBus.getEvents(correlationId)
      return events.map(toTimelineEntry)
    },
    async verifyChain(): Promise<{ valid: boolean; brokenAtIndex?: number }> {
      const events = await eventBus.getEvents(correlationId)
      let expectedPrevHash = GENESIS_HASH
      for (let i = 0; i < events.length; i++) {
        const event = events[i]
        // Two independent checks, both required: (1) this entry's own
        // prevHash must match the running chain (catches reordering,
        // insertion, or deletion of whole entries), and (2) recomputing
        // entryHash from the entry's own stored (eventName, publishedAt,
        // payload, prevHash) must match what's stored (catches an entry
        // mutated in place, whose prevHash link is still intact but whose
        // payload no longer matches the hash computed for it at write
        // time — check (1) alone would miss this entirely).
        const recomputed = computeEntryHash(event.eventName, event.publishedAt, event.payload, event.prevHash)
        if (event.prevHash !== expectedPrevHash || event.entryHash !== recomputed) {
          return { valid: false, brokenAtIndex: i }
        }
        expectedPrevHash = event.entryHash
      }
      return { valid: true }
    },
  }
}
