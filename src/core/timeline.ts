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
import type { DurableEvent } from '../common/events/event-store'

export interface TimelineEntry {
  eventType: string
  occurredAt: string
  payload: unknown
  // Not in D5's original interface — added because a Timeline consumer
  // (SocialEngineeringAgent) needs to reference which entry a RiskSignal
  // came from (SocialEngineeringRiskDetectedEvent.sourceEventId).
  eventId: string
}

export interface Timeline {
  correlationId: string
  getEvents(): Promise<TimelineEntry[]>
}

function toTimelineEntry(event: DurableEvent): TimelineEntry {
  return {
    eventId: event.eventId,
    eventType: event.eventName,
    occurredAt: event.publishedAt,
    payload: event.payload,
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
  }
}
