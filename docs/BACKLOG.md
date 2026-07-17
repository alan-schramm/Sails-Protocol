# BACKLOG.md
### Sails Protocol — Engineering Handoff · Document 20 of 20

> Technical backlog, not a product backlog — ordered by architectural
> dependency, not by feature value. Requested explicitly by the CTO
> following `PROTOCOL_FREEZE_REPORT.md`. Every item cites the RFC or spec
> section it implements, per `GOVERNANCE.md` §6B's traceability
> discipline — this is the first artifact that discipline applies to.

---

## Phase Verification — where the project actually stands

Checked directly against the CTO's proposed 6-stage schedule, not assumed:

| Stage | Status |
|---|---|
| 1. Protocol Freeze | ✅ **Done** — `PROTOCOL_FREEZE_REPORT.md`, confirmed "Sails Protocol v1.0 — Architecture Frozen" |
| 2. Implementation Review | 🟡 **Substantially in progress** *(updated 2026-07-16, open-reputation pass)* — every P0 item is done or explicitly scoped-out; every one of the 5 application/cross-module services (OpenIdentity, OpenLiquidity, OpenP2P, OpenSettlement, OpenReputation) now has both a real service layer and HTTP routes, `API_REFERENCE.md`-conformant, tested via `app.inject()`. Genuinely remaining: production-grade Settlement/Liquidity providers beyond Mock/Internal, OpenProof's service layer, and OpenAgents/OpenFinance (both explicitly blocked on external dependencies, not on this backlog's own pace) |
| 3. Economic Model & Governance | 🟡 **Substantially already done** — `PROTOCOL_ECONOMY.md` (8 sections) and `GOVERNANCE.md` already cover fees, incentives, value capture, neutrality, RFC approval, module registration. One genuine gap (formal version-stability criteria) is correctly deferred to the future "RFC de Operação" phase, not blocking here. |
| 4. Resilience Reviews | 🟡 **Partially done** — `RED_TEAM_REVIEW.md` already covers several attack scenarios that overlap with "Economic Attack" (RT-003, wash-trading reputation laundering) and "Protocol Resilience" (RT-005, governance capture during bootstrap; RT-006/007, name-squatting and arbitration griefing at scale). No dedicated Network Simulation exercise exists yet — genuinely not started. |
| 5. Release Candidate 1 (RC1) | 🔲 **Not started** — blocked on Implementation Review |
| 6. Grant Submission | 🔲 **Not started** — blocked on RC1 |

**The project is not in "ideation" by any reasonable reading of the above
— Protocol Freeze is complete, and three of the four remaining stages
before RC1 are already partially or substantially satisfied.** What's
genuinely ahead: finishing Implementation Review's remaining P2/P3 items
(production Settlement/Liquidity providers, OpenProof's service layer),
a Network Simulation exercise within Resilience Reviews, and RC1 itself.

---

## P0 — Core Primitives (block everything else)

| Item | RFC / Spec | Current Status |
|---|---|---|
| Participant Model | RFC-001, §1.1 | 🔲 Not started — interface not yet in code anywhere |
| Proof Primitive (Claim/Proof/Verification) | RFC-003, §1.8 | 🔲 Not started — no tables, no interfaces in code |
| **Intent Engine** *(new — 03-implementation_plan.md, CISO+CTO-approved MVP blueprint)* | §2, §2.6 | ✅ **Done, verified** — `core/intent-engine.ts`'s `create()`/`cancel()`/`transition()` are real, backed by new `Intent`/`IntentEvent` Prisma models (2 tables, not the 3 §2.6 originally sketched — see that section for why). CISO Byzantine Rule (structural validation) and Economic Rule (`policy-engine.ts`'s `validateFinancialSanity`) both reject before any Prisma call. Hard-timeout `EXPIRED` enforcement (`state-machine.ts`'s `isExpired()`) is lazy-evaluated, not a proactive sweeper — see that file's own doc comment. `IntentEvent` implements RFC-008 D2's hash-chaining ahead of `EscrowEvent`/`ReputationEvent` picking it up. Verified with `npm run build`, `npm test` (18 tests, `tests/intentFlow.test.ts` + `tests/transportFallback.test.ts`), and `app.inject()` HTTP round-trips through the real route |
| `POST /api/v1/intents`, `DELETE /api/v1/intents/:id` *(new)* | §2, §4 of 03-implementation_plan.md | ✅ **Done, verified** — `routes/intentRoutes.ts`, zod-validated, registered in `app.ts`. First HTTP route in this codebase actually wired end-to-end (every other route file referenced in `app.ts`'s comments still doesn't exist) |
| Jest test framework *(new)* | 03-implementation_plan.md §4 | ✅ **Done** — `package.json`'s `"test": "jest --runInBand"` script existed but jest itself was never installed (found while doing this work). `jest.config.js` + `ts-jest` now real. Fixed a real, separate `uuid@14` ESM/CommonJS incompatibility with Jest along the way by replacing the `uuid` package with Node's built-in `crypto.randomUUID()` in the 2 files that used it — removes a dependency, not just works around the test runner |
| Transport Provider | RFC-002, §4B | ✅ **Done, verified** — `infrastructure/p2p/transport-provider.ts`: `TransportProvider` interface (adapted from RFC-002's literal spec — `start(participant: Participant)` → `start(participantId: string)`, since `Participant`/RFC-001 has no TS interface anywhere yet), `PearsTransportProvider` wraps `pearNodeRegistry` with zero behavioral change (RFC-002's own plan), `FallbackTransportProvider` composes it with a new `WebSocketRelayTransportProvider` (`websocket-relay.service.ts`, blind relay — CISO Privacy Rule) — 5s timeout, verified with real unit tests (fake providers/sockets), not just type-checked. **Still not wired to a `/ws/relay` endpoint** — connecting `FallbackTransportProvider` to a live route remains open. Distinct from `pearNodeRegistry` itself, which now has direct routes (`infrastructure/p2p/pear.routes.ts`, start/stop/status/join-topic/join-trade/broadcast-offer, `API_REFERENCE.md` §7) as of the 2026-07-16 route-restoration pass — those wrap `pearNodeRegistry` directly per that doc's own implementation note, not the `TransportProvider` abstraction this row describes. Don't conflate the two when picking this up |
| Negotiation State Machine + Channel | RFC-004, §1.4 | 🟢 **First real implementation exists** — `negotiation.service.ts`'s `HumanChatChannel` built on the real `pearNodeRegistry`. Not yet wired to HTTP/WebSocket routes (routes still don't exist). `NegotiationStatus` is still an in-memory `Map`, not persisted — flagged, not fixed, by RFC-011 |
| `ReconciliationService` on peer reconnect *(new — RFC-011)* | §1.4, RFC-011 | ✅ **Done, verified** — `peer.connected` (real handshake) now reconciles every shared active `Trade`/`Escrow`/`Message` against Postgres. Confirmed via `npm run build` + a runtime test showing the DB-unreachable path is caught and logged, not crashing. Not yet exposed via HTTP for client-driven delta reconciliation (`sinceMessageCreatedAt` param exists, unused until routes are restored) |
| Event Bus update | RFC-003 + RFC-004, `TODO.md` §6B | ✅ **Done** — `claim.*`/`proof.*`/`verification.*`/`dispute.*`/`negotiation.*` events all added and typed |
| `EventStore` + mandatory `correlationId` *(new — RFC-010)* | §1.11, RFC-010 | ✅ **Done, verified** — `SailsEventBus` now delegates to a pluggable `EventStore`; all 13 `eventBus.emit()` call sites updated with `correlationId` (`tradeId` or `userId`). `InMemoryEventStore` (default) confirmed working via `npm run build` + two runtime smoke tests |
| `RedisStreamsEventStore` (durable backend) *(new — RFC-010)* | §1.11, RFC-010 | 🔲 Not started — interface-conformant stub exists (`event-store.ts`), throws rather than faking success. Needs: real `XADD`/`XREADGROUP`/`XACK` implementation, `XCLAIM`-based recovery for crashed consumers, integration tests against a live Redis (none available when RFC-010 was written) |
| Timeline read-model *(new — RFC-007 D5)* | §1.9, RFC-007 | 🔲 Not started — a per-`intentId` ordered projection over the Event Bus above; blocks Evidence Bundle (P2) and the Social Engineering Agent (P3) |
| Timeline hash-chaining *(new — RFC-008 D2)* | §1.9, RFC-008 | 🔲 Not started — `entryHash`/`prevHash` columns on `EscrowEvent`/`ReputationEvent`, computed at write time; build alongside the Timeline read-model above, not as a separate pass |

## P1 — First Proven Module + SDK Core

| Item | RFC / Spec | Current Status |
|---|---|---|
| Sails OpenP2P (trade lifecycle + chat) | §3, §3.1 | 🟢 **Routes now real** *(route-restoration pass, 2026-07-16)* — `trade.routes.ts` + new `trade.service.ts` (the missing piece: `negotiation.service.ts` owned the channel but nothing created the `Trade` row it assumes exists) and `chat.routes.ts` (WebSocket + message history), both per `API_REFERENCE.md` §5, `requireAuth`-gated. Remaining: this WS path doesn't yet unify with `HumanChatChannel`'s Pears relay — same open gap as the Transport Provider row in P0 above ("Not yet wired to an actual HTTP/WS route") |
| SDK Core (`@sails/sdk`, ships as **Sails P2P Trading SDK** per the Named-SDK Rule, `PROJECT_CONTEXT.md` §3) | `SDK_GUIDE.md` | 🔲 Not started — depends on P0's Participant Model + Proof Primitive being real, not just typed |
| **`@sails/p2p-schemas`** *(new — 04-Deepseek Review Task 1)* | `packages/sails-p2p-schemas` | ✅ **Done, verified** — real npm workspace package (first one; root `package.json` gained `workspaces`), types-only, zero runtime deps. `OfferSchema` (assetSell/assetBuy/paymentMethods/expiresAt — divergences from the real Prisma `Offer` model documented field-by-field in `offer.ts`, not papered over), `TradeState` (the `open → payment_sent → payment_confirmed → escrow_released` vocabulary, DERIVED from existing `Trade`/`Escrow`/`Dispute` columns via `deriveTradeState()` — deliberately not a fourth stored status column, to avoid a second source of truth; `payment_confirmed` currently aliases `payment_sent`, no backing column distinguishes them yet), `DisputeSchema` (§1.9's shape) |
| CRDT / WebRTC adoption | 04-Deepseek Review | 🔲 **Evaluated, deliberately not adopted now** — the Deepseek review's CRDT-based dispute/order-book model was weighed against the architecture already built: Postgres is the authoritative source (RFC-011), and a CRDT dispute document would reintroduce the divergent-sources-of-truth problem RFC-011 exists to close. The practical outcomes the review wanted (freeze + notify arbiter + arbiter resolves; shared order book) are delivered today by `dispute.service.ts` + EventStore pubsub and by `LiquidityRouter` respectively. CRDT/WebRTC remain candidates for the *client-side offline-first* layer (a wallet's local view syncing over P2P), which doesn't exist yet — adopting them belongs to that future work, with an RFC, not as a bolt-on to the server-side reference implementation |

## P2 — Cross-Module Services

| Item | RFC / Spec | Current Status |
|---|---|---|
| Sails OpenSettlement | §1.5, §4B | 🟢 **Most complete module today** — `escrow.service.ts` is real, reviewed, and decoupled correctly (`ARCHITECTURE.md` §5's fix already applied). `lockedAmount` moved `Float` → `Decimal` (RFC-009). **Routes now real** *(route-restoration pass, 2026-07-16)*: `settlement.routes.ts` wraps every escrow method plus a new dispute-resolve route (`API_REFERENCE.md` §4, updated to document it). Remaining: real `LightningHodlProvider`/`LiquidCovenantProvider` (both currently throw "not implemented"), and wiring `DisputeResolutionProvider` (RFC-003's Verification) |
| `Float` → `Decimal` schema migration *(new — RFC-009)* | §1.5, RFC-009 | 🟡 Schema/code fixed in this repo; **migration not yet applied to any live database** — no Postgres reachable in the environment this was done in. Whoever has a connected DB must run `npx prisma migrate dev` before this takes effect anywhere real |
| `PendingBankSettlement` status *(new — RFC-007 D3)* | §1.5, RFC-007 | 🟡 Smallest RFC-007 item and the only one touching live code — one `EscrowStatus` enum value + one `assertTransition()` edge in `escrow.service.ts`, additive, no data migration |
| Dispute persistence + `raiseDispute()`/`resolveDispute()` *(new — 04-Deepseek Review Task 2)* | §1.9, RFC-007 D4 | ✅ **Done, verified** — `Dispute` Prisma model (first persistence of §1.9's primitive), `dispute.service.ts` (freeze via existing `escrowService.openDispute()`, arbiter assignment, pubsub notification via `dispute.opened`, ruling → release/refund mapping), `ArbitrationProvider` first real implementation (`arbitration-provider.ts`, `TrustedArbitratorProvider` — per-application trusted-arbiter list, round-robin assignment; RFC-007 D4's `rule()` dropped from the interface since a human arbiter's ruling is an input, not something the provider computes). 10 tests in `tests/disputeFlow.test.ts`. Built WITHOUT CRDTs by explicit decision (reconciled with the repository owner): a CRDT dispute document would be a second source of truth alongside `Trade`/`Escrow` — the exact divergence risk RFC-011 closed. Remaining from RFC-007 D4's full escalation order: the Policy Engine → OpenAgents auto-resolution stages before human arbitration (depends on Evidence Bundle, below) |
| `SPLIT` ruling settlement action | §1.9 | 🔲 Not started — `SettlementProvider` only has release/refund; a SPLIT ruling is recorded but moves no funds. Needs a real split operation on the provider interface |
| Participant payout address | §1.1 | 🔲 Not started — `resolveDispute(RELEASE)` requires the caller to pass `releaseToAddress` because no schema field models a participant's payout address; a real gap surfaced by the dispute work |
| Sails OpenIdentity | §1.1, RFC-001 | 🟢 **Routes now real** *(route-restoration pass, 2026-07-16)* — `identity.routes.ts` + new `identity.service.ts` (register/challenge/authenticate/get participant, `API_REFERENCE.md` §2). `common/middleware/auth.ts`'s Ed25519 challenge-response (`RED_TEAM_REVIEW.md` RT-002) is now actually wired as `requireAuth` on every write-side route across identity/peers/liquidity/p2p/settlement. Fixed a real bug found in the process: `verifySignedChallenge()` never returned the session token it generated, so authentication verified but produced no usable credential — see `TODO.md` §3. Remaining: Growth path beyond Level-0 Keys (DID/Credentials/Trust Graph, `PROTOCOL_SPECIFICATION.md` §1.1) and Operational Profiles, below |
| Operational Profiles *(new — RFC-007 D8/D11)* | §1.1, RFC-007 | 🔲 Not started — additive OpenIdentity attribute (`OperationalProfileGrant`), blocked on OpenIdentity module itself |
| Sails OpenReputation | §1.6 | 🟢 **First service layer + routes, done and tested** *(open-reputation pass, 2026-07-16)* — `reputation.service.ts` + `reputation.routes.ts`, `API_REFERENCE.md` §6. `User.reputationScore` (single `Float`) stands in for `ReputationScore`'s full `{tradeScore, volumeScore, settlementScore, disputeRate}` breakdown — a documented simplification, not silently narrowed; `total`/`disputeRate` are real, the sub-scores report zero. See the Outcome Engine row directly below for the score-mutation half |
| Outcome Engine + `rate()` demotion *(new — RFC-007 D8/D9)* | §1.6, RFC-007 | ✅ **Done, verified** — `recordOutcome()` is the sole `reputationScore` input (asymmetric +2/-5, a disputed loss costs more than a clean trade earns); `rate()` (`POST /v1/reputation/rate`) is informational only, never calls it, one rating per `(tradeId, raterId)` enforced by the schema's `@@unique`. Wired dispute-aware into `common/events/handlers.ts`'s `settlement.escrow.released`/`refunded` reactions: a plain completion/refund is Positive/Neutral for both parties, but a RELEASE/REFUND dispute ruling means one party won and the other lost — the handler checks for a resolved `Dispute` row to tell the two apart, since the escrow event payload alone doesn't carry that context. `CancelledByAgreement` (no dispute ever raised) always classifies Neutral, never Negative, per RFC-007 D9. 4 tests in `tests/reputationOutcome.test.ts` verify all four branches directly, not just through an HTTP round-trip |
| **Sails OpenProof** *(new — RFC-006)* | §1.8, RFC-003, RFC-006 | 🟡 **Data model already real** — `Claim`/`Proof`/`EvidenceVerification` tables in `DATABASE.md`, TypeScript interfaces in `common/types`. Remaining: `modules/open-proof/proof.service.ts` — the actual `assertClaim()`/`submitProof()`/`verify()` service logic doesn't exist yet |
| Proof Registry, `EvidenceProvider`, Evidence Bundle *(new — RFC-007 D1/D2/D6)* | §1.8, RFC-007 | 🔲 Not started — scope these into OpenProof's first service layer alongside `proof.service.ts` above rather than as a later addition (per RFC-007's own Reference Implementation Plan) |
| `TimestampAnchor` (`anchorProof` on `EvidenceReference`) *(new — RFC-008 D1)* | §1.8, RFC-008 | 🔲 Not started — scope alongside `EvidenceProvider` above; first implementation should be `opentimestamps` (Bitcoin-anchored), not `rfc3161`, per RFC-008's own Reference Implementation Plan |

## P3 — Advanced / Aspirational Modules

| Item | RFC / Spec | Current Status |
|---|---|---|
| Sails OpenLiquidity | §1.3, §4B | 🟢 **Second most complete module** — `liquidity.service.ts` is real, deduplicated (`ARCHITECTURE.md` §5). `priceUsd`/`minAmount`/`maxAmount` moved `Float` → `Decimal` (RFC-009). **Routes now real** *(route-restoration pass, 2026-07-16)*: `liquidity.routes.ts` (`API_REFERENCE.md` §3), plus new `createOffer()`/`updateOfferStatus()`/`getOrderBook()` methods on `LiquidityRouter` — only read/match methods existed before. Remaining: real HodlHodl integration (currently stubbed, `isAvailable()` returns `false`), and asset/side-only filtering on `GET /v1/liquidity/offers` (paymentMethod/price-range filters from `API_REFERENCE.md`'s description aren't implemented yet) |
| Sails OpenFinance | §4B, `REFERENCE_IMPLEMENTATIONS.md` §3 | 🔲 Not started — blocked on real external adapters (Morpho, etc.) |
| Sails OpenAgents | §1.7 (includes the `learn()` step) | 🔲 Not started — blocked on QVAC integration, which is at 0% per `TETHER_DUE_DILIGENCE_REPORT.md` finding 12 |
| Social Engineering Agent *(new — RFC-007 D7)* | §1.7, RFC-007 | 🔲 Not started — blocked on OpenAgents itself and on the Timeline read-model (P0) it reads from |

---

## Why the Order Differs From Pure Priority

Strict priority order alone would suggest building OpenP2P (P1) before
touching OpenSettlement or OpenLiquidity (P2/P3) — but those two already
have real, reviewed code, while OpenP2P has none. The practical sequence
for whoever picks this up: **finish what's already 70-80% real (P2/P3's
Settlement and Liquidity adapters) opportunistically alongside P0/P1 work**,
rather than leaving working code idle while building P1 from zero. The
priority tiers above reflect architectural dependency order — what
blocks what — not a strict "do P0 fully, then P1 fully" sequence.

---

## Traceability Rule (per `GOVERNANCE.md` §6B, now in effect)

Every commit implementing an item above must cite its RFC or spec section
in the commit message or code comment. Any implementation work that
doesn't map to a row in this backlog needs a new RFC (`RFC-006` onward)
before it starts, not after.
