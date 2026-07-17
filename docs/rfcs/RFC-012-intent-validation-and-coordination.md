# RFC-012: Intent Validation and Coordination States

**Status:** Accepted. Triggered by a concrete integration need — the
QVAC/WDK MVP pass's `BuyerAgent.requestUsdtViaPix()` (`modules/open-agents/
buyer-agent.ts`) generates a `TradeIntentPayload` autonomously via local
LLM inference, and needed a formal, audited way for the Core to receive
and process an agent-submitted Intent before it enters Discovery. Checked
against `PROTOCOL_SPECIFICATION.md` §2.4 before drafting, not assumed:
`VALIDATED` and `COORDINATED` do not exist anywhere in the frozen v1.0
lifecycle (`CREATED → DISCOVERING → MATCHED → NEGOTIATING → COMMITTED →
SETTLING → FULFILLED`), so this is a real Core primitive change, not a
wiring fix — routed through the RFC process the same way RFC-008 through
RFC-011 were, not applied silently.

## Summary

Adds two new intermediate states to the Intent lifecycle, both sitting
between `CREATED` and the existing `DISCOVERING`:

```
CREATED → VALIDATED → COORDINATED → DISCOVERING → MATCHED → NEGOTIATING
        → COMMITTED → SETTLING → FULFILLED
```

Neither state introduces new checks — both formalize logic that already
runs today inside `core/intent-engine.ts`'s `create()`, un-audited:

- **`VALIDATED`** — the Intent has passed the CISO Byzantine Rule
  (`validateStructure`) and CISO Economic Rule (`validateFinancialSanity`,
  `core/policy-engine.ts`). These checks already gate persistence today
  (a malformed or financially insane Intent never gets a `CREATED` row at
  all) — this RFC does not change that. What changes: once a row *does*
  exist, reaching `VALIDATED` is now a real, hash-chained `IntentEvent`
  transition instead of an implicit, unobservable fact.
- **`COORDINATED`** — `core/coordination-engine.ts`'s `decide()` (a stub
  since it was first scaffolded — `ARCHITECTURE.md`'s inventory: "STUB —
  not yet implemented") gets its first real implementation: it resolves
  the Intent's target module from its own `moduleId` and returns a
  `CoordinationDecision`. The registered `IntentHandler.onCreated()` hook
  (§2.7) — already called today, just not tied to any observable state —
  now runs as part of reaching this state.

Also consolidates a real, separate drift risk found while reading the
current code before drafting this RFC: `IntentStatus` was independently
declared twice — once in `common/types/intent.ts`, once in
`core/state-machine.ts` — structurally identical today by coincidence,
not by any shared reference. `common/types/intent.ts` becomes the single
source of truth; `state-machine.ts` imports it.

## Motivation

`BuyerAgent`'s QVAC-generated payloads are exactly the kind of input this
project's own `TODO.md` §5B already flagged as "structurally valid but
sometimes semantically degenerate" (a live-verified example:
`minValue: "0"`, or a `SellerAgent` offer with `minAmount === maxAmount`
— a small model's known limitation, not a bug in the integration). An
agent-submitted Intent — passing through `agentId` (already part of the
frozen `Intent` shape, §2.2, threaded through `create()` in the same
pass this RFC's need surfaced in) — is a case where a visible, audited
"this specific Intent passed the CISO checks, and here's the exact
IntentEvent entry proving it" record has more value than for a
human-submitted Intent from a wallet UI, precisely because the submitter
wasn't a human reading the amount before hitting send.

Separately, `core/coordination-engine.ts` has been a real stub since
`ARCHITECTURE.md`'s Core-component list was written (`decide()` threw
`Not yet implemented`) — this is one of the "6 formal Core components"
the architecture already committed to (`ARCHITECTURE.md` §1B), not new
scope invented for this RFC. Giving it a real (if intentionally minimal)
first implementation, tied to an observable state, closes a stub this
project already knew it owed rather than leaving a second, unrelated
gap next to the one this RFC set out to fix.

## Alternatives Considered

**Encode "was this validated / was this coordinated" as free-text
`IntentEvent.note` fields instead of real `IntentStatus` values.**
Rejected — `state-machine.ts`'s own file header calls itself "the single
source of truth for valid Intent-state transitions." A note is
unqueryable, unenforceable by `assertValidTransition`, and gives CISO
Rule failures no real terminal-state distinction from any other kind of
failure. If this is worth recording, it's worth being a real state.

**Make `VALIDATED`/`COORDINATED` optional per `IntentType`, skippable by
future types that don't need them.** Rejected for this RFC — `TradeIntent`
is the only implemented type today; every other `IntentType`
(`PaymentIntent`/`SwapIntent`/`LoanIntent`/`EarnIntent`/`AgentIntent`) is
📋 Aspirational, zero code (`PROTOCOL_SPECIFICATION.md` §2.9). Designing
a skip mechanism for hypothetical future types that don't exist yet is
speculative work this project's own v1 Positioning Freeze
(`PROJECT_CONTEXT.md` §1) explicitly discourages — "does this directly
improve building a P2P Financial Marketplace?" Revisit when a second
`IntentType` actually ships and its handler has a real reason to skip a
step.

**Persist genuinely malformed/insane Intents as a real `CREATED` row
before rejecting them, so `VALIDATED` becomes reachable across a
separate request instead of within the same `create()` call.** Rejected
— this would weaken a specifically tested security property. The CISO
Byzantine Rule's own comment in `intent-engine.ts` is explicit: "reject
and drop malformed intents at the entry boundary — never persisted,
never handed to a handler," and `tests/intentFlow.test.ts` has two tests
asserting exactly that (`mockIntentCreate` never called for malformed or
financially insane input). Weakening that for a naming/audit-trail
preference would be a regression, not an improvement, and not something
to change without it being the RFC's actual subject. Decision below
keeps pre-persistence rejection for genuinely invalid input unchanged;
`VALIDATED`/`COORDINATED` are recorded via the existing `transition()`
mechanism immediately after the `CREATED` row lands, within the same
`create()` call — real, hash-chained, auditable IntentEvent entries, not
spanning multiple requests, but not a bare status overwrite either.

**Fully implement `coordinationEngine.decide()` against the Policy
Engine's governed-policy store (`policy-engine.ts`'s `get`/`propose`/
`activate`, still a stub) and the Capability Registry
(`capability-registry.ts`, still a stub).** Rejected for this RFC's
scope — building three stubs out together (coordination engine, policy
engine's governed-policy system, capability registry) to make one of
them "fully" real is a much bigger change than an agent needing a formal
receive-and-route path. `decide()` here resolves target-module routing
from the Intent's own `moduleId` — real, working code, honestly scoped,
not yet policy- or capability-gated. That gating is real future work,
tracked in `BACKLOG.md`, not silently implied as already done.

**Move the `handlers: Map<IntentType, IntentHandler>` registry's
ownership from `intent-engine.ts` into `coordination-engine.ts`, so the
Coordination Engine also owns "who's registered."** Considered, not done
— `registerHandler()` has zero real callers in this codebase today
(`PROTOCOL_SPECIFICATION.md` §2.6: "only one real `IntentHandler`
exists — none yet, actually"), so this would be speculative
restructuring with no code to prove it against. `coordinationEngine.
decide()` is deliberately self-contained (reads the persisted Intent's
own `moduleId`, no dependency on `intent-engine.ts`'s internal `handlers`
Map) — a real, working separation of concerns without needing to move
code that has no current caller to reorganize around.

## Decision

**`IntentStatus` gains two values, consolidated into one declaration**
(`common/types/intent.ts` — `core/state-machine.ts` imports from here
now instead of re-declaring):

```typescript
export type IntentStatus =
  | 'CREATED' | 'VALIDATED' | 'COORDINATED' | 'DISCOVERING' | 'MATCHED'
  | 'NEGOTIATING' | 'COMMITTED' | 'SETTLING' | 'FULFILLED' | 'EXPIRED'
  | 'CANCELLED' | 'FAILED'
```

**`state-machine.ts`'s `VALID_TRANSITIONS` table**, `DISCOVERING`'s
former predecessor (`CREATED`) replaced by the two new states, following
the same branch pattern (`CANCELLED`/`EXPIRED`, no `FAILED`) the
adjacent early-lifecycle states already use — not the
`COMMITTED`/`SETTLING` pattern, which does allow `FAILED`. This RFC does
not attempt to reconcile that pre-existing inconsistency between the
frozen spec's prose ("Branches from any active state" includes `FAILED`)
and the literal table (`FAILED` only reachable from `COMMITTED`/
`SETTLING` today) — flagged, not silently "fixed," since resolving it is
a separate, broader question this RFC's scope doesn't cover:

```typescript
CREATED:     ['VALIDATED', 'CANCELLED', 'EXPIRED'],
VALIDATED:   ['COORDINATED', 'CANCELLED', 'EXPIRED'],
COORDINATED: ['DISCOVERING', 'CANCELLED', 'EXPIRED'],
DISCOVERING: ['MATCHED', 'EXPIRED', 'CANCELLED'],       // unchanged
// MATCHED through FAILED: unchanged
```

`EXPIRABLE_STATES` gains `'VALIDATED'`, `'COORDINATED'`.

**`event-bus.ts`** — two new events, namespace `intent.*` (§2.5,
cross-cutting, unowned by any single module — matches the existing
`intent.created`/`intent.cancelled` entries):

```typescript
export interface IntentValidatedEvent {
  intentId: string
  participantId: string
}
export interface IntentCoordinatedEvent {
  intentId: string
  targetModule: string
}
```

**`core/coordination-engine.ts`** — first real implementation:

```typescript
export const coordinationEngine: CoordinationEngine = {
  async decide(intentId: string): Promise<CoordinationDecision> {
    const record = await prisma.intent.findUnique({ where: { id: intentId } })
    if (!record) throw new NotFoundError('Intent', intentId)
    return { action: 'route', targetModule: record.moduleId, payload: record.payload }
  },
}
```

**`core/intent-engine.ts`'s `create()`** — after the existing
`CREATED` persistence + `intent.created` emit (both unchanged), two new
`transition()` calls using the same hash-chained mechanism `cancel()`
already uses, not a bare status overwrite:

```typescript
const validated = await transition(
  record.id, 'VALIDATED', participantId, 'intent.validated',
  { intentId: record.id, participantId }
)

const decision = await coordinationEngine.decide(record.id)
const handler = handlers.get(type)
if (handler) await handler.onCreated(validated as unknown as Intent)

const coordinated = await transition(
  record.id, 'COORDINATED', participantId, 'intent.coordinated',
  { intentId: record.id, targetModule: decision.targetModule }
)

return coordinated as unknown as Intent<T>
```

`create()` now returns the Intent in `COORDINATED` status rather than
`CREATED` — a real, deliberate change to what callers observe (checked:
`intentRoutes.ts` returns whatever `create()` gives it with no
status-specific branching, so this is safe for the one real caller that
exists today).

## Primitives Used or Extended

Extends the Intent primitive (`PROTOCOL_SPECIFICATION.md` §2) — two new
`IntentStatus` values and two new lifecycle events. No new primitive;
`GOVERNANCE.md` §3's "extending an existing primitive's contract" is the
right RFC weight here, not a full new-primitive proposal.

## Principle Alignment

- **Principle 1 (Protocol First):** the Core still never imports a
  module (§2.7's own rule, unchanged) — `coordinationEngine.decide()`
  reads only the Intent's own `moduleId` field, already set at creation
  time, never a module's internals.
- **Risk flagged, not resolved by this RFC:** `coordinationEngine.
  decide()` does not yet consult Policy or Capability — see Alternatives
  Considered. A `COORDINATED` Intent today is coordinated by moduleId
  alone, not by any governed policy check. Whoever eventually builds out
  `policy-engine.ts`'s governed-policy system should wire it in here,
  not build a second, parallel coordination path.
- **Pre-existing inconsistency flagged, not resolved:** the frozen
  lifecycle's prose ("Branches from any active state" includes `FAILED`)
  and the literal `VALID_TRANSITIONS` table (`FAILED` only reachable
  from `COMMITTED`/`SETTLING`) already disagreed before this RFC. Decision
  above extends the table consistently with its own existing pattern
  rather than silently resolving that disagreement as a side effect.

## Specification

| Component | Change |
|---|---|
| `common/types/intent.ts` | `IntentStatus` gains `VALIDATED`, `COORDINATED` — becomes the single declaration, `state-machine.ts` imports from here |
| `core/state-machine.ts` | Imports `IntentStatus` instead of re-declaring it; `VALID_TRANSITIONS`/`EXPIRABLE_STATES` updated per Decision above; stale "STUB — not yet implemented" file-header comment removed (the code below it has been real since `intentFlow.test.ts` was written — a documentation-drift fix, not a behavior change) |
| `event-bus.ts` | New `IntentValidatedEvent`/`IntentCoordinatedEvent` + `'intent.validated'`/`'intent.coordinated'` map entries |
| `core/coordination-engine.ts` | `decide()` implemented for real (Decision above); stale "STUB" file-header comment removed |
| `core/intent-engine.ts` | `create()` gains the two `transition()` calls above; `agentId` (already threaded through in the same pass, prior commit) is what a `BuyerAgent`-submitted Intent carries through `VALIDATED`/`COORDINATED` the same as any other |

## Backward Compatibility

`protocolVersion` bump recommended, consistent with RFC-009/010/011.
Zero schema changes — `Intent.status` was already a plain `String`
column in Prisma (not a Postgres enum), so new `IntentStatus` string
values need no migration. Real behavior change, stated plainly: a
successful `create()` call now does 2 more `IntentEvent` writes and 2
more event-bus emits per Intent than before, and returns the Intent in
`COORDINATED` status instead of `CREATED`. Verified with `npm run build`
(zero errors) and the full test suite (`tests/intentFlow.test.ts`
updated for the new transition count — see that file's own comments for
exactly what changed).

## Reference Implementation Plan

Shipped and verified in this pass — `npm run build` clean,
`tests/intentFlow.test.ts` updated and passing, plus a new live check:
`BuyerAgent.requestUsdtViaPix()`'s QVAC-generated `TradeIntentPayload`
submitted through `intentEngine.create()` with mocked Prisma, confirmed
it reaches `COORDINATED` via the same path any other `TradeIntent` does
— no agent-specific branching required, `agentId` is just data that
flows through unchanged. Natural next steps, tracked in `BACKLOG.md`:

1. Wire `coordinationEngine.decide()` to the Policy Engine and Capability
   Registry once those stubs have real implementations — a governed
   routing decision instead of moduleId-only.
2. Build `modules/open-p2p/`'s own real `IntentHandler` (PROTOCOL_
   SPECIFICATION.md §2.6 already flags this as natural follow-up,
   independent of this RFC) so `handlers.get('TradeIntent')` actually
   resolves to something instead of always being `undefined` today.
3. Decide, separately, whether to reconcile the `FAILED`-branch
   inconsistency this RFC flagged but didn't touch (Principle Alignment,
   above).
