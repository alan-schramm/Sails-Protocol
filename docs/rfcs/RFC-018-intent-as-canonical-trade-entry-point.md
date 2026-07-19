# RFC-018: Intent as the Canonical Entry Point for Every Trade

## Summary

Today, `Intent`/`IntentEvent` (`core/intent-engine.ts`) and OpenP2P's
`Offer`/`Trade` (`liquidity.service.ts`, `trade.service.ts`) are two
fully separate, unconnected code paths — no real `Offer` or `Trade` has
an `Intent` row behind it, despite `PROTOCOL_SPECIFICATION.md` §1.11
already stating that a published `Offer` "is OpenLiquidity's concrete
database artifact representing a published, discoverable Intent." This
RFC makes that claim true: every `Offer` is created *from* a real
`TradeIntent`, and every `Trade` references the `Intent` that produced
it. The Intent Engine becomes the single owner of the intention's
lifecycle (creation, validation, expiration); OpenP2P's `Trade` becomes
purely the materialized agreement once negotiation concludes — it never
duplicates lifecycle logic Intent already owns.

**Status:** Accepted. Triggered by a project-owner-relayed CTO-role
review that first flagged a documentation gap ("Intent não está no
centro"), which a code-level fidelity audit then corrected in the
opposite direction — Intent *is* already the 2nd primitive,
fully specified, but the real Offer/Trade code path never calls it. The
CTO review's follow-up response approved this as a P0 architecture item
("ARC-001" in that review; renumbered here to stay in this project's
single, permanent RFC sequence — see `GOVERNANCE.md` §5's "numbered,
sequential, never reused" rule, itself part of what this consolidation
effort has been enforcing). Bypasses the Discussion window
(`GOVERNANCE.md` §5), the same precedent RFC-007/RFC-015/RFC-016/RFC-017
already used for owner-directed RFCs.

**Classification:** Core RFC (`GOVERNANCE.md` §6A) — changes which code
path is the canonical entry point for `Trade`, a lifecycle-wiring
change to an existing primitive, not an additive one.

## Motivation

A concrete, present-day consequence of the gap: an SDK consumer calling
`@sails/sdk`'s `createIntent()` today gets a real, persisted `Intent`
with zero relationship to any actual P2P trade they might separately
start via `POST /v1/openp2p/trades`. Nothing lets that consumer answer
"what happened to my Intent?" — the audit trail `parentIntentId`
composability (§2.2) is explicitly designed for, and the whole reason
`AgentIntent`-driven flows need a traceable decision tree, cannot exist
while `Offer`/`Trade` sit outside the Intent lifecycle entirely.

This also means `PRINCIPLES.md` Principle 2 ("Intent Driven" — "lets
humans, wallets, and AI agents all speak the protocol the same way ...
never a direct API call") is currently violated by the one real trade
flow this codebase ships: `trade.routes.ts`'s `POST
/v1/openp2p/trades` is exactly the "direct, action-specific API call"
that principle says shouldn't be the starting point.

## Alternatives Considered

- **Eliminate `Intent`/`IntentEvent`, keep `Offer`/`Trade` as the only
  real model.** Rejected — this is what the code accidentally does
  today, and it's the thing being fixed, not adopted. It would also
  mean deleting real, tested, working code (`intent-engine.ts`'s
  `create()`/`cancel()`/`transition()`, the hash-chained `IntentEvent`
  audit trail) to paper over a wiring gap.
- **Eliminate `Offer`/`Trade`, route everything through raw `Intent`.**
  Rejected — `Trade` carries OpenP2P-specific fields (`buyerId`,
  `sellerId`, escrow relationship) the generic `Intent.payload: Json`
  blob was never meant to model directly, and `PROTOCOL_SPECIFICATION.md`
  §3.1 already establishes the pattern every application module should
  follow: a module-specific lifecycle refinement that maps back onto
  the generic one, never a parallel top-level lifecycle. `Trade` is
  OpenP2P's refinement; it should reference its originating `Intent`,
  not replace it.
- **Make `Offer` optional but `intentId` mandatory on `Trade` only,
  skip linking `Offer`.** Considered, rejected: `Offer` is the
  *discoverable, public* form of a `TradeIntent` — leaving it
  unlinked would mean Discovery (§1.3) still can't answer "which
  Intent does this candidate satisfy," reproducing the same gap one
  layer later.

## Decision

Every `Offer` gains a nullable `intentId` foreign key to `Intent`.
`liquidity.service.ts`'s `createOffer()` calls `intentEngine.create()`
first (with `type: 'TradeIntent'`, deriving `TradeIntentPayload` from
the `CreateOfferInput` fields it already receives — `asset`, `side`,
`fiatMethod: input.paymentMethod`, `network`, and a `maxValue`/
`minValue` pair derived from `priceUsd × maxAmount`/`minAmount`), then
persists the `Offer` row with the resulting `intentId`.

Every `Trade` gains a nullable `intentId` foreign key. `trade.service.ts`'s
`createTrade()` copies the accepted `Offer`'s `intentId` onto the new
`Trade` row and calls `intentEngine.transition(intentId, 'COMMITTED')`
— matching §2.4's existing generic lifecycle ("terms agreed, settlement
requested") and §3.1's already-published mapping table (`COMMITTED` ↔
"05 ESCROW LOCKED"). When settlement completes,
`common/events/handlers.ts`'s existing `settlement.escrow.released`/
`refunded` reaction (which already calls `reputationService.recordOutcome()`)
also calls `intentEngine.transition(intentId, 'FULFILLED')` or the
appropriate terminal state.

`IntentHandler` (§2.7) gets its first real implementation:
`OpenP2PTradeIntentHandler`, formalizing the inline `TradeIntent`
validation `intent-engine.ts` currently does directly — already flagged
in §2.6 as "natural follow-up work, not done here." This RFC is that
follow-up's trigger, not its full implementation (see Reference
Implementation Plan).

## Implementation Impact

A scannable map to the full detail in Specification/Reference
Implementation Plan below — not a duplicate of it:

- `prisma/schema.prisma` — `Offer` and `Trade` each gain a nullable
  `intentId String?` column + relation to `Intent`. Migration required.
- `src/modules/open-liquidity/liquidity.service.ts` — `createOffer()`
  gains a call to `intentEngine.create()` before `prisma.offer.create()`.
- `src/modules/open-p2p/trade.service.ts` — `createTrade()` copies
  `offer.intentId` onto the new `Trade` row and calls
  `intentEngine.transition(intentId, 'COMMITTED')`.
- `src/common/events/handlers.ts` — the existing
  `settlement.escrow.released`/`refunded` reaction gains a call to
  `intentEngine.transition(intentId, 'FULFILLED')` alongside its
  existing `recordOutcome()` call.
- `src/core/intent-engine.ts` — `transition()`'s ownership check needs a
  real code change (not just a new call site): today only the Intent's
  creator may transition it; a `Trade` counterparty who didn't create
  the originating `Offer`/`Intent` also needs to be permitted to drive
  `COMMITTED`.
- New file: `src/modules/open-p2p/intent-handler.ts` (or similar) —
  `OpenP2PTradeIntentHandler`, Phase 3 only (see Reference
  Implementation Plan).

## Primitives Used or Extended

Extends **Intent** (§1.2, §2) and **Discovery** (§1.3, via `Offer`'s new
`intentId`). No new primitive — this operationalizes a relationship
§1.11 already asserts conceptually but the code has never built.

## Principle Alignment

- **Principle 2, Intent Driven** — directly restored. Today's gap is
  the one live violation of this principle in the shipped code; this
  RFC's whole purpose is closing it.
- **Principle 9, Interface Agnostic** — unaffected. `Trade`'s existing
  shape is unchanged except for the additive `intentId` column; no UI
  or SDK-facing contract needs to change to keep working (a caller that
  never looks at `intentId` sees no difference).

## Specification

```prisma
model Offer {
  // ...existing fields unchanged...
  intentId String?
  intent   Intent? @relation(fields: [intentId], references: [id])
}

model Trade {
  // ...existing fields unchanged...
  intentId String?
  intent   Intent? @relation(fields: [intentId], references: [id])
}
```

```typescript
// liquidity.service.ts
async createOffer(input: CreateOfferInput) {
  const intent = await intentEngine.create('TradeIntent', {
    asset: input.asset,
    side: input.side,
    maxValue: Number(input.priceUsd) * Number(input.maxAmount),
    minValue: Number(input.priceUsd) * Number(input.minAmount),
    fiatMethod: input.paymentMethod,
    network: input.network,
  }, input.userId)

  const offer = await prisma.offer.create({
    data: { /* ...existing fields..., */ intentId: intent.id },
  })
  // ...existing event emission unchanged...
}

// trade.service.ts
async createTrade(input: CreateTradeInput) {
  const offer = await prisma.offer.findUnique({ where: { id: input.offerId } })
  // ...existing validation unchanged...
  const trade = await prisma.trade.create({
    data: { /* ...existing fields..., */ intentId: offer.intentId },
  })
  if (offer.intentId) {
    await intentEngine.transition(offer.intentId, 'COMMITTED', input.counterpartyId)
  }
  // ...existing event emission + negotiationService.open() unchanged...
}
```

`intentEngine.transition()`'s existing signature/ownership checks
(`ForbiddenError` on a mismatched `participantId`) need one adjustment:
today only the Intent's own creator may transition it; a `Trade`'s
counterparty (who did not create the originating `Offer`/`Intent`) must
also be permitted to drive `COMMITTED` once they accept it. This is a
real, scoped code change to `intent-engine.ts`'s ownership check, not
just new call sites — flagged here explicitly rather than left implicit.

## Backward Compatibility

No `protocolVersion` bump — `intentId` is additive and nullable on both
tables, same pattern RFC-008 used for `entryHash`/`prevHash`. Existing
`Offer`/`Trade` rows keep `intentId: null` and remain fully valid;
`Timeline`/reputation/dispute code that reads `Trade`/`Offer` today
needs no change, since nothing currently reads `intentId` off either
table.

## Reference Implementation Plan

Satsails reference implementation (this repo). Explicitly phased, per
the CTO review's own instruction not to implement provisional fixes in
the same pass as registering the gap:

1. **Schema + wiring** (not done in this RFC): add the nullable
   `intentId` columns, wire `createOffer()`/`createTrade()` as
   specified above, adjust `intentEngine.transition()`'s ownership
   check for the counterparty case.
2. **Lifecycle completion**: wire the `FULFILLED`/terminal-state
   transition into `common/events/handlers.ts`'s existing settlement
   outcome reaction.
3. **`OpenP2PTradeIntentHandler`**: extract `intent-engine.ts`'s inline
   `TradeIntent` validation into a real, registered `IntentHandler`
   (§2.7), retiring the inline special-case.

Acceptance of this RFC is not a commitment to a build date
(`GOVERNANCE.md` §5, step 4) — it registers the target architecture and
an incremental path, per the CTO review's explicit instruction:
"registrar claramente a diferença ... e planejar a migração de forma
incremental."
