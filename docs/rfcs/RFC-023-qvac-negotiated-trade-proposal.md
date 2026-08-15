# RFC-023: QVAC Negotiated Trade Proposal (price/reputation-bounded discovery)

## Summary

Adds two additive optional fields to the frozen `TradeIntentPayload`
(`maxPriceUsd`/`minPriceUsd`, decimal strings, RFC-009) and a new
`POST /v1/intents/:id/propose` route that uses them — together with the
already-real `minReputationRating` (RFC-013) — to find a real matching
`Offer` for a persisted `Intent`, without creating a `Trade` or touching
escrow/settlement in any way. This is the backend half of making
`packages/sails-ui`'s "AI Negotiator" panel real: QVAC already drafts a
structured `TradeIntent` from a goal (`POST /v1/agents/generate-trade-intent`,
real since the `open-agents` module shipped); everything after that was a
client-side `setInterval` simulation until this RFC.

**Status:** Accepted. Directive from the project's CTO (relayed via chat,
2026-08-15): implement now, scoped as a small, demonstrable vertical slice —
explicitly not "QVAC completo." Hard boundary he set, preserved in full
here: QVAC may negotiate/discover autonomously within user-declared limits,
but gets no autonomous authority over escrow/settlement. The human approves
the returned proposal; only then does the existing, unmodified
`POST /v1/openp2p/trades` flow run — the same call the UI already makes
today for a manually-selected offer.

## Motivation

`TradeIntentPayload` already carries `minValue`/`maxValue` (a *quantity*
range) and, since RFC-013, `minReputationRating` — but RFC-013's own text
explicitly deferred the actual matching/enforcement of that reputation
field ("OpenLiquidity reading this during matching is separate follow-up
work"). Nothing in the codebase reads any of these fields to actually find
a counterparty; `intent-handler.ts`'s `onCreated()` is a documented no-op,
and `liquidity.service.ts`'s real `getOffers()` already supports
`priceMin`/`priceMax` filters and already joins each offer's
`traderReputation` — both currently unused for this purpose. There is no
*price* limit field anywhere on the Intent today, which blocks the
reputation-matching follow-up RFC-013 deferred: a real proposal needs both
a price ceiling/floor and a reputation floor to be a meaningful "was this
found within the user's stated limits," not just one.

## Alternatives Considered

1. **Give the agent direct authority to call `createTrade()`/lock escrow
   once a match is found.** Rejected outright per the CTO's explicit
   instruction — this conflates two separable concerns (autonomous
   discovery vs. autonomous fund custody) that must ship as two different,
   independently-gated capabilities. This RFC is scoped to the first only.
2. **Reuse `minValue`/`maxValue` to also mean a price bound, instead of
   adding new fields.** Rejected — those fields are documented and used
   elsewhere as a *quantity* range (see `intent-handler.ts`'s `validate()`,
   `buyer-agent.ts`'s own goal-prompt text: "Proponha um intervalo de
   quantidade"). Repurposing an already-frozen field's meaning is exactly
   what this codebase's own conventions (and CLAUDE.md's engineering-loop
   contract) rule out; additive new fields, same as RFC-013's own precedent,
   are the correct move.
3. **Route the new endpoint under `/v1/liquidity/` (next to the existing
   `POST /v1/liquidity/match`) instead of `/v1/intents/:id/propose`.**
   Rejected. `/v1/liquidity/match` is deliberately unauthenticated and
   accepts `priceMin`/`priceMax` as raw caller-supplied body params — fine
   for a stateless price check, wrong for this feature, where the price/
   reputation limits must be read from the *persisted, ownership-checked*
   Intent, not re-trusted from whatever the request body claims.
4. **Persist a new `Proposal`/`Quote` Prisma model.** Rejected for V1 —
   no correctness need depends on it (the eventual `createTrade()` call
   re-validates the offer's live status/amount bounds regardless of what
   an earlier proposal said), and a real audit trail is already available
   for free: the matched offer id is written into the Intent's own
   hash-chained `IntentEvent.note` when it transitions `COORDINATED` →
   `DISCOVERING`.
5. **Build the governed `PolicyEngine` (`get`/`propose`/`activate`, still a
   stub) as part of this pass, since the CTO's own diagram shows a "Policy
   Engine" box.** Rejected, same scope-cut reasoning RFC-012 and RFC-013
   both already applied to this exact stub: the Intent's own already-real,
   already-validated fields (`maxPriceUsd`/`minPriceUsd`/
   `minReputationRating`) are sufficient policy for this feature. The
   governed, versioned, multi-stakeholder policy-storage system remains
   out of scope until Months 10-12 (`PROTOCOL_ECONOMY.md` §7), unchanged.

## Decision

**1. `TradeIntentPayload` gains two additive optional fields**
(`common/types/intent.ts`):

```typescript
maxPriceUsd?: string  // decimal string, RFC-009, USD-denominated (matches Offer.priceUsd)
minPriceUsd?: string
```

Validated for type (decimal string) in `intent-handler.ts`'s `validate()`
and for sanity (non-negative, sane ceiling, `min <= max`) in
`policy-engine.ts`'s `validateFinancialSanity()` — the same two gates
`maxValue`/`minValue` already go through, applied identically here.

**2. `liquidity.service.ts` gains `LiquidityRouter.proposeForIntent()`**:
given `asset`/`side`/`amount` plus the Intent's own `priceMin`/`priceMax`/
`minReputation`, calls the existing `getOffers()` (already supports price
bounds) with the full `MAX_PAGE_LIMIT`, then application-filters by
`traderReputation >= minReputation` (the join already exists, just unused
until now), returning the single best-priced match or `null`. No new
matching algorithm, no new Prisma model.

**3. `POST /v1/intents/:id/propose`** (new route, `intent.routes.ts`,
`docsOnlySchema()` pattern — not the file's two grandfathered hand-rolled-
schema routes): `requireAuth`, ownership-checked (only the Intent's creator
may propose against it), rejects an `amount` outside the Intent's own
declared `minValue`/`maxValue` range, calls `proposeForIntent()`, and — if
the Intent is still `COORDINATED` — transitions it to `DISCOVERING` (the
only valid forward transition per `state-machine.ts`) with the matched
offer id recorded in the hash-chained event `note`. Does **not** transition
further (`MATCHED`/`NEGOTIATING` mean "a real Trade now exists" elsewhere in
this codebase); this buyer-side Intent tops out at `DISCOVERING` and later
expires via its own `expiresAt` — fully unifying it with the *offer's own*
separate Intent (the one `createTrade()` walks to `MATCHED`) would mean
touching `createTrade()` itself, explicitly out of scope here.

**4. Approval is the existing, unmodified path.** The UI's "Aprovar" action
on a returned proposal calls the same `sailsClient.openp2p.trade(offerId,
amount)` → `POST /v1/openp2p/trades` → `trade.service.ts createTrade()`
flow already in production for a manually-selected offer
(`OfferDetail.tsx`). Nothing in `open-settlement` is touched by this RFC.

## Reference Implementation

`src/common/types/intent.ts`, `src/core/intent.routes.ts`,
`src/modules/open-p2p/intent-handler.ts`, `src/core/policy-engine.ts`,
`src/modules/open-liquidity/liquidity.service.ts`,
`packages/sails-sdk/src/modules/` (new typed client method),
`packages/sails-ui/src/components/agent/AgentIntentionPanel.tsx` (real
`handleDelegate()`, replacing `lib/aiNegotiator.ts`'s deleted simulation).
