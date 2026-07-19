# RFC-017: Real Timeline Read-Model and Social Engineering Agent

## Summary

Implements RFC-007's D5 (Timeline) and D7 (Social Engineering Agent) for
real — both were fully specified in RFC-007 but never built;
`docs/BACKLOG.md` marked both "🔲 Not started" until this pass. D5
becomes a real, queryable read-model (`EventStore.getEvents()`,
`core/timeline.ts`), corrected from its literal `intentId`-keyed
interface to a `correlationId`-keyed one that matches what `DurableEvent`
(RFC-010) actually carries today — see Motivation and Decision §1. D7
becomes a real `SocialEngineeringAgent` (`social-engineering-agent.ts`)
that calls QVAC to detect two of its three named patterns
(`off_channel_migration`, `payment_instruction_change`) from real chat
messages, wired to raise a `RISK_WARNING` in the trade's chat when it
fires. Both new capabilities are off by default
(`config.features.socialEngineeringDetection`) and detect-only — neither
blocks, delays, nor alters a trade.

**Status:** Accepted. Triggered by the project owner asking directly how
QVAC orients users against scams, receiving an honest "not built, here's
exactly what's specified vs. what exists" status report, and then
choosing "build the real Social Engineering Agent" over the lighter
alternatives offered (a static UI-only tips layer, or leaving it
documented only). Bypasses the Discussion window (`GOVERNANCE.md` §5),
the same precedent RFC-007/RFC-015/RFC-016 already used for
owner-directed RFCs.

## Motivation

RFC-007 D7 fully specifies a `SocialEngineeringAgent` that watches a
Timeline for fraud-precursor patterns and raises a `RiskSignal` — real,
useful design, never implemented. Two real gaps existed before this
RFC, one in the spec's own literal wording, one in the missing
implementation:

1. **D5's Timeline interface names its id `intentId`,** but no event a
   Social Engineering Agent would actually need to see — chat messages,
   escrow status changes, negotiation events — carries `intentId` as its
   correlationId (RFC-010) in this codebase today. Only
   `core/intent-engine.ts`'s own narrow Intent-lifecycle events do
   (`event-store.ts`'s own `DurableEvent.correlationId` doc comment
   already discloses this: "today this is `tradeId` for trade/
   negotiation/settlement-lifecycle events... intentId for every
   Intent-scoped event" — once Intent persistence fully replaces the
   Trade-based flow). Building D5 strictly around `intentId` today would
   be correct per the RFC's literal words and functionally useless for
   D7's actual purpose: a Social Engineering Agent that can only see
   `intent.created`/`intent.validated`/... events never sees a single
   chat message. Checked before writing any code (Decision §1), not
   assumed.
2. **`EventStore` (RFC-010) never grew a query capability.** Its
   interface was `publish`/`subscribe` only — a store you can tell
   things to and get notified by, never one you can ask "what already
   happened for X." `InMemoryEventStore`'s own name implied storage it
   never actually did (published events were forwarded to an
   `EventEmitter` and then gone). D5's `Timeline.getEvents()` needs
   exactly the query capability that was missing.

## Alternatives Considered

1. **Build Timeline strictly as D5 specifies, keyed by `intentId`.**
   Rejected — see Motivation #1. Would ship a Timeline that returns
   real, correct results and is useless for the one consumer (D7) it
   exists to serve, since Intent and Trade are not yet correlated in
   this codebase.
2. **Wait for Intent-to-Trade correlation to exist first, defer this
   whole RFC.** Rejected — explicitly not what the project owner asked
   for, and the correlationId-generic design in Decision §1 means no
   code changes when that correlation eventually exists; `tradeId` today
   and `intentId` later both flow through the same `getEvents(correlationId)`
   call, unchanged.
3. **A lighter, UI-only static tips layer instead of a real detector**
   (offered as an option, not chosen): warning banners with generic scam
   advice, no QVAC, no Timeline, no backend change. Rejected by the
   project owner's own choice — "Construir o Social Engineering Agent de
   verdade" (build the real Social Engineering Agent).
4. **Wire `RiskSignal` into the Policy Engine's governed-policy interface
   (`get`/`propose`/`activate`, `core/policy-engine.ts`)**, matching D7's
   own "riskScore feeds the Policy Engine" framing literally. Rejected
   for this pass — that interface is, and remains, a stub (`throw new
   Error('Not yet implemented')`); building it for real is a materially
   larger, separate scope (a Prisma-backed policy store, versioning,
   activation) not warranted here. Instead, a detected signal is
   re-emitted as a real event
   (`agents.social_engineering.risk_detected`) and surfaced today as a
   chat `RISK_WARNING` — a real, visible, human-facing consumer that
   doesn't require the Policy Engine stub to be finished first. Wiring
   into a real Policy Engine later is additive: the event already
   exists for it to subscribe to.
5. **Detect all three of D7's named patterns
   (`off_channel_migration`/`payment_instruction_change`/
   `unexpected_flow_deviation`) in this pass.** Rejected for
   `unexpected_flow_deviation` specifically — the first two are readable
   from message text alone, which QVAC can classify the same way
   `assessIntentRisk()` already does. Flow deviation needs real
   awareness of what's "expected" for a given trade's current state (a
   state-machine-aware component, not a per-message text classifier) —
   meaningfully larger scope, named explicitly as not built rather than
   faked with a pattern QVAC can't actually detect from a single message.
6. **Change `SailsEventBus.on()`'s handler signature to pass the full
   `DurableEvent`, so `SocialEngineeringAgent.evaluate()` could use the
   existing `on()` call sites.** Rejected — would touch every handler in
   `common/events/handlers.ts`, all of which only need the bare payload
   today. Added `onDurable()` instead, purely additive, so every
   existing `eventBus.on(...)` call site in this codebase stays
   untouched (Decision §3).

## Decision

**1. `Timeline` is `correlationId`-keyed, not `intentId`-keyed** —
`core/timeline.ts`:

```typescript
export interface TimelineEntry {
  eventType: string
  occurredAt: string
  payload: unknown
  eventId: string   // not in D5's original interface — needed so a
                     // RiskSignal can reference which entry produced it
}
export interface Timeline {
  correlationId: string
  getEvents(): Promise<TimelineEntry[]>
}
export function getTimeline(correlationId: string): Timeline
```

Callers pass `tradeId` for OpenP2P trades today — the real, useful case.
No code changes needed when Intent-to-Trade correlation exists and
`intentId` becomes the natural id to pass instead; `getTimeline()`
doesn't know or care which kind of id it was given.

**2. `EventStore` gains `getEvents(correlationId): Promise<DurableEvent[]>`**
(`common/events/event-store.ts`) — real in `InMemoryEventStore` (a
`Map<correlationId, DurableEvent[]>`, appended to on every `publish()`,
ordered by publish order already); throws in `RedisStreamsEventStore`,
matching that class's existing "designed, not verified against live
Redis" status for `publish()`/`subscribe()`. `SailsEventBus.getEvents()`
is a thin passthrough.

**3. `SailsEventBus.onDurable()`** (additive, `event-bus.ts`) — gives a
handler the full `DurableEvent` (`eventId`, `publishedAt`) instead of
`on()`'s bare payload. The only consumer today is
`common/events/handlers.ts`'s new `openp2p.message.sent` reaction
(Decision §5), which needs those fields to build a real `TimelineEntry`.

**4. `SocialEngineeringAgent`** (`social-engineering-agent.ts`) — D7's
own interface, unchanged:

```typescript
class SocialEngineeringAgent {
  async evaluate(event: TimelineEntry): Promise<RiskSignal | null>
}
```

A cheap pre-filter runs first: only `openp2p.message.sent` events with
non-empty `content` ever reach QVAC (an escrow/status-change event, or
an empty-content media message from the chat's image/video attach
feature, returns `null` immediately — neither detectable pattern can be
read from anything but message text). For a real candidate, it pulls up
to 5 prior messages from that trade's own `Timeline` as conversational
context, then calls `qvacAgentProvider.assessSocialEngineeringRisk()`
(new method, same `structuredCompletion()` helper and
schema-constrained-JSON pattern `assessIntentRisk()`/
`generateTradeIntent()` already use) to classify the message as
`off_channel_migration`, `payment_instruction_change`, or `none`.

**5. Wiring** (`common/events/handlers.ts`) — a new
`eventBus.onDurable('openp2p.message.sent', ...)` reaction, gated behind
`config.features.socialEngineeringDetection` (default `false`, checked
*before* anything else runs). `social-engineering-agent.ts` is required
lazily inside the handler, after that flag check — it transitively
imports the real `@qvac/sdk` (ESM-only), which every test importing
`app.ts` would otherwise need to mock even if it never touches this
feature (see `tests/walletAgents.test.ts`'s own `jest.mock('@qvac/sdk',
...)` for why that pattern exists). A non-null signal is re-emitted as
`agents.social_engineering.risk_detected` (correlationId = tradeId);
`chat.routes.ts` (alongside its existing `TRADE_STATUS_UPDATE`/
`ESCROW_STATUS_UPDATE` broadcasts) reacts to that event and pushes
`RISK_WARNING` to the trade's WS room. A detection failure is caught and
logged, never thrown — the same "must not break the thing it's
watching" philosophy `autoSettleOnMatch`'s handler already follows.

**6. `config.features.socialEngineeringDetection`** (`SOCIAL_ENGINEERING_DETECTION`
env var) — default `false`, same precedent as every other
behavior-changing flag in this codebase (`autoSettleOnMatch`,
`enforceCapabilities`, `requireDualApprovalForRelease`): a real local-LLM
call on every chat message is real latency and real inference cost, not
something a reference deployment should pay for unconditionally.

## Primitives Used or Extended

`Timeline` — Core-level read-model, per D5's own classification (not a
new primitive, see RFC-007's "Primitives Used or Extended" for the full
reasoning). `EventStore.getEvents()` extends the RFC-010 Adapter
interface additively. No Core primitive or protocol event contract
changes shape; `agents.social_engineering.risk_detected` is a new event,
same category as any other module event in `SailsEventMap`.

## Principle Alignment

- **Principle 8 (Privacy Preserving):** detection runs entirely through
  QVAC's on-device inference (`qvacAgentProvider`) — no message content
  ever leaves the process for this analysis, consistent with D7's own
  design and `SECURITY_MODEL.md`'s local-AI guarantee.
- **"The agent detects, it does not act unilaterally"** (D7's own
  words): `SocialEngineeringAgent.evaluate()` returns data, nothing
  else. Every consumer of that data (the event re-emission, the WS
  broadcast) is a human-facing signal, not an automatic trade action —
  no code path in this RFC locks funds, cancels a trade, or blocks a
  message from sending.
- **Honesty about scope**, the same discipline every prior RFC in this
  index follows: `unexpected_flow_deviation` is named as explicitly not
  detected in this pass (Alternatives Considered #5), and Policy Engine
  integration is named as explicitly deferred (Alternatives Considered
  #4) — neither is silently implied as covered by "Social Engineering
  Agent, built."

## Specification

| File | Change |
|---|---|
| `src/common/events/event-store.ts` | `EventStore.getEvents()`; real in `InMemoryEventStore`, throws in `RedisStreamsEventStore` |
| `src/common/events/event-bus.ts` | `SailsEventBus.getEvents()`, `.onDurable()`; new `SocialEngineeringRiskDetectedEvent` + `agents.social_engineering.risk_detected` in `SailsEventMap` |
| `src/core/timeline.ts` (new) | `Timeline`/`TimelineEntry`, `getTimeline(correlationId)` |
| `src/modules/open-agents/qvac-agent.provider.ts` | `assessSocialEngineeringRisk()` — new structured-completion method, `social_engineering_signal` schema |
| `src/modules/open-agents/social-engineering-agent.ts` (new) | `SocialEngineeringAgent.evaluate()` |
| `src/common/events/handlers.ts` | New config-gated `openp2p.message.sent` → `SocialEngineeringAgent.evaluate()` → `agents.social_engineering.risk_detected` reaction |
| `src/modules/open-p2p/chat.routes.ts` | New `agents.social_engineering.risk_detected` → `RISK_WARNING` WS broadcast registration |
| `src/config/index.ts` | `features.socialEngineeringDetection` |
| `tests/timeline.test.ts` (new) | Real `InMemoryEventStore`/`Timeline` integration tests — no mocking needed |
| `tests/socialEngineeringAgent.test.ts` (new) | `SocialEngineeringAgent.evaluate()`, QVAC mocked per `tests/walletAgents.test.ts`'s established pattern |
| `tests/socialEngineeringDetection.test.ts` (new) | Handler wiring, config-gated, matching `tests/autoSettleHandler.test.ts`'s pattern |
| `tests/routes.test.ts`, `rateLimit.test.ts`, `autoSettleHandler.test.ts`, `reputationOutcome.test.ts`, `chatUnification.test.ts` | Added `onDurable: jest.fn()` to each file's own `event-bus` mock — `registerEventHandlers()` now calls it unconditionally at registration time |
| `docs/API_REFERENCE.md` | `RISK_WARNING` documented alongside the other WS server messages |
| `docs/BACKLOG.md`, `docs/ARCHITECTURE.md`, `docs/TODO.md` | D5/D7 rows updated from "🔲 Not started" |

## Backward Compatibility

No `protocolVersion` bump. Additive throughout: new `EventStore` method
implemented for the default store only (the non-default
`RedisStreamsEventStore` throws, matching its pre-existing status for
every other method), new event type, new config flag defaulting to
today's exact behavior (no detection). The five test-mock updates
(`onDurable: jest.fn()`) are required only because those tests mock
`event-bus` entirely and now exercise `registerEventHandlers()`, which
calls every registration method unconditionally — no production
behavior change.

## Reference Implementation Plan

1. `EventStore.getEvents()`, `Timeline`, `onDurable()` (this pass).
2. `assessSocialEngineeringRisk()`, `SocialEngineeringAgent` (this pass).
3. Handler wiring + `RISK_WARNING` broadcast + config flag (this pass).
4. Tests (this pass) — 13 new tests, full suite (206 tests, 24 suites)
   verified green afterward.
5. `packages/sails-ui`: a mocked reflection of `RISK_WARNING` in the
   chat UI (this pass, alongside this RFC — honest, clearly-labeled
   simulation, same pattern as `AgentIntentionPanel`/`AgentRiskCard`).
6. **Explicitly not this pass, tracked in `BACKLOG.md`/`docs/TODO.md`:**
   `unexpected_flow_deviation` detection (Alternatives Considered #5);
   real Policy Engine integration — `get`/`propose`/`activate` remain a
   stub (Alternatives Considered #4); `RedisStreamsEventStore.getEvents()`
   (XRANGE-based or a secondary index, undecided, same status as that
   class's other methods); a real WS/HTTP route in `packages/sails-ui`
   consuming an actual `RISK_WARNING` message (today's UI reflection is
   mocked, no live connection).
