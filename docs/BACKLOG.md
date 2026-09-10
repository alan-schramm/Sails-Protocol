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
| 2. Implementation Review | 🟡 **Substantially in progress** *(updated 2026-07-16, open-reputation pass; row stale relative to this file's own later sections — see correction below)* — every P0 item is done or explicitly scoped-out; every one of the 5 application/cross-module services (OpenIdentity, OpenLiquidity, OpenP2P, OpenSettlement, OpenReputation) now has both a real service layer and HTTP routes, `API_REFERENCE.md`-conformant, tested via `app.inject()`. Genuinely remaining: production-grade Settlement/Liquidity providers beyond Mock/Internal, OpenProof's service layer, and OpenAgents/OpenFinance (both explicitly blocked on external dependencies, not on this backlog's own pace) |
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

**Correction, 2026-09-06 (Current Truth P1+ Cleanup) — the row 2 cell
above is stale relative to this file's own later sections.** "Genuinely
remaining: production-grade Settlement/Liquidity providers beyond
Mock/Internal, OpenProof's service layer" no longer accurately describes
current state: four real settlement providers exist today (MULTISIG,
LIGHTNING_HODL, WDK_USDT_EVM, SAFE_GUARD_EVM — see the OpenSettlement row
in the Known Debt section below for the full, dated build history), and
OpenProof's service layer has been real since 2026-08-04 (see the Sails
OpenProof row below). Narrowest current statement: none of the four real
settlement providers is production-authorized (each is testnet-only or
explicitly production-ineligible per `docs/PROVIDER_SUBSTITUTION_INVARIANCE_EVIDENCE.md`
§7) — "production-grade" in the sense of a production-authorized rail is
still genuinely open; "production-grade" in the sense of "no real
implementation exists" is not. Original 2026-07-16 text preserved above
verbatim as the historical record of what was true when it was written;
not rewritten in place.

---

## P0 — Core Primitives (block everything else)

| Item | RFC / Spec | Current Status |
|---|---|---|
| Participant Model | RFC-001, §1.1 | 🔲 Not started — interface not yet in code anywhere |
| Proof Primitive (Claim/Proof/Verification) | RFC-003, §1.8 | ✅ **Done, verified — corrected 2026-08-01, this row was stale.** Real since `modules/open-proof/proof.service.ts` (dated 2026-07-21, predating this row's own "not started" claim): `assertClaim()`/`submitProof()` (server-recomputed `evidenceHash`, never client-supplied — real forgery resistance)/`issueVerificationNonce()`+`verifyProof()` (real anti-replay nonce, `auth.ts`'s challenge-response pattern reused) all real, backed by real `Claim`/`Proof`/`Verification` Prisma models. Real routes in `proof.routes.ts` (`POST /v1/proof/claims`, `POST /v1/proof/proofs`, `POST /v1/proof/proofs/:id/verify-nonce`, `POST /v1/proof/proofs/:id/verify`, `GET /v1/proof/claims/:id/bundle`), all `requireAuth`-gated, registered in `app.ts`. `@satsails/p2p-trading-sdk`'s Intent facade `submitProof()` now calls these for real too (see the SDK Core row below). Time-lock enforced (`config.proof.submissionWindowHours`, RFC-008's reasoning applied to evidence age) |
| **Intent Engine** *(new — 03-implementation_plan.md, CISO+CTO-approved MVP blueprint)* | §2, §2.6 | ✅ **Done, verified** — `core/intent-engine.ts`'s `create()`/`cancel()`/`transition()` are real, backed by new `Intent`/`IntentEvent` Prisma models (2 tables, not the 3 §2.6 originally sketched — see that section for why). CISO Byzantine Rule (structural validation) and Economic Rule (`policy-engine.ts`'s `validateFinancialSanity`) both reject before any Prisma call. Hard-timeout `EXPIRED` enforcement (`state-machine.ts`'s `isExpired()`) is lazy-evaluated, not a proactive sweeper — see that file's own doc comment. `IntentEvent` implements RFC-008 D2's hash-chaining ahead of `EscrowEvent`/`ReputationEvent` picking it up. Verified with `npm run build`, `npm test` (18 tests, `tests/intentFlow.test.ts` + `tests/transportFallback.test.ts`), and `app.inject()` HTTP round-trips through the real route |
| `POST /api/v1/intents`, `DELETE /api/v1/intents/:id` *(new)* | §2, §4 of 03-implementation_plan.md | ✅ **Done, verified** — `core/intent.routes.ts` (moved 2026-08-10, was `routes/intentRoutes.ts`), zod-validated, registered in `app.ts`. First HTTP route in this codebase actually wired end-to-end (every other route file referenced in `app.ts`'s comments still doesn't exist) |
| **Coordination Engine** *(new — RFC-012, `rfcs/RFC-012-intent-validation-and-coordination.md`)* | §2.4, §1B | ✅ **Done, verified** — `core/coordination-engine.ts`'s `decide()` is real (was a stub), resolving an Intent's `targetModule` from its own persisted `moduleId`. `intent-engine.ts`'s `create()` now runs `CREATED → VALIDATED → COORDINATED` through the existing hash-chained `transition()` mechanism before returning, formalizing checks (CISO Byzantine/Economic rules) that already ran pre-persistence as observable, audited states rather than an implicit gate. `coordinationEngine.decide()` itself does **not** consult `policy-engine.ts`'s governed-policy interface or `capability-registry.ts` — out of scope per that RFC's Alternatives Considered, still true today. (`intentEngine.create()` *does* now consult the registry directly, config-gated — RFC-014, row below — a different call site than `decide()`.) Verified with `npm run build` + `npm test` (`tests/intentFlow.test.ts`, 11 tests) |
| **Capability Registry** *(new — RFC-013, `rfcs/RFC-013-capability-registry-and-wallet-adapter.md`)* | §1.10, RFC-005 | ✅ **Done, verified** — `core/capability-registry.ts`'s `grant()`/`check()`/`revoke()`/`listGrants()` are real, backed by a new `CapabilityGrant` Prisma model (`capability_grants` table). Corrected a signature drift found while implementing: the pre-RFC-013 stub's `grant(capability: Capability)` predated RFC-005 disambiguating `Capability` from `CapabilityGrant` and took the wrong shape — fixed to `grant(input: Omit<CapabilityGrant, 'grantId'>)`. `CAPABILITY_IMPLEMENTATIONS` (RFC-005's own module↔Capability table) stays a static in-code map, not a second persisted table — that RFC calls it "illustrative... a Reference Implementation detail" with no real write path. New routes: `POST /v1/capabilities/register` (self-issued grants), `GET /v1/capabilities/:participantId`, `POST /v1/capabilities/:grantId/revoke` (`modules/open-agents/capability.routes.ts` — this module's first real routes). Triggered by an external technical proposal that attributed capability/policy verification to QVAC — checked against docs.qvac.tether.io and found inaccurate; this is and always was Sails Protocol's own Core responsibility, see the RFC's Motivation for the full correction. Verified with `npm run build` + `npm test` (`tests/capabilityRegistry.test.ts`, 9 tests; `tests/routes.test.ts` capability cases, 6 tests). At merge time, had zero real callers anywhere in the money-moving path — closed by RFC-014, row below |
| **Capability Registry Enforcement** *(new — RFC-014, `rfcs/RFC-014-capability-registry-enforcement.md`; relocated by RFC-015 same day)* | §1.10, RFC-005 | ✅ **Done, verified** — the registry's first two real callers: `intentEngine.create()` (TradeIntent, before persistence) and `escrow.service.ts`'s `releaseFunds()` (immediately before the real, signed USDT release — the one irreversible step in that function). Originally shipped inside `settlement-orchestrator.ts`'s `executeSettlement()`; relocated into `releaseFunds()` itself the same day once RFC-015's work found that location silently missed two of `releaseFunds()`'s three real callers (the direct HTTP release route, the arbitrated dispute-resolution release) — see the RFC-015 row below. Both behind a new `config.features.enforceCapabilities` flag (`ENFORCE_CAPABILITIES`, default `false` — same off-by-default precedent as `AUTO_SETTLE_ON_MATCH`, since no test or deployment in this repo has ever issued a `CapabilityGrant`). Required scope strings are real event names (`'intent.created'`, `'settlement.escrow.released'`), matching RFC-013's own example grant rather than inventing a parallel vocabulary. `examples/demo/pix-to-usdt-flow.ts` now issues both grants unconditionally so it keeps working regardless of the flag. Verified with `npm run build` + `npm test` (`tests/intentCapabilityCheck.test.ts`, 3 tests; `tests/escrowReleaseControls.test.ts`, 13 tests covering both this and the RFC-015 row below) |
| **Two-Person Control for Escrow Release** *(new — RFC-015, `rfcs/RFC-015-dual-authorization-escrow-release.md`)* | Custody model, `docs/TODO.md` §4 | ✅ **Done, verified** — application-layer maker-checker on `escrow.service.ts`'s `releaseFunds()`, explicitly not on-chain multisig (`@tetherto/wdk-wallet-evm-erc-4337`'s real compiled types show single-owner only, checked before choosing this design). On the normal (non-disputed) path, release now requires both `Trade.buyerId` and `sellerId` to have separately called the new `POST /v1/settlement/escrow/:id/approve-release` first (`escrowService.approveRelease()`/`getReleaseApprovals()`/`hasDualApproval()`, new `EscrowReleaseApproval` Prisma model). Arbitrated releases (`Escrow.status === 'DISPUTED'`) always bypass this — re-requiring the original two counterparties' agreement after a dispute exists would defeat arbitration's purpose. Behind `config.features.requireDualApprovalForRelease` (`REQUIRE_DUAL_APPROVAL_RELEASE`, default `false` — turning it on changes `executeSettlement()`'s calling pattern, since no approval can exist yet within that same synchronous call; see the RFC's Decision §5). Demo script does not enable this flag (would break its atomic settlement call by design); the mechanism is proven by real tests instead. Verified with `npm run build` + `npm test` (`tests/escrowReleaseControls.test.ts`, 13 tests total across both this and the RFC-014 row above) |
| **Real Protocol Fee collection** *(new — RFC-021 Phase 0, `rfcs/RFC-021-market-based-arbitration-and-payment-trust.md`)* | PROTOCOL_ECONOMY.md §3/§6.2 | ✅ **Done, verified** — `escrow.service.ts`'s `releaseFunds()` now computes a real fee (`config.settlement.protocolFeeRate`, `PROTOCOL_FEE_RATE` env var, default `0` matching the documented bootstrap "Protocol Fee is OFF" default) and persists both `Escrow.feeCharged` and a new `FeeDistribution` row (the real, already-documented 40/30/20/10 split — node operators/treasury/wallet rebate/arbitrator reserve). Never charged on refund — PROTOCOL_ECONOMY.md §3's own "only ever attaches to a completed Settlement." Deliberately bypasses `policy-engine.ts`'s governed `FeePolicy` interface (still correctly unimplemented — that's the bigger Months 10-12 governance layer, out of scope here), same "bypass the governed-policy indirection for a real, working check" precedent `validateFinancialSanity()` already set in that same file. This closes the actual data-source gap RFC-021 D4 (cost-to-fabricate-reputation floor) needs — before this, `cumulativeFeesObserved` had nothing to sum. Verified with `npm run build` + `npm test` (`tests/escrowReleaseControls.test.ts`, 3 new tests: zero-rate no-op, real 40/30/20/10 split math, refund never charged). **Revised 2026-08-11:** `PROTOCOL_ECONOMY.md` §3/§6.2 changed the split to 35/30/25/10 (wallet rebate now the largest bucket) and the rate to a default of 0.40%, active from launch rather than after a 12-month grace period — the code default stays `0` for safety, production sets `PROTOCOL_FEE_RATE=0.004` explicitly. `escrow-lifecycle.ts`'s `chargeProtocolFee()` and this row's own test file updated to match. **Superseded 2026-08-23 (Missão 11 Fase 6.5.2):** `chargeProtocolFee()`/`FeeDistribution` (this whole row) is now HISTORICAL / SUPERSEDED / WRITE-FROZEN — the call site was removed from `releaseFunds()`, and `fee_distributions` (plus Fase 2.2's `FeeDistributionBatch`/`FeeDistributionBatchItem`) is now DB-natively rejected on every new `INSERT`/`UPDATE`/`DELETE`, including raw SQL. `FeeCollectionEvidence(CONFIRMED) → FeeObligation → a frozen DistributionPolicyVersion → EntitlementLedgerEntry` (Fase 6.3A) is the sole normative economic authority going forward; no production distribution policy has been published under it. See `docs/DATABASE.md`'s `FeeDistribution`/`FeeDistributionBatch` entries and `docs/PROTOCOL_ECONOMY.md` §6.1-§6.3's own historical markings. **Hardened further 2026-08-23 (Missão 11 Fase 7.2, CTO-frozen decision):** `DistributionPolicyVersion` now becomes economically binding at COLLECTED time, not at whenever an allocation worker happens to run — the live policy is resolved once, by `fee-collection-recognition.service.ts`'s `recognizeConfirmation()`, and frozen onto the new `FeeCollectionEvidence.distributionPolicyVersionId` column (DB-natively immutable once set — `docs/DATABASE.md`). `EntitlementAllocationService.allocate()` reads this frozen reference exclusively and never queries live `PUBLISHED` state itself. Both policy tables are DB-natively exclusive (`fee_policy_versions_single_published_per_rail_key` per rail, `distribution_policy_versions_single_published_key` globally — migration `20260823182951`) and fail closed on ambiguity (`EconomicAuthorityAmbiguityError`, never "take the newest"). `FeePolicyVersion`'s four legacy bucket-percentage columns are now nullable and no longer validated at publish time. Policy publication is gated by a new server-side-only operator CLI (`scripts/publish-economic-policy.ts`, `npm run economics:publish-policy` — no HTTP admin endpoint, no `CapabilityRegistry` reuse, no fabricated operator identity), the bootstrap-appropriate "Model A" control plane pending Governance Layer v1. The authenticated `GET /v1/settlement/escrow/:id`/`/trade/:id` response now also exposes `distributionPolicyFreezes[]` — the frozen historical `DistributionPolicyVersion` (id, label, recipients) for each of this escrow's confirmed collection generations, so a wallet can independently verify which policy actually governed a specific past generation, immune to a later policy rotation (a "current live policy" endpoint cannot prove this after rotation — deliberately not built as the primary verification surface for this reason). Two CTO-level decisions from Phase 7.1A remain open: no existing authorization primitive in this codebase gated policy publication before this CLI existed (now addressed by the CLI itself, pending eventual migration to Governance Layer v1); the CLI's own operator-attribution is honestly disclosed as "bootstrap operator control," not a fabricated identity, since no trustworthy per-operator identity source exists yet |
| **Permissionless arbiter registration** *(new — RFC-021 Phase 1, D1-D3)* | `SECURITY_MODEL.md` §3's 2026-07-29 correction | ✅ **Done, verified** — `market-arbitration.provider.ts`'s `MarketArbitrationProvider` (`register()`/`eligibleFor()`/`assign()`), new `ArbiterProfile` Prisma model, `effectiveStake = monetaryCollateral + arbiterReputation × REPUTATION_STAKE_FACTOR` (`0.01`), eligibility `effectiveStake ≥ K_ELIGIBILITY × disputeValue` (`1.5`). `TrustedArbitratorProvider` unchanged/undeleted — chosen per deployment via `config.settlement.arbitrationMode` (`ARBITRATION_MODE` env var, default `'trusted-list'`). New routes `POST /v1/settlement/arbitration/register`, `GET /v1/settlement/arbitration/profile/:participantId`; new SDK `SailsArbitrationModule`. Verified with `npm test` (`tests/marketArbitrationProvider.test.ts`, 8 tests; `tests/routes.test.ts`, 2 new HTTP round-trip cases) |
| **Payment-account trust ramp** *(new — RFC-021 Phase 4, D5)* | `SECURITY_MODEL.md` §1.4 (reused tiers, not a second scale) | ✅ **Done, verified** — new `PaymentAccount` Prisma model, `payment-account.service.ts` (server-side reference hash + trade-limit ramp: unsigned → `0.001` BTC, signed → `0.01`, `≥5` completed trades → `0.05`, `≥20` completed with zero chargebacks → unlimited; any real chargeback permanently caps at `0.01`), `@satsails/p2p-trading-sdk`'s `hashPaymentAccount()` (`@noble/hashes` SHA-256, the real client-side path — the raw PIX key/bank account never reaches the server, only its hash). New routes `POST /v1/settlement/payment-accounts`, `GET .../{accountHash}`, `POST .../{accountHash}/sign`; new SDK `SailsPaymentAccountModule`. Cross-package hash consistency (SDK vs. backend, byte-identical for the same input — the load-bearing property for the whole privacy scheme) verified directly (`tests/paymentAccountHashConsistency.test.ts`, 3 tests). Verified with `npm test` (`tests/paymentAccountService.test.ts`, 13 tests; `tests/routes.test.ts`, 4 new HTTP round-trip cases) |
| **Slashing + reputation-weighted appeal escalation** *(new — RFC-021 Phase 2, D6)* | `THREAT_MODEL.md`'s "Malicious Arbiter Collusion" row (updated 2026-07-29) | ✅ **Done, verified** — `DisputeService.appeal()` reopens a `RESOLVED` dispute (new `DisputeStatus.APPEALED`, `Dispute.appealRound`/`previousRuling`/`previousArbiterId`), draws a new arbiter via `MarketArbitrationProvider.assignAppealPanel()` (panel size `PANEL_SIZE_BASE × 2^round`, `PANEL_SIZE_BASE = 3`, weighted 70% reputation/30% collateral — deliberately not Kleros's stake-only draw), excludes the original arbiter. An overturned ruling triggers `slash()` (forfeits `SLASH_COLLATERAL_FRACTION = 0.5` of collateral + `OVERTURNED_PENALTY = -10` reputation, floored at 0); an upheld ruling slashes nothing. New route `POST /v1/settlement/disputes/:id/appeal`; new SDK `SailsSettlementModule.appealDispute()`. **`appealFeeRequired` (`APPEAL_FEE_MULTIPLIER = 2×` the escrow's collected protocol fee) is now a real charge, closed 2026-08-01** — a new `DisputeAppealFee` row (one per appeal round) is created by `appeal()` and settled (`FORFEITED` on a denied/frivolous appeal, `REFUNDED` on an overturn) by `resolveDispute()`. Same "computed and persisted, not actually routed on-chain" realness the Protocol Fee itself already has (`escrow.service.ts`'s `chargeProtocolFee()` doesn't move funds either — no `SettlementProvider` here has a real configured treasury/arbitrator-reserve address to send anything to); a real on-chain appeal-fee lock is separate, larger follow-up work blocked on that same missing treasury infrastructure, not attempted here. Verified with `npm test` (`tests/marketArbitrationProvider.test.ts`, +8 tests; `tests/disputeFlow.test.ts`, +12 tests total across both passes; `tests/routes.test.ts`, +1 test) and a real `npx prisma db push` against local Postgres (no migration history exists in this repo yet — `db push` is this project's own established convention, not `migrate dev`, which asked to reset the whole schema on a database with no tracked migration baseline) |
| **cumulativeFeesObserved wiring (cost-to-fabricate floor, real)** *(new — RFC-021 Phase 3, D4)* | RFC-021 D4 | ✅ **Done, verified** — new `User.cumulativeFeesObserved` accrues `Escrow.feeCharged` onto both trade parties in the `settlement.escrow.released` handler (`common/events/handlers.ts`) — refunds never charge a fee, so refunds correctly don't touch it. `ArbiterProfile.cumulativeFeesObserved` (schema field existed since Phase 1, unwired until now) accrues the same per ruling arbiter, via a new optional `feeObserved` parameter on `ArbitrationProvider.recordRuling()`. `reputation.service.ts`'s `getScore()` exposes the real trader-side field alongside the three still-honestly-zero placeholders its own header comment already discloses. Stays `0` for everyone while `protocolFeeRate` is `0` (the bootstrap default) — the honest number, not a bug. Verified with `npm test` (`tests/reputationOutcome.test.ts`, +2 tests; `tests/disputeFlow.test.ts`, +1 test; `tests/routes.test.ts`, updated) |
| **`DATABASE.md` missing `ArbiterProfile`/`PaymentAccount`** *(gap found — RFC-021 doc-correction pass, 2026-07-29; scope widened 2026-08-01; closed 2026-08-02)* | `docs/DATABASE.md` | ✅ **Closed** — flagged three times without being fixed (2026-07-29, widened 2026-08-01, widened again 2026-08-02 for `Vouch`) before finally being closed in one pass: `ArbiterProfile` and `PaymentAccount` now have their own full sections; `Dispute`'s listing now includes D6's appeal fields and D8's auto-resolution fields; `Escrow`'s listing now includes `feeCharged`; `FeeDistribution` now has its own section. `DisputeAppealFee`/`Vouch` were already documented properly when each was added. Real lesson from letting this sit flagged-but-unfixed three times: a "note the gap, move on" pass invites the next person (including future-me) to do the same instead of just spending the 20 minutes — closed properly this time instead of widened a fourth time |
| **Escrow timelock proactive sweeper** *(gap found — security-validation round, 2026-07-19, "trade abandonado" scenario; closed 2026-08-01)* | `SECURITY_MODEL.md` Scenario B, Resolution Principles | ✅ **Done, verified** — `escrow.service.ts`'s new `sweepExpiredEscrows()` queries every `Escrow` still `FUNDS_LOCKED` past its own `expiresAt` and calls the existing, already-real `refundFunds()` for each, `triggeredBy` always the trade's own `sellerId` (never a fabricated "system" actor — the same `sellerTriggeredBy` precedent `settlement-orchestrator.ts` already established for automated calls into this method, and the only way to satisfy `isSellerOrAssignedArbiter()`'s real INV-OP-1 check). Per-escrow try/catch, same "one failure must not stop the rest" shape `getAggregatedOffers()` already uses — a stuck escrow doesn't block sweeping the others. Wired into `app.ts`'s `startServer()` as a `setInterval` (`config.trade.timelockSweepIntervalMs`, default 5 min), gated behind `config.features.escrowTimelockSweeper` (`ESCROW_TIMELOCK_SWEEPER`, default `false` — same "off by default, deliberate opt-in" precedent every other automated-money-action flag in this file already sets), `unref()`'d so it never keeps the process alive on its own. Verified with `npm test` (`tests/escrowReleaseControls.test.ts`, 3 new tests: query shape, multi-escrow refund attributing each to its own trade's seller, one failure not blocking the rest) |
| Jest test framework *(new)* | 03-implementation_plan.md §4 | ✅ **Done** — `package.json`'s `"test": "jest --runInBand"` script existed but jest itself was never installed (found while doing this work). `jest.config.js` + `ts-jest` now real. Fixed a real, separate `uuid@14` ESM/CommonJS incompatibility with Jest along the way by replacing the `uuid` package with Node's built-in `crypto.randomUUID()` in the 2 files that used it — removes a dependency, not just works around the test runner |
| Transport Provider | RFC-002, §4B | ✅ **Done, verified at unit level; runtime Docker re-check pending in this environment** — `infrastructure/p2p/transport-provider.ts`: `TransportProvider` interface (adapted from RFC-002's literal spec — `start(participant: Participant)` → `start(participantId: string)`, since `Participant`/RFC-001 has no TS interface anywhere yet), `PearsTransportProvider` wraps `pearNodeRegistry` with zero behavioral change (RFC-002's own plan), `FallbackTransportProvider` composes it with a new `WebSocketRelayTransportProvider` (`websocket-relay.service.ts`, blind relay — CISO Privacy Rule) — 5s timeout, verified with real unit tests (fake providers/sockets), not just type-checked. **`/ws/relay` is now wired** by `infrastructure/p2p/relay.routes.ts` and registered in `app.ts`; it authenticates the WebSocket upgrade through the same Redis session token as the other browser WebSocket route, then registers and blindly forwards frames through `WebSocketRelayTransportProvider`. A current verification pass ran `tests/transportFallback.test.ts` clean (8 tests), but could not repeat the Docker/runtime check because Docker is unavailable in this environment; `tests/routes.test.ts` also times out while building Fastify before any route assertion. Distinct from `pearNodeRegistry` itself, which now has direct routes (`infrastructure/p2p/pear.routes.ts`, start/stop/status/join-topic/join-trade/broadcast-offer, `API_REFERENCE.md` §7) as of the 2026-07-16 route-restoration pass — those wrap `pearNodeRegistry` directly per that doc's own implementation note, not the `TransportProvider` abstraction this row describes. Don't conflate the two when picking this up |
| `PearsTransportProvider.sendIntentToPeer()` *(new)* | RFC-002, §4B | ✅ **Done, verified** — real, direct, server-free Intent delivery: joins the trade-scoped topic (`PearNode.joinTradeTopic`, real Hyperswarm/HyperDHT discovery — hole-punching is automatic inside `swarm.join(topic, {server:true, client:true})`, not a separate step), resolves the recipient's real Ed25519 peerId (prefers an already-connected handshake, falls back to the Postgres `User.peerId` directory — a public-key lookup, not a stand-in for the P2P delivery itself), and encrypts the payload before handing it to `sendToPeer` — closing a real, previously-undelivered claim in `websocket-relay.service.ts`'s own comment ("Secretstream/E2E encryption already happens above this layer") that nothing in the codebase actually did until now. New `infrastructure/p2p/payload-crypto.ts`: real libsodium sealed-box encryption (`sodium-native`, official transitive dependency of `hyperdht`, now also a direct dependency), converting each `PearNode`'s Ed25519 identity keypair to Curve25519 for `crypto_box_seal`/`crypto_box_seal_open` — verified with real generated `HyperDHT.keyPair()` keypairs, a genuine round-trip, wrong-key rejection, and tamper rejection, all without needing a live network (`tests/payloadCrypto.test.ts`, 4 tests). `sendIntentToPeer`'s own composition logic (topic join, peerId resolution branches, encrypt-then-send) verified with mocked `pear.service.ts`/Postgres, same discipline `PearsTransportProvider` itself has always used since it can't be verified live without a real P2P network (`tests/intentTransport.test.ts`, 4 tests). Wired into `examples/demo/pix-to-usdt-flow.ts`'s step 6 — not run live in this pass (no live network reachable in this environment, same limitation as everything else P2P here), but internally consistent and compiles/typechecks against the real APIs |
| Negotiation State Machine + Channel | RFC-004, §1.4 | 🟢 **First real implementation exists** — `negotiation.service.ts`'s `HumanChatChannel` built on the real `pearNodeRegistry`. Not yet wired to HTTP/WebSocket routes (routes still don't exist). `NegotiationStatus` is still an in-memory `Map`, not persisted — flagged, not fixed, by RFC-011 |
| `ReconciliationService` on peer reconnect *(new — RFC-011)* | §1.4, RFC-011 | ✅ **Done, verified** — `peer.connected` (real handshake) now reconciles every shared active `Trade`/`Escrow`/`Message` against Postgres. Confirmed via `npm run build` + a runtime test showing the DB-unreachable path is caught and logged, not crashing. Not yet exposed via HTTP for client-driven delta reconciliation (`sinceMessageCreatedAt` param exists, unused until routes are restored) |
| Event Bus update | RFC-003 + RFC-004, `TODO.md` §6B | ✅ **Done** — `claim.*`/`proof.*`/`verification.*`/`dispute.*`/`negotiation.*` events all added and typed |
| `EventStore` + mandatory `correlationId` *(new — RFC-010)* | §1.11, RFC-010 | ✅ **Done, verified** — `SailsEventBus` now delegates to a pluggable `EventStore`; all 13 `eventBus.emit()` call sites updated with `correlationId` (`tradeId` or `userId`). `InMemoryEventStore` was the default at the time this row was written; **corrected 2026-08-15 (Missão 05.7)** — the default is now `PostgresEventStore`, see the new row below. `InMemoryEventStore` still exists, real, unmocked-by-default in several test files that want a fast, zero-infrastructure store |
| `RedisStreamsEventStore` (durable backend) *(new — RFC-010)* | §1.11, RFC-010 | 🟢 **Implementation done and verified against a live Redis, 2026-08-04** — real `XADD`/`XGROUP`/`XREADGROUP`/`XACK`/`XPENDING`/`XCLAIM`, dual-write (`sails:events:{eventName}` for consumer-group fan-out + `sails:events:by-correlation:{id}` for `getEvents()`, a real design decision this RFC's own text had left "undecided"), RFC-008 D2 hash-chaining, and 5 integration tests against this repo's own docker-compose Redis (`tests/integration/redisStreamsEventStore.test.ts`) — including a real handler-throws-then-XCLAIM-redelivers scenario observed actually happening, not asserted from a mock. See RFC-010's own updated Reference Implementation Plan for the fresh-consumer-group-replays-history bug found and fixed during that testing (`0` → `$` as the `XGROUP CREATE` start offset). **Still NOT wired as the active default** (`event-bus.ts`'s `SailsEventBus` constructor now defaults to `PostgresEventStore`, not this — see the hard precondition below, which is specific to Redis's own XCLAIM-redelivery idempotency gap and does not apply to Postgres) — the hard precondition below is why: |
| `PostgresEventStore` (durable backend, active default) *(new — RFC-008 D2 amendment, Missão 05.7)* | §1.11, RFC-008, RFC-010 | ✅ **Done, verified, 2026-08-15** — new `durable_events` table (Prisma model `DurableEventRecord`), `entryHash`/`prevHash` reusing the exact `computeEntryHash()`/`GENESIS_HASH` `InMemoryEventStore`/`RedisStreamsEventStore` already use — `Timeline.verifyChain()` needed zero code changes. Now `SailsEventBus`'s default backing store, closing the durability gap the RFC-008 D2 amendment row above explicitly disclosed and deferred (the hash-chained `DurableEvent` stream living only in-memory, gone on restart). `tests/postgresEventStore.test.ts` proves the actual restart scenario: a freshly constructed `SailsEventBus`/`PostgresEventStore`, sharing no in-process state with the one that wrote the events, reads back the identical events with `verifyChain(): { valid: true }`. See RFC-008's own new D2 amendment section for the full design (including the disclosed concurrency exposure this backend has and `InMemoryEventStore` never did) | 
| ↳ **Hard precondition before `RedisStreamsEventStore` can be switched in as the active store** (found by a security-validation stress test, 2026-07-19, `tests/fullTradeLifecycle.test.ts`'s "Event replay / idempotency" describe block; unchanged by the row above — implementing the store doesn't remove this) | §1.11, RFC-010 | 🔲 Not started. `common/events/handlers.ts`'s Intent-lifecycle reactions are naturally protected by `core/state-machine.ts`'s `assertValidTransition()` (a duplicate delivery throws, caught and logged by `event-store.ts`'s `subscribe()`, state untouched) — but the Trade-status writes and, more seriously, `reputation.service.ts`'s `recordOutcome()` are bare increments with no idempotency key. A duplicate `settlement.escrow.released`/`refunded` delivery (now a real possibility — `RedisStreamsEventStore`'s own real XCLAIM recovery redelivers a message whose handler failed, or one whose consumer crashed before XACK) double-counts `User.reputationScore`/`totalTrades`/`totalVolumeBtc`. Needs an eventId-based idempotency check on `recordOutcome()`'s callers (or a broader dedup layer) — this requires widening `eventBus.on()`'s handler signature to expose `DurableEvent.eventId` to the ~13 registered handlers in `handlers.ts` (today they only ever receive the bare payload), a real interface change affecting every one of them, not a small patch — scoped as its own pass, not bundled into this row. The "Future RFC candidate — Event Processing Guarantees" row below is now ripe to actually draft (its own stated precondition, "until an actual durable-backend implementation demands it," is met) — a CTO-level decision to make explicitly, not something to draft unilaterally (`CONTRIBUTING.md` §6B) |
| **Future RFC candidate — Event Processing Guarantees** *(registered, not drafted — CTO-role recommendation, 2026-07-19, following the idempotency finding in the row above)* | RFC-010 | 🔲 Not started, deliberately not drafted yet (Implementation Freeze discipline — a backlog registration, not a new governance document, until an actual durable-backend implementation demands it). Proposed scope, for whenever `RedisStreamsEventStore` (row above) is picked up: a formal protocol-level requirement that every event this bus publishes MUST be **idempotent** (a duplicate delivery has no additional effect — the `recordOutcome()` gap above is the concrete motivating case), **deterministic** (same input always produces the same handler outcome), **replay-safe** (a consumer catching up from history via `getEvents()` behaves identically to having received each event live), and **versioned** (a payload shape change doesn't break an older consumer still processing a backlog). Not a new primitive — a correctness contract on the existing Event Bus primitive (RFC-010), the same category of addition RFC-009 (Decimal precision) and RFC-011 (P2P reconciliation) already made to it |
| Timeline read-model *(new — RFC-007 D5, real as of RFC-017)* | §1.9, RFC-007, RFC-017 | ✅ **Done, verified** — `core/timeline.ts`, backed by a new `EventStore.getEvents()` query capability (real in `InMemoryEventStore`, throws in `RedisStreamsEventStore`). Corrected from D5's literal `intentId`-keyed interface to a `correlationId`-keyed one before implementing — checked first that no event a real consumer needs (chat, escrow, negotiation) carries `intentId` today, only `tradeId` (RFC-017's own Motivation has the full reasoning); no code change needed when Intent-to-Trade correlation exists later. Now unblocks the Social Engineering Agent row below. Evidence Bundle (P2, RFC-007 D6) is separate scope, still not started |
| Timeline hash-chaining *(new — RFC-008 D2)* | §1.9, RFC-008 | 🟢 **Done, 2026-08-04 — with a real correction to the RFC's own original target.** The RFC as written targeted `entryHash`/`prevHash` columns on `EscrowEvent`/`ReputationEvent`, but `core/timeline.ts` (RFC-017) had already moved `Timeline` to read from `EventStore.getEvents(correlationId)` instead — chained `DurableEvent` (`common/events/event-store.ts`) there instead, which is what `Timeline.getEvents()`/new `verifyChain()` actually consume. See RFC-008's own updated D2 section for the full reasoning. 9 new tests (`tests/timeline.test.ts`), including two real tamper-detection tests against the shared `InMemoryEventStore` |

## P1 — First Proven Module + SDK Core

| Item | RFC / Spec | Current Status |
|---|---|---|
| Sails OpenP2P (trade lifecycle + chat) | §3, §3.1 | 🟢 **Routes real, chat transports unified in both directions** *(route-restoration + two chat-unification passes, 2026-07-16)* — `trade.routes.ts` + new `trade.service.ts` (the missing piece: `negotiation.service.ts` owned the channel but nothing created the `Trade` row it assumes exists) and `chat.routes.ts` (WebSocket + message history), both per `API_REFERENCE.md` §5, `requireAuth`-gated. New `chat-room-registry.ts` is the single WS broadcast point, triggered via `common/events/handlers.ts`'s reaction to `openp2p.message.sent` — a message persisted via *either* `chat.routes.ts`'s WS route or `HumanChatChannel`'s Pears relay pushes `NEW_MESSAGE` to every WS-connected room member for that trade, verified in `tests/chatUnification.test.ts`. Fixed a real bug in the process: `HumanChatChannel.sendEvent()` discarded the created `Message` row and emitted a placeholder `messageId` equal to `tradeId`. **WS → Pears direction (added in a follow-up pass):** `chat.routes.ts` now attempts a best-effort relay onto Pears via `pearNodeRegistry.get(senderId)?.sendToPeer(...)` when the WS-connected sender *also* has an active PearNode — verified in `tests/routes.test.ts`'s "Pears relay" cases. This is not full symmetry and never can be with this architecture: `sendToPeer()` only exists on the sending identity's own node, so a sender with no PearNode at all has nothing to relay from — a structural limit of peer-to-peer transports, not a missing wiring step. **Deeper gap found, not fixed:** `HumanChatChannel.onEvent()` — the handler for messages *arriving* via Pears — is defined but never called anywhere in this codebase, for either transport. Needs a live two-node Pears/HyperDHT setup to build and verify against, the same limitation `PearsTransportProvider`'s own tests already decline to fake. **Another gap found while wiring `sendIntentToPeer` (`infrastructure/p2p/transport-provider.ts`) — client-side primitive now real, server/UI wiring still open (2026-08-01):** chat/negotiation messages (`chat.routes.ts`, `HumanChatChannel.sendEvent()`) still send plain JSON server-side — `websocket-relay.service.ts`'s doc comment previously implied this was already handled everywhere; corrected to say precisely where it is and isn't true. `@satsails/p2p-trading-sdk` now ships a real, tested primitive for this (`encryptChatMessage()`/`decryptChatMessage()`, `packages/sails-sdk/src/chat-encryption.ts`) — deliberately NOT `payload-crypto.ts`'s `crypto_box_seal` (that primitive can't be decrypted by its own sender, wrong for a stored, re-readable chat history; this uses a real X25519 shared key via `ed2curve`+`tweetnacl`, decryptable by either party at any time). Needs no server/schema change to adopt (`content` is already a free-form string). **UI wiring done, 2026-08-01:** `packages/sails-ui`'s `Trade.tsx`/`ChatWindow.tsx`/`ChatMessage.tsx` now call these primitives — opt-in via a header `Switch` (default off, existing plaintext history untouched), reusing `AuthContext`'s already-stored `Ed25519Keypair` (no new key generation), tagging outgoing ciphertext with a new client-only `ENCRYPTED_TEXT` `msgType` rather than sniffing `content`'s shape (an explicit sentinel, not a guess). Decrypt failures (stale/wrong keypair, corrupted payload) render a distinguishable muted/dashed bubble instead of raw ciphertext or a crash. **Live round-trip verified for real, 2026-08-02:** run against the actual running backend + real Postgres/Redis (no mocking) — two real participants registered via the real challenge/response auth flow, a real offer + trade created, two real WebSocket connections joined to the trade room. Buyer encrypted a message with `encryptChatMessage()`/seller's real pubkey; seller received the real `NEW_MESSAGE` WS frame (confirmed `msgType: 'ENCRYPTED_TEXT'`, `content` genuinely ciphertext, not plaintext) and decrypted it correctly with `decryptChatMessage()`. The buyer (sender) then re-fetched the same message via `GET /v1/openp2p/chat/:tradeId/messages` and decrypted their OWN sent ciphertext successfully — the specific property `crypto_box_seal` couldn't have provided, now proven against the real stored row, not just asserted in a unit test. A reply in the opposite direction (seller → buyer) round-tripped the same way. A wrong keypair correctly threw `decryptChatMessage`'s own clear error rather than silently producing garbage. Confirms the UI wiring (`Trade.tsx`/`ChatWindow.tsx`/`ChatMessage.tsx`) talks to a real, working server-side path end-to-end |
| SDK Core (`@satsails/p2p-trading-sdk`, ships as **Sails P2P Trading SDK** per the Named-SDK Rule, `PROJECT_CONTEXT.md` §3) | `SDK_GUIDE.md` | 🟢 **v0.1 real, partial** *(2026-07-17)* — `packages/sails-sdk`: Transport (real `fetch`/`WebSocket`, browser+Node) and Protocol SDK layers (`identity`/`reputation`/`liquidity`/`openp2p`/`settlement`/`peers`) are real, verified route-by-route against the actual `*.routes.ts` files, not `API_REFERENCE.md`'s prose — two real deviations from that doc found and documented in the process (`createIntent` needs `participantId`, `openp2p.trade()` needs `amount`). `identity.authenticate()`'s Ed25519 signing checked byte-for-byte against `auth.ts`'s real verification logic, not assumed compatible. 46 SDK tests (`packages/sails-sdk/tests/`), `npm run build`/`npm test` clean project-wide (57 suites, 689 tests as of 2026-08-07). **Still depends on P0's Participant Model + Proof Primitive being real** for the parts that don't yet — the six-verb Intent facade's `negotiate`/`submitProof`/`releaseAsset`/`dispute` throw `SailsNotImplementedError` rather than fake success (`intent-facade.ts`'s own header has the exact reasons); this SDK pass did not and could not close that gap itself, since it's Core/module work, not client-library work. **Correction, 2026-08-01:** `submitProof`/`releaseAsset`/`dispute` are now real (see the Proof Primitive row above and `docs/API_STABLE.md`) — only `negotiate` still throws, and for an architectural reason (shape mismatch against a real `WebSocketChannel`), not a missing backend. **Network reliability landed, 2026-08-02** — closes `PRODUCTION_READINESS_REVIEW.md`'s High-severity finding #1 on the SDK side, prompted by a CTO-directed positioning shift ("prova que funciona" → "referência de infraestrutura que uma wallet/fintech/parceiro institucional diria: eu preciso disso"): `transport.ts` gained real per-request timeouts (`AbortController`) and exponential-backoff-with-jitter retry for `GET` only — deliberately never for `POST`/`PATCH`/`DELETE`, since this backend has no client-generated idempotency-key mechanism to tell "safe retry" apart from "duplicate side effect after a lost response," the exact risk that review called out; `WebSocketChannel` (`modules/openp2p.ts`) now takes a socket factory instead of a bare `WebSocket` (a closed real socket can never reopen) and reconnects itself with backoff + jitter on an unexpected close, re-`JOIN_TRADE`-ing automatically, capped at `maxReconnectAttempts` before giving up; new `onConnectionStateChange()` hook (`'open'`/`'reconnecting'`/`'closed'`) for a UI to build a real indicator on. Both additive to `chat(tradeId, options?)`/`SailsClientOptions` — no existing caller's code needs to change. One disclosed, deliberate exception: `WebSocketChannel`'s own constructor shape changed (factory, not instance) — never itself part of `API_STABLE.md`'s frozen "Method inventory," but real enough to call out explicitly rather than silently. 17 new tests (`packages/sails-sdk/tests/transport.test.ts`, `packages/sails-sdk/tests/modules.test.ts`). Still open from that same review: finding #2 (SDK contract ambiguity), #4 (UI state sync), #5 (observability), #6 (demo placeholders) — untouched. **Finding #3 (client key custody) — SDK-side prerequisite closed the same day**: `WalletAdapter` (RFC-013) previously had no way to authenticate a session at all — `identity.authenticate()` needed the raw Ed25519 secretKey directly, so a real wallet integration for *identity* (as opposed to escrow signing, which `signTransaction()` already covered reasonably) was structurally impossible, not just undone. Added `WalletAdapter.signMessage(message)` (new required method — generic, works for Ed25519/secp256k1/hardware signers alike), `identity.createWithPublicKey(publicKeyHex, displayName?)`, and `identity.authenticateWithWallet(publicKeyHex, wallet)` — same exact challenge-response wire protocol and byte encoding `authenticate()` already uses, just delegated to the wallet instead of computed from a key this SDK never receives. `MockWalletAdapter` (`examples/sails-integration-starter`) updated to implement it. 7 new tests, including one proving `authenticateWithWallet()`'s signature passes the real server-side verification logic (`identity.test.ts`'s own established rigor for `authenticate()`). **The actual UI migration (`packages/sails-ui`'s `AuthContext.tsx`/`useEscrowKey.ts` off `localStorage`) is a separate session's own ownership boundary in this repo's current working setup — not edited from here; a concrete handoff spec referencing these now-real primitives was given to the project owner directly** |
| **`@satsails/p2p-schemas`** *(new — 04-Deepseek Review Task 1)* | `packages/sails-p2p-schemas` | ✅ **Done, verified** — real npm workspace package (first one; root `package.json` gained `workspaces`), types-only, zero runtime deps. `OfferSchema` (assetSell/assetBuy/paymentMethods/expiresAt — divergences from the real Prisma `Offer` model documented field-by-field in `offer.ts`, not papered over), `TradeState` (the `open → payment_sent → payment_confirmed → escrow_released` vocabulary, DERIVED from existing `Trade`/`Escrow`/`Dispute` columns via `deriveTradeState()` — deliberately not a fourth stored status column, to avoid a second source of truth; `payment_confirmed` currently aliases `payment_sent`, no backing column distinguishes them yet), `DisputeSchema` (§1.9's shape) |
| CRDT / WebRTC adoption | 04-Deepseek Review | 🔲 **Evaluated, deliberately not adopted now** — the Deepseek review's CRDT-based dispute/order-book model was weighed against the architecture already built: Postgres is the authoritative source (RFC-011), and a CRDT dispute document would reintroduce the divergent-sources-of-truth problem RFC-011 exists to close. The practical outcomes the review wanted (freeze + notify arbiter + arbiter resolves; shared order book) are delivered today by `dispute.service.ts` + EventStore pubsub and by `LiquidityRouter` respectively. CRDT/WebRTC remain candidates for the *client-side offline-first* layer (a wallet's local view syncing over P2P), which doesn't exist yet — adopting them belongs to that future work, with an RFC, not as a bolt-on to the server-side reference implementation |

## Known Debt — MULTISIG production-hardening (Missão 09 final freeze, 2026-08-18)

Nine items (H1-H9) found during Missão 09's real Bitcoin mainnet MULTISIG rehearsal (see `docs/MAINNET_MULTISIG_PROOF.md` for the underlying proof — funding `5815534b...a2ed`, release `db0b5e4b...d6ca8`, both independently verified on-chain). Deliberately **not** fixed as part of that mission — real BTC funding was mid-flight through most of them; CLAUDE.md's engineering-loop discipline says report and stop, don't fix live in a fund-moving path. None of these blocked the specific escrow Missão 09 proved end-to-end (its own collision-freedom, outpoint, and signature requirements were all verified directly for that one escrow, not assumed) — they matter for treating MULTISIG as a *definitive production model* rather than a proven-once rehearsal.

**H1 — No explicit dust validation.** `buildUnsignedSpend()` (`multisig.provider.ts`) only guards `spendableValue <= 0n` — there is no check against Bitcoin's standard-relay-policy dust threshold (~294 sats for a P2WPKH output under current relay rules). Severity: low at typical rehearsal/escrow values (this mission's own 29,836-sat output was nowhere near dust), but a small enough `lockedAmount` combined with a high fee rate could construct a technically-valid but non-relayable (or trivially unspendable-by-fee) output today with no earlier, clearer error. Recommend an explicit dust-threshold check before broadcast, not left to the network to reject.

**H2 — `keyIndexFor()` reduces to a 31-bit BIP32 index.** `sha256(role:id).readUInt32BE(0) % 0x7fffffff` (`multisig.provider.ts`, reused by the demo's `deriveClientKeypair()`) — BIP32 only defines 2³¹ non-hardened indices per level, so two different ids (arbiterId, or an escrowId per the fix below) can theoretically collide on the same index despite different sha256 inputs. Theoretical risk is low (birthday bound over 2³¹ slots) but real and worth a production-grade collision strategy (e.g. a full 256-bit hardened multi-level path derived from the id) before this derivation is treated as more than a demo-scoped recoverability mechanism. **Not altered in this mission.**

**H3 — `Escrow.txLockId` persists a bare txid, not the funding outpoint.** `buildUnsignedSpend()` re-queries the explorer at spend time and matches whichever UTXO at the address has that txid, then trusts whatever `vout` the explorer reports. Correct today only because every funding transaction tested paid the multisig address with exactly one output. Bitcoin identifies UTXOs by outpoint (`txid:vout`), not txid alone. Recommend persisting the full outpoint at `lockFunds()` time. **Not altered in this mission** (schema change).

**H4 — Demo funding-poll resilience.** `waitForFunding()` in `examples/demo/multisig-testnet-flow.ts` originally let a single transient `fetch()` failure (explorer connect timeout, DNS blip) crash the whole process, destroying the in-memory buyer/seller keys it existed to protect. **Fixed in this mission** — the fetch is now wrapped in try/catch that logs and retries instead of throwing (confirmed present in the committed file, exercised for real during this mission's own rehearsal runs).

**H5 — Client key recovery: demo mechanism vs. production wallet design.** The original demo used `generateEscrowKeypair()`'s pure random ephemeral keys with no backup. This mission demonstrated recoverability via a client-owned seed (`DEMO_BUYER_SEED`/`DEMO_SELLER_SEED`) plus escrow-bound deterministic derivation. This is a **demo proof that the recoverability pattern works**, not a production wallet key-management contract — `generateEscrowKeypair()`/`escrow-key.ts` (the real, published SDK surface) is unchanged and still returns fresh random keys; the deterministic-derivation code lives only in the demo script. A real wallet integration would derive escrow keys from its own already-backed-up HD seed (e.g. BIP39) the same structural way, but that is a design recommendation for wallet integrators, not something this mission promoted into the SDK.

**H6 — Address uniqueness (found and fixed in this mission).** An initial version of the demo's recoverable-derivation fix bound buyer/seller keys only to the client seed, not to the specific escrow — two different escrows built with the same seeds produced byte-identical pubkeys and the identical P2WSH address (confirmed directly: escrow `418d10d8...` and `67738ec6...` both derived the same address, before any funds were sent). **Fixed** by binding derivation to `escrowId` via `keyIndexFor()` — re-verified that two different escrows from the same seeds now produce two different addresses, and a real restart against the same escrowId recovers the same address (cross-checked against the real `multisigProvider.getDepositAddress()`, not a reimplementation).

**H7 — Funding attribution (related to H3, not a duplicate).** `lockFunds()`/`verifyLock()` locate a funding UTXO by address + minimum value only, with no txid/vout cross-check against what's already recorded for other escrows. Combined with H6's now-fixed address-collision risk being closed, this is lower-severity than it was, but the underlying attribution model (match by value at an address) is still not outpoint-precise — see H3's recommendation, which resolves both together rather than as two separate fixes.

**H8 — Pre-signature human verification (added in this mission).** The demo originally signed and broadcast immediately after building the PSBT, no human checkpoint. **Fixed** — the rehearsal now decodes and prints the unsigned PSBT (input outpoint, amount, destination, fee, outputs, required signers) and stops unless `DEMO_AUTHORIZE_SIGN=true` is explicitly set in a separate invocation. Recommendation for production: a real wallet UX must show the same fields (input, outpoint, amount, destination, fee, outputs, required signers) before requesting a user's signature — this mission's gate is a demo-script stand-in for that UX requirement, not the UX itself.

**H9 — Protocol fee.** Audited directly (see `docs/MAINNET_MULTISIG_PROOF.md`'s "Sails Protocol fee" section): `chargeProtocolFee()` is real and wired into every MULTISIG release, but `PROTOCOL_FEE_RATE` defaults to 0 and was never set during this mission — confirmed via Postgres that `feeCharged` is null and no `fee_distributions` row exists for the rehearsed escrow. The 164 sats observed on-chain are entirely Bitcoin miner fee. Not a gap to fix — a factual finding to keep visible so a future nonzero-rate run isn't assumed untested by this proof.

**Update — Missão 10 (2026-08-18), MULTISIG Production Hardening, Fases 1-4:**

- **H1 (dust validation) — fixed.** New `bitcoin-dust-policy.ts` computes Bitcoin Core's real `GetDustThreshold()` formula from the actual destination script's serialized size (not a universal `DUST = 546` constant) — P2WPKH=294, P2WSH/P2TR=330, P2PKH=546, P2SH=540 sats, all empirically verified against real mainnet addresses. Wired into `buildUnsignedSpend()` (shared by release/refund/split), rejecting a sub-dust output before any PSBT is built — proven via a real-Postgres test (`tests/integration/multisigDustPolicyIntegration.test.ts`) that a rejected build never creates an `EscrowPendingTransaction` row, so no signature is ever requested.
- **H3 / H7 (outpoint persistence/attribution) — fixed for new escrows.** `Escrow.txLockVout` (nullable, additive) now persists the full funding outpoint alongside `txLockId`; a new `@@unique([txLockId, txLockVout])` constraint (relying on Postgres's NULLS DISTINCT default) makes the database itself, not a check-then-write, refuse two escrows claiming the identical outpoint. `buildUnsignedSpend()` selects the exact `(txid, vout)` when `txLockVout` is set.
- **New explicit debt (CTO-flagged, deliberately not resolved this mission): legacy-outpoint resolution.** Every escrow locked before this migration has `txLockVout = NULL` and falls back to the original txid-only UTXO match (`buildUnsignedSpend()`'s legacy branch) — this remains structurally ambiguous if a historical multisig address ever received more than one funding output. No backfill was attempted and none should be via speculative computation or explorer consultation outside a dedicated future pass with its own review — the risk is bounded (funding addresses are per-escrow and single-use by convention) but not eliminated by this mission.
- H2 (key-derivation collision bound) and H5/H8 (client key recovery, pre-signature verification contract) remain open, gated behind Missão 10's own later phases (STOP GATE CRYPTO, wallet-signing contract) — not touched by Fases 1-4.

**Update — Missão 10 (2026-08-19/21), Fases 6-9/6.10/6.11 — H5/H8 closed, H2 corrected and reclassified:**

- **H5 (client key recovery) — closed.** `@satsails/p2p-trading-sdk`'s new `deriveEscrowKey()`/`recoverEscrowKey()` give a real, production-shaped (not demo-only) deterministic derivation for buyer/seller escrow keys — a frozen, versioned BIP32 path (`m/1888146842'/coin_type'/script_type'/role'/account_index'`, all levels hardened, official test vectors against the public BIP32 spec seed), fully additive alongside the existing `generateEscrowKeypair()` (unchanged, still the default). Recovery works fully offline from seed + local wallet metadata (Level 1). A second, separate check — `verifyRecoveredKeyRegistration()` (Level 2) — confirms the recovered key matches what the Sails protocol actually has on record for that escrow/role, reading a new additive `participantKeys` field on the already-authenticated/authorized `GET /v1/settlement/escrow/:id` response (buyer/seller/assigned-arbiter only, same gate every other field already requires) — no new endpoint, no reverse pubkey lookup. Fails closed on missing or duplicate registration entries.
- **H8 (pre-signature verification contract) — closed.** New `verifySigningIntent()`/`verifyAndSignEscrowPsbt()` decode a real release/refund/split PSBT and compare it field-by-field (input outpoint/value/script, every output's destination+value, miner fee, threshold, participant pubkeys, required signers) against the caller's own expectation before any signature is produced — signing is structurally unreachable when verification fails. Covers a 14-case adversarial matrix (tampered txid/vout/input value/destination/amount/fee/extra output/OP_RETURN/network mismatch/witnessScript/threshold/pubkeys/required signer/split ratio).
- **H2 — corrected and reclassified, effective 2026-08-21.** The original framing ("theoretical risk over 2³¹ slots") generalized "arbiter" and "participant-scale" together and overstated the arbiter's real exposure. A direct, read-only re-audit of the live code found: `MultisigProvider.partiesFor()` (and `getDepositAddress()`) always call `defaultArbiterId()`, which always returns `config.settlement.trustedArbitrators[0]` — the MULTISIG script's arbiter key is derived from **exactly one** distinct `arbiterId` value system-wide, for as long as that config entry doesn't change (confirmed by direct code reading, not assumed — `assertArbiterMatchesScript()`'s own existing "single-arbiter limitation" comment already implied this, this pass just confirmed it end-to-end). A birthday-bound collision is not merely improbable here, it is structurally impossible with n=1 draw. Cross-checked `lightning-hodl.provider.ts`'s own `deriveArbiterKey()`: a completely different construction (`sha512(config.arkade.seed + seedFor(...))`, separate seed) — no key-material reuse between MULTISIG and LIGHTNING_HODL arbiter roles.
  - What remains real, not closed: the derivation path's last level (`m/0'/0/${index}`) is still non-hardened — the classic "xpub + one leaked child key ⇒ parent private key" BIP32 exposure class. No pathway in the current codebase exports this branch's xpub anywhere (`MULTISIG_SEED` is server-only, no watch-only/hardware-wallet flow touches it), so this is a **design constraint to keep in mind**, not an active production blocker.
  - The existing derivation must **not** be changed retroactively: the arbiter's pubkey is baked permanently into every already-created MULTISIG P2WSH redeem script — including the real Missão 09 mainnet escrow. Any derivation change would need its own versioning scheme (analogous to `txLockVout`'s additive-column pattern) and would apply prospectively only, never to historical scripts.
  - **Reclassified**: H2 moves from "production-hardening debt" to **compatibility/design constraint** — reopen only if any of: (a) MULTISIG ever supports multiple concurrent arbiters per escrow (not supported today, by explicit design); (b) an arbiter xpub/watch-only export pathway is ever introduced; (c) arbiter key rotation/versioning is ever needed; (d) the arbitration model changes in a way that feeds more than one distinct `arbiterId` into `keyIndexFor('arbiter', ...)`.

**Update — Missão 11, Fase 4.2 (2026-08-22), Protocol Fee Collection — read-only adversarial economic audit, four activation blockers found:**

Fases 3 (Settlement Obligation Integration), 4 (Protocol Fee Collection Implementation), and 4.1 (Final Collection Hardening) were implemented, adversarially audited, and committed together (`a87764f`). The audit did **not** find defects in what those three phases built — the MULTISIG construction math (exact funding, conservation, dust handling, destination freeze) held under direct attack. What it found is the boundary of that scope: real fee collection cannot yet be safely activated in production, for reasons outside the construction logic itself. These are **not failures of Fases 3/4/4.1** — they are the next phase's own scope, tracked here so activation isn't attempted before they're closed.

**ACTIVATION BLOCKER A — CLOSED (Missão 11, Fase 5, 2026-08-22).** ~~no production transition ever moves a collected `FeeObligation` to `COLLECTED`.~~ `FeeCollectionRecognitionService` (`fee-collection-recognition.service.ts`) now records real `FeeCollectionEvidence` (BROADCAST at signature-finalization time, CONFIRMED via `multisig-fee-confirmation-job.ts`'s sweeper re-verifying against the real chain) and drives the real `PENDING_COLLECTION → IN_PROGRESS → COLLECTED` transition, gated by a configurable, snapshotted `FeePolicyVersion.requiredConfirmations`. Original text preserved above for audit-trail context.

**ACTIVATION BLOCKER B — CLOSED (Missão 11, Fase 5, 2026-08-22).** ~~`FeePolicyVersion` must not be activatable for a rail with no real fee-aware collection.~~ `escrow-providers.ts`'s `assertRailCanActivateFeeCollection()` (backed by `FEE_COLLECTION_CAPABLE_RAILS`) is now enforced both at `FeePolicyService.publish()` time and defense-in-depth at `computeSnapshotFields()` time — publishing a policy for `LIGHTNING_HODL`/`SAFE_GUARD_EVM`/`WDK_USDT_EVM` is rejected at the code level, not left to a runbook.

**ACTIVATION BLOCKER C — CLOSED (Missão 11, Fase 5, 2026-08-22).** ~~Phase-0 `chargeProtocolFee()`/`FeeDistribution` coexistence must be retired or structurally excluded.~~ `escrow-lifecycle.ts`'s `chargeProtocolFee()` now returns `null` immediately whenever `escrow.feePolicyVersionId` is set, making Phase-0/new-mechanism coexistence structurally impossible at the escrow level regardless of `PROTOCOL_FEE_RATE`'s live value — no reliance on an operational runbook.

**ACTIVATION BLOCKER D — CLOSED (Missão 11, Fase 5 / 5.1 / 5.2, 2026-08-22).** ~~wallet-side fee-aware pre-signature verification exists only as an unused SDK capability.~~ `examples/demo/multisig-testnet-flow.ts` now demonstrates a real call to `verifyAndSignEscrowPsbt()`/`buildExpectedFeeAwareReleaseOutputs()`. Fase 5.1/5.2 went further than the original blocker asked: `packages/sails-sdk`'s `wallet-verification.test.ts` proves the verification logic itself is remote-wallet-clean (zero imports from `src/`, zero access to `multisigProvider`/`MULTISIG_SEED`/server config), and the escrow's own arbiter public key — previously only derivable by a party co-located with `MULTISIG_SEED` — is now a persisted, escrow-specific commitment (`EscrowParticipantKey` role='arbiter') exposed through the existing authenticated `GET /v1/settlement/escrow/:id` response, closing the gap between "the SDK can verify" and "a genuinely remote wallet has the real data to verify with."

**ESCROW-SPECIFIC ARBITER COMMITMENT / HISTORICAL STABILITY — CLOSED (Missão 11, Fase 5.2 / 5.3, 2026-08-22).** New finding, not part of the original Fase 4.2 audit: no durable, escrow-specific, immutable source of a MULTISIG escrow's committed arbiter public key existed anywhere in the codebase — a future `TRUSTED_ARBITRATORS`/`MULTISIG_SEED` change could silently redefine what an existing escrow's script meant. Closed by persisting the exact arbiter pubkey used at script-construction time (`EscrowParticipantKey` role='arbiter', write-once, DB-trigger-enforced immutability), and by `assertArbiterMatchesScript()` now failing closed the moment the live-derivable key no longer matches an escrow's own persisted commitment — proven against real config/seed drift, through the real signature-collection path (not a hand-built fixture), including the `triggeredBy` context-threading fix Fase 5.3 found and closed in the same pass. Legacy (pre-Fase-5.2) escrows are read-compatible with no backfill.

**FOLLOW-UP, NON-FEE — still open.** `sweepExpiredEscrows()` (`escrow.service.ts`) calls `refundFunds()` directly, which throws "not directly callable" for MULTISIG/LIGHTNING_HODL/SAFE_GUARD_EVM (client-held-keys design) — an escrow of those types that expires while `FUNDS_LOCKED` can never be auto-refunded by the sweeper; it requires a human-driven dispute → REFUND ruling through the signature-collection path instead. Pre-existing, unrelated to fee economics, tracked separately.

**LOW HARDENING — CLOSED (Missão 11, Fase 5, 2026-08-22).** ~~`buildUnsignedSplit()`'s `sellerBasisSats` used plain JS `Number` arithmetic~~, now exact `BigInt` arithmetic (`(BigInt(tSats) * BigInt(10000 - buyerBps)) / 10000n`), matching `fee-obligation.service.ts`'s own Decimal exactness at any trade size.

**Update — Missão 11, Fase 5 / 5.1 / 5.2 / 5.3 (2026-08-22):** all four Fase 4.2 activation blockers plus the Low Hardening item above are closed, per the CTO-reviewed reports for each phase (real-Postgres integration tests, full-repo regression at 116/116 suites / 1315/1315 tests, 0 skips, each time). **Remaining open, deliberately not addressed by this work and not authorized by it:**
- Protocol-wide fee activation for rails other than MULTISIG (`LIGHTNING_HODL`/`SAFE_GUARD_EVM`/`WDK_USDT_EVM` have no real fee-aware collection construction at all, not just a gating gap).
- `LIGHTNING_HODL`'s own analogous single-arbiter/live-config-derivation pattern (`ArkParties.arbiterId`, its own `defaultArbiterId()`) has the exact same historical-stability gap this update closed for MULTISIG — found during Fase 5.2, explicitly out of that phase's MULTISIG-only scope, not fixed.
- `escrow-pending-tx.ts`'s signature-collection path still never threads `triggeredBy` fully into every downstream consumer beyond what Fase 5.3 needed — worth a broader audit, not done here.
- The false-green Postgres-test-hygiene pattern Fase 5.3 fixed in two named files (`feePolicyImmutability.test.ts`, `feeCollectionRecognitionIntegration.test.ts`) still exists identically in other integration test files (e.g. `postgresProductionReadiness.test.ts`) — not fixed, disclosed only.
- Production protocol fee rate selection (0.40% or any other number), revenue-distribution percentages, production collection address/key generation, and any real mainnet transaction remain untouched and unauthorized by this work — a separate CTO gate.

Next phase: **Missão 11 — Protocol Economics / Revenue Distribution Design.**

**Update — Durable Protocol Truth Foundations mission (frozen 2026-09-04, `main` `0cd260abdbdd8d98945a835d64cd6e631af499f3`, full record `docs/DURABLE_PROTOCOL_TRUTH_EVIDENCE.md`) — one new, genuinely distinct architectural residual, not a MULTISIG-rehearsal finding like H1-H9 above but tracked in this section for the same reason those are: a real, disclosed gap this backlog's own traceability rule requires staying visible, not a MULTISIG production-hardening item.**

**Independent Verifiability of Authority → Outcome → Destination Binding.** The property question: can an independent verifier establish, without trusting operator-held database associations, that a specific Outcome and DestinationBinding are the authorized consequence of a specific signed Authority decision? Traced end to end (full 7-link binding-chain table in the evidence doc's §18.2): the signed `AuthorityDecisionPayload` (`arbitration-authority.ts`) is independently verifiable (Ed25519, domain-separated, portable canonicalization shipped in both server and SDK); the Outcome content it implies is **conditionally, deterministically derivable** (`buildRulingOutcomeContent()` is a pure function of the signed `ruling`/`buyerBps` plus `totalUnits`/`asset`/`buyerId`/`sellerId`) — but those four context values are not uniformly obtainable independently of the operator: `totalUnits`/`asset` are chain-observable for MULTISIG (the funding transaction, not arbiter-decided), while `buyerId`/`sellerId` remain **database-associated only and are not independently obtainable under the demonstrated evidence scope**. The derivability is real and conditional on that distinction, never "Outcome is universally independently verifiable." `hashOutcomeContent()` exists in `@sails/core`, is tested, and has no production call site, but that fact alone does not mean Outcome is unbound. The chain's one real break is **Outcome → DestinationBinding**: no signature, hash, or deterministic derivation ties the persisted destination to the signed decision anywhere in this codebase — confirmed even for MULTISIG, the one rail with every other link in the chain real. This holds even though `EscrowEvent`/`DurableEventRecord` are both real, append-only, hash-chained records (both anchored at a hardcoded, externally-unverified `'genesis'` sentinel, a related but distinct finding). A claim that an operator could silently reassociate a different destination with an already-signed decision is classified precisely as **structural integrity / equivocation risk** — the application itself has zero `SemanticTransitionRecord` UPDATE call sites, so this was **not** dynamically demonstrated as an exploit; the gap is that nothing independently constrains what gets written in the first place, not that an existing record was shown to be rewritable. **This is a property gap, recorded here without prescribing a mechanism** — no hash, signature, Merkle structure, or anchor is proposed by this entry; whether and how to close it is a future, separately-authorized decision. Related, already-tracked, and explicitly not duplicated by this entry: `docs/TECHNICAL_DEBT_AUDIT.md` #40-43 (Recovery/Reconciliation's own already-disclosed residuals) and the GitHub Project's "Recovery/Reconciliation Coverage Across Settlement Paths" / "Live Correspondence Coverage Across Settlement Paths" deltas (Backlog Delta Syncs #6/#7) — those concern *whether recovery/correspondence machinery exists per settlement path*; this entry concerns *whether the one MULTISIG path that has it also has independently verifiable content-binding*, a narrower and distinct question. Separately, this same investigation found `docs/BACKLOG.md`'s own **row 155 above ("Sails OpenProof") is stale relative to row 156 directly below it** — row 155 still describes `ProofRegistry`/`EvidenceProvider`/`TimestampAnchor` as "genuinely remaining," while row 156 (dated 2026-08-04, added later) correctly documents all three as done, including RFC-008's `TimestampAnchor.anchor()` being real, live-wired, working code (`upgrade()`'s Bitcoin-block-confirmation step honestly disclosed as not built). Flagged here as an internal self-contradiction within this same document, not resolved by this entry — row 155's summary was simply never updated after row 156 superseded it.

**Update — Cold Sweep Institutional Sync (2026-09-04, `main` `eb98099e7fe8e65600826500ce7055a862fc184b`, spanning the New CTO Cold Sweep, its adversarial verification, the Delta Closure Preflight, and the Mintlify Developer Documentation Surface Audit) — two new institutional obligations registered below, neither corrected by this entry.**

**Current Truth Reconciliation.** One bounded documentation-accuracy obligation with two execution slices, both registered only — not corrected here, per this repository's own dated-correction discipline (see row 155/156's self-correction above for precedent).
- **Repository current truth.** Eight known stale instances: this file's own "Phase Verification" section (above) understates settlement-provider/economic-model progress relative to this file's own later sections; `docs/00-INDEX.md` misstates its own document count and describes `@sails/core` as having no implementation, though real code exists since the Sails Core Implementation Program (2026-08-30 onward); `docs/HANDOFF.md`'s operational sequencing (dated 2026-07-20) carries no superseded marker despite ~7 weeks of since-closed work it cannot know about; `docs/TRUST_BOUNDARY.md`'s summary-level custody claim doesn't forward-reference its own already-disclosed WDK_USDT_EVM exception; five Core module header comments (`discretionary-authority.ts`, `dispatch-gate-adapter.ts`, `destination-correspondence.ts`, `economic-outcome.ts`, `semantic-transition-record.ts`) still read "NOT WIRED INTO ANY LIVE PATH" despite being wired into the live MULTISIG dispute-settlement path since 2026-08-30 — the highest-priority instance, since it concerns real fund-dispatch code, not prose; `docs/SDK_usecases.md` still describes `LightningHodlProvider` as unimplemented (real since 2026-07-27); `docs/GITHUB_PROJECT.md`'s Bucket D still shows Archify as unstarted despite Pass 1 having shipped (PR #54, 2026-09-02); `docs/DX_REVIEW.md` (2026-07-29) carries no current/historical status marker despite its recommendations having been substantially adopted since.
- **Mintlify developer-surface current truth.** The public Mintlify site (`satsails.mintlify.site`, ~28 real pages) is live and populated — this repository's own prior tracking of it (`docs/GITHUB_PROJECT.md` §D.2, "not scoped, not designed, not started") is itself one of the stale artifacts this obligation covers; see the dated correction added to that section. Known P0 findings, none corrected by this entry: a blanket "all without centralized custody" statement on the site's settlement-concepts page contradicts its own escrow-lifecycle page's correct WDK_USDT_EVM "server-custodial" disclosure; `LIQUID_COVENANT` is presented as an available provider despite being a reserved, deliberately unimplemented `EscrowType` value (`escrow-providers.ts`; `DATABASE.md` §2; 2026-08-01 decision, recorded above under "Third and fourth real providers landed"); unqualified reputation/identity "portable... from day one" language conflicts with this repository's own frozen `Participant Portability = NOT DEMONSTRATED` state; LIGHTNING_HODL is described by its pre-2026-07-27 superseded HTLC/hold-invoice design rather than its real Arkade/VTXO/Taproot mechanism.

Neither slice is authorized for correction by this entry. See `docs/NORTE_FIXO.md` macrofront 23 (GitHub/Knowledge Architecture); relationship to macrofront 22 (Developer Docs/Mintlify). Project representation: one card, "Current Truth Reconciliation — Repository & Mintlify P0" (Documentation workstream).

**Update — Current Truth Reconciliation, P0 repository slice closed (2026-09-05, PR #66, merge `71dc1addf0e3fe48f92df2bb6bb359fd5c2b123d`).** Of the eight repository instances listed above, the five stale Core module header comments (`discretionary-authority.ts`, `dispatch-gate-adapter.ts`, `destination-correspondence.ts`, `economic-outcome.ts`, `semantic-transition-record.ts`) and `docs/TRUST_BOUNDARY.md`'s summary-level custody forward-reference are corrected. Each correction is explicitly scoped to MULTISIG only (and, for `semantic-transition-record.ts`, the escrow-expiry transition on the three signature-collection-type rails) — the corrections state plainly that LIGHTNING_HODL/SAFE_GUARD_EVM/WDK_USDT_EVM/MOCK remain on the legacy `applyRuling()` path, unchanged. **Not solved by this update:** the remaining six repository items from the list above (`docs/BACKLOG.md`'s own Phase Verification section, `docs/00-INDEX.md`, `docs/HANDOFF.md`, `docs/SDK_usecases.md`, `docs/GITHUB_PROJECT.md`'s Archify status, `docs/DX_REVIEW.md`) are untouched and remain exactly as stale as described above. **The Mintlify slice is separately, not independently verified or closed by this update** — four corrections were made via Mintlify's own editing tool and a PR was opened (`mintlify-community/docs-satsails-38258ae8#1`, commit `388fce2da4ae59794ac11dbc34a828bdbe15873b`), but that PR lives in a private, access-restricted repository this repository's own tooling (`gh`, direct HTTP fetch) could not independently confirm — see the separate registration below. The overall Current Truth Reconciliation obligation (this entry, both slices) is **not** complete; only the named P0 repository items are.

**Update — Mintlify repository architecture / review-provenance gap (2026-09-05, discovered while closing the P0 slice above).** Mintlify developer documentation is edited through a separate, access-restricted git repository (`mintlify-community/docs-satsails-38258ae8`), not this repository. This is not a claim that a separate repository is inherently wrong — it is that this repository currently has no demonstrated visibility, review linkage, or provenance guarantee showing how Mintlify-derived documentation participates in the normal engineering review and claim-governance process this repository's own PRs go through (CI, CodeQL, `check:core-boundary`, the dated-correction discipline used throughout this file). No mechanism, cross-repo sync, CI integration, or repository-merger is proposed or authorized by this registration — the gap itself is the finding. See `docs/NORTE_FIXO.md` macrofront 23 (GitHub/Knowledge Architecture), relationship to macrofront 22 (Developer Docs/Mintlify).

**Update — Current Truth Reconciliation P0 closed (2026-09-06).** A1 (repository) closed 2026-09-05 via PR #66, merge `71dc1addf0e3fe48f92df2bb6bb359fd5c2b123d` (recorded above). A2 (Mintlify) is now published and independently live-verified: all four P0 findings — the custody-topology blanket claim, `LIQUID_COVENANT` presented as available, the unqualified reputation/identity portability claim, and the obsolete LIGHTNING_HODL HTLC/hold-invoice framing — are corrected on the live, production developer-facing surface, not merely in a pending draft. With both slices closed, the Current Truth Reconciliation P0 obligation registered above is **complete**. **Explicitly not solved by this closure, and not to be read as solved:** the separately-registered Mintlify repository architecture / review-provenance gap (immediately above) — publishing corrected content to production does not establish review linkage, cross-repo provenance, or automated governance between this repository and Mintlify's own repository; that finding remains open and unchanged. The 6 remaining repository items named in the P0-repository-slice update above (BACKLOG Phase Verification, `00-INDEX.md`, `HANDOFF.md`, `SDK_usecases.md`, `GITHUB_PROJECT.md` Archify status, `DX_REVIEW.md`) were P1+ items outside this P0's scope from the start and remain untouched — their being outside P0 scope is not itself a new finding.

**Update — Current Truth P1+ set extended by one instance (2026-09-06, found during the Architecture Derivation Addendum investigation).** A seventh stale repository instance, of the same P1+ character as the six above (not P0, not fixed by this entry): `docs/TRUST_BOUNDARY.md`'s Boundary 1b ("Device → Backend (P2P node start)") still states that the caller's raw Ed25519 secret key transits `POST /v1/peers/start` and is held only in-memory by `PearNode`. Current implementation no longer behaves that way — `pear.service.ts`'s 2026-08-09 key-custody fix changed `PearNode.start()` to take no caller-supplied key at all; it generates its own transport keypair via `HyperDHT.keyPair()`. Classification: **current truth documentation drift only** — not a new architecture gap, not a new custody vulnerability, and not proof of anything stronger than what it actually shows: economic participant identity and transport identity are demonstrably different keys today, but their association remains server-mediated/database-associated (`User.peerId`, checked by `verifyHandshakeIdentity()`), not independently cryptographically bound. Grouped with, not duplicating, the six P1+ items named above — the set is now seven, still out of P0 scope, still not fixed by this entry.

**Cross-Rail Guard-Maturity Disclosure.** A functionally uniform `SettlementProvider` interface must not cause an integrator to infer uniform security/authority/verification/guard properties across rails when those properties materially differ — a disclosure obligation, not an equivalence requirement, and not authorization for any new registry, schema, API, or Core primitive. Custody topology, destination authority, translation-guard asymmetry, recovery/reconciliation scope, and production eligibility are all already substantially disclosed elsewhere (`docs/PROVIDER_SUBSTITUTION_INVARIANCE_EVIDENCE.md`; the Independent Verifiability of Authority → Outcome → Destination Binding entry above, a distinct property from this one; `docs/RECOVERY_RECONCILIATION_CONFORMANCE_EVIDENCE.md`). What is not yet disclosed: MULTISIG's fail-closed capability-profile enforcement (`capability-profile.ts`, `REQUIRED_CAPABILITY_PROFILE`) is a second, real, MULTISIG-only guard mechanism entirely absent from `docs/PROVIDER_SUBSTITUTION_INVARIANCE_EVIDENCE.md`, and the one consumer-facing disclosure surface that exists (`custodyModel`, `docs/API_REFERENCE.md`) presents MULTISIG and LIGHTNING_HODL under an identical label with no caveat about this guard-maturity gap. Registered only — no correction, mechanism, or new interface authorized by this entry. See `docs/NORTE_FIXO.md` macrofront 12 (OpenSettlement); cross-reference macrofront 27 (Security). No Project card created — Backlog representation is sufficient while no execution mission is authorized (default posture: Backlog first, Project when executable work is scheduled).

**Property Preservation Under Composition — deliberately not given its own row here.** Registered as a research question/hypothesis only, at the GitHub Project level (a new small card, distinct from the existing "Ecosystem Composition Hypothesis" — that hypothesis concerns Sails benefiting from *external* ecosystem capabilities, e.g. WDK, a materially different question from this one) rather than duplicated in this file, consistent with this repository's existing practice of keeping Hypothesis-tier items Project-only (e.g. "Reputation / Portable History Program") until they graduate to real engineering work. For the record: "composition is untested" is not an accurate claim — `tests/fullTradeLifecycle.test.ts` provides real cross-module evidence for the OpenLiquidity→OpenP2P→OpenSettlement→OpenReputation happy/dispute paths — and neither is "property preservation under composition is demonstrated," since every conformance-evidence doc in this repository is explicitly single-module/single-component scoped by its own text. The correct state is OPEN RESEARCH QUESTION. The reputation duplicate-event/double-count finding surfaced while investigating this question is **not new** — already durably represented since 2026-07-19 at the "Hard precondition"/"Future RFC candidate" rows above and in `docs/TODO.md` §17; not duplicated by this entry. See `docs/NORTE_FIXO.md` macrofront 26 (Conformance); potential relationship macrofront 30 (Productization/Ecosystem Composition).

**Update — Independent Code Quality & Production Reality Audit, Institutional Sync (2026-09-06).** Four bounded technical obligations registered, none authorizing a mechanism — property statements only, per this file's own existing discipline.
- **Bounded liveness for live chain/RPC calls.** Live network calls to a Bitcoin explorer or EVM bundler (`multisig.provider.ts:228,243,270,300,314,654,908,930`; `safe-guard-evm.provider.ts:571`) must fail within a bounded time and may be retried a bounded number of times before propagating — none does today (no `AbortSignal`, no timeout, no retry ceiling). Property at risk: settlement-path availability, not economic correctness. Full evidence and reasoning: `docs/TECHNICAL_DEBT_AUDIT.md` #51. **PARTIAL / PENDING CTO GATE (Bounded Remediation F1, 2026-09-06)** — see that item's own dated status updates (an initial CLOSED claim, then a same-day CTO Gate correction) for the full evidence. Raw `fetch()` paths (multisig explorer, EVM bundler) are CLOSED — real `AbortController`-backed timeout, genuinely cancels the in-flight request. `ethers` RPC paths (SAFE_GUARD_EVM `getNonce`/`getStorage`/`getBalance`×2) are PARTIAL — caller-wait is bounded by a real, empirically-confirmed transport-level timeout (`ethers.FetchRequest.timeout`, not a `Promise.race`), and retry is safely sequential (no overlapping attempts), but the underlying TCP socket is not guaranteed torn down by `ethers` itself — confirmed via a reproducible hang during test development. Not closed pending the CTO's decision on whether this narrower property is acceptable or a custom transport is warranted.
- **Shared SDK↔backend escrow-creation contract truth.** `packages/sails-p2p-schemas` covers dispute/offer/trade/capability-profile/bitcoin-network but not escrow creation; `packages/sails-sdk`'s settlement `create()` and `settlement.routes.ts`'s `createEscrowSchema` are maintained independently today, with one comment already documenting a real past divergence (missing `WDK_USDT_EVM`/`SAFE_GUARD_EVM`). Property at risk: SDK↔server contract integrity. Full evidence: `docs/TECHNICAL_DEBT_AUDIT.md` #52. **CLOSED (Bounded Remediation F5, 2026-09-06)** — see that item's own dated status update for the full evidence; `packages/sails-p2p-schemas/src/escrow.ts` is now the single canonical source (SDK, `escrow.service.ts`, and `settlement.routes.ts`'s zod schema all import it, none redeclares its own copy), parity proven by direct compiler evidence (the route's pre-existing `as any` cast was removed and the code still compiles) plus `tests/escrowCreationSchemaParity.test.ts`. `AssetType`/`EscrowType`'s other, non-creation-specific declarations elsewhere in the repo are unchanged, deliberately out of this fix's scope. **Correction (CTO Gate, 2026-09-07):** an initial version of the shared package also included a hand-written runtime validator (`isValidCreateEscrowInput()`), which was removed — it was itself a second, independently drifting validation implementation. The shared package provides the canonical structural type/enum source only; `settlement.routes.ts`'s Zod `createEscrowSchema` remains the sole runtime validation authority, unchanged. Full detail: `docs/TECHNICAL_DEBT_AUDIT.md` #52's own dated correction.
- **`verifyLock()` fate decision (not made here).** All four `SettlementProvider` implementations define `verifyLock()`; zero real call sites exist anywhere in `src/` (self-documented, `multisig.provider.ts:762-765`). A future pass must decide: wire it into a real property-bearing path, or remove it — this entry names the decision, it does not make it. Full evidence: `docs/TECHNICAL_DEBT_AUDIT.md` #53. **CLOSED, Decision B — removed (Bounded Remediation F6, 2026-09-07)** — see that item's own dated status update for the full adversarial analysis and evidence. `verifyLock()` duplicated `lockFunds()`'s own funding-verification logic in every real provider with no real caller anywhere; nothing that actually protected funds was removed, only the redundant, never-called interface member. **Precision correction (CTO Gate, same day):** the real, unchanged property is that a lock operation's result/evidence/event are only finalized after `provider.lockFunds()` succeeds — not that the `FUNDS_LOCKED` status itself can only exist post-verification (the atomic state claim happens provisionally, before the provider call; see `docs/TECHNICAL_DEBT_AUDIT.md` #53's own dated correction for the full account).
- **`WDK_USDT_EVM`'s `lockFunds()` — unknown-outcome / retry-safety evidence gap (new delta, CTO Gate #2 on F6, 2026-09-07).** Not caused by, and does not invalidate, F6's `verifyLock()` removal — a separate, independent finding on `lockFunds()` itself, surfaced during F6's review. `escrow.service.ts` reverts the provisional `CREATED→FUNDS_LOCKED` claim to `CREATED` whenever `provider.lockFunds()` throws, making the internal database state retryable — but this does not by itself demonstrate that `WDK_USDT_EVM`'s own external side effect (`wdk-settlement.provider.ts`'s `lockFunds()` calls `treasury.transfer(...)`, a real fund movement) is safe to repeat after an ambiguous failure (network timeout, dropped response). Property at risk: a side-effecting external funding action must not be repeated merely because the caller could not determine the first attempt's outcome. Not claimed as proven exploitable or as a confirmed duplicate-transfer defect — registered as an evidence gap only. Seven open questions requiring a dedicated future evidence mission (transfer()'s rejection guarantees, broadcast-before-response timing, recoverable tx-hash/nonce identity, pre-retry reconciliation, EVM-nonce-layer idempotence, whether the current revert conflates UNKNOWN with FAILED, and whether this is already fully contained by `WDK_USDT_EVM`'s existing `PRODUCTION-INELIGIBLE` classification) — none answered here, none to be answered by assumption. Full evidence: `docs/TECHNICAL_DEBT_AUDIT.md` #56.

**Update — Mission #56, Unknown-Outcome / Retry-Safety Investigation (2026-09-07).** The seven questions above were investigated for real: direct reading of `escrow.service.ts`/`escrow-lifecycle.ts`/`wdk-settlement.provider.ts` plus the installed `@tetherto/wdk-wallet-evm@1.0.0-beta.16` package source, and a new adversarial test (`tests/wdkLockFundsRetrySafety.test.ts`) exercising the real, unmocked `escrow.service.ts` orchestration against a fake provider. **DEMONSTRATED RETRY-SAFETY GAP** (not a proven exploit, not "funds definitely drainable"): `WalletAccountEvm.transfer()` returns as soon as `eth_sendRawTransaction` is accepted by the RPC node — it never waits for confirmation; nonce is always fetched fresh (`getTransactionCount(from, 'pending')`), never cached or supplied explicitly; no idempotency key exists at any layer (WDK, provider, or the `POST /v1/settlement/escrow/:id/lock` route). The real test demonstrates: a genuinely successful external transfer, followed by an ordinary LOCAL failure afterward (e.g. `updateLockResult()`'s DB write failing — not an exotic scenario), causes `escrow.service.ts`'s existing unconditional `revertEscrowStatus()` to revert the escrow to `CREATED` with the real transaction id persisted nowhere, and a subsequent retry invokes the real provider a second time. This is precisely bounded: the CONCURRENT double-call case (two simultaneous requests) remains safely protected by the existing atomic `claimEscrowTransition` (2026-07-20) — the gap is specifically the SEQUENTIAL retry after a completed-and-reverted attempt. Two further, independent findings surfaced and are registered separately, not conflated with the retry-safety property: (a) `WDK_USDT_EVM`'s RPC provider has no configured timeout at all (F1, `docs/TECHNICAL_DEBT_AUDIT.md` #51, never covered this file — only `multisig.provider.ts`/`safe-guard-evm.provider.ts` were in that scope); (b) `lockFunds()` never checks an on-chain receipt/confirmation — a transaction that reverts on-chain but is accepted into the node's mempool would today be recorded as a successful lock with a real `txLockId`, despite no USDT having actually moved. **Claude recommendation: C — STRUCTURAL GAP** (not a narrow fix — the design persists nothing about the external call until full success, and reverts unconditionally on any failure in between; CTO decides final disposition). No mechanism authorized or implemented by this mission — candidate mechanism classes are named for the record only (`docs/WDK_UNKNOWN_OUTCOME_RETRY_SAFETY.md` §19), none chosen or built. `WDK_USDT_EVM` remains `PRODUCTION-INELIGIBLE`, unchanged — this mission found the containment is operationally real (the provider cannot run in production today, per the existing boot-time fail-closed guard) but not architectural (the property gap itself remains unresolved for any future eligibility decision). `package.json`/`package-lock.json` unaffected; no production source changed. Full evidence, including the complete failure-window matrix (10 scenarios), the EVM nonce analysis, the line-by-line real call-path trace, and the disclosed environmental Jest/Haste-map condition this mission worked around locally (unrelated stale worktrees from other parallel sessions on this machine, not caused by this branch): `docs/WDK_UNKNOWN_OUTCOME_RETRY_SAFETY.md`. BACKLOG DELTA: DETECTED AND SYNCED.

**CTO Gate Correction (same day, 2026-09-07) — 5 precision corrections, central finding preserved.** (1) "a genuinely successful external transfer" was imprecise — the provider was mocked in the test; no real network call occurred. Corrected: the real, unmocked Sails orchestration (claim -> provider call -> catch -> revert -> retry) is DEMONSTRATED; the external side effect itself is SIMULATED. A second adversarial test was added (`tests/wdkLockFundsRetrySafety.test.ts`, now 4 tests) modeling the exact "submit then throw"/lost-response scenario: a fake provider records that its (simulated) side effect occurred and only then throws, never returning a txId — proving the same logical operation reaches the provider a second time even when the provider never signals success at all. Permitted claim: "Sails orchestration demonstrates retry after a simulated post-submission unknown outcome." Forbidden claim, not made: "a real on-chain duplicate transfer" — no live network was used anywhere. (2) "no configured timeout at all" was corrected — the installed `ethers@6.17.0` sets a default `FetchRequest` timeout of 300000ms (5 minutes), inherited without a Sails-specific override (confirmed directly in `node_modules/ethers/lib.commonjs/utils/fetch.js:402`). Correct classification: NO SAILS-SPECIFIC TIMEOUT CONFIGURED, not UNBOUNDED RPC — downgraded from "new independent finding" to an observation; it does not by itself open a new production-safety backlog delta absent a concrete demonstrated property violation. (3) The failure window "FUNDS_LOCKED claim persisted but the provider is never called" was incorrectly treated as impossible — a crash can occur between any two sequential `await`s, including the two inside `lockFunds()` itself; reclassified as a REPOSITORY-OBSERVED CRASH WINDOW (reasoned from code structure, not reproduced via an actual process kill). (4) A restart followed by a repeated `POST .../lock` does NOT automatically cause a second transfer when the escrow is stuck at `FUNDS_LOCKED` with no `txLockId` — `assertEscrowTransition` blocks that call (now proven by a dedicated test). Two scenarios were separated: Scenario A (crash leaves `FUNDS_LOCKED`, stuck, not retryable via the normal flow) vs. Scenario B (caught exception + revert to `CREATED`, genuinely retryable — the only scenario where a second provider invocation can occur). (5) The claim that the escrow's re-derivable address plus an approximate time window is "sufficient" for manual reconciliation was corrected — it is correlation material / a search aid only, not a durable operation identity. Correct state: Durable operation identity: ABSENT / NOT DEMONSTRATED. Analytical candidates (a transaction hash, a `(sender, nonce, chainId)` triple, a Sails-generated `logicalOperationId`) are named for the record only, none chosen or authorized. None of these corrections change the final verdict: **C — STRUCTURAL GAP**, CTO-confirmed. Corrected evidence: `docs/WDK_UNKNOWN_OUTCOME_RETRY_SAFETY.md`.

**Remediation (Bounded Remediation, WDK Fund-Moving Safety, 2026-09-08).** The finding above is preserved verbatim. A new provider-local execution-truth layer (`wdk-execution-truth.ts`/`wdk-transfer-attempt-repository.ts`, new `WdkTransferAttempt` Prisma model) now wraps every self-initiated `transfer()` call — durable identity persisted before the side effect, a prior `SUBMITTED`/`SUBMISSION_UNKNOWN` outcome blocks a new submission until reconciled via a real receipt query, and economic success is only ever declared after a receipt with `status===1`. `tests/wdkExecutionTruth.test.ts` (11 tests, real provider, no live network) demonstrates the blocked-retry and receipt-verification properties directly; full regression (9 suites, 197 tests) passes unchanged, including the original `#56` test file, which remains a valid description of `escrow.service.ts`'s own unchanged orchestration layer. Disclosed residuals: conservative pre/post-submission classification, no automated `SUBMISSION_UNKNOWN` reconciliation, 1 confirmation not N, bounded ~30s receipt-poll window, unpopulated `chainId`. The new migration: locally validated only via `prisma validate`/`generate` (no live Postgres reachable this session) — **but CI's own ephemeral-Postgres `build`/`test` workflow ran `prisma migrate deploy` against this exact migration and passed, DEMONSTRATING it applies cleanly to a real Postgres instance**, though no test yet exercises `WdkTransferAttempt`'s own query shapes against that live data. `WDK_USDT_EVM` remains `PRODUCTION-INELIGIBLE`. Full evidence: `docs/WDK_UNKNOWN_OUTCOME_RETRY_SAFETY.md` §22.

**CTO Gate Correction (2026-09-08).** Closed a real remaining gap: the `PREPARED → transfer() → SUBMITTED` crash window. A durable pre-submission commit (`markSubmissionAttempted()`, reusing the existing `SUBMISSION_UNKNOWN` status — no new status/schema/worker) is now written immediately before every `transfer()` call. Amount comparison replaced with an exact decimal-string comparator (no floating point). 2 new adversarial tests + an extension of the `REVERTED` test (13 tests total). Detail: `docs/WDK_UNKNOWN_OUTCOME_RETRY_SAFETY.md` §22.1. No new BACKLOG DELTA — a correction to an already-registered remediation.

- **New backlog delta — WDK Fund-Moving Operations Safety Sweep (registered 2026-09-08, investigation obligation derived from #56, not itself a demonstrated defect).** `#56`'s frozen investigation covered `lockFunds()` only. `releaseFunds()`, `refundFunds()`, and `splitFunds()` (`wdk-settlement.provider.ts`) share the identical structural shape — each calls `WalletAccountEvm.transfer()` (or, for `splitFunds()`, two sequential calls) directly against `@tetherto/wdk-wallet-evm`, with the same observed contract `#56` already established: a returned hash means RPC-mempool-acceptance, not confirmation, and no idempotency key exists anywhere in the call chain. **This entry does not claim any of the three methods has been shown to share `lockFunds()`'s demonstrated retry-safety gap — that is exactly the investigation obligation being registered, not its answer.** Three properties named for a future dedicated investigation:
  - **Property A — Unknown Outcome / Retry Safety.** A side-effecting economic action must not be repeated merely because the previous attempt's outcome is unknown. (Same property `#56` investigated for `lockFunds()`; not yet investigated for `releaseFunds()`/`refundFunds()`/`splitFunds()`.)
  - **Property B — Multi-Leg Partial Execution** (`splitFunds()` specifically, RFC-021 D9 — two separate, non-atomic on-chain transfers with no shared-recipient primitive on this provider's `transfer()` API). A multi-leg economic action must not become partially executed without durable, reconcilable knowledge of which legs succeeded, failed, or remain unknown.
  - **Property C — Submission vs. Execution.** Transaction submission acknowledgement is not equivalent to confirmed successful economic execution — a returned tx hash ≠ a successful receipt ≠ a confirmed token transfer (this is `#56`'s own already-registered receipt/confirmation gap, `docs/TECHNICAL_DEBT_AUDIT.md` #56, restated here because it is cross-cutting to all four methods, not `lockFunds()`-specific).

  Classification: BACKLOG DELTA DETECTED. Categories: Production Safety / OpenSettlement / `WDK_USDT_EVM` / Economic Side Effects / Recovery-Reconciliation. Not a new macrofront — relates to the same `docs/NORTE_FIXO.md` macrofronts `#56` already relates to (OpenSettlement, Security). No implementation authorized: no idempotency keys, `UNKNOWN` states, operation journal, receipt polling, nonce persistence, reconciliation engine, retry logic, split-transaction redesign, atomic multi-transfer abstraction, or generic settlement coordinator — investigation first, exactly as `#56`'s own governing rule required before any of `#56`'s findings were produced. Explicitly not proposed and not evidenced as necessary: a cross-rail/cross-provider generic mechanism of any kind — `MULTISIG`/`LIGHTNING_HODL`/`SAFE_GUARD_EVM`'s own release/refund/split calls are read-only verifications or independently-scoped, not self-initiated transfers sharing this exact shape, matching `#56`'s own Rube Goldberg check. Project representation: "Code Quality & Production Reality — Bounded Remediation" card (`docs/GITHUB_PROJECT.md` §1 documents this Project's own field/view configuration; the card's live body is the authoritative, per-item log), updated to add this investigation, distinguishing `lockFunds()` (investigated/frozen) from `releaseFunds()`/`refundFunds()`/`splitFunds()` (pending investigation) and the receipt/confirmation gap (cross-cutting, pending). Full `lockFunds()` evidence this sweep extends: `docs/WDK_UNKNOWN_OUTCOME_RETRY_SAFETY.md`.

**Update — investigation executed (2026-09-08).** The sweep this entry registered has been carried out: real call-path tracing (`escrow.service.ts`) plus 7 new adversarial tests (`tests/wdkFundMovingOperationsSafety.test.ts`) exercising the real, unmocked orchestration against a fake provider (external side effects always SIMULATED — no live network call anywhere). **Verdicts, not forced uniform:** `releaseFunds()` — **C, structural gap demonstrated** (identical mechanism to `lockFunds()`'s own #56 finding: claim-before-call, unconditional revert-on-any-failure, a retry after a simulated post-submission unknown outcome DEMONSTRATED to reach the provider a second time). `refundFunds()` — **C, structural gap demonstrated** (same mechanism, same evidence class). `splitFunds()` — **C, structural gap demonstrated**, and strictly larger than the other two: `WdkSettlementProvider.splitFunds()` makes two sequential, non-atomic `transfer()` calls with no partial-result channel — a DEMONSTRATED test shows leg 1 succeeding (simulated) then leg 2 throwing causes `updateSplitResult()` to never run (zero persistence of either leg, even leg 1's), and a subsequent retry re-triggers leg 1's side effect a second time; a second test shows leg 2 ALSO having its own simulated side effect before throwing produces the byte-for-byte identical observable outcome to Sails — i.e., **Sails cannot distinguish "leg 2 never attempted" from "leg 2 attempted and its result was lost."** Receipt/confirmation (Property C, cross-cutting across all four fund-moving methods including `lockFunds()`) — **C, structural gap demonstrated**: none of `releaseFunds()`/`refundFunds()`/`splitFunds()` waits for or checks a receipt; a terminal Sails status (`COMPLETED`/`REFUNDED`/`SPLIT`) can be recorded before the underlying transfer(s) are confirmed or even while one leg later reverts on-chain. A new retry surface was also confirmed REPOSITORY OBSERVED and explicitly named: `dispute.service.ts`'s `applyRuling()` resets a dispute's `ruling`/`resolvedAt` to `null` on any release/refund/split failure with its own comment stating "the arbiter must re-submit" — a real, documented "dispute resolution replay" path for all three methods, distinct from `#56`'s HTTP-route/auto-settle surfaces (`splitFunds()` has no direct HTTP route at all — reachable only via dispute ruling). No mechanism implemented or authorized by this update. `WDK_USDT_EVM` remains `PRODUCTION-INELIGIBLE`, unchanged. Full evidence: `docs/WDK_FUND_MOVING_OPERATIONS_SAFETY.md`.

**Remediation (Bounded Remediation, WDK Fund-Moving Safety, 2026-09-08).** The verdicts above are preserved verbatim. The same execution-truth layer described in `#56`'s own remediation note now wraps `releaseFunds()`/`refundFunds()` identically, and `splitFunds()` was redesigned around it for Property D (Safe Multi-Leg Resume): the buyer/seller legs are tracked as two independent logical operations (`SPLIT_BUYER`/`SPLIT_SELLER`), the seller leg never attempted until the buyer leg has a receipt-confirmed `txHash`, resuming without repeating `transfer()` whenever a prior attempt already reached `CONFIRMED`, and safely retrying a single leg specifically when that leg's own prior attempt reached `REVERTED`. All four scenarios the original mission named (buyer confirmed + seller not started/UNKNOWN/reverted; buyer UNKNOWN) are now resolved by design. Evidence: `tests/wdkExecutionTruth.test.ts` (11 tests, including 3 `splitFunds()`-specific), real provider, no live network. Full regression (9 suites, 197 tests) passes unchanged, including the original `#58` test file. Residuals identical to `#56`'s own remediation note (not repeated here — same shared mechanism). `WDK_USDT_EVM` remains `PRODUCTION-INELIGIBLE`. Full evidence: `docs/WDK_FUND_MOVING_OPERATIONS_SAFETY.md` §15.

**CTO Gate Correction (2026-09-08).** The same `PREPARED → transfer() → SUBMITTED` crash-window fix registered in `#56`'s own correction note applies identically here — `executeTransfer()` is the shared mechanism `lockFunds()` and all three of this item's methods (including each `splitFunds()` leg) use. Detail: `docs/WDK_UNKNOWN_OUTCOME_RETRY_SAFETY.md` §22.1, `docs/WDK_FUND_MOVING_OPERATIONS_SAFETY.md` §15.1. No new BACKLOG DELTA.

- **Test-harness reliability — Jest Haste module-map collision via `.claude/worktrees/` (new delta, 2026-09-08) — CLOSED.** Note: a CTO mission labeled this investigation "#57," but `docs/TECHNICAL_DEBT_AUDIT.md` #57 is a genuinely different, still-open finding (parallel `buildApp()` timeout contention) — this item is registered as **`docs/TECHNICAL_DEBT_AUDIT.md` #59** instead, to avoid conflating two distinct root causes; #57 itself is untouched, still open. **Property:** the unit-test discovery/execution harness must not fail or duplicate suites because tooling-generated `.claude/worktrees/` are scanned as product source (narrower than "the full test suite" — the separate integration-test phase and its own Postgres-availability policy are untouched by and out of scope for this property; see `docs/TEST_HARNESS_RELIABILITY.md` §8). **Root cause, DEMONSTRATED by controlled experiment:** `.claude/worktrees/agent-*` (real, linked git worktrees left behind by Agent-tool `isolation: "worktree"` invocations that made changes) each carry their own `packages/sails-sdk/package.json` declaring the same `"name"` as the real one; Jest's `jest-haste-map` indexes every `package.json` under `roots` by that field and throws the instant anything resolves the colliding name — confirmed sufficient at a single stray worktree (excluding 3 of 4 and leaving 1 still reproduced the identical failure with exactly 2 candidates), and confirmed absent from every CI run this entire session (a fresh `actions/checkout` never has this local-only, never-committed directory). A second, independently confirmed effect of the same cause: each worktree's own nested `tests/` directory (148 files each) was also being discovered by Jest's `testMatch` as phantom duplicate suites, inflating the pre-fix total from the real 154-155 suites to ~742. **Fix implemented:** one array entry added to `jest.config.js`'s pre-existing `modulePathIgnorePatterns` (`<rootDir>/.claude/worktrees/`), alongside its already-established `dist/` entry for the identical class of problem — no new config key, no framework change, nothing deleted or moved on disk. **Evidence:** `npm run test:unit` before: `442 failed, 300 passed, 742 total` suites; after: **`154 passed, 154 total` suites, `1923 passed, 1923 total` tests, zero failures** — matching this repository's own real `tests/*.test.ts` count (155) almost exactly, confirming no real coverage was lost, only the four stale worktree duplicates stopped being discovered. **Residual:** the precise internal `jest-resolve` reason the pre-existing `moduleNameMapper` entry for this same package name doesn't pre-empt the collision is INFERRED, not traced to source — doesn't weaken the fix, which removes the duplicate providers regardless of resolver internals. `.claude/` is still not in `.gitignore` (a separate, minor hygiene gap noticed in passing, not fixed here). Full evidence: `docs/TEST_HARNESS_RELIABILITY.md`.

- **Operational visibility for degraded QVAC-based detection.** `liquidity.service.ts:270-289` (`screenOfferContent`) and `handlers.ts:519-543` (`socialEngineeringAgent.evaluate`) both swallow a QVAC inference failure into a log-only catch — on failure, the protective signal is simply never emitted, with no distinct operator-visible signal. This does not fabricate a result and is not a settlement-correctness defect — it is an observability gap on a protective control. Full evidence: `docs/TECHNICAL_DEBT_AUDIT.md` #54. **CLOSED (Bounded Remediation F8, 2026-09-07)** — two paired `prom-client` counters (`sails_qvac_detection_invocations_total`, `sails_qvac_detection_failures_total`), reusing the existing `common/metrics.ts` registry and the existing `GET /metrics` endpoint (no new metrics library, no new endpoint), same bounded single-label (`path`, closed 2-value enum: `offer_screening` | `social_engineering`) convention `suspiciousActivityTotal` already established. Paired deliberately — a bare failure counter reading 0 can't distinguish "ran clean every time" from "never ran at all" (the feature flag defaults off); the invocations counter resolves that. SUCCESS+CLEAN vs SUCCESS+THREAT was already distinguishable via each path's own pre-existing risk-detected event and stays that way — this closure adds nothing there; only DEGRADED vs either SUCCESS state was actually missing. No metric labels carry error text, participant/trade/offer/message ids, or model output. No event, no health/degraded indicator, and no `reason_class` label were added — each considered and rejected as not earning its place (no existing QVAC error taxonomy to classify against, and an event/health signal would imply enforcement authority this detector does not have). Detection itself, and its fail-open behavior, are completely unchanged. **Correction (CTO Gate, same day):** the `social_engineering` path's invocation increment was originally placed after its two context-preparation reads (`recentMessageContext()`/`buildTradeStateContext()`), immediately before the QVAC call — this let a context-prep failure register as `failures += 1` / `invocations += 0`, making `failures / invocations` invalid (could exceed 1) for the same path. Corrected: the increment now happens right after the path's own pre-filters, before context prep, so both counters share one population per evaluated item (`failures <= invocations` always, proven by `tests/qvacDetectionSharedPopulation.test.ts` against the real, unmocked wiring). `handlers.ts`'s broader catch (covering both context-prep and QVAC-provider failure) remains deliberate — the metric represents protective-evaluation degradation, not narrowly "QVAC availability." Full evidence: `docs/TECHNICAL_DEBT_AUDIT.md` #54's own dated status update.

- **Test-harness reliability under parallel load (new delta, CTO Gate follow-up on F8, 2026-09-07) — not caused by, and does not invalidate, F8's closure.** Discovered during F8's own validation, an independent finding about the Jest harness, not about F8's code. Property at risk: a full test run should fail because code is wrong, not because unrelated application bootstraps exceed timing budgets under parallel contention. 10 non-integration suites (`cors`, `healthLiveReady`, `metrics`, `securityHeaders`, `fullTradeLifecycle`, `joinTradeAuthorization`, `liquidityDiscoverPagination`, `proofBundleAccess`, `settlementReadAccess`, `suspiciousActivityWiring`) failed under the full parallel `npx jest` run, all with the identical symptom — `beforeAll()`'s `buildApp()` exceeding a 30s hook timeout — and all 10 passed cleanly re-run in isolation (`--runInBand`). A smaller form of this pattern (6 suites) was already observed in earlier missions this session; it has now grown to 10. Not claimed as a proven Swagger/OpenAPI-registration bottleneck — that is a hypothesis supported by observed timing, not yet an architectural fact; root cause not proven; CI's own timing distribution under its own topology is not confirmed to match. Seven open questions registered for a future dedicated investigation (why 30s is crossed only under parallel load; whether Swagger/OpenAPI registration is the dominant cost or merely correlated; whether DB/bootstrap/module init contributes; whether repeated app construction across workers is unnecessary; whether CI reproduces the same timing distribution; whether a test-only bootstrap boundary would reduce contention without hiding real startup cost; whether the right fix is implementation, harness configuration, or test architecture) — none answered here, none to be answered by assumption. Explicitly not authorized by this entry: blindly raising the Jest timeout, blindly reducing workers, disabling suites, skipping tests, removing Swagger, adding retries, changing CI topology, or a new test framework. Classification: new backlog delta / engineering-system reliability / test-harness evidence quality, not a technical-debt item of the same family as #51-54. No new macrofront. Full evidence: `docs/TECHNICAL_DEBT_AUDIT.md` #57.

Sequencing recorded: chain/RPC bounded liveness (F1, closed partial/accepted residual) → shared escrow-creation schema (F5, closed) → `verifyLock()` decision (F6, closed — removed) → QVAC-detection observability (F8, closed, 2026-09-07) → (separately, comment-only) the `proof.service.ts` current-truth correction below (F7, closed, 2026-09-07). Already-known/already-represented findings from the same audit (`escrow.service.ts`'s oversized functions — already `docs/TECHNICAL_DEBT_AUDIT.md` #2; `as any`/`as unknown as X` escape hatches — already #11, strengthened with new evidence; `ENFORCE_CAPABILITIES` default-false posture — already this file, "Capability Registry Enforcement" row) are intentionally **not** duplicated here. `escrow.service.ts`'s `markPaymentSent()` duplicating `claimEscrowTransition()`'s atomic-claim pattern (without its `VALID_TRANSITIONS` gate) remains known, deliberate, accepted technical debt — confirmed genuinely unrepresented anywhere in this file, but out of this sync's authorized scope; not added by this entry.

**Current Truth correction — `proof.service.ts`'s event-store-default comment (2026-09-06).** Not technical debt: `event-bus.ts`'s `SailsEventBus` changed its real default from `InMemoryEventStore` to `PostgresEventStore` in Missão 05.7 (2026-08-15); `proof.service.ts:346-352`'s comment was never updated to match and still describes the old default as current. Runtime behavior is already correct today — `timelineDurable`/`timelineStore` read the actual configured store dynamically, not a hardcoded value. Registered as a documentation/comment-only correction, not a durability gap. **CLOSED (F7, 2026-09-07)** — comment corrected in place to state the current default (`PostgresEventStore`, `durable = true`, confirmed directly from `event-bus.ts`'s constructor default and its singleton construction — no config/env-based override exists anywhere in `src/`), while preserving the non-durable-configuration caveat (`SailsEventBus` accepts an `EventStore` via its constructor and `InMemoryEventStore` remains an available non-durable implementation — though the current production singleton exposes no config/env switch to select it — and if a non-durable store were ever wired in, restart/redeploy could still silently lose timeline history) and the tamper-evidence-vs-durability distinction. No runtime behavior changed; no new test needed — `tests/evidenceBundleDurability.test.ts` already proves the real default against the unmocked `eventBus`. BACKLOG DELTA: ZERO. **Correction (CTO Gate, same day):** narrowed two overclaims — "an empty timeline genuinely means nothing happened" (durability under the current default only means history isn't lost to a mere process restart, not that every event was necessarily recorded) and "tamper-evidence proves nothing altered / durability proves nothing lost" (replaced with property-accurate wording: hash-chain verification detects covered mutation/reordering/deletion of recorded events; durability describes whether recorded history survives the relevant restart boundary; neither alone proves completeness, historical non-occurrence, portability, or independent verifiability). Full evidence: `docs/TECHNICAL_DEBT_AUDIT.md` #55's own dated closure and its own same-day correction block.

Project representation: one card, "Code Quality & Production Reality — Bounded Remediation" (see `docs/GITHUB_PROJECT.md`), covering all five items above plus the `WDK_USDT_EVM` retry-safety delta discovered during F6's own review and the test-harness reliability delta discovered during F8's own review (no new card for either delta — both appended to the same existing card). No new macrofront — see `docs/NORTE_FIXO.md` macrofronts 12 (OpenSettlement) and 27 (Security); the QVAC-detection item additionally relates to macrofront on OpenAgents.

**External Capability Evolution Policy (2026-09-07).** Institutional gap, not a code defect: no rule existed for deciding whether to actually *adopt* a material external-dependency update (QVAC, WDK, Pears/HyperDHT/Hyperswarm, Ark/Arkade, Bitcoin/EVM/crypto-primitive libraries). Dependabot's existing weekly schedule is only a periodic *awareness/discovery* trigger, not a review — its own Mission 9.10 comment states a rule that packages touching signing/key material/hashing/Bitcoin-EVM transaction construction must never be grouped (covering `@noble/*`, `sodium-native`, `tweetnacl*`, `bitcoinjs-lib`, `bip32`, `ecpair`, `tiny-secp256k1`, `@aws-sdk/client-kms`, transitively `ethers`); separately, `@qvac/sdk`/`@tetherto/wdk-wallet-evm`/`@arkade-os/sdk`/`hyperdht`/`hyperswarm` also open individually today only because they match none of the six current group patterns, not because the config declares them crypto-sensitive — a precision this entry does not blur. Branch protection already requires human review before any of these merge, but neither mechanism says *when an upgrade should actually be adopted*. Closed via `docs/ENGINEERING_GOVERNANCE.md` §8A: lifecycle (Discover → Classify → Capability Delta Review → Compatibility/Breaking Change Review → Security/Trust-Boundary Review → Architecture Fit → Evidence → CTO Decision → Adopt/Defer/Reject → Freeze/Document), a bounded Class A (Security/Correctness) / B (Capability) / C (Compatibility/Maintenance) / D (Non-Material) classification — explicitly **Classification ≠ Consequence**: a Class C/D update touching a security-sensitive, fund-moving, trust-boundary, semantic, or production-critical property still requires evidence proportionate to that consequence, never "Class C = no property review" — a 10-question decision test with 5 possible outcomes (Adopt / Adopt with bounded conditions / Defer / Reject / STOP), a security-sensitive-dependency evidence rule applying regardless of class, an explicit QVAC/agent-authority non-expansion rule (a `@qvac/sdk` update must never silently expand signing/settlement/`CapabilityGrant`/protocol-truth/enforcement authority — that stays a separate RFC decision), and a semantic-stability STOP rule (an external upgrade forcing a redefinition of Intent/Authority/Conditions/Evidence/Outcome/Settlement/Capability/event/conformance meaning is an architecture change, not a dependency bump). Evidence obligation is proportionate to consequence, not to class label — a genuinely non-material Class D update records only version/classification/tests-run/no-material-impact, not a full record. No automation added or changed — Dependabot's existing configuration and branch protection's existing review gate already satisfy the "automated update ≠ architectural approval" rule this section states. No new macrofront; relates to `docs/NORTE_FIXO.md` macrofronts 14 (OpenAgents/QVAC), 25 (Versioning/Governance/Lifecycle), 27 (Security), and 30 (Productization/Ecosystem Composition). **Next concrete application registered, not performed here:** QVAC SDK Capability Delta Review — current declared range `@qvac/sdk ^0.15.0` (`package.json`); that future review must verify the actual latest relevant stable QVAC release from an authoritative upstream source at execution time (not assumed from memory) and run it through this section's Decision Test before any adoption. BACKLOG DELTA: DETECTED AND SYNCED. **Correction (CTO Gate, same day):** narrowed the same four points corrected in `docs/ENGINEERING_GOVERNANCE.md` §8A — Classification ≠ Consequence (Class C/D no longer read as automatically requiring no property review), Dependabot's weekly schedule renamed periodic awareness/discovery, not review, the lockfile wording ("resolved version may float on a fresh install") corrected to describe when the resolved version actually changes, and the Dependabot "crypto-sensitive" attribution narrowed to only the packages the config's own comment actually describes, not the full ungrouped list.

**QVAC SDK Capability Delta Review, first application of §8A (2026-09-07).** Full evidence: `docs/QVAC_SDK_CAPABILITY_DELTA_REVIEW.md` — not duplicated here. Reviewed `@qvac/sdk` `0.15.0` (declared/resolved/reviewed version, unchanged since first added) against `0.19.0` (verified latest, npm `dist-tags.latest` — OBSERVED directly, not inferred). A real version/publish-date discrepancy was found and reported: `1.0.0`/`1.1.0` exist numerically higher. **Corrected (CTO Gate, 2026-09-07):** only directly OBSERVED facts support selecting `0.19.0` regardless — 20+ `0.x` releases were published after `1.1.0`; no `1.x` release later than `1.1.0` exists anywhere in the registry's version list; the **current** npm `latest` dist-tag points to `0.19.0`; the official current GitHub release is `sdk-v0.19.0`. This review never queried historical dist-tag state, so no claim is made that the tag "stayed on `0.x`" continuously over time — only its present value is observed. The conclusion that `1.0.0`/`1.1.0` are an abandoned lineage is INFERRED by this review, not itself upstream-documented — both levels stated explicitly, not blurred. Repository-wide grep confirms Sails' entire QVAC surface is exactly 4 symbols (`loadModel`, `completion`, `unloadModel`, `LLAMA_3_2_1B_INST_Q4_0`, no `modelConfig` object); **AT THE TIME OF THIS STATIC REVIEW, no Sails source-code API migration was indicated** for that surface (zero of 0.16.0-0.19.0's several breaking changes touch it), though 0.19.0's runtime/package restructure onto `@qvac/inference` is real and empirical Sails-runtime compatibility **had not yet been demonstrated at that time** (static analysis only — no install/runtime test performed). **This static-review expectation was later refined, not overturned, by the bounded runtime validation below (2026-09-07):** runtime behavior largely worked as expected (real model load, real structured completion, 5 of 6 QVAC-routed capabilities DEMONSTRATED live), but a real, build-blocking TypeScript declaration incompatibility was DEMONSTRATED for `LLAMA_3_2_1B_INST_Q4_0` specifically — a fact the static review could not have found without installing the package. The historical finding above is preserved as the record of what the static review concluded at the time; it is not the current final truth on runtime compatibility — see the paragraph below for that. Classification, corrected: Primary Class B (Capability); **Secondary Consequence: Security/Runtime-sensitive** (the inference-engine/package boundary, native/runtime dependency surface, worker-startup/error behavior, and delegated-inference availability all changed — none affects protocol authority, but Classification ≠ Consequence means a future upgrade mission must still satisfy the Security-Sensitive Rule's proportionate-evidence bar). Privacy finding narrowed: no documented privacy regression found in release notes, but actual `0.19.0` network/telemetry behavior was NOT TESTED. **CTO Gate direction: B — Adopt with bounded conditions** (superseding the original Claude recommendation of C — Defer, preserved for the record in the evidence doc) — the capability delta is relevant to Sails' *current* six QVAC-routed capabilities, not only a future Guardian layer, and the missing empirical evidence is exactly what a bounded upgrade mission should produce. This authorizes a future, separately-scoped experimental/validation upgrade mission only — not production adoption, no Guardian authority expansion, no tool execution, no `AgentGrant` change — gated on 17 named evidence obligations (target version, `@qvac/inference` declaration behavior, lockfile preservation, typecheck, full QVAC test pass, real model load/completion, real clean/threat/degraded paths, F8's `failures ≤ invocations` re-verified under the upgraded runtime, a real concurrent-`completion()` benchmark, a `0.15.0` baseline comparison, worker-startup/`assessModelFit` behavior exercised directly, real network/telemetry observation, a native-layer delta review, full regression, and a rollback plan). No upgrade performed by this review or its correction; `package.json`/`package-lock.json` unchanged. BACKLOG DELTA: DETECTED AND SYNCED (the review itself, the CTO Gate direction, and the residuals named above).

**QVAC 0.19.0 bounded upgrade & runtime validation, executed per the CTO Gate direction above (2026-09-07).** Full evidence: `docs/QVAC_SDK_CAPABILITY_DELTA_REVIEW.md` §23. `@qvac/sdk` was actually installed at `0.19.0` and exercised for real (real `loadModel()`/`completion()`, real concurrency benchmark N=1/2/4/8, real worker-startup-failure and `assessModelFit` tests, 5 of 6 QVAC-routed capabilities exercised live) — then **fully rolled back**, verified byte-identical to the pre-upgrade `package.json`/`package-lock.json` (SHA-256 match). **Dispositive finding: `npx tsc --noEmit`/`npm run build` fail against `0.19.0`** — a real, demonstrated, root-caused upstream TypeScript type-declaration gap (`LLAMA_3_2_1B_INST_Q4_0` is a genuine, working runtime export but missing from `@qvac/sdk@0.19.0`'s own `.d.ts` files; confirmed via direct `.d.ts` inspection and the package's own bundled example still importing it the same way). Per this mission's own explicit instruction, no source was edited to work around the break — `qvac-agent.provider.ts` is untouched. Every other finding was neutral-to-favorable: no unrelated dependency churn (46 changed lockfile entries, all within the `@qvac/*`/`bare-*` family, individually classified); no new `npm audit` finding attributable to the QVAC 0.19.0 dependency delta in this run (not a proof of vulnerability absence — see the evidence doc's own caveat); **F8 evidence, stated precisely (corrected, CTO Gate, same day):** `tests/qvacDetectionSharedPopulation.test.ts` mocks `@qvac/sdk` entirely, so passing it (2/2, in isolation, with 0.19.0 installed) demonstrates F8's counter/invariant semantics (`failures ≤ invocations`, `SUCCESS+CLEAN ≠ SUCCESS+THREAT ≠ DEGRADED`) for **Sails' own wiring**, not against QVAC 0.19.0's real inference behavior — F8 jointly exercised with a real, unmocked 0.19.0 `completion()` call remains NOT FULLY DEMONSTRATED, and the fully-live social-engineering path (real Postgres + real inference together) stayed BLOCKED BY ENVIRONMENT (no reachable Postgres here, unrelated to QVAC); no material concurrency gain demonstrated under Sails' actual (unmodified) call shape; worker-startup diagnostics and `assessModelFit` both genuinely work as documented (both DEMONSTRATED against the real, unmocked 0.19.0 runtime). **Recommendation: C — Rollback to 0.15.0 / Defer** (already executed) — narrow, checkable re-open trigger named (an upstream patch restoring the type declaration, or an explicit, separately-reviewed CTO authorization for a minimal type-only shim), not an indefinite wait. `main`'s `package.json`/`package-lock.json` are unaffected by this mission. BACKLOG DELTA: DETECTED AND SYNCED — the build-blocking type-declaration gap itself (an upstream QVAC defect, not a Sails defect), plus residuals carried forward from the original review (Hugging-Face-checksum applicability, `@qvac/inference`'s undemonstrated P2P-dependency usage, and now a single-sample-only performance-regression signal requiring a proper multi-run benchmark before any future attempt).

## P2 — Cross-Module Services

| Item | RFC / Spec | Current Status |
|---|---|---|
| Sails OpenSettlement | §1.5, §4B | 🟢 **Most complete module today** — `escrow.service.ts` is real, reviewed, and decoupled correctly (`ARCHITECTURE.md` §5's fix already applied). `lockedAmount` moved `Float` → `Decimal` (RFC-009). **Routes now real** *(route-restoration pass, 2026-07-16)*: `settlement.routes.ts` wraps every escrow method plus a new dispute-resolve route (`API_REFERENCE.md` §4, updated to document it). **Second real provider landed** *(QVAC/WDK MVP pass, 2026-07-17)*: `WDK_USDT_EVM` (`wdk-settlement.provider.ts`) — see `TODO.md` §4 for the full custody-model caveat. **`executeSettlement()` orchestrator landed** *(same day, follow-up pass)*: `settlement-orchestrator.ts` — the single real entrypoint carrying a matched Trade through escrow creation, the seller locking real signed WDK collateral, an explicitly-labeled emulated PIX-receipt confirmation (`pixConfirmation.emulated: true` — not a real OpenProof integration, RFC-003 is still 📋 future), and the seller's agent releasing a real, digitally signed USDT transfer via the existing `escrowService.releaseFunds()` → `WdkSettlementProvider` → `@tetherto/wdk-wallet-evm` path (no second WDK integration introduced — `@tetherto/wdk-core` does not exist on npm, verified against the registry before writing any import; the real multi-chain umbrella package is `@tetherto/wdk`, distinct from the chain-specific `@tetherto/wdk-wallet-evm` this codebase already correctly uses for signing). Wired to `openp2p.trade.created` (this codebase's real stand-in for "the P2P engine gives Match" — the Intent Engine's own `MATCHED` state has no real matching engine wired to it yet) via `common/events/handlers.ts`, gated behind `config.features.autoSettleOnMatch` (default `false`, `AUTO_SETTLE_ON_MATCH` env var) — deliberately not unconditional, since that event fires for every real HTTP-driven trade, not only agent-driven demo ones, and autonomous fund release with no dispute-window step is not a safe default. Verified with `tests/settlementOrchestrator.test.ts` (6 tests, mocked `escrow.service.ts`) and `tests/autoSettleHandler.test.ts` (3 tests, confirms the flag actually gates it and that a settlement failure doesn't crash the event dispatcher). **Third and fourth real providers landed** *(2026-07-27)*: `MULTISIG` (`multisig.provider.ts`) — real 2-of-3 Bitcoin P2WSH/PSBT construction and signing; `LIGHTNING_HODL` (`lightning-hodl.provider.ts`) — real 2-of-3 Arkade (Ark protocol) VTXO/Taproot escrow, replacing the literal-LND-hold-invoice approach (blocked on infra this environment doesn't have) with the same HodlHodl/Lendasat-proven Arkade pattern. Both `TODO.md` §4 have the full custody-model and single-arbiter-limitation disclosure. Same pass also fixed `getProvider()`'s silent fallback to `MOCK` for any unregistered escrow type. **Client-held keys (Phase 1) landed** *(same day, follow-up pass)*: buyer/seller pubkeys for `MULTISIG`/`LIGHTNING_HODL` are now submitted client-side (`@satsails/p2p-trading-sdk`'s `generateEscrowKeypair()`, `POST /v1/settlement/escrow/:id/submit-key`, new `EscrowParticipantKey` model) instead of server-derived — the server now only ever derives the arbiter's own key, the same split HodlHodl's real design uses. Verified end-to-end against the live server + real Postgres. `releaseFunds()`/`refundFunds()` on both providers threw "Phase 2 not built" (signature collection) rather than attempt a signature the server no longer has the key for. **Phase 2 (client-signature-collection for release/refund) landed** *(same day, second follow-up pass), MULTISIG only*: real `POST .../initiate-release`/`initiate-refund` (`escrow.service.ts`'s `initiateRelease()`/`initiateRefund()`) build and persist an unsigned PSBT (`multisig.provider.ts`'s new `buildUnsignedRelease()`/`buildUnsignedRefund()`) without transitioning the escrow; each required signer submits their own independently-signed copy (`@satsails/p2p-trading-sdk`'s new `signEscrowPsbt()`, `@bitcoinerlab/secp256k1`) via `POST .../submit-transaction-signature`; once every required signature has arrived, the server combines and finalizes for real (`finalizeRelease()`/`finalizeRefund()`, `Psbt.combine()` — verified experimentally that independently-signed copies of the same unsigned PSBT combine correctly and that a `@bitcoinerlab/secp256k1`-signed input finalizes against a `tiny-secp256k1`-backed verifier) and the same atomic status-claim race protection the old synchronous methods used is preserved. Disputed release/refund: the arbiter's own required signature is pre-embedded at build time (its key is still server-derived) rather than waited on via HTTP. Verified end-to-end against the live server + real Postgres (a local stub swapped in only for the one dependency this environment can't reach with real funds — a funded testnet UTXO; every other part of the stack ran for real). `releaseFunds()`/`refundFunds()` on `MultisigProvider` now throw "not directly callable" pointing at the new routes, since the server structurally can't do a single synchronous call anymore. **`LIGHTNING_HODL`'s own Phase 2 landed** *(same day, third follow-up pass)*: the browser-side signing question this row previously deferred is resolved — `@arkade-os/sdk`'s `SingleKey` (raw-private-key signer, no ASP/wallet machinery) verified to bundle cleanly for a real Vite production browser build (889 modules transformed, `@arkade-os/sdk`/`@scure/btc-signer` genuinely included) before `lightning-hodl.provider.ts` gained its own `buildUnsignedRelease()`/`buildUnsignedRefund()`/`finalizeRelease()`/`finalizeRefund()`, registered in the SAME generic `SIGNATURE_COLLECTION_PROVIDERS` orchestration MULTISIG uses (a one-line change — the service layer never inspects the signed-payload format). Ark's tx shape needs a JSON bundle (main tx + checkpoint tx) rather than a single PSBT, but the wire format is opaque to `escrow.service.ts`. `@satsails/p2p-trading-sdk` gained `signEscrowArkTx()` alongside `signEscrowPsbt()`; `sails-ui`'s auto-sign hook now dispatches on escrow type. Disclosed the same way this row's very first `LightningHodlProvider` entry always has: built against the real, documented API, not executed end-to-end against a real funded mutinynet VTXO (this environment can't originate real testnet funds) — but this pass verified substantially more than that entry ever needed to (real signing round-trip, real PSBT serialization round-trip, real browser bundle, 18 new orchestration-level Jest tests). Remaining: `LiquidCovenantProvider` (still doesn't exist — genuinely blocked, no Arkade-equivalent precedent found for Liquid yet), and wiring `DisputeResolutionProvider` (RFC-003's Verification). **`WDK_USDT_EVM`'s custody gap gains a real target — RFC-020** (`rfcs/RFC-020-non-custodial-evm-settlement.md`, RFC-019's Phase 2, 2026-07-28): `SailsEscrowSafe.sol` (Safe Transaction Guard + ERC-4337, compiles clean against real audited dependencies, not deployed) plus `@satsails/p2p-trading-sdk`'s `ERC4337CustodyProvider`/`BitcoinCustodyProvider`/`SailsSignerService` (AWS KMS co-signer). **Fifth real provider, now actually registered and wired — `SAFE_GUARD_EVM`** (same day, follow-up pass): `safe-guard-evm.provider.ts`, in `escrow.service.ts`'s `PROVIDERS`/`SIGNATURE_COLLECTION_PROVIDERS` maps alongside MOCK/WDK_USDT_EVM/MULTISIG/LIGHTNING_HODL — same client-held buyer/seller keys + server-held (now KMS, not a raw seed) arbiter co-signer shape as MULTISIG. Real, tested logic: real `PackedUserOperation`/`userOpHash` construction (`@satsails/p2p-trading-sdk`'s `getUserOpHash()`, imported rather than duplicated — the first real backend→SDK dependency in this repo, since client and server must compute the byte-identical hash for a signature to verify), and real signature recovery/ascending-address-sort/concatenation into Safe's actual packed-signature format (20 new tests, `tests/safeGuardEvmProvider.test.ts`). Still disclosed, not fabricated: `lockFunds()`/`verifyLock()`/the final `broadcast()` step all throw a clear error — deploying/checking a Safe and submitting to a bundler need live EVM RPC infrastructure this environment doesn't have — and the disputed-path KMS co-sign throws without a real `AWS_KMS_KEY_ID` configured (the cooperative buyer+seller path needs no AWS access at all). `TODO.md` §4 has the full remaining-gap detail. **Asset × custody-provider coverage audit (2026-08-01)** — real finding: `createEscrow()` had NO asset-aware type selection at all; an omitted `type` defaulted to a hardcoded `'MULTISIG'` regardless of `asset`, and the one real production call site (`sails-ui`'s `Trade.tsx`) never sent `type`, so every trade of every asset silently became a Bitcoin PSBT escrow in a non-mock deployment — correct only by accident for BTC. Fixed: `recommendedEscrowType(asset)` (`escrow.service.ts`, mirrored in `@satsails/p2p-trading-sdk`'s `settlement.create()` for a client-side fail-fast) is now the single source of truth — `BTC`→`MULTISIG`, `LN_BTC`→`LIGHTNING_HODL`, `USDT_ERC20`→`WDK_USDT_EVM`; every other real `AssetType` throws instead of guessing. Honest count from the same audit: of the 10 real `AssetType` values, only BTC and LN_BTC have genuinely non-custodial (client-held-keys) escrow today; USDT_ERC20 has real on-chain execution but single-seed custody (`WDK_USDT_EVM`'s own header); `USDT_TRC20`/`USDT_LIQUID`/`USDT_LIGHTNING`/`LIQUID_BTC`/`SPARK`/`STACKS`/`RSK_BTC` have no real provider at all. **Decision (2026-08-01, project owner):** consciously left as-is for now — documented as unsupported (`DATABASE.md` §2's own note on `AssetType`), not removed from the enum and not prioritized for a new provider. `LIQUID_COVENANT` similarly **decided to stay a reserved, unimplemented `EscrowType` value** (`DATABASE.md` §2's own note) rather than being built or removed — `getProvider()`'s existing refuse-to-silently-fall-back-to-MOCK behavior is the only enforcement needed until/unless this is revisited. 26 new tests (`tests/escrowProviderWiring.test.ts`, `packages/sails-sdk/tests/modules.test.ts`). **Same-day follow-through: SAFE_GUARD_EVM's `lockFunds()`/`verifyLock()`/`broadcast()` are now real** — real CREATE2 address prediction for both the Safe and the Guard (every hardcoded contract address cross-checked live against Sepolia via `eth_getCode`, `SafeProxy`'s creation bytecode additionally confirmed byte-identical to the real factory's own `proxyCreationCode()`), real on-chain balance verification, real `eth_sendUserOperation` bundler submission. `Safe.setGuard()`'s access-control requirement (self-call only) is resolved by folding it into the SAME UserOp as the terminal release/refund transfer via `MultiSendCallOnly`, not a new signing round — see `safe-guard-evm.provider.ts`'s own header comment, `RFC-020`'s 2026-08-01 update, and `TODO.md` §7. 31 tests (`tests/safeGuardEvmProvider.test.ts`). Now added to `NON_CUSTODIAL_PROVIDERS` so `submitParticipantKey()` derives/persists the Safe address the same way MULTISIG/LIGHTNING_HODL already do. Real, disclosed behavior change: deriving a Safe/Guard address now unconditionally needs `AWS_KMS_KEY_ID` configured (read-only `GetPublicKeyCommand`, never `Sign`) — the Safe's 3-owner list is fixed at deployment regardless of dispute status, so the previous "cooperative path needs no AWS access at all" claim no longer holds for address derivation (it still holds for co-signing). Never exercised against a live funded Sepolia account or a live bundler — same disclosed boundary as every other real provider in this file. **Client-tooling gap closed, 2026-08-02**: the server has computed `guardDeployment: {to, data}` since this pass shipped, but no SDK surface ever let a caller reach it — `@satsails/p2p-trading-sdk`'s new `parseSafeGuardBundle()` parses the real bundle shape out of `unsignedPsbtBase64` (deliberately does not submit the transaction itself — no hard ethers/viem dependency, the caller submits via their own wallet/provider). This was the actual prerequisite blocking anyone from ever testing SAFE_GUARD_EVM against a live Sepolia account for real — without it, there was no way to even deploy the guard contract client-side. 4 new tests. **RFC-021 D8, same day, second design session — QVAC-assisted automated first-pass dispute resolution, arbiters as a fallback rather than the default**: `qvac-agent.provider.ts`'s `assessDisputeEvidence()` (real, same LLAMA_3_2_1B_INST_Q4_0 local-inference call every other QVAC capability uses — deliberately payment-method-agnostic, never assumes PIX, project owner's own explicit correction this pass); `dispute.service.ts`'s `submitEvidence()` (finally makes `DisputeStatus.EVIDENCE_SUBMITTED` reachable — dead since the Dispute primitive was first built), `proposeAutoResolution()`/`contestAutoResolution()`/`sweepExpiredAutoResolutions()`; a new `AUTO_PROPOSED` status with a confidence score, reasoning, and contest deadline, never final without either trade party's chance to reject it. Same "attestor, not mover" boundary D1 already draws around human arbiters, applied to software: an uncontested auto-resolution is applied via the SAME already-assigned human arbiter's authorized identity (`escrow.service.ts`'s `isSellerOrAssignedArbiter()` completely untouched — no new kind of caller ever gains fund-moving authority). Honest, disclosed gap found while building this: a `RELEASE` auto-resolution needs a real payout address this schema doesn't store for any participant, so the sweep refuses to guess one and falls through to the human arbiter instead — `REFUND` has no such gap. Off end-to-end by default (`QVAC_AUTO_RESOLUTION_ENABLED=false`). 48 new tests (`tests/qvacDisputeEvidence.test.ts`, `tests/disputeFlow.test.ts`, `tests/qvacAutoResolutionHandler.test.ts`, `tests/routes.test.ts`). See RFC-021's own D8 section and updated "Known Risks". **RFC-021 D9, same day, third design session — SPLIT finally has a real settlement action**: `dispute.service.ts`'s `applyRuling()` used to just record a SPLIT ruling with no fund movement (`SettlementProvider` had no split operation at all); now real for `MOCK`/`WDK_USDT_EVM` (`splitFunds()`, two real transfers) and `MULTISIG` (`buildUnsignedSplit()`/`finalizeSplit()`, a genuine 2-output PSBT — the 2-of-3 script has no per-output covenant). `SAFE_GUARD_EVM`/`LIGHTNING_HODL` each throw a specific, real, provider-level rejection instead (the deployed `SailsEscrowSafe.sol` guard hardcodes `value === lockedAmount`; the Arkade `VtxoScript`'s fixed 2-of-2 leaves have no arbiter-inclusive leaf that pays both parties) — confirmed by reading each provider's actual code, not assumed from the escrow type's name. **Real second bug found and fixed in the same pass, affecting RELEASE/REFUND too, not just SPLIT**: `applyRuling()` called `escrowService.releaseFunds()`/`refundFunds()` unconditionally for every escrow type, which throw "not directly callable" for `MULTISIG`/`LIGHTNING_HODL`/`SAFE_GUARD_EVM` — meaning a disputed RELEASE/REFUND on those three escrow types could never actually resolve through `resolveDispute()` at all before today, never caught since no test exercised it against a non-`MOCK`/`WDK` escrow. Fixed via a new `escrowService.isSignatureCollectionType()` dispatch, routing to `initiateRelease()`/`initiateRefund()`/`initiateSplit()` for those three types. New `EscrowStatus.SPLIT`, `settlement.escrow.split` event/handler (`Trade`→`COMPLETED`, both parties scored NEUTRAL, no vouch burned — a real, disclosed judgment call since `TradeStatus`/`IntentStatus` have no partial-outcome value), new `EscrowPendingTransaction.toAddressSecondary` column. `resolveDispute()` gains two additive trailing params (`refundToAddress`, `splitBuyerBps`), per `API_STABLE.md`'s own freeze commitment. 26 new tests across `tests/escrowReleaseControls.test.ts`, `tests/escrowProviderWiring.test.ts`, `tests/multisigProvider.test.ts`, `tests/lightningHodlProvider.test.ts`, `tests/safeGuardEvmProvider.test.ts`, `tests/disputeFlow.test.ts`, `tests/reputationOutcome.test.ts`, `tests/fullTradeLifecycle.test.ts` (real end-to-end SPLIT resolution through the actual event chain), `tests/routes.test.ts`, `packages/sails-sdk/tests/modules.test.ts`. See RFC-021's own new D9 section and updated "Known Risks". **Two UI-audit gaps closed, 2026-08-03 (sails-ui SLC audit, relayed from the parallel UI session)**: (1) every dispute *action* (`resolveDispute`/`appealDispute`/`submitDisputeEvidence`/`contestAutoResolution`) was already real, but nothing let an operator/arbiter discover a `disputeId` to call them with — `dispute.service.ts` gained `getDispute(id)` and `listForArbiter(arbiterId, pagination?)` (scoped to the caller's own arbiterId server-side, never a client-supplied filter, same convention `trade.service.ts`'s `getTrades()` already follows), wired to new `GET /v1/settlement/disputes`/`GET /v1/settlement/disputes/:id` routes and `@satsails/p2p-trading-sdk`'s `settlement.listDisputes()`/`settlement.getDispute()` — unblocks `sails-ui`'s dispute console. **Correction, 2026-08-04 (UI session):** that console is `pages/Disputes.tsx` now, not `admin/Disputes.tsx` — moved out of the `admin/` namespace the same day `admin/Dashboard.tsx`/`ManageOffers.tsx` were deleted outright (see the very next sentence's "list all trades/offers" decline — those two pages were mocked stand-ins for exactly that non-existent operator tier, not something to unblock). `Disputes.tsx` itself now calls `listDisputes()`/`getDispute()` plus all four dispute actions for real; a second UI-side bug was also found and fixed wiring it — `contestAutoResolution()` is scoped to a trade party (buyer/sellerId), not the arbiter, so the arbiter console's own "Contestar" button was removed (the arbiter can just call `resolveDispute()` directly instead, no status guard blocks that even during `AUTO_PROPOSED`) and the real contest/evidence/appeal actions were added to `Trade.tsx` for the trade party instead, now that `getEscrow()`'s new `disputes[]` field (next paragraph) lets them discover their own dispute at all. **Declined as part of the same audit**: an unscoped "list all trades/offers" operator view — unlike the dispute list, there is no operator/admin role concept anywhere in this protocol's auth model (every other read is participant-scoped), so building it would let any authenticated participant enumerate every user's trade data; flagged back as a real authorization-primitive decision for the CTO rather than built unilaterally (`CONTRIBUTING.md` §6B). (2) `parseSafeGuardBundle()` could read a bundle's `userOpHash` but nothing in `@satsails/p2p-trading-sdk` could sign it — every disputed `SAFE_GUARD_EVM` trade was stuck at "awaiting counterparty signature" forever. New `signEscrowSafeUserOp(unsignedPsbtBase64, privateKey)` (`escrow-safe-signing.ts`) signs the digest directly with the same client-held `EscrowKeypair` MULTISIG already uses, reusing `custody/kms-signer.ts`'s already-tested `toEthereumSignature()` recovery-bit logic rather than duplicating it. Verified for real, not just unit-tested: a signature this function produced was fed through `safe-guard-evm.provider.ts`'s own live `recoverSignerAddress()` and recovered the exact expected Ethereum address. 11 new tests (`tests/disputeFlow.test.ts`, `packages/sails-sdk/tests/escrow-safe-signing.test.ts`); full suite (49 suites, 621 tests) green. **Third gap found the same day while confirming buyer/seller/arbiter dispute visibility was actually complete (project owner asked directly)**: only whoever *called* `raiseDispute()` ever learned the resulting `disputeId` — it only ever appeared in that one POST response, no listener reacts to `dispute.opened` to push it over the trade's WebSocket room, and neither `getTrade()` nor `getEscrow()` surfaced it. The OTHER trade party had no way to discover their own dispute at all. Fixed by including the already-existing `Escrow.disputes` relation (no schema change) in `getEscrow()`/`getEscrowByTrade()` — the same public `GET /v1/settlement/escrow/:id` a trade party already polls for status now answers this too. 3 new tests (`tests/escrowProviderWiring.test.ts`). **RFC-021 D4 finally wired for real, 2026-08-04** — a design-review meeting between the project owner, their dev partners, and Yuri Vilas Boas (audio) confirmed every other arbiter-model point (D1-D3, D5-D9) was already resolved in code; `cumulativeFeesObserved`'s own cost-to-fabricate floor formula was the one real exception — the value was accrued for real (Phase 3) but never actually *read* anywhere, only displayed. Wired into `MarketArbitrationProvider.assignAppealPanel()`'s (D6) 70/30 reputation/collateral weighting only — a candidate whose fee history hasn't cleared the floor for the disputed value gets a zeroed reputation term for that panel. Deliberately **not** folded into D3's baseline `eligibleFor()` (project owner's own explicit call, via a presented tradeoff): `protocolFeeRate` defaults to `0` during the bootstrap phase, so gating ordinary eligibility on it would exclude every reputation-heavy, low-capital arbiter exactly when D3's "veteran with little capital can still compete" goal matters most — the appeal panel is where a deep-capital actor buying cheap reputation to also dominate the reputation-weighted appeal pool actually matters. 3 new tests (`tests/marketArbitrationProvider.test.ts`, including one proving D3 stays unaffected); full suite (49 suites, 627 tests) green. See RFC-021's own updated D4 section. **MULTISIG demonstrated end-to-end with real BTC on Bitcoin mainnet (Missão 09, 2026-08-18)** — see `docs/MAINNET_MULTISIG_PROOF.md` for the full, independently-verifiable proof (funding `5815534b...a2ed`, release `db0b5e4b...d6ca8`, both confirmed on-chain by two independent public explorers). This demonstrates the 2-of-3 P2WSH mechanism works with real funds; it does not by itself establish production readiness for high-value custody — see that document's own "What was NOT proven" section and `H1-H9` in this file's "Known Debt" section above for what remains open |
| `Float` → `Decimal` schema migration *(new — RFC-009)* | §1.5, RFC-009 | 🟡 Schema/code fixed in this repo; **migration not yet applied to any live database** — no Postgres reachable in the environment this was done in. Whoever has a connected DB must run `npx prisma migrate dev` before this takes effect anywhere real |
| `PendingBankSettlement` status *(new — RFC-007 D3)* | §1.5, RFC-007 | 🟡 Smallest RFC-007 item and the only one touching live code — one `EscrowStatus` enum value + one `assertTransition()` edge in `escrow.service.ts`, additive, no data migration |
| Dispute persistence + `raiseDispute()`/`resolveDispute()` *(new — 04-Deepseek Review Task 2)* | §1.9, RFC-007 D4 | ✅ **Done, verified** — `Dispute` Prisma model (first persistence of §1.9's primitive), `dispute.service.ts` (freeze via existing `escrowService.openDispute()`, arbiter assignment, pubsub notification via `dispute.opened`, ruling → release/refund mapping), `ArbitrationProvider` first real implementation (`arbitration-provider.ts`, `TrustedArbitratorProvider` — per-application trusted-arbiter list, round-robin assignment; RFC-007 D4's `rule()` dropped from the interface since a human arbiter's ruling is an input, not something the provider computes). 10 tests in `tests/disputeFlow.test.ts`. Built WITHOUT CRDTs by explicit decision (reconciled with the repository owner): a CRDT dispute document would be a second source of truth alongside `Trade`/`Escrow` — the exact divergence risk RFC-011 closed. Remaining from RFC-007 D4's full escalation order: the Policy Engine → OpenAgents auto-resolution stages before human arbitration (depends on Evidence Bundle, below) |
| `SPLIT` ruling settlement action | §1.9 | 🟢 **Done — stale row, corrected 2026-08-04.** RFC-021 D9 (2026-08-02) landed this for real: `MOCK`/`WDK_USDT_EVM` (`splitFunds()`) and `MULTISIG` (`buildUnsignedSplit()`/`finalizeSplit()`); `SAFE_GUARD_EVM`/`LIGHTNING_HODL` throw a specific, structural rejection instead of faking one. See the Sails OpenSettlement row above for the full detail — this row was left unmarked when that work shipped |
| Participant payout address | §1.1 | 🟢 **Done, 2026-08-04.** New `PayoutAddress` model (one row per participant+asset, `DATABASE.md` has the full section) plus `payout-address.service.ts`'s `setPayoutAddress()`/`getPayoutAddress()`, wired to `POST`/`GET /v1/settlement/payout-addresses`. `escrow.service.ts`'s new private `resolvePayoutAddress()` is the fallback consumer for `releaseFunds()`/`splitFunds()`/`initiateRelease()`/`initiateSplit()` (and transitively `resolveDispute()` RELEASE/SPLIT) — `toAddress`/`buyerAddress`/`sellerAddress` are all optional now; an explicit address still always wins, absent that it falls back to the participant's own registered address, and only throws if neither exists. `dispute.service.ts`'s `resolveDispute()` no longer pre-validates address presence itself (that check moved to the actual fallback consumer) — only `splitBuyerBps` is still required up front for SPLIT, since there's no fallback for a ruling decision. 9 new tests (`tests/payoutAddress.test.ts`, plus 2 corrected in `tests/disputeFlow.test.ts` to assert the new forward-through behavior instead of an upfront rejection) |
| Sails OpenIdentity | §1.1, RFC-001 | 🟢 **Routes now real** *(route-restoration pass, 2026-07-16)* — `identity.routes.ts` + new `identity.service.ts` (register/challenge/authenticate/get participant, `API_REFERENCE.md` §2). `common/middleware/auth.ts`'s Ed25519 challenge-response (`RED_TEAM_REVIEW.md` RT-002) is now actually wired as `requireAuth` on every write-side route across identity/peers/liquidity/p2p/settlement. Fixed a real bug found in the process: `verifySignedChallenge()` never returned the session token it generated, so authentication verified but produced no usable credential — see `TODO.md` §3. Remaining: Growth path beyond Level-0 Keys (DID/Credentials/Trust Graph, `PROTOCOL_SPECIFICATION.md` §1.1) and Operational Profiles, below |
| Operational Profiles *(new — RFC-007 D8/D11)* | §1.1, RFC-007 | 🔲 Not started — additive OpenIdentity attribute (`OperationalProfileGrant`), blocked on OpenIdentity module itself |
| Sails OpenReputation | §1.6 | 🟢 **First service layer + routes, done and tested** *(open-reputation pass, 2026-07-16)* — `reputation.service.ts` + `reputation.routes.ts`, `API_REFERENCE.md` §6. `User.reputationScore` (single `Float`) stands in for `ReputationScore`'s full `{tradeScore, volumeScore, settlementScore, disputeRate}` breakdown — a documented simplification, not silently narrowed; `total`/`disputeRate` are real, the sub-scores report zero. See the Outcome Engine row directly below for the score-mutation half. **RFC-021 D7, peer vouching (2026-08-02) — corrected from an earlier "onboarding/KYC-optional identity-linking flow" framing that was a lazy reading of this RFC's own draft; this protocol does not do KYC.** The real fix: `Vouch` model + `vouch.service.ts`'s `vouchFor()` (real eligibility bar — `MIN_VOUCHER_TRADES=3` completed trades and positive reputation — `@@unique([voucherId, voucheeId])` prevents duplicates), `hasActiveVouch()`, `burnVouchesFor()`. A vouch pre-signs the vouchee's genuinely-first `PaymentAccount` (`payment-account.service.ts`'s `getOrCreate()`, skipping `UNSIGNED_TRADE_LIMIT` straight to `SIGNED_TRADE_LIMIT`) — real skin in the game closes the two-fresh-Sybils-vouch-each-other loophole: if the vouchee's first lost dispute happens while the vouch is active, the voucher's own reputation takes a real hit (`reputation.service.ts`'s new `penalizeForBurnedVouch()`, `VOUCH_BURN_PENALTY=-5`, a second explicitly-disclosed legitimate input to `User.reputationScore` alongside `recordOutcome()`), wired from `common/events/handlers.ts`'s existing dispute-aware `settlement.escrow.released`/`refunded` branch. New route `POST /v1/reputation/vouch`, `@satsails/p2p-trading-sdk`'s `reputation.vouchFor()`. 27 new tests. See RFC-021's own D7 section (fully rewritten, not just patched) |
| Outcome Engine + `rate()` demotion *(new — RFC-007 D8/D9)* | §1.6, RFC-007 | ✅ **Done, verified** — `recordOutcome()` is the sole `reputationScore` input (asymmetric +2/-5, a disputed loss costs more than a clean trade earns); `rate()` (`POST /v1/reputation/rate`) is informational only, never calls it, one rating per `(tradeId, raterId)` enforced by the schema's `@@unique`. Wired dispute-aware into `common/events/handlers.ts`'s `settlement.escrow.released`/`refunded` reactions: a plain completion/refund is Positive/Neutral for both parties, but a RELEASE/REFUND dispute ruling means one party won and the other lost — the handler checks for a resolved `Dispute` row to tell the two apart, since the escrow event payload alone doesn't carry that context. `CancelledByAgreement` (no dispute ever raised) always classifies Neutral, never Negative, per RFC-007 D9. 4 tests in `tests/reputationOutcome.test.ts` verify all four branches directly, not just through an HTTP round-trip |
| **Sails OpenProof** *(new — RFC-006)* | §1.8, RFC-003, RFC-006 | ✅ **Service layer real — corrected 2026-08-01, see the Proof Primitive row above for the full detail.** ~~Genuinely remaining, unchanged from before: `ProofRegistry` (duplicate-evidence detection), `EvidenceProvider` (external media storage — evidence is stored inline in Postgres for now), and RFC-008's `TimestampAnchor`/`AnchorProof`.~~ **Corrigido 2026-09-04 (Independent Master Backlog Audit) — this line was stale relative to the row directly below it**: all three were completed 2026-08-04, see the row directly below for the full detail (`ProofRegistry`/`EvidenceProvider` real; `TimestampAnchor.anchor()` real and live-wired, `upgrade()` honestly disclosed as not built) |
| Proof Registry, `EvidenceProvider`, Evidence Bundle, `TimestampAnchor` *(RFC-007 D1/D2/D6, RFC-008 D1)* | §1.8, RFC-007, RFC-008 | 🟢 **Done, 2026-08-04.** `ProofRegistry` (`proof-registry.ts`) — real exact-content sha256 fingerprinting (reuses `proof.service.ts`'s own `hashEvidence()`), `findDuplicates()` wired into `submitProof()` (emits `proof.duplicate_detected`, never blocks — D1's own "flags reuse, does not adjudicate" framing). Real deviation, disclosed in that file's own header comment: no separate `register()` — `Proof.evidenceHash` (already persisted) already *is* the registration, a second table/call would duplicate it. Perceptual/near-duplicate hashing is explicitly not covered, only exact-content matches. `EvidenceProvider` (`evidence-provider.ts`) — new `LocalFilesystemEvidenceProvider` (real, content-addressed disk storage, zero external credentials — same "always-available reference default" role `InMemoryEventStore` plays for RFC-010), new `EvidenceReference` Prisma model, `proof.service.ts`'s new `attachEvidence()` (real Ed25519 signature verification against the caller's own registered `User.publicKey`, via `tweetnacl` — same call `common/middleware/auth.ts` already uses). `TimestampAnchor` (`timestamp-anchor.ts`) — real submission verified against a live public OpenTimestamps calendar server before writing the file (not assumed from docs): plain `fetch()`, not the `opentimestamps`/`javascript-opentimestamps` npm packages (both depend on deprecated, vulnerable `request`/`request-promise`). `anchor()` is fully real; `upgrade()` (confirming against a real Bitcoin block) throws a specific, honest "not implemented" error — needs a real OTS binary-parser this codebase doesn't have, disclosed rather than faked. Real per-trade `EvidenceBundle` (D6) — new `getEvidenceBundleForTrade(tradeId)`, `tradeId` not RFC-007's literal `intentId` (same real-world correction `core/timeline.ts`'s own header comment already made for Timeline), kept separate from the already-shipped, differently-scoped `getEvidenceBundle(claimId)` (real SDK/React-hook surface — not renamed, to avoid a breaking change). New `Claim.tradeId` column. 24 new tests (`tests/proofRegistry.test.ts`, `tests/evidenceProvider.test.ts` — real filesystem I/O, `tests/integration/timestampAnchor.test.ts` — real network call to the live calendar server, `tests/proofService.test.ts`) |
| MULTISIG cooperative spend without the server *(audit — Missão 11, Fase 9.1 §8, 2026-08-24)* | `wallet-verification.ts` | 🟡 **Partially closed.** Before this pass, `@satsails/p2p-trading-sdk` could independently VERIFY and SIGN a server-proposed PSBT (`verifySigningIntent()`/`verifyAndSignEscrowPsbt()`, real since Missão 10) but had no way to COMBINE two independently-signed copies into a finalized, broadcastable transaction without asking the server to do it — `multisig.provider.ts`'s `finalizeSpend()` was the only place that logic existed. Closed: new `combineAndFinalizeEscrowPsbt()`, a thin wrapper around bitcoinjs-lib's own `combine()`/`finalizeAllInputs()`/`extractTransaction()` mirroring the server's real implementation exactly (zero new cryptographic logic, same "verified experimentally" premise that function's own header comment already established) — `tests/wallet-verification.test.ts` proves a buyer+seller pair can go from an unsigned PSBT to a valid, correctly-spending raw transaction hex using only this SDK, with zero server calls in between. **Deliberately NOT closed, per this phase's own explicit STOP-and-propose instruction rather than a from-scratch reimplementation:** constructing the UNSIGNED PSBT itself from raw inputs (UTXO selection, fee-rate estimation, dust policy, arbiter-key handling) remains server-only (`multisig.provider.ts`'s `buildUnsignedRelease/Refund/Split()`) — this is genuinely substantial, security-sensitive provider logic, and an independent SDK reimplementation risks exactly the "server and external wallet maintain subtly different construction rules" drift this session has avoided everywhere else. Proposed, not built: a shared, pure (network-I/O-free) construction primitive both sides call, analogous to `fee-reserve-math.ts`'s existing server/SDK-shared arithmetic — a genuine follow-up pass, not attempted here. Broadcasting is also out of scope by design: pushing a raw tx to the network isn't Sails-specific logic, any Bitcoin explorer/node client already does it, and this SDK doesn't need to own that dependency. |
| `sails-ui` signs MULTISIG PSBTs blind, bypassing the SDK's own verification *(gap found — Missão 11, Fase 9.1 §11 audit, 2026-08-24)* | `wallet-verification.ts`, `escrow-key.ts`, `multisigSigningIntent.ts` | ✅ **CLOSED — Missão 11 Fase 9.1.1 §3 (CTO decision), 2026-08-24.** `useEscrowKey.ts`'s MULTISIG branch now routes through `verifyAndSignEscrowPsbt()`, never raw `signEscrowPsbt()` — a new `packages/sails-ui/src/lib/multisigSigningIntent.ts` assembles the `ExpectedSigningIntent` from ONLY public `@satsails/p2p-trading-sdk` data (`sailsClient.settlement.get()`/`getPendingTransaction()`), no server-internal imports. This required closing two real, small public-API gaps found doing this (not server internals, real additive fixes): (1) `Escrow.fundedAmount`/`txLockVout` already flowed through the real GET response but were missing from the SDK's own `Escrow` TypeScript type — added; (2) the exact miner fee a specific pending PSBT was built against had NO reliable public source at all (a live fee-rate re-estimate at verification time would almost never match the historical value baked into an already-built PSBT) — closed with a new `EscrowPendingTransaction.minerFeeSats` column (migration `20260824222816`), threaded through `multisig.provider.ts`'s `buildUnsignedRelease/Refund/Split()` and persisted alongside the existing `feeCollectionSats`. Also added: `networkFromMultisigAddress()` (derives the real network from the address's own bech32 prefix — `Escrow.network` itself is just an unreliable passthrough of whatever `createEscrow()`'s caller supplied) and `btcToSats()` (exact BigInt BTC-string→sats conversion, same precision discipline §13 already established, closing a latent float-conversion gap this exercise surfaced). **SPLIT is deliberately refused, not guessed** — its output construction (proportional `buyerBps` division plus a three-way fee leg) is genuinely complex arithmetic that would risk exactly the "server and external wallet maintain subtly different construction rules" drift this session avoids everywhere else (see this file's own shared-PSBT-construction row); SPLIT only ever happens via a rare disputed-arbitration ruling, never the normal cooperative path. Proven with real cryptography, not mocks: `tests/multisigSigningIntentUi.test.ts` (14 tests) — correct PSBT signs, wrong recipient/amount/extra-output/wrong-script all rejected before signing, plus a structural proof `useEscrowKey.ts` no longer imports or calls `signEscrowPsbt` at all. **Still out of scope, unchanged from the original finding**: `signEscrowArkTx()`/`signEscrowSafeUserOp()` (LIGHTNING_HODL/SAFE_GUARD_EVM) have the identical raw-sign shape — no verify-then-sign SDK primitive exists for either rail, a wider version of the same gap this closure phase did not extend to (Fase 9.1.1's own mandate named MULTISIG specifically). |

## P3 — Advanced / Aspirational Modules

| Item | RFC / Spec | Current Status |
|---|---|---|
| Sails OpenLiquidity | §1.3, §4B | 🟢 **Second most complete module** — `liquidity.service.ts` is real, deduplicated (`ARCHITECTURE.md` §5). `priceUsd`/`minAmount`/`maxAmount` moved `Float` → `Decimal` (RFC-009). **Routes now real** *(route-restoration pass, 2026-07-16)*: `liquidity.routes.ts` (`API_REFERENCE.md` §3), plus new `createOffer()`/`updateOfferStatus()`/`getOrderBook()` methods on `LiquidityRouter` — only read/match methods existed before. **`paymentMethod`/`priceMin`/`priceMax` filters on `GET /v1/liquidity/offers` landed** *(Production Readiness Audit, 2026-08-09)* — real, matching `API_REFERENCE.md`'s description. **HodlHodl liquidity aggregation (pulling their public order book into search results) removed as dead code the same day** — the stub (`isAvailable()` always `false`, zero test coverage, no runtime effect) added no value sitting in the tree; stays a roadmap line here only, no code, until actually prioritized |
| Sails OpenFinance | §4B, `REFERENCE_IMPLEMENTATIONS.md` §3 | 🔲 Not started — blocked on real external adapters (Morpho, etc.) |
| Sails OpenAgents | §1.7 (includes the `learn()` step) | 🟡 **First real capabilities landed** *(QVAC/WDK MVP pass + same-day follow-up, 2026-07-17)* — `QvacAgentProvider` (`qvac-agent.provider.ts`, real `@qvac/sdk` local LLM inference, no cloud dependency) plus `BuyerAgent`/`SellerAgent` (`wallet-agent.ts`, `buyer-agent.ts`, `seller-agent.ts`) — two local agents simulating Satsails Wallet instances, `BuyerAgent` autonomously generating a real `TradeIntentPayload` from a plain-language goal, live-verified (see `TODO.md` §5B for timing/output notes, including the small-model output-quality caveat). The "QVAC integration at 0%" finding this row previously cited (`TETHER_DUE_DILIGENCE_REPORT.md` finding 12 — that file isn't present in this environment either, same as `MASTER_COORDINATION.md`) is now out of date. **HTTP surface landed, 2026-08-09** — `agent.routes.ts`'s `POST /v1/agents/generate-trade-intent`/`generate-offer-intent`/`assess-intent-risk` wrap `QvacAgentProvider`'s three real capabilities directly (`API_REFERENCE.md` §7D), unblocking `packages/sails-ui`'s "AI Negotiator" panel/`AgentRiskCard` to swap off their disclosed client-side simulation. `requireAuth`-gated (cost/DoS reason, not data-scoping — same rate-limit tier `capability.routes.ts`'s revoke route uses). Still genuinely not started: the `learn()` step. (RFC-007 D7's Social Engineering Agent is now real — see its own row below.) **`demo-satsails-qvac.ts`** *(new — root-level entrypoint, same day)*: `npm run demo:qvac` boots QVAC agents → Pears P2P → Sails Protocol state machine (Intent Engine) → WDK signing in one command, delegating to `pix-to-usdt-flow.ts`'s `main()` (now exported, guarded behind `require.main === module`) rather than duplicating that orchestration logic. Also fixed, found while verifying this: `src/main.ts` (the server entrypoint `package.json`'s `dev`/`start` scripts have referenced since before this pass) genuinely did not exist — confirmed via `npm run dev` failing with `Cannot find module 'src/main.ts'`, not assumed. Created as a thin wrapper around `app.ts`'s already-real `startServer()`; `package.json`'s `start`/`main` fields also corrected to the real `tsc` output path (`dist/src/main.js`, not `dist/main.js` — `tsconfig.json` has no explicit `rootDir`, and the `@satsails/p2p-schemas` path mapping pulls a `packages/`-rooted file into the same compiled program, shifting the inferred common root to the repo root). `npm run dev`/`npm start` both verified to resolve and run cleanly now, up to the already-documented "no live Postgres/Redis in this environment" point |
| Social Engineering Agent *(new — RFC-007 D7, real as of RFC-017)* | §1.7, RFC-007, RFC-017 | 🟢 **Real, 2 of 3 patterns detected** — `social-engineering-agent.ts`'s `SocialEngineeringAgent.evaluate()` (D7's own interface, unchanged) calls QVAC (`qvac-agent.provider.ts`'s new `assessSocialEngineeringRisk()`) to classify real chat messages for `off_channel_migration`/`payment_instruction_change`, using up to 5 prior messages from the real Timeline (row above) as context. Wired via `common/events/handlers.ts` → `agents.social_engineering.risk_detected` → `chat.routes.ts` broadcasts a `RISK_WARNING` WS message — detection only, never blocks or alters a trade. Off by default (`config.features.socialEngineeringDetection`, real QVAC call per message has real cost). `unexpected_flow_deviation` explicitly not detected in this pass — needs real trade-state-machine awareness, a larger scope than reading one message (RFC-017's Alternatives Considered #5). Policy Engine integration (`get`/`propose`/`activate`, "riskScore feeds the Policy Engine" per D7's own words) also not built — that interface remains a stub; the signal is a real event instead, ready for the Policy Engine to subscribe to once it exists. 13 tests across `tests/timeline.test.ts`/`socialEngineeringAgent.test.ts`/`socialEngineeringDetection.test.ts` |

---

## Developer Experience / Tooling (out-of-band — doesn't gate any module)

| Item | Status |
|---|---|
| HyperDHT/dht-rpc Wireshark dissector | 🟢 **Complete, 2026-08-09** — `tools/wireshark-hyperdht-dissector/` (`hyperdht.lua` + `README.md`). Standalone Wireshark Lua plugin, isolated from `src/`/`packages/`, never installed with the product. Decodes `dht-rpc`'s full request/response envelope and all 11 HyperDHT commands (including request/response correlation by transaction ID, since `dht-rpc`'s own wire format carries no command field on responses), transcribed and cross-checked directly against `holepunchto/dht-rpc`'s `lib/io.js`, `holepunchto/hyperdht`'s `lib/constants.js`/`lib/messages.js`/`lib/persistent.js`, and `holepunchto/compact-encoding`'s `index.js` — confirmed via direct source reading (2026-08-08) that no such dissector exists publicly anywhere (checked `holepunchto/hyperdht`'s own repo). Cross-checking against `persistent.js`'s real request handlers (not just `messages.js`'s schema definitions) caught a real bug in the first draft — `IMMUTABLE_PUT` was wrongly decoded with `MUTABLE_PUT`'s shape; it's actually unwrapped, content-addressed raw bytes — fixed before ever being used against real traffic. Built as a genuine engineering-workflow improvement for Sails' own Pears/HyperDHT debugging. Known, disclosed limitations (see the README): not validated against a live two-node HyperDHT capture (no such network available in the environment this was built in); cannot see anything past the DHT routing/discovery layer — every Sails application payload (Intent, Offer, Chat) is already encrypted client-side (`payload-crypto.ts`) before it ever reaches this transport, on top of Hyperswarm's own Noise_XX transport encryption, so this tool decodes plaintext bootstrap/lookup/announce/hole-punch traffic only, never trade content. Useful for debugging "peer didn't discover the offer" / NAT traversal / bootstrap-timing issues going forward. |
| UDX Wireshark dissector | ⛔ **Not pursued — already exists officially.** Holepunch itself publishes a working dissector at `holepunchto/libudx`'s `docs/wireshark/udx.lua` (143 lines, decodes the full UDX header — magic byte, version, type flags DATA/END/SACK/MSG/DESTROY/PING, data offset, length, id, window, seq, ack, sacks, payload). Confirmed before writing any code (2026-08-09) — building a competing/duplicate dissector would have been redundant with Holepunch's own published work, not a genuine contribution. Also, unlike HyperDHT, UDX doesn't appear anywhere in Sails' own code or dependencies (confirmed via repo-wide search) — it's Holepunch's internal transport underneath Hyperswarm, never touched directly, so it carries no debugging value for Sails' own stack either way. Deliberately not built. |

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

---

## Update — Multi-Wallet-Kit + Multi-Rail Network-Effect Strategy (2026-09-07)

**BACKLOG DELTA DETECTED — strategic adoption obligation registered.**

The Sails P2P Trading SDK should ship with first-party integration paths for
the major wallet development kits and the major settlement-capable networks
relevant to P2P markets.

**Property / distribution objective:** a wallet should be able to adopt Sails
without being forced to replace its existing wallet-development, key,
signing, or settlement stack. The already-shipped RFC-013 `WalletAdapter`
boundary is structurally compatible with this objective, but first-party
named adapter coverage is not yet implemented or demonstrated.

**Cross-link (added 2026-09-08, Institutional Cold Sweep):** this entry
corresponds to [Issue #86](https://github.com/alan-schramm/Sails-Protocol/issues/86)
("[Strategy] First-party wallet-kit adapters + multi-rail OpenP2P
distribution") — same adapter-target list, same architecture boundary.
Cross-referenced here rather than duplicated as a separate entry.

Initial visible **planned adapter targets**:

- `@sails/adapter-bdk` — BDK / Bitcoin wallet stacks
- `@sails/adapter-wdk` — Tether WDK wallet stacks
- `@sails/adapter-breez` — Breez SDK wallet stacks
- `@sails/adapter-spark` — Spark SDK wallet stacks
- `@sails/adapter-ldk` — LDK / Lightning wallet stacks
- `@sails/adapter-ethers` — major EVM wallet stacks using ethers-compatible flows, including Ethereum and BNB Smart Chain
- `@sails/adapter-tron` — TRON wallet stacks
- `@sails/adapter-solana` — Solana wallet stacks
- `@sails/adapter-ton` — TON wallet stacks
- additional wallet-development kits when ecosystem relevance and real
  integrator demand earn first-party support

**Current truth / claim discipline:** none of the six named adapter packages
above is claimed as published or supported today by this registration. Exact
package namespace availability and implementation shape must be verified
before release. Existing `WalletAdapter` examples using bitcoinjs-lib and
ethers demonstrate the generic integration boundary, not BDK/Breez/Spark/LDK
first-party support.

**Settlement-network principle:** support is open to economically relevant
networks that can demonstrate Sails' required settlement properties
(escrow/conditional settlement, authority, evidence, release/refund/dispute,
recovery and reconciliation). "Has smart contracts" or "has an SDK" is not a
sufficient acceptance criterion.

**Architecture boundary:** Wallet-kit Adapter != SettlementProvider.
Core semantics remain vendor-neutral. WDK remains an important reference and
first-party adapter target, but **WDK is not a mandatory dependency for every
wallet integrating Sails**.

**Network-effect rationale:** OpenP2P becomes more valuable as wallets using
different development stacks and settlement rails can join the same shared
economic coordination layer with lower integration cost. Wallet-stack reach
and settlement-rail reach are therefore explicit distribution concerns, not
reasons to move vendor-specific complexity into Core.

Classification:
- prior "every wallet becomes, by necessity, a WDK integrator" wording:
  **DOCUMENTATION DRIFT / STRATEGIC CONTRADICTION**
- first-party adapter coverage:
  **NEW BACKLOG DELTA / PRODUCTIZATION + ECOSYSTEM DISTRIBUTION**
- no adapter implementation is authorized by this registration alone
- no new Core primitive, registry, or generic abstraction authorized
- Norte macrofront count remains unchanged; this refines Productization /
  Ecosystem Composition rather than creating a new macrofront

---

## Identity Root & Multi-Protocol Identity UX (registered 2026-09-08)

**Type:** architecture + product UX obligation. **Backlog/design
registration only — no implementation, no new Core primitive, no
derivation scheme, no schema change authorized by this entry.**

### Where this comes from — investigated before registering, not assumed

A repository-wide search (not a guess) for every representation of this
space, done before writing anything below:

- **Pears/HyperDHT identity** — the only one with a *real, shipped*
  partial implementation: `prisma/schema.prisma`'s `User.peerId` (a
  single, independent, nullable field — no derivation relationship to
  `User.publicKey` enforced or even modeled), `identity.service.ts`'s
  `PublicParticipantIdentity` (peerId disclosed as "their P2P transport
  identity"), and `pear.service.ts`'s 2026-08-09 fix (`PearNode.start()`
  generates its own `HyperDHT.keyPair()`, taking no caller-supplied key
  at all). **This exact gap is already disclosed, not new**:
  `docs/BACKLOG.md`'s own "Current Truth P1+ set extended by one
  instance" entry (2026-09-06) and `docs/TRUST_BOUNDARY.md` Boundary 1b
  already state plainly: *"economic participant identity and transport
  identity are demonstrably different keys today, but their association
  remains server-mediated/database-associated (`User.peerId`, checked by
  `verifyHandshakeIdentity()`), not independently cryptographically
  bound."* This entry generalizes that already-disclosed, Pears-specific
  finding to every other protocol identity the wallet composes — it does
  not re-discover or duplicate it.
- **`rfcs/RFC-013-capability-registry-and-wallet-adapter.md`** — titled
  "...and Portable Identity via `peerId`," but this is a *narrower and
  different* concept than what this entry registers: RFC-013's
  "portability" means reputation stays addressable by the same `peerId`
  across different wallet apps (a lookup-key convenience), not a
  recovery root deriving multiple domain-separated protocol identities.
  Not to be conflated — cited here precisely so it isn't.
- **`docs/PROTOCOL_SPECIFICATION.md` §1.1's "Portable Identity Layer"**
  (Level-0 Keys → DID/Portable-Identity → Credentials → Trust Graph) —
  also a *different* portability axis: an established identity usable
  across wallets/apps without re-registering, explicitly technology-
  neutral ("W3C DID, a Nostr keypair/NIP-05 identifier, a bare Ed25519
  key... the protocol has no opinion"). This is about one identity's
  portability, not about deriving several independent protocol
  identities from one recovery root. Cited, not duplicated.
- **Nostr** — appears only in three unrelated framings: (1) design
  inspiration for `EvidenceProvider`'s pointer-and-hash pattern
  (`rfcs/RFC-007`, `rfcs/RFC-008` — explicitly critiqued there as
  under-specifying non-repudiation for a financial protocol, RFC-008's
  entire reason to exist), (2) an evidence-media hosting adapter
  (`Nostr.build`, alongside S3/R2/IPFS/Arweave, `docs/PROTOCOL_SPECIFICATION.md`
  §1.8, `docs/ECOSYSTEM_INTEGRATIONS.md`), and (3) one illustrative,
  non-committal example of a Portable-Identity-Layer format (previous
  bullet). **None of these is about Nostr key *recovery* or derivation.**
  The only place "Nostr as transport" is named as its own front at all
  is `docs/GITHUB_PROJECT.md` §D's flat "named only, not elaborated"
  list (also cross-referenced from `docs/ENGINEERING_GOVERNANCE.md`
  §13) — a name with zero scope, zero design, zero commitment.
- **Pubky / PKARR** — appear *only* in that same `docs/GITHUB_PROJECT.md`
  §D flat list and its `ENGINEERING_GOVERNANCE.md` cross-reference.
  Nowhere else in the repository. No design, no scope, no prior
  discussion beyond the name.
- **Iroh** — a targeted search of every `.md` file and `src/` found
  **zero mentions anywhere in this repository.** Not previously named,
  not previously discussed, not previously registered in any form. A
  genuinely new addition to the ecosystem-technology list, not a gap in
  an existing registration.
- **`ParticipantIdentity`** (the conceptual name for the `User` Prisma
  model) — its Core contract (`docs/PROTOCOL_SPECIFICATION.md` §1.1) is
  silent on multi-protocol derivation entirely; it defines Level-0 Keys
  → optional Portable-Identity-Layer → Credentials → Trust Graph, none
  of which models "one root, several domain-separated protocol
  identities."
- **"multi-device"**, **"seed-derived identity"**, **"reputation
  portability"** (as a dedicated architectural treatment, distinct from
  RFC-013's narrower `peerId`-lookup sense) — zero hits anywhere in
  `docs/` or `rfcs/`. Missing obligations, not overlooked existing text.

### Classification of what already exists

- **Current architecture:** `User.publicKey` (economic/funds identity)
  and `User.peerId` (Pears transport identity) as two independent,
  caller-supplied fields with a server-mediated, not cryptographically
  bound, association. This is the *only* protocol identity beyond the
  core keypair with any real, shipped representation today.
- **Historical discussion, named only:** Nostr (as transport), Pubky,
  PKARR — `docs/GITHUB_PROJECT.md` §D. No scope, no design.
- **Partial implementation:** none beyond the Pears/`peerId` case above.
- **Future direction:** the Portable Identity Layer (`docs/PROTOCOL_SPECIFICATION.md`
  §1.1) — a different axis (portability of one identity), not multi-
  protocol derivation.
- **Missing obligation (this entry):** a single user recovery root
  deriving or recovering multiple protocol-specific identities with
  domain separation, independent rotation/revocation, and no implied
  cross-protocol correlation — not represented anywhere in this
  repository before this registration. Iroh as an ecosystem technology
  is likewise entirely new.

### Architectural direction registered

A single user recovery root may derive or recover multiple
protocol-specific identities while preserving domain separation,
independent key material, independent protocol dependencies, and
independent rotation/revocation semantics. Preserved distinctions:

- **Funds Authority ≠ Economic Identity ≠ Transport/Communication
  Identity** — three conceptually distinct roles that must not be
  silently collapsed into "the wallet's one key."
- **Same recovery seed/root ≠ same private key across protocols** — a
  single backup recovering multiple identities does not mean those
  identities share, or are trivially derivable from, one another's key
  material in a way that breaks domain separation.

Obligations this direction must eventually cover (registered as scope,
not scheduled or designed): one-backup recovery UX; protocol-specific
domain-separated derivation; Nostr identity recovery; Pears/P2P identity
recovery; Pubky/PKARR identity recovery; Iroh/device identity where
relevant; device-specific keys where the underlying protocol requires
them; rotation/revocation; wallet migration; compromise isolation;
multi-device; binding external identities to Sails `ParticipantIdentity`
(building on, not replacing, the existing `User.peerId` precedent above);
reputation/history continuity; export/import boundaries; privacy/
correlation resistance; no implication that external transport
identities become Sails Core identity.

### Privacy property (registered)

**Deterministic recoverability must not imply publicly correlatable
identities across protocols.** A wallet must not accidentally expose

```
Nostr pubkey ↔ Pears pubkey ↔ Pubky key ↔ wallet addresses
```

as trivially provable siblings unless the user or protocol intentionally
creates that binding.

### UX property (registered)

**The user should not need to understand or separately back up every
protocol-specific key merely because the wallet composes multiple
decentralized protocols.** But: **UX simplification must not collapse
cryptographic trust domains.**

### Conflict check against current `OpenIdentity`

No conflict found. `docs/PROTOCOL_SPECIFICATION.md` §1.1's `Identity`
Core contract is additive-by-design (each layer optional, Level-0 keys
always remain valid) and explicitly technology-neutral on the Portable
Identity Layer — this entry's direction fits inside that contract as a
possible future OpenIdentity-module-level (or dedicated
Transport/Interoperability-level) elaboration, not a change to it. The
one existing concrete data point (`User.peerId`) is treated here as a
precedent to build on, not a design to unwind.

### Not authorized by this entry

KDF choice, derivation paths, NIP-specific derivation, Pubky key scheme,
Pears identity changes, Iroh integration, a new `OpenIdentity` schema, a
new `ParticipantIdentity` primitive, a device-key registry, recovery UI,
key escrow, cloud backup, or a cross-protocol identity registry. Backlog/
design obligation only.

### Norte placement

No new Norte macrofront. Represented within the existing macrofronts
whose scope it composes: **9. OpenIdentity**, **13. Transport/
Interoperability**, **17. Protocol UX**, **19. Privacy Architecture**.
Macrofront count remains 38.

### Project sync

**No new Project card.** Same posture already established immediately
above in this file for the Cross-Rail Guard-Maturity Disclosure entry:
Backlog representation is sufficient while no execution mission is
authorized; this is one composed architectural obligation, not four
independent per-technology initiatives.

Classification: **BACKLOG DELTA DETECTED AND SYNCED** — the obligation
was not explicitly represented before this entry (only its Pears-scoped
special case was, and only Nostr/Pubky/PKARR's bare names, and Iroh not
at all).

---

## `docs/CRYPTOGRAPHIC_MODEL.md` §1 documentation drift (found 2026-09-08, Identity Architecture Discovery) — CLOSED (corrected 2026-09-08, Institutional Cold Sweep)

**Type:** current-truth documentation drift, found in passing while
verifying Sails' current identity model against real code for
`docs/IDENTITY_ARCHITECTURE_DISCOVERY.md` §2 — not the target of that
investigation, and genuinely distinct from the Identity Root &
Multi-Protocol Identity UX obligation immediately above.

`docs/CRYPTOGRAPHIC_MODEL.md` §1 (2026-07-19) still claims Sails'
economic identity keypair and the Pears/HyperDHT transport keypair are
"one primitive, not two." Confirmed false today: `pear.service.ts`'s
2026-08-09 key-custody fix changed `PearNode.start()` to take no
caller-supplied key at all (`async start(): Promise<string>`, verified
directly, `src/infrastructure/p2p/pear.service.ts:119-123`) — it calls
`HyperDHT.keyPair()` with no seed, generating a fresh, unpersisted
keypair every session, cryptographically unrelated to
`User.publicKey`. This exact correction already landed in
`docs/TRUST_BOUNDARY.md` Boundary 1b and this file's own 2026-09-06
entry — it was simply never propagated back to
`docs/CRYPTOGRAPHIC_MODEL.md` itself, the document that originated the
now-false claim.

Not corrected by the original registration (out of scope for a
discovery-only mission — no document besides
`docs/IDENTITY_ARCHITECTURE_DISCOVERY.md` was authorized for edits
there).

**Corrected 2026-09-08 (Institutional Cold Sweep / Production
Readiness).** `docs/CRYPTOGRAPHIC_MODEL.md` §1 now carries a dated
"Corrigido/Current-truth update (2026-09-08)" note, preserving the
original 2026-07-19 text verbatim above it, stating plainly: economic
identity = `User.publicKey`; transport identity = a separate, ephemeral
`User.peerId`; the association is server-mediated, not cryptographically
bound; the Pears key is not today cryptographically bound to
participant identity. Points to `docs/TRUST_BOUNDARY.md` Boundary 1b as
the already-correct source — same dated-correction convention used
throughout this repository. Does not resolve the underlying identity
architecture (tracked separately, see the entry above and
`docs/IDENTITY_ARCHITECTURE_DISCOVERY.md`) — documentation-accuracy fix
only.

**Status: CLOSED.** Full evidence: `docs/TECHNICAL_DEBT_AUDIT.md` item
60, `docs/IDENTITY_ARCHITECTURE_DISCOVERY.md` §2, correction in
`docs/CRYPTOGRAPHIC_MODEL.md` §1.

Classification: **BACKLOG DELTA DETECTED AND SYNCED** — genuinely
distinct from the Identity Root & Multi-Protocol Identity UX entry
above; not a duplicate.

---

## Institutional Cold Sweep / Production Readiness (2026-09-08)

**Type:** institutional reconciliation — closing a real gap where the
CTO had already recognized several obligations (via GitHub Issues,
prior sessions' framing) that had not yet been reflected as explicit
Master Backlog entries. No product implementation, no new Core
primitive, no new Norte macrofront. Three obligations registered below.

### 1. Issue #75 reconciliation — multi-implementation / platform / agent-interface horizon

**Source:** [Issue #75](https://github.com/alan-schramm/Sails-Protocol/issues/75)
("Horizon: multi-implementation, application platforms & agent
interfaces"), read in full before this registration. The issue's own
closing line — *"Master Backlog operational representation: needs
reconciliation"* — is what this entry resolves.

**Obligation registered:**

> **TypeScript is first, not authoritative.** Different implementations
> and interfaces must preserve the same economic semantics.

Three distinct tiers, preserved exactly as Issue #75 structures them —
**not collapsed into one undifferentiated "implementation" bucket**:

- **Protocol implementations** (semantics-bearing, must conform):
  TypeScript (first, already real), Rust, Go. Rust/Go, if/when adopted,
  must be evaluated as independent implementations against canonical
  Sails semantics and conformance evidence — never assumed equivalent
  as "mere translations." No cross-language equivalence claim without
  implementation *and* conformance evidence.
- **Application/platform targets** (consume a protocol implementation,
  not necessarily full implementations themselves): Web, React Native,
  iOS, Android.
- **Native/developer surfaces** (integration surface, smallest-correct
  mechanism per platform — native SDK, client, binding, generated
  client, WASM, or direct API, decided per surface, not assumed):
  Swift, Kotlin, plus agent interfaces API, CLI, MCP, WebMCP. Interfaces
  may multiply; protocol semantics must not. Agent access must not
  imply agent authority.

**Explicitly not authorized by this registration:** building Rust, Go,
Swift, or Kotlin SDKs; MCP/WebMCP integration; any implementation work
at all. This is horizon preservation + Master Backlog reconciliation,
exactly as Issue #75 itself scopes it ("Implementation authorization:
NO", "Research / horizon preservation: YES").

**Norte placement:** no new macrofront. Existing fronts 16 (Agent & Tool
Interfaces), 21 (SDK/DX), 22 (Developer Docs/Mintlify), 26 (Conformance),
30 (Productization/Ecosystem Composition) — matching Issue #75's own
"Current classification" section exactly.

### 2. Independent Implementation Conformance

**Sources, cross-referenced rather than merged silently:** the
conformance obligation is currently fragmented across this file (no
prior explicit entry), Issue #75 ("No cross-language equivalence claim
without implementation + conformance evidence"), and
[Issue #77](https://github.com/alan-schramm/Sails-Protocol/issues/77)
("Final Red Team Horizon")'s own second registered case, **"Sails
semantic divergence"** — which states, nearly verbatim, the same
property this entry now registers formally. This entry is the single
Master Backlog anchor both issues should point back to; it does not
duplicate Issue #77's Red-Team-specific framing (a future adversarial
test case) or Issue #75's broader multi-language horizon (§1 above) —
it registers the underlying *property* both already assume.

**Obligation registered:**

> A TypeScript implementation conforming with itself is not sufficient
> evidence of implementation-independent protocol semantics.

Future property (not implemented, not scheduled):

```
canonical input
→ implementation A
→ implementation B
→ same valid economic interpretation / Outcome
```

Preserved distinctions, verbatim:

- **TypeScript implementation ≠ protocol truth.**
- **Conformance ≠ interoperability.**
- **Same canonical inputs must not produce different valid economic
  meaning across conformant implementations.**

**Relation to the historical "Participant Model" debt — checked,
found distinct, kept distinct, not merged silently.** This file's own
P0-status table (`docs/BACKLOG.md`, row "Participant Model", RFC-001
§1.1) tracks a *structural* gap: whether a specific Core interface
primitive exists in code at all ("🔲 Not started — interface not yet in
code anywhere"). Independent Implementation Conformance is a *semantic*
question: whether two implementations that both claim to satisfy that
(or any other) primitive's contract actually agree on economic meaning
for the same input. These are genuinely different failure modes — a
single, complete TypeScript implementation could satisfy "Participant
Model: done" while conformance remains entirely unestablished (no
second implementation exists to conform against), and conversely a
future second implementation could exist yet still diverge from
TypeScript's own interpretation regardless of Participant Model's own
completeness. Registered as two separate obligations; neither is a
subset or a rename of the other.

**Explicitly not authorized by this registration:** building a Rust or
Go implementation now; building any conformance harness/engine now.
Classified as a **future / core-hardening obligation** — evidence
requirement, not a scheduled deliverable.

### 3. Production Readiness Consolidated Gate

**Purpose:** prevent "several things look ready" from being read as
"Sails is ready for production" — a real, observed risk in a repository
where individual providers, migrations, and hardening passes each
carry their own, real, honestly-earned "done" status, but no single
gate has ever asked whether they compose into an actual production-
ready system.

**Obligation registered:** a single, named **Production Readiness
Consolidated Gate**, not yet defined as a detailed checklist or
automated score (explicitly not authorized below), that must eventually
consolidate, at minimum:

provider production eligibility; settlement rail maturity; real
migrations applied; DB/Postgres readiness; Redis/runtime readiness;
secrets and key custody; environment/configuration; recovery/
reconciliation; unknown-outcome handling; finality/reorg assumptions;
observability; operational runbooks; dependency readiness; external SDK
maturity; protocol economics activation; fee policy activation;
capability enforcement posture; real-value evidence; security audit
status; Red Team status; network simulation; deployment assumptions;
incident/recovery procedures; claim boundaries; reference-wallet
production evidence; independent integration evidence.

**Updated 2026-09-08 (Day-0 Multi-Operator Sails Network addendum) —
seven categories added**, surfaced by
`docs/PARTNER_BETA_INTEGRATION_REALITY.md`'s network-topology finding
and the "Day-0 Multi-Operator Sails Network / Node Independence"
obligation registered below: **multi-operator node readiness; node
independence; shared-market cross-node behavior; bootstrap/discovery;
failover/migration; node economic attribution; single-operator
dependency check.**

**Updated again 2026-09-08 (Day-0 Network Property Correction) — one
category added**, not semantically covered by the seven above:
**market fragmentation test** — "three conformant APIs serving three
isolated marketplaces" (this file's own Day-0 entry, Fragmentation
property) is a specific, falsifiable failure mode distinct from the
broader "shared-market cross-node behavior" category; named separately
so it cannot be satisfied by conformance testing alone. Same discipline
as the original 25 categories —
named, not checklisted; evidence required, no automated score.

**Core requirement:** passing this Gate must require **evidence, not
accumulation of completed tickets** — the number of closed BACKLOG/
TECHNICAL_DEBT_AUDIT items is not itself a production-readiness signal.

Preserved distinctions, verbatim:

- **Provider implementation ≠ provider maturity ≠ production
  eligibility.**
- **Reference implementation success ≠ independent interoperability
  proof.**

**Explicitly not authorized by this registration:** a detailed,
itemized checklist beyond the category list above; any automated
"production readiness percentage"/scoring mechanism; a CI scoring
system; a production-readiness checker; deployment automation;
provider-eligibility code. This entry names the Gate and its required
categories — it does not build it.

### Roadmap check (item 5 of the mission) — no contradiction found

Verified each named front's current positioning; none required
correction:

- **Third-Party Sails Modules & Developer Extension Ecosystem**,
  `create-sails-adapter`, `create-sails-module`, **Third-Party Liquidity
  & Economic Modules** — already correctly placed in `docs/ROADMAP.md`
  under Months 10-12, framed as future tracks, not executable backlog.
- **Sandbox / Playground** (Issue #78) — correctly **not yet mentioned
  anywhere in `docs/ROADMAP.md`** (confirmed by direct search) — Issue
  #78 itself scopes this as "Implementation now: NO," so its absence
  from the Roadmap is the correct state, not an omission needing a fix.
- **External security audit** — `docs/DEPLOYMENT.md` already states
  plainly "no external security audit of this codebase has happened,"
  correctly undisclosed as complete anywhere.
- **RC1** — `docs/BACKLOG.md`'s own status table already shows
  "🔲 Not started — blocked on Implementation Review," correctly
  unpromoted.

No file required a correction for this check.

### Issue check (item 6 of the mission)

Read in full, classified, no new Issues created:

| Issue | Properly represented? | Needs Backlog link? | Future-only? | Execution-ready? | Duplicated? |
|---|---|---|---|---|---|
| **#75** | Now yes — reconciled by §1 above | Yes, added | Yes | No | No |
| **#77** | Yes, as its own Red-Team horizon marker | Yes, cross-linked by §2 above for its conformance sub-case only | Yes | No | No — distinct from §2, which registers the underlying property #77's second case assumes |
| **#78** | Yes, self-contained and already correctly scoped (see Roadmap check above) | No — appropriately Issue-only until a later execution mission | Yes | No | No |
| **#84** | Yes, a well-scoped watch/re-open trigger with its own explicit re-entry checks | No — status is self-contained (`WATCH / DEFERRED`), already cross-references `docs/BACKLOG.md`'s QVAC entry and PR #83 | N/A (deferred, not a future horizon) | No | No |
| **#86** | Yes — its adapter-target list matches `docs/BACKLOG.md`'s existing wallet-adapter entry verbatim (registered via the earlier PR #87 strategy pass), but that entry never cited the issue number | Yes — cross-link added | Partially (planned targets are future; the `WalletAdapter` boundary itself is already real) | Partially (the boundary exists; adapters themselves are not built) | No — confirmed the same content, added the missing cross-reference rather than creating a duplicate entry |

Cross-link added to the existing wallet-adapter entry in this file (the
one with the `@sails/adapter-*` bullet list) noting it corresponds to
Issue #86, rather than creating a new entry for already-registered
content.

Classification: **BACKLOG DELTA DETECTED AND SYNCED** — Production
Readiness Consolidated Gate and Independent Implementation Conformance
were materially under-represented (no prior Master Backlog entry
existed for either); Issue #75's own reconciliation requirement is now
satisfied. No new Norte macrofront. Norte remains 38.

---

## Partner Beta / Integration Reality (2026-09-08)

**Source:** `docs/PARTNER_BETA_INTEGRATION_REALITY.md`, a discovery
mission investigating whether a stranger developer/partner could
actually integrate the Sails P2P Trading SDK using only public
material. Four distinct deltas registered below, grouped from 18
individual findings per the mission's own rule against creating one
issue per finding.

### 1. Shared economic network topology (most severe finding)

**Property:** `docs/PROJECT_CONTEXT.md` states "a wallet that
integrates Sails becomes a participant in one shared, interoperable
network, not the operator of its own isolated instance." **Confirmed,
directly, that the current documented integration path does the
opposite** — every example (`README.md`, `docs/GETTING_STARTED.md`,
`docs/SDK_GUIDE.md`) points `SailsClient` at a self-hosted
`docker compose up` instance with its own empty Postgres database.
`docs/PARTNER_BETA_INTEGRATION_REALITY.md` §4 confirmed no publicly
reachable, Sails-operated endpoint is documented anywhere, and that
existing "cross-instance" mechanisms
(`sails:cross-instance-events`, `docs/DATABASE.md`) are horizontal
scaling for *one* operator's own deployment, not federation between
independently-operated nodes. A partner following the documented path
today gets an isolated economic island: no shared offers, identity, or
reputation with Satsails' own users or any other operator.

**Not the same as** Issue #75 (multi-implementation/platform/interface
horizon) or Issue #86 (wallet-kit distribution) — both are adjacent,
neither addresses cross-operator network topology. Genuinely distinct,
kept distinct.

**Classification: NEW BACKLOG DELTA — the most consequential precondition
for any real Partner Beta.** No architecture chosen here (Discovery
only, per that document's own scope) — a future, separately CTO-gated
mission must design how a second real operator joins the same economic
network as Satsails, or the "shared network" positioning claim needs an
explicit, honest revision if that is not the near-term plan. Cross-links
Production Readiness Consolidated Gate's "deployment assumptions" and
"independent integration evidence" categories (already registered
above) — not duplicating either.

### 2. Professional liquidity provider primitives

**Gap, confirmed directly against `prisma/schema.prisma`'s `Offer`
model and `trade.service.ts`'s `createTrade()`:** no quote-expiry field
on `Offer`; no inventory/partial-fill tracking beyond per-trade
`minAmount`/`maxAmount`; no pre-commit review/accept gate for offer
owners (`createTrade()` always transitions straight to `ACTIVE`, no
manual-acceptance option exists); no outbound webhook delivery
mechanism (only a WebSocket channel, which assumes a persistent client
connection — a poor fit for a backend/OTC-desk integrator).
`docs/PARTNER_BETA_INTEGRATION_REALITY.md` §6 confirmed the trade
*settlement* lifecycle itself already works for a professional
provider (same primitives a wallet's own users get) — the gap is
narrowly in the market-making layer (quote/inventory/review/push),
not evidence of needing a second, provider-specific marketplace.

**Classification: NEW BACKLOG DELTA.** Cross-links Production
Readiness Consolidated Gate's "provider production eligibility"
category (registered above) with new, narrower detail — not a
duplicate category. No new Core primitive proposed; reads as `Offer`/
`Trade` extensions plus a genuinely new webhook-delivery mechanism.

### 3. Live capability/rail discovery

**Gap:** `GET /v1/settlement/escrow/:id`'s `data.custodyModel`
(confirmed real and working, 2026-08-24) only discloses custody
topology *after* an escrow already exists with a chosen `type` — there
is no live, runtime API a partner's own code can query *before*
choosing a settlement type to ask "what does this specific deployment
currently support, at what maturity?" Today that information exists
only as static documentation (`README.md`'s coverage matrix,
`docs/GETTING_STARTED.md`'s provider table), which describes this
repository's own capabilities, not necessarily a given partner-operated
deployment's actual configuration.

**Classification: NEW BACKLOG DELTA**, narrow. Cross-links the
already-real `custodyModel` precedent as the pattern a future live
discovery surface should extend, not replace. Preserves `WalletAdapter
≠ SettlementProvider`, `wallet support ≠ network support ≠ asset
support ≠ settlement support`, `provider implementation ≠ provider
maturity ≠ production eligibility` throughout — no
`supportedCapabilities()` method is proposed merely because it was
discussed conceptually elsewhere; the finding is narrower than that.

### 4. Client-side session recovery + non-wallet integration example

**Two small, bounded gaps grouped together:** (a) no automatic
client-side session-expiry recovery exists anywhere in
`packages/sails-sdk` — a developer must manually catch `401` and
re-call `identity.authenticate()`, per `docs/GETTING_STARTED.md`'s own
error table; (b) `WalletAdapter` is confirmed genuinely optional
(`client.ts`'s `wallet?: WalletAdapter`, `requireWallet()` only gates
wallet-specific methods) — a real, already-existing, good property —
but no example anywhere in this repository demonstrates a non-wallet
(service/backend) integration end-to-end, so a stranger reading only
the examples would reasonably (if incorrectly) conclude a wallet is
required.

**Classification: NEW BACKLOG DELTA**, small. Cross-links Issue #75
(DX/interfaces horizon) for the missing-example half; the session-
recovery half has no existing representation and is registered fresh.

### Explicitly not registered as new deltas

Findings that confirmed already-closed work or positive properties
needing no new entry: liquidity discovery's real pagination/filtering
mechanism (already implemented, only the `examples/simple-wallet`
README and its own hardcoded low-price workaround are stale —
a documentation-maintenance item, not a Backlog delta); the fund-moving
restart/resume safety property (already substantially closed by this
session's own #56/#58/#59 remediation chain, confirmed not
re-litigated); `WalletAdapter` optionality and `custodyModel`
disclosure themselves (both already real, cited above as precedents,
not gaps); `IntentFacade.negotiate()`'s intentional, correctly-disclosed
non-implementation (`docs/BACKLOG.md`'s existing SDK Core entry already
covers this). The stranger-integration-test and independent-partner-
evidence findings map directly to the Production Readiness Consolidated
Gate's own "independent integration evidence" category (registered
above) — `docs/PARTNER_BETA_INTEGRATION_REALITY.md` itself is the
evidence trail for that category, not a reason for a fifth delta.

Classification: **BACKLOG DELTA DETECTED AND SYNCED** — four new
deltas, none duplicating an existing entry, none escalated into a new
Issue (per the mission's own rule that a Backlog entry is sufficient
while no execution mission is authorized). No new Norte macrofront.
Norte remains 38.

---

## Day-0 Multi-Operator Sails Network / Node Independence (2026-09-08)

**Type:** Architecture + Production Readiness + Network Distribution +
Economic Infrastructure. **This is a launch requirement, not a Months
10-12 aspiration.** No architecture selected, no federation/P2P
mechanism chosen, no implementation authorized by this entry — an
architecture-discovery obligation, elevated to Day-0 priority by
explicit CTO addendum on the "Shared economic network topology" finding
already registered above (`docs/PARTNER_BETA_INTEGRATION_REALITY.md`
§4, this file's own delta 1 in the section above). Tracked for
traceability, given the Day-0 elevation, as
[Issue #95](https://github.com/alan-schramm/Sails-Protocol/issues/95)
("[Architecture Discovery] Day-0 Multi-Operator Sails Network & Shared
Market") — this Backlog entry is the full registration; the issue
cross-links back here rather than duplicating content.

### Central property

> Satsails may operate the first/default Sails Node, but no Sails
> participant or integrator must depend architecturally on Satsails
> operating the unique coordination node.

Preserved, verbatim:

- **Sails Protocol ≠ Satsails server.**
- **Sails Protocol ≠ Sails Node (added 2026-09-09, Day-0 Multi-Node +
  Partner Beta Reality reconciliation).** A Sails Node/runtime is an
  *operational implementation* of the protocol, not the protocol
  itself — the same relationship this file's own "TypeScript is first,
  not authoritative" distinction (Issue #75 reconciliation, above)
  already establishes for *language* implementations, now stated
  explicitly for *operational* ones too. Satsails may operate a first
  node/reference runtime without becoming the network's normative
  authority.
- **Node choice must not define market membership.** Explicit failure
  mode this forbids, named concretely: `Node A → 100 offers, Node B →
  14 offers, Node C → 3 offers, with no cross-node discovery` — this
  produces three isolated marketplaces, not one Sails economic
  network, regardless of how healthy each individual node looks in
  isolation.
- **Choosing a Sails Node must not, by itself, confine a participant to
  an economically isolated marketplace.**
- **Changing node must not inherently change participant economic
  identity, reputation or historical rights.**
- **Running a node must not grant authority over settlement truth,
  participant funds, or protocol semantics.**

### Day-0 operational target

At launch, the architecture must support the intended model:

```
Sails Node A — Satsails
Sails Node B — partner wallet
Sails Node C — liquidity/service provider
        ↓
shared Sails economic network
```

**Corrected 2026-09-08 (Day-0 Network Property Correction) — the
original wording below read as a future aspiration; it is a Day-0
launch requirement, restated explicitly:**

> At launch, an integrator must be able either to use an existing
> conformant Sails Node or operate an independent conformant Sails
> Node without becoming economically isolated merely because of that
> node choice.

**This is a launch requirement, not a Months 10-12 aspiration** —
restated here verbatim from this entry's own opening classification,
because the property immediately above it is the one place that
distinction most needs to be unambiguous. No federation/P2P mechanism
is selected here — property first, mechanism second (§10).

### Shared Market Universe (strengthened 2026-09-08)

> **Node choice must not partition the economic market.**

> All conformant Sails Nodes must be able to participate in the same
> protocol-level liquidity universe. Node choice alone must not isolate
> offers, counterparties, or market access.

**Consistency qualifier — not promising impossible strong
consistency:**

> Shared liquidity does not require byte-for-byte instantaneous global
> state. Different nodes may observe bounded propagation delay,
> explicit provider/user filters, availability differences, or policy
> constraints. Those differences must not arise merely because
> operators run independent Sails Nodes.

Distinctions preserved, verbatim:

- **Shared Market Universe ≠ Instantaneous Identical View.**
- **Eventual propagation ≠ Economic fragmentation.**

**Reinforced framing (2026-09-09, Day-0 Multi-Node + Partner Beta
Reality reconciliation) — same property, articulated a second way for
institutional clarity, not a second obligation:**

> Liquidity should be network-level; node operation should be
> service-level.

> Shared economic discoverability ≠ identical full database
> replication.

> An economically eligible participant should be able to discover
> relevant network liquidity regardless of which conformant Sails
> Node/runtime it connects through, subject to legitimate privacy,
> policy, capability, market, and filtering constraints.

No mechanism is chosen by this reinforcement — `ADR-001` (below)
already made the Day-0 mechanism decision (signed-offer gossip); this
paragraph exists only to make the underlying property legible
independent of that decision, for any future re-evaluation.

### Properties requiring evidence before any production claim

Registered as investigation targets, **none of them claimed as
demonstrated by this registration**: cross-node offer discovery;
cross-node trade coordination; node discovery/bootstrap; node
capability advertisement; identity portability; reputation portability;
evidence/history portability or re-verifiability; protocol-version
compatibility; node failover; node migration; malicious-node
containment; spam/Sybil implications; node availability assumptions; no
single-node semantic authority; no single-node settlement authority; no
mandatory Satsails-operated infrastructure; economic attribution for
node participation.

### Node economics — Day-0-capable, nothing frozen (corrected 2026-09-08)

The repository already contains the real, shipped chain this direction
builds on: `FeeCollectionEvidence` (kind: `CONFIRMED`) →
`FeeObligation` → `DistributionPolicyVersion` →
`EntitlementLedgerEntry` (verified directly, `prisma/schema.prisma`).
It also already contains real prior art on node-operator incentives:
`docs/PROTOCOL_ECONOMY.md` §4.2 ("Node Operators — Bootstrap nodes,
Reputation nodes, future relay nodes") names a phased *rollout*
narrative (voluntary bootstrap nodes today; a fee-funded "Node Operator
Pool" for reputation nodes at Months 7-9; relay/routing-node payment at
Months 10-12) — that rollout narrative is preserved, but §4.2 itself
now carries a dated current-truth correction (2026-09-08): **node
economic *capability* is a Day-0 property, per the CTO/Product Owner
decision this entry registers**, not something architecturally gated
until Months 7-9.

> Node economic participation must be Day-0-capable. Exact
> percentages, attribution formula, and incentive weights remain
> policy-versioned and must earn separate evidence.

> A node does not earn fees merely by existing or registering. Economic
> entitlement must follow confirmed contribution to an economic outcome
> under the applicable frozen `DistributionPolicyVersion`.

**Not frozen by this entry:** any percentage; a 50% node share; an
exact attribution formula; a proof-of-relay/proof-of-coordination
mechanism; fee-routing implementation. **Mostro's 50% is reference
evidence only, not Sails policy — not adopted.**

### Fragmentation property (explicit architectural failure case, strengthened 2026-09-08)

Registered as a failure case to design against, not solved here:

```
Node A → isolated liquidity A
Node B → isolated liquidity B
Node C → isolated liquidity C
```

**= FAIL, even if all three implement the identical, fully conformant
API.** Conformance to the same interface is not the property being
tested — economic reachability across nodes is. This is functionally
the same isolated-island outcome `docs/PARTNER_BETA_INTEGRATION_REALITY.md`
§4 already found for the current (single-operator) reality, generalized
to the N-operator case.

> Independent node operation should not inherently fragment shared
> economic discovery into isolated marketplaces.

> Three conformant APIs serving three isolated marketplaces do not
> constitute one Sails economic network.

If closing this requires an additional mechanism beyond what any single
node already does, that mechanism is itself a discovery target for a
future mission — not designed or selected here.

### Anti-fragmentation incentive (economic/architectural principle, added 2026-09-08)

> A Sails Node should compete on service quality, not by capturing
> users into isolated liquidity.

**Restated 2026-09-09:** node operators should compete on service
quality and economic contribution, not on artificial liquidity
enclosure.

Possible competition dimensions, named only as rationale for why this
principle is plausible, **not scored, weighted, or ranked here**:
uptime, latency, fee, privacy, operational quality, support,
routing/service quality, jurisdictional posture, additional services,
integrations, reputation. **No scoring mechanism is authorized or
implied by naming these** — this is a design-north-star statement, not
a specification. No node marketplace is created by this entry.

### Node authority (reaffirmed 2026-09-08)

Preserved, verbatim, and extended with one further distinction the
node-economics direction above makes newly relevant:

> Operating a Sails Node does not grant authority over protocol
> semantics, participant funds, settlement truth, or participant
> identity.

> Liquidity propagation authority ≠ Settlement authority ≠ Protocol
> authority.

A node that helps discovery/coordination reach more counterparties
(liquidity propagation) gains no claim over what a trade's outcome
*means* (settlement authority) or over the protocol's own rules
(protocol authority) merely by having propagated it — these remain
three separate authorities today, and this entry does not blur them
even while registering that a node may earn economic entitlement for
the first one.

### Node selection UX (new, 2026-09-09)

**Property:** infrastructure choice may be visible to advanced users/
operators without becoming mandatory cognitive load for ordinary users.
Target UX for an ordinary user: `Open wallet → Buy/Sell → works` — node
selection never enters that path. An integrator may internally reason
about `primary node / fallback node / own node / partner node`, the
same way other P2P protocols already let advanced users pick a relay/
node/server — **this does not imply a failover protocol is designed or
implemented by naming the possibility.** No node-selection UI, no
failover mechanism, authorized by this entry.

### Production bootstrap model — concrete questions added to the Production Readiness Consolidated Gate (2026-09-09)

The Gate's existing "bootstrap/discovery" category (registered above)
gains a concrete question checklist a future Partner Beta pass must
actually answer — **not answered by assumption here**:

Where does the SDK connect by default? Who operates the initial
node(s)? Can a wallet run its own node? Can a web service run its own
node? How does a new node enter the network? How does it discover
other participants/liquidity? Is any operator *required* for
bootstrap? What happens if the default node goes offline? Does node
selection affect economic membership? Which data is local vs.
network-visible? Which data must never be globally propagated for
privacy reasons (see Privacy, below)?

### Privacy — granular data-category separation (strengthened 2026-09-09)

**Preserved, verbatim:** `Shared market ≠ shared private state` /
`Shared economic discoverability ≠ global identity/profile
replication`. A future design must separate, at minimum: public market
data; selective participant information; private negotiation data;
identity bindings; reputation evidence; payment details; proof/
evidence; settlement secrets. **No schema designed here** — this is a
category list a future mechanism must respect, not a data model.

### Security / Sybil / abuse — registered as an open question, not solved (cross-linked, 2026-09-09)

Already named in `ADR-001-day0-multi-operator-network.md` §7/§14
(Sybil resistance explicitly not promised; a threat inventory covering
spam offers, fake liquidity, duplicate offers, poisoning, censorship,
selective forwarding, stale offers, and fabricated node metadata) —
restated here for Master Backlog visibility rather than duplicated:
**how to bound these abuses without introducing a central membership
authority remains an open architectural/economic question.** Not
solved by staking, trusted lists, proof-of-work, bonds, or assumed
reputation — none of those is adopted here or in `ADR-001`.

### Conformance connection (new, 2026-09-09)

Cross-linking, not merging, the separately-registered **Independent
Implementation Conformance** obligation (above, this file) with this
Day-0 Multi-Node obligation:

> Multiple independent nodes only form one protocol network if they
> interpret shared economic objects compatibly.

> Network reachability without semantic conformance does not establish
> one economic network.

A gossip/propagation mechanism (`ADR-001`) can make a signed `Offer`
*reach* every conformant node; it says nothing about whether every
node's own implementation *agrees* on what that Offer's terms mean
economically — that is exactly Independent Implementation
Conformance's own scope, not re-registered here.

### Partner Beta Readiness — named as a bounded sub-gate of Production Readiness (new, 2026-09-09)

**Not a score. Not "N/8 = production."** Beta readiness ≠ full
production readiness — this sub-gate exists precisely to prevent that
conflation. Likely properties (cross-linking existing registrations,
not re-describing them): an independent developer can integrate
(`docs/PARTNER_BETA_INTEGRATION_REALITY.md` §10, `ADR-001` §19);
bootstrap path documented (this entry, above); supported node model
understood (this entry, above); relevant liquidity discoverable
(`docs/PARTNER_BETA_INTEGRATION_REALITY.md` §5, already shipped —
example doc still stale); correct rail/capability visibility
(`docs/PARTNER_BETA_INTEGRATION_REALITY.md` §8); user journey can
resume after normal interruptions (`docs/PARTNER_BETA_INTEGRATION_REALITY.md`
§9, `ADR-001` §9); at least one real independent partner path
exercised (`docs/PARTNER_BETA_INTEGRATION_REALITY.md` §11, `ADR-001`
§20); claims strictly beta-bounded; no unsupported production-provider
claim. **No new registration of any individual property here** — this
sub-gate's only new content is naming it as a distinct, bounded
checkpoint rather than leaving "beta" and "production" readiness
conflated inside one undifferentiated Gate.

**No-assistance developer test — classification taxonomy added
(2026-09-09).** Extending the already-registered Stranger Developer
Test (`docs/PARTNER_BETA_INTEGRATION_REALITY.md` §10, `ADR-001` §19):
every clarification a test subject needs from the team must itself be
classified as one of — documentation defect; SDK DX defect; missing
capability; hidden operational dependency; architectural ambiguity.
**This test is evidence of independent integrability, not proof of
protocol correctness** — the two are explicitly not conflated.

### Existing architecture overlap — checked before registering, not assumed new

- **OpenP2P / OpenLiquidity:** `Offer`/`Trade` are per-node Postgres
  rows today (confirmed throughout
  `docs/PARTNER_BETA_INTEGRATION_REALITY.md`) — no cross-node query
  path exists. Directly relevant, not yet solved by either module.
- **Pears/transport:** already genuinely serverless at the connection
  layer (HyperDHT/Hyperswarm peer discovery needs no central server) —
  the gap is entirely at the *application* layer (offers/trades/
  identity), which has no cross-node protocol today, confirmed
  `docs/PARTNER_BETA_INTEGRATION_REALITY.md` §4. Pears itself is not
  the blocker.
- **OpenIdentity:** `User.publicKey` is portable in principle (it's
  just a keypair a participant controls), but nothing today associates
  one identity across two independently-deployed nodes' separate
  databases — same gap `docs/IDENTITY_ARCHITECTURE_DISCOVERY.md`
  already investigates for cross-*protocol* identity, now shown to
  apply equally to cross-*node* identity within the same protocol.
  Cross-linked, not duplicated.
- **OpenReputation:** `User.reputationScore` is a per-node running
  total (confirmed, `prisma/schema.prisma`) — reputation earned on Node
  A has no defined meaning or portability to Node B today. Directly
  relevant, unresolved.
- **Durable Protocol Truth** (`docs/DURABLE_PROTOCOL_TRUTH_EVIDENCE.md`):
  establishes what "true" means *within* one node's own event/escrow
  history — does not yet address what happens when two nodes' separate
  histories need to be reconciled or cross-verified. A real, adjacent
  precedent for evidence/history re-verifiability across nodes, not a
  solution to it.
- **Recovery/Reconciliation:** this session's own #56/#58/#59
  remediation closed *intra-node* fund-moving safety — genuinely
  unrelated to *inter-node* failover/migration, which remains fully
  open.
- **Production Readiness Consolidated Gate:** updated above with the
  seven new categories this obligation requires.
- **Issue #75** (multi-implementation/platform horizon): adjacent
  (different implementations of the *same* node), not the same as
  multiple *independently-operated* nodes of any implementation.
  Genuinely distinct, kept distinct.
- **Issue #77** (Final Red Team Horizon): its own "Sails semantic
  divergence" case (cross-*implementation* agreement) is a narrower,
  different question than cross-*node* economic fragmentation —
  related in spirit, not duplicated.
- **Issue #78** (Sandbox/Playground): a future consumer of this
  obligation's eventual solution (a sandbox could exercise multi-node
  behavior once it exists), not a substitute for registering it.
- **Protocol economics:** covered above — `docs/PROTOCOL_ECONOMY.md`
  §4.2's existing phasing preserved untouched.

**Genuinely new obligations, not covered by any of the above before
this entry:** the central property itself (node choice must not
determine market membership); the Day-0 operational target diagram;
the fragmentation-property naming; and the explicit list of 16
evidence-required properties, none previously enumerated together
anywhere in this repository.

### Claim boundary — explicitly NOT claimed by this registration

Federation exists; multiple Sails nodes interoperate today; shared
liquidity across nodes is demonstrated; node failover exists;
partner-operated nodes work; decentralized operation is implemented.
**All of the above are evidence obligations, not current facts.**

### Norte placement

No new macrofront — this composes existing fronts (7. OpenP2P, 9.
OpenIdentity, 10. OpenReputation, 11. OpenLiquidity, 13. Transport/
Interoperability, 6. Economics/Fees, 27. Security) the same way the
Production Readiness Consolidated Gate itself does. Norte remains 38.

Classification: **BACKLOG DELTA DETECTED AND SYNCED** — a real,
previously-unregistered Day-0 obligation, distinguished explicitly from
every adjacent existing entry above rather than merged into any of
them.

**Reconciliation pass, 2026-09-09 (Day-0 Multi-Node + Partner Beta
Reality).** Added, within this same entry: the "Sails Protocol ≠ Sails
Node" distinction, the concrete three-node isolated-liquidity failure
example, the network-level/service-level reinforcement, expanded
competition dimensions, Node Selection UX, the concrete bootstrap
question checklist (feeding the Production Readiness Gate's existing
"bootstrap/discovery" category), a granular privacy data-category
list, the Sybil/abuse open-question cross-link, the Conformance
Connection, the Partner Beta Readiness sub-gate, and the no-assistance
developer test's classification taxonomy. **Confirmed before writing,
not assumed:** liquidity-discovery scaling (`docs/TODO.md` §25,
`examples/simple-wallet`'s own stale finding), professional-provider
flow, capability/rail discovery, restart/offline/resume, the
independent-developer test, and independent partner-wallet evidence
were **all already materially represented** in
`docs/PARTNER_BETA_INTEGRATION_REALITY.md` and its own Backlog deltas
(above) and in `ADR-001` — cross-linked here, not duplicated as new
entries. No mechanism chosen or implemented by this pass — property
first, mechanism second, unchanged.

---

## ADR-001 Day-0 Multi-Operator Sails Network — decision registered (2026-09-09)

**Source:** `docs/adr/ADR-001-day0-multi-operator-network.md`. Freezes
the smallest correct architecture (signed-offer, pairwise-gossip over
Hyperswarm/HyperDHT — Model C, not D/A/B — see the ADR's own
Alternatives section for why each other model lost) satisfying the
Day-0 Multi-Operator obligation registered above. **No implementation
authorized by the ADR itself** — this entry registers the ADR's own
executable consequences as concrete Backlog deltas, superseding the
prior entry's abstract "investigation targets" framing with a real
implementation sequence.

**Not forced to BACKLOG DELTA: ZERO**, per the mission's own explicit
instruction. **Count correction (2026-09-09, CTO Gate) — stated
explicitly, not left for the reader to add up:** the original ADR-001
registration pass below (items 1-2) registered **2** distinct
obligations; the subsequent CTO correction/reconciliation pass (items
3-4) added **2 further** distinct obligations. **Total distinct
obligations carried by this ADR entry: 4.** No history erased — all
four are preserved below in the order they were registered:

1. **Settlement-release signature requirement (ADR-001 §11).** Ordinary
   (non-disputed) escrow release/refund authorizations do not carry a
   participant-signed attestation today — only `DisputeOutcome` does
   (`attributionRawProof`). Extending the same, already-proven Ed25519
   signature pattern to ordinary releases is a genuinely new obligation,
   not previously named anywhere in this file, `docs/TODO.md`, or any
   Issue. No new primitive — reuses the exact existing signature/
   verification mechanism.
2. **The Implementation Sequence itself (ADR-001 §21, updated
   2026-09-09 three times — first to insert two new Day-0
   identity/binding items, then to insert two new Day-0 economics
   items, then to insert (d) Operational Sails Node Identity and
   renumber everything after it, CTO decision, PR #108
   final-precision pass, reconciled with PR #106's own independent
   A/B/C/D taxonomy on merge)** — (a) portable signed Offers, (b)
   persistent Participant Transport Identity (corrected naming,
   2026-09-09 — not Operational Sails Node Identity), (c) Economic
   Identity ↔ Transport Identity Binding, **(d) Operational Sails Node
   Identity** — ~~Sails Node Operator Identity~~, renamed 2026-09-09
   per the C≠D separation in item 5 below and
   `docs/DAY0_COMPLETENESS_COLD_SWEEP.md` §3.5 — (e) propagation/
   bootstrap, (f) multi-node discovery/convergence, (g) cross-node
   trade coordination, (h) pagination/discovery-scaling wiring, (i)
   professional-provider inventory locking, (j) cross-node
   restart/resume, (k) Node Contribution Accounting, (l) Incentive
   Compatibility / No-Cannibalization Evidence, (m) stranger-node test,
   (n) stranger-developer test, (o) first independent partner-wallet
   beta — registered as the concrete, ordered obligation that
   supersedes this file's own prior "16 evidence-required properties"
   framing (still accurate as *scope*, now given an actual build
   order). Explicitly **not** authorized for implementation by the ADR
   or this entry — requires its own separate CTO Gate before any step
   begins. **Critical dependency, explicit:** (e) propagation/bootstrap
   must not be implemented before (d) has its own CTO-approved design
   and evidence. **Actual payout execution is separate from and later
   than this sequence** — gated by the Production Readiness
   Consolidated Gate, may remain disabled through the entire beta;
   (k)/(l) make
   contribution accounting and entitlement recognition testable, they
   do not activate payment.

**Updated 2026-09-09 (CTO Gate correction + PR #98 reconciliation) —
two further genuinely new obligations**, neither previously
represented anywhere in this repository:

3. **Economic Identity ↔ Transport Identity Binding (ADR-001 §7.1).**
   Correction: the ADR originally overclaimed Pears connections are
   "already keyed by participant public key" — confirmed false against
   this session's own prior work (`docs/IDENTITY_ARCHITECTURE_DISCOVERY.md`
   §2/§3.3: `User.publicKey` and Pears' `peerId` are today
   cryptographically unrelated and `peerId` isn't even session-stable).
   Registered: `"A participant must be able to prove an authorized
   binding between its economic identity and the transport identity
   used to establish direct trade communication."` Final binding format
   explicitly not chosen (a real cryptographic design decision);
   explicitly forbidden: reusing `User.publicKey` directly as the Pears
   transport key.
4. **Persistent Participant Transport Identity (ADR-001 §7/§7.1),
   renamed from "Persistent Node Identity" 2026-09-09 (CTO Gate B
   correction on PR #108, ADR-001 §7.2).** `"A Sails Node participating
   in network discovery must have a stable operational identity across
   ordinary restarts."` Today's participant-scoped transport identity
   (HyperDHT's ephemeral, per-session `peerId`, tied 1:1 to a `User`
   row via `PearNode.start()`'s own `prisma.user.update({..., data:
   {peerId}})`) is classified as a **current implementation gap against
   the accepted Day-0 architecture**, not a future nicety — a
   participant's own direct-connection relationships (trade
   communication, reconnection) need it to survive ordinary restarts.
   **Corrected, 2026-09-09 (final-precision pass):** this obligation is
   **not** the same property as "the ADR's own gossip model (§4)
   depends on stable peer relationships surviving restarts" — §4's
   gossip-relay peer network is operator-to-operator (item 5, §21(d)),
   not participant-to-participant; conflating them here was itself an
   error, now removed. **Closed by PR #108** (`participant-transport-identity.ts`)
   — narrowly: this closes ONLY the participant-scoped, direct-connection
   gap. It does **not** close item 5 below, and it does **not** make any
   gossip-relay peer relationship stable (no operator-level identity for
   gossip to attach to exists yet). **Narrow claim (2026-09-09,
   final-precision pass):** "Local participant transport identity
   persistence across ordinary restarts on the same persisted storage."
   **Explicitly does not close**: cross-node portability; node
   migration; recovery; rotation; node gossip identity; participant
   continuity after changing operator (see the new node-switch-continuity
   entry below).

5. **Operational Sails Node Identity — new, 2026-09-09 (CTO Gate B
   correction on PR #108, ADR-001 §7.2).** ~~Sails Node Operator
   Identity~~, renamed 2026-09-09 (PR #108 ↔ PR #106 merge) to match the
   C≠D separation below. A cryptographic identity for the
   operator/deployment itself, independent of any single hosted
   participant, required by §4's gossip-relay peer model ("each node
   maintains connections to a bounded set of known peer nodes") and
   §16's node economics ("a node was genuinely used by a real
   participant to reach a real, confirmed trade" — compensating the
   infrastructure that served the trade, distinct from the participant
   who traded). **Confirmed, by direct code and `prisma/schema.prisma`
   search, not to exist anywhere in this codebase today** — no model, no
   keypair; the only "node operator" references are
   `nodeOperatorShare`/`nodeOperatorPct` payout-percentage fields inside
   distribution-policy models, not an identity. **Not solved or designed
   in this pass** — no gossip, node-registry protocol, or federation
   mechanism is proposed. Item 4 above (Participant Transport Identity)
   does **not** close this — they are structurally distinct, confirmed
   by the fact that a single operator can host many participants (one
   `PearNode` per `ownerUserId`), so no per-participant identity can
   stand in for an operator-level one. **Sequenced (2026-09-09, CTO
   decision, final-precision correction pass on PR #108): ADR-001
   §21(d)**, inserted immediately after (c) Economic Identity ↔
   Transport Identity Binding and before (e) Propagation/bootstrap — an
   ordered Day-0 prerequisite, not merely "sometime before
   gossip/economics." Propagation/bootstrap (e) must not be implemented
   before this step has its own CTO-approved design and evidence.
   **Duplicate check (2026-09-09, PR #108 ↔ PR #106 merge):** this is
   the *same* obligation as the "Day-0 Completeness Cold Sweep" section
   below's own item 5, "Node identity lifecycle + operator-recipient
   separation" — both independently found the identical gap from
   different missions. Not double-counted: that entry carries the fuller
   A/B/C/D taxonomy (including the C≠D cardinality correction) and is
   treated as the canonical registration; this entry is kept for its
   §21(d) sequencing detail and cross-referenced, not re-counted in any
   total.

**Node-switch continuity — investigated, reconciled, not a sixth
obligation (2026-09-09, CTO Gate B final-precision pass, ADR-001 §7.3).**
Question investigated: if the same participant moves from Sails Node A
to Sails Node B, what happens to its Participant Transport Identity
today? Demonstrated against the real implementation
(`tests/participantTransportIdentity.test.ts` test 8): two different
nodes' local storage produce two different seeds/`peerId`s for the
identical participant — `Node A local storage → seed A → peerId A`,
`Node B empty local storage → seed B → peerId B`, confirmed unequal.
Property named, not solved: `"Changing Sails Node must not silently
destroy participant identity continuity."` Two model families evaluated
without choosing (Model P1 — portable, participant-controlled
re-derivation; Model P2 — rotatable, re-bound via §21(c)'s own
mechanism). **Classification: this decomposes into two already-registered
obligations, not a new one.** Model P1 is a refinement of the existing
Identity Root & Multi-Protocol Identity UX obligation (PR #91,
`docs/IDENTITY_ARCHITECTURE_DISCOVERY.md`, which already surveys Pears
as one of its seven protocol rows). Model P2 is a refinement of item 3
above (§21(c) binding). **Total remains 5 — no sixth obligation
registered.**

**Updated again, 2026-09-09 (CTO Gate, Fase 2-5/9) — Node Contribution
Accounting and Incentive Compatibility, classified before registering:**
both are **new content inside the already-counted Implementation
Sequence obligation (item 2, sequence items (j)/(k) at the time of this
entry, renumbered to (k)/(l) 2026-09-09 by the later (d) Sails Node
Operator Identity insertion)**, deliberately
**not** registered as separate fifth/sixth top-level obligations — they
are sub-obligations of the same "build this ordered sequence" item
already counted above, and double-counting them would contradict this
entry's own corrected "4 distinct obligations" framing. **Checked
against `docs/PROTOCOL_ECONOMY.md` §4.2 — no duplication:** that
section's Node Operator Pool / Lightning-style routing fee are the
future *rollout/payout* layer (Months 7-9/10-12 timing, itself already
corrected to be Day-0-*capability*-compatible, not accelerated); Node
Contribution Accounting and Incentive Compatibility are the
Day-0-*capability* layer underneath — recording and testing that a
contribution happened and would be entitled under some policy, with
zero real value moving. Distinct obligations, not the same one named
twice.

**Reconciled against PR #98's (`docs/SAILS_NODE_SHARED_LIQUIDITY_DISCOVERY.md`)
own 9 backlog-delta candidates, checked before registering, per its own
explicit isolation instruction not to duplicate:** professional-provider
flow, liquidity-discovery scaling, Partner Beta Readiness, privacy
minimization, Sybil resistance, and node economics are **all already
represented** in this file's own Partner Beta and Day-0 entries above —
**not re-registered here.** PR #98's remaining three candidates
(signed Offer envelope, jointly-signed trade-open handshake, signed
ordinary-release authorization) were **already registered** by this
same ADR-001 entry (items 1/2 above) before PR #98 was even opened —
confirmed, not assumed, by direct comparison. **Only the
`reputation@NodeA`/`NodeB` demonstrated-identity-split candidate and
the two items above (3/4) were genuinely new** — the identity-split
fact is not separately re-registered as its own delta, since it is
exactly what item 3's binding requirement exists to eventually close;
registering both would be the same obligation counted twice.

**Explicitly deferred past Day-0 beta, named not dropped** (ADR-001
§21's own residual list): partial fill; outbound webhook delivery; any
node-economic payment activation (§16 of the ADR activates none — the
architecture is Day-0-*capable*, per `docs/PROTOCOL_ECONOMY.md` §4.2's
own correction, without any payment being *activated* here); a formal
Sybil-resistance mechanism; Model D/hybrid propagation.

**Not registered as new deltas** — already covered by existing
representation: the professional-provider quote-expiry/min-max gaps
(already registered, this file's own Partner Beta entry — the ADR's §3
`OfferEnvelope` design closes quote expiry as part of (a) above, not a
separate obligation); the liquidity-discovery pagination mechanism
(already real and shipped, only the stale example doc needed fixing,
already registered); capability/rail discovery (already registered,
the ADR's §15 only narrows the *shape* of the future surface —
capability-specific, not universal — without creating a new
obligation).

Classification: **BACKLOG DELTA DETECTED AND SYNCED** — two genuinely
new obligations (settlement-release signatures; the ordered
implementation sequence), everything else confirmed already covered.

**Updated again, 2026-09-09 (CTO Gate B correction on PR #108) — one
further genuinely new obligation: item 5, Sails Node Operator Identity**
(see above). PR #108 itself was initially returned to CTO claiming
"BACKLOG DELTA: ZERO" for closing item 4 — that claim is **corrected,
not retracted for item 4 itself**: item 4, now precisely renamed
Persistent *Participant* Transport Identity, genuinely is closed by PR
#108 with zero delta of its own. The zero-delta claim was wrong only in
implicitly assuming item 4 was the *entire* content of ADR-001 §7; §7.2
found it was not. **Total: 5** distinct obligations under this ADR
entry, not 4.
No new Norte macrofront. Norte remains 38.



---

## Day-0 Completeness Cold Sweep — network continuity beyond the happy path (2026-09-09)

**Source:** `docs/DAY0_COMPLETENESS_COLD_SWEEP.md`.

**Type:** Day-0 architecture completeness + Partner Beta/Production Reality.
**Status:** obligations registered, implementation not authorized by this entry.
**Norte:** no new macrofront; this composes existing OpenP2P, OpenLiquidity,
Transport/Interoperability, OpenIdentity, Economics, Security, DX and
Production Readiness fronts.

This pass deliberately starts **after** ADR-001's accepted signed-offer
gossip decision and asks whether a network that works on a clean, live
happy path can still fragment or become operationally centralized over
time.

Preserved:

> **Node choice must not define market membership.**

> **Liquidity should be network-level; node operation should be service-level.**

> **Sails Protocol ≠ Sails Node.**

### New completeness obligations

1. **Gossip catch-up / anti-entropy / partition healing — Day-0.**
   Newly-connected or returning nodes must converge toward current
   active offers and higher revisions/tombstones that were published
   while they were absent. New-event flood-gossip alone is insufficient
   evidence for late join or partition healing.

2. **Stale-resurrection-safe revision retention — Day-0.**
   Garbage collection must never allow an older signed `ACTIVE`
   revision to become valid again after a higher revision/cancellation
   was accepted. Nodes may compact state but must retain enough monotonic
   knowledge to reject stale resurrection.

3. **Self-authenticating Node Descriptor / operator advertisement —
   Day-0.** A node must be able to disclose, without a central registry
   becoming authority: stable node identity; reachable transport/
   endpoint information; supported protocol/wire version range;
   relevant enabled capabilities; settlement rails plus disclosed
   maturity/custody labels; applicable fee/policy information; descriptor
   freshness/expiry; descriptor authenticity. Optional human metadata
   never becomes protocol authority.

4. **Protocol/wire compatibility negotiation — Day-0.**
   Live nodes must determine whether they can safely exchange economic
   objects before doing so, and fail clearly on incompatible semantics.
   **Wire-version compatibility ≠ Independent Implementation
   Conformance**; both are required and remain distinct.

5. **Node identity lifecycle + operator-recipient separation —
   Day-0/Production.** Preserve, precisely, four protocol/semantic
   cardinalities, not their current TypeScript/database identifiers
   (**corrected, 2026-09-09, CTO Gate, final institutional precision
   pass** — full taxonomy, implementation-neutral:
   `docs/DAY0_COMPLETENESS_COLD_SWEEP.md` §3.5): **A. Participant
   Economic Identity** (protocol concept; today represented by
   `User.publicKey` — a reference-implementation fact, not a protocol
   format) ≠ **B. Participant Transport Identity** (protocol concept;
   today represented by a per-participant `peerId` associated locally
   through `ownerUserId` over Pears/HyperDHT — none of `peerId`,
   `ownerUserId`, or Pears/HyperDHT is a mandatory protocol format; this
   is what "persistent node identity" elsewhere in this repository
   actually refers to; not C) ≠ **C. Operational Sails Node Identity**
   (the operator/deployment's own running-node identity, used for
   gossip trust and a future Node Descriptor; no reference
   implementation exists today) ≠ **D. Operator Economic Recipient**
   (entitled to Node Contribution Accounting; no reference
   implementation exists today). **C does not determine D**: one
   operator may run several C instances, but node cardinality does not
   by itself fix how many economic recipients (D) that operator has —
   that is a policy choice, not a fact derivable from C; C may rotate or
   be rebuilt without automatically redefining D's entitlement, and D's
   own policy must not grant C's operational authority. **C and D must
   not be assumed to use the same key; no recipient model, no C↔D
   mapping, and no new operator-identity primitive, is authorized by
   this registration.** Once C exists, its own lifecycle (backup/
   recovery, compromise/rotation/replacement, superseded-key distrust)
   is required before production.

   **Duplicate check (2026-09-09, PR #108 ↔ PR #106 merge):** this is
   the *same* underlying obligation as the ADR-001 §21 Implementation
   Sequence registration above's own item 5 ("Operational Sails Node
   Identity"), reached independently by a separate mission. This entry
   is the canonical one (fuller A/B/C/D taxonomy); the other carries the
   §21(d) sequencing detail this one doesn't restate. One obligation,
   cross-referenced from both sides, not counted twice in any total.

6. **Eclipse / peer-diversity / selective-forwarding resilience —
   Day-0 evidence obligation.** One malicious bootstrap peer, relay set,
   or operator must not be sufficient to define an otherwise conformant
   node's market view. Evidence must exercise alternate honest paths,
   bootstrap diversity, peer rotation/reconnection, and isolation
   attempts. This is not a claim of perfect censorship resistance.

7. **Gossip resource bounds / abuse containment — Day-0.**
   Valid signatures do not make traffic economically valid. The network
   must bound CPU/memory/storage/bandwidth cost from envelope size,
   ingress rate, duplicate/revision caches, tombstones, malformed
   messages, signature-verification amplification, peer count and
   backpressure without requiring central permission for honest users.
   Formal Sybil resistance remains separately tracked.

8. **Clock / expiry operational correctness — Production Readiness.**
   `expiresAt` depends on local time even though revisions do not.
   Production node operation must define bounded clock-health behavior
   so clock error does not silently create materially different offer
   availability across otherwise conformant nodes.

9. **Node failover / migration without economic amnesia —
   Partner Beta/Production evidence.** Changing the node used by a
   wallet must not inherently erase participant identity, signed trade
   anchors, portable evidence, historical rights, or access to network
   liquidity. Local policy/score may differ; signed economic facts may
   not be redefined.

10. **Independent Node Operator No-Assistance Test — Day-0.**
    A competent third-party operator must be able to deploy, configure,
    join, observe, upgrade, back up, recover and safely stop a conformant
    Sails Node using only public artifacts/documentation. This is the
    node-side counterpart to the existing Stranger Developer Test.

11. **Service-integration durable event consumption — Public
    Production.** Outbound webhooks remain explicitly deferred past the
    first beta and are **not forgotten**. Before public production, a
    backend/service integrator needs a documented recoverable way to
    consume economically relevant state changes without depending on an
    unbounded best-effort WebSocket session. Webhooks, resumable event
    consumption, durable cursors or bounded polling are possible
    mechanisms; none is selected here.

### New adversarial evidence obligations

Add to the Day-0/Production evidence program:

- Late Join Test
- Partition Heal Test
- Tombstone Resurrection Test
- Malicious Selective Forwarding Test
- Eclipse / Bootstrap Diversity Test
- Node Descriptor Authenticity + Staleness Test
- Wire-Version Mismatch Test
- Node-Key Rotation / Compromise Test
- Node Switch / Economic Continuity Test
- Gossip Resource-Exhaustion Test
- Clock-Skew / Offer-Expiry Test
- Independent Node Operator No-Assistance Test

These extend, not replace, ADR-001's stranger-node,
stranger-developer and first independent partner-wallet tests.

### Explicitly checked and NOT duplicated

Already institutionally represented before this pass:
shared-market invariant, signed Offers, persistent **participant
transport identity** (scoped per participant — not Operational Sails
Node Identity, item 5's own precision above), Economic Identity ↔
Transport Identity binding, bootstrap/peer exchange,
cross-node trade handshake, capability/rail discovery, professional
provider flow, restart/resume, node contribution accounting,
no-cannibalization evidence, node selection UX, privacy separation,
Partner Beta Readiness, stranger developer, stranger node, partner
wallet evidence, node economics, Production Readiness, Sybil/spam risk,
protocol-version compatibility as an evidence category, and node
failover/migration as an evidence category.

This pass turns several of those broad categories into falsifiable
Day-0 completeness properties without counting the same obligation
twice.

### Claim boundary

Until these properties are evidenced, a happy-path two-node demo does
**not** demonstrate: durable shared liquidity, late-join convergence,
seamless node switching, practical permissionless node operation,
censorship resistance, or production-grade decentralized operation.

Classification: **BACKLOG DELTA DETECTED AND SYNCED.**

Operational tracker: **Issue #105 — [Day-0] Multi-Operator Network + Partner Beta Completion Gate**.


### Cold Sweep Loop 2 — exact economic binding (2026-09-09)

A second pass over the already-accepted OfferEnvelope + trade-open design
found two further Day-0 precision gaps.

12. **Signed rail/network semantics — Day-0.**
    The portable Offer signature must commit to every field whose value
    can change economic interpretation. `asset` alone is not sufficient
    for Sails' multi-rail direction where one asset family may exist on
    multiple networks. Preserve:
    **Asset identity ≠ Network identity ≠ Settlement-provider identity.**
    The signed canonical representation must include the canonical
    network/rail semantics whenever the asset identifier alone is
    insufficient. Exact vocabulary remains a separate compatibility
    decision; no new universal identifier is invented here.

13. **Trade-open exact revision/terms commitment + replay safety —
    Day-0.** The jointly-signed trade-open anchor must not commit merely
    to `logicalOfferId + tradeId`; it must prove both parties accepted
    one exact economic proposal. Directly or through a canonical
    OfferEnvelope hash, the commitment must bind the accepted revision,
    amount, price/quote, asset, network/rail semantics, required
    payment-method semantics, and the mutually-derived tradeId, with
    replay/idempotency protection sufficient to prevent one acceptance
    from creating multiple logical trades.

    Preserved:
    **Offer Identity ≠ Accepted Offer Revision.**
    **Trade ID ≠ Economic Terms.**

14. **Concurrent acceptance / double-commit evidence — Day-0.**
    Extend the already-registered professional-provider inventory
    reservation obligation to the multi-node case: two buyers racing the
    same single-fill/limited-inventory Offer through different nodes or
    devices must not create more mutually exclusive commitments than the
    owner's signed availability permits. Required evidence includes stale
    revision attempts, duplicate/replayed trade-open handshakes and
    owner-node migration during a race. No global lock service is
    authorized.

These are sub-obligations of the same Day-0 completeness sweep, not new
macrofronts.

**BACKLOG DELTA: DETECTED AND SYNCED.**


### Cold Sweep Loop 3 — real-money agreement + dispute authority (2026-09-09)

A third pass traced a cross-node trade through fiat payment, settlement
selection, fee binding and dispute resolution. Four further Day-0
properties are now explicit:

15. **Exact fiat obligation + payment-destination commitment — Day-0.**
    Before fiat payment becomes binding, both parties must be able to
    verify the exact fiat amount, fiat currency, payment method and
    committed payment-destination identity/reference. Raw PIX/bank
    details must not need to become public gossip merely to be
    verifiable. Any post-commit instruction change requires explicit
    authenticated amendment; chat text alone cannot redefine the
    obligation.

    Preserve:
    **Payment destination commitment ≠ Public payment destination.**
    **Chat Instruction ≠ Economic Authority.**
    **Payment Method ≠ Payment Destination.**

16. **Settlement contract / custody semantics binding — Day-0.**
    The trade/escrow agreement must bind the actual settlement mechanism
    accepted by the parties: selected EscrowType/provider capability,
    network/rail, asset, custody posture, signer/approval requirements,
    relevant finality/confirmation policy and required refund/dispute
    semantics. A node may not silently substitute a different settlement
    mechanism after economic commitment.

    Preserve:
    **Interface uniformity ≠ Security uniformity.**

17. **Fee/policy commitment before economic commitment — Day-0.**
    Every participant-facing fee obligation must be disclosed and frozen
    before commitment, including payer, economic basis and applicable
    policy/version. Policy/node rotation after trade-open must not
    retroactively change the agreed obligation.

    Preserve:
    **Fee discovery ≠ Fee obligation.**
    **Verified contribution ≠ Fee entitlement.**

18. **Cross-node dispute/arbitration authority — Day-0 blocker.**
    Current dispute/arbitration selection is deployment-local. In a
    multi-operator trade, whichever node receives `raiseDispute()` must
    not gain authority to choose the governing arbiter/policy after the
    fact. Arbitration authority, applicable policy and appeal semantics
    must be established by the trade/settlement agreement and be
    independently verifiable by both sides. Evidence/rulings must remain
    usable if one party's node disappears.

    Preserve:
    **Dispute Hosting Node ≠ Arbitration Authority.**
    **Arbitration Policy ≠ Node Local Configuration once a trade is committed.**
    **Ruling Attribution ≠ Funds Authority.**

New evidence cases:
Fiat Amount/Currency Binding; Payment-Destination Substitution;
Post-Commit Payment-Instruction Change; Settlement-Provider
Substitution; Fee-Policy Rotation/Hidden Fee; Cross-Node Arbitration
Policy Mismatch; Dispute Hosting-Node Failover; Appeal-Round Cross-Node
Consistency.

These are sub-obligations of the existing Day-0 Completion Gate / Issue
#105 and must not be split into parallel marketplaces, node-local truth,
or hidden operational conventions.

**BACKLOG DELTA: DETECTED AND SYNCED.**


### Cold Sweep Loop 4 — current public Offer privacy defect (2026-09-09)

19. **Public OfferDetail privacy projection — CURRENT DEFECT / Partner
    Beta blocker.** Registered as `docs/TECHNICAL_DEBT_AUDIT.md #61`.
    The unauthenticated `GET /v1/liquidity/offers/:id` currently
    returns the raw persisted Offer (including `paymentDetails`) plus
    a broad User projection. This violates the already-established
    public-read discipline used elsewhere in the repository.

    Required property:
    **Public Offer View ≠ Raw Offer Row.**
    **Offer Discovery Data ≠ Payment Execution Data.**
    **Payment Destination Commitment ≠ Public Payment Destination.**

    Must close before Partner Beta: purpose-built public projection,
    no raw payment-instruction disclosure, justified participant fields,
    and proof that the actual two trade parties still receive/verify the
    committed payment instruction through the authorized pairwise path.

    Cross-node rule: the ADR-001 OfferEnvelope must continue excluding
    private `paymentDetails`; gossip must never serialize the current
    raw DB row by convenience.

**BACKLOG DELTA: DETECTED AND SYNCED.**


### Cold Sweep Loop 5 — Partner Beta Asset/Rail Scope Gate (2026-09-09)

20. **Partner Beta Asset/Rail Scope Gate — beta-launch obligation.**
    README strategic coverage already names USDT, USDC, BTC, LBTC,
    L-USDT, DePix, Tether Gold and RGB assets as “in view,” correctly
    without claiming support. Current `AssetType` is materially
    narrower and does not contain DePix, USDC or Tether Gold.

    Required property:
    the first partner beta must publish an explicit
    **Asset × Network/Rail × Wallet Adapter × Settlement Capability ×
    Maturity** matrix, and every advertised beta flow must be
    representable end-to-end by the real SDK/schema/provider combination.

    Preserve:
    **Roadmap Asset ≠ SDK-Representable Asset ≠ Settlement-Supported Asset
    ≠ Beta-Enabled Asset.**

    If DePix is promised in the first partner beta, its current absence
    from `AssetType` and the absence of a production-eligible
    Liquid/DePix settlement path are blockers to that scope. If the beta
    is explicitly narrower (for example BTC-only or bounded BTC+USDT),
    DePix does not block the narrower evidence gate.

21. **Canonical quote-currency discoverability — conditional Day-0
    blocker for multi-fiat beta.** Aggregate `LiquidityOffer` exposes
    `priceUsd`; persisted Offer has optional `priceBrl`; Intent has
    optional `currency`. For any beta supporting more than one fiat
    quote denomination, the market pair/currency must be explicit and
    never inferred from node, locale, payment method or geography.

Required evidence:
Beta Asset/Rail Matrix Truth Test; Unsupported Asset Fail-Closed Test;
DePix End-to-End Representability Test if DePix is in beta scope;
Multi-Fiat Quote-Currency Disambiguation Test when multi-fiat is enabled.

Operational tracker remains Issue #105.

**Counting precision (2026-09-09, CTO Gate, final institutional
precision pass):** the sequential numbering used across this entry
(items 1-21) and mirrored into Issue #105 (items 1-41 including the
pre-existing ordered path) is an **operational/sequential item count,
not a canonical count of distinct institutional obligations.** Several
numbered items are evidence cases, sub-properties, or required tests
for the same underlying property rather than independent obligations.
**Issue item count ≠ distinct institutional obligation count.** BACKLOG
DELTA is stated qualitatively above, by named property/category
(anti-entropy, tombstone retention, node descriptor, wire compatibility,
identity lifecycle, eclipse resilience, resource bounds, clock health,
node switch, operator self-service, durable event consumption, exact
economic/fiat/settlement/fee/dispute binding, and the confirmed #61
privacy defect) — no aggregate numeric total is asserted as a canonical
count, since no canonical counting model for "one institutional
obligation" is defined anywhere in this repository.

**BACKLOG DELTA: DETECTED AND SYNCED.**
