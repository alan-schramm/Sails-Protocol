# Policy / Eligibility / Risk Discovery — Evidence Report for CTO Gate

**Mission**: Sails Policy / Eligibility / Risk Discovery (discovery + evidence only — no implementation, no Product/UI work, no architecture redesign, no new policy engine, no RFC acceptance, no Day-0 OpenAgents product commitment).
**Baseline**: `main@10c9cf0b8e2c53d69436c28b96376e1a0807f3de` (PR #168 merged/frozen).
**Branch**: `mission/policy-eligibility-risk-discovery`.
**Status**: Evidence only. No code, test, RFC, ADR, UI, config, capability, or governance mutation. No Product/Architecture/Policy Decision resolved.

---

## 1. Executive Summary

Sails' Policy/Eligibility/Risk domain is real, evidenced, and in several places genuinely well-built — but it is neither centralized nor uniformly enforced, and it contains one significant, previously-undisclosed implementation gap. The clearest finding across every research thread is structural: **the settlement-eligibility pipeline has a confirmed, explicitly-disclosed hole exactly where Policy/Eligibility should sit.** `src/common/execution-candidates.ts`'s own header states outright that permission filtering, availability filtering, maturity/evidence filtering, and risk policy "do not exist as real runtime concepts anywhere in this codebase yet" — and direct tracing confirms `escrow.service.ts` flows straight from structural-compatibility resolution into escrow creation with no intervening eligibility check of any kind. This is not a silent oversight: it was found, named, and correctly renamed once already (the file's outputs used to be called `ELIGIBLE`, now `STRUCTURALLY_COMPATIBLE`), and a second, doc-layer instance of the same conflation (in an earlier draft of `docs/PRODUCT_UI_REALITY_RETURN.md`, claiming structural compatibility meant "sellable now") was independently found and self-corrected in the same document before this mission began.

Three findings rise to genuine, previously-unregistered gaps:

1. **The capability-grant temporal-meaning question — the single most important open question carried forward from Authority Model Discovery — is confirmed genuinely undocumented, not merely under-documented.** Exhaustive search of RFC-005, RFC-013, RFC-014, `PROTOCOL_SPECIFICATION.md` §1.10, the Prisma schema comments, and every relevant test found no statement anywhere of whether a `CapabilityGrant` authorizes initiation-only, an entire operation, a bounded window, or every stage independently. The actual behavior is inconsistent across call sites: the Intent primitive checks capability twice, at two different lifecycle stages; the Escrow/settlement primitive checks it once, at initiate only, never at finalize.
2. **A real, coded risk-tiering mechanism — the payment-account graduated trade-limit ramp (RFC-021 D5) — is fully computed and displayed but never enforced anywhere.** `computeTradeLimit()` implements a genuine chargeback-aware, trade-count-gated limit ladder; it is called only to populate a read-only view field. No code path in trade creation, escrow creation, or settlement compares an actual trade amount against this limit. This is the mission's clearest standalone implementation defect.
3. **`CapabilityDenialReason` is half-dead and inconsistently applied.** Of six frozen reason values, `DISABLED` and `NOT_IMPLEMENTED` are declared but never produced anywhere in `src/`. Of the three real "missing capability grant" denial sites, only one (`checkFundMovementCapability()`) actually attaches `'FORBIDDEN'`; the other two (`intentEngine.create()`, the intent-propose route) throw a bare, unclassified `ForbiddenError`, discarding the same durable fact the third site preserves. The SDK propagates the reason correctly end-to-end; the UI package never reads it at all.

Positively confirmed, not merely assumed: capability/eligibility never creates economic authority anywhere checked (the ordering is structural — role/authority checks run first and unconditionally, capability checks run second and are opt-in); a valid session never implies eligibility for every action; QVAC/agent output creates no eligibility anywhere (confirmed by direct, zero-hit search of `open-agents/`); destination-authority and the appeal/finalize Architecture Decision remain exactly as frozen by the prior Authority mission, untouched here. The domain's richest real eligibility mechanisms — RFC-021's arbiter-eligibility formula (D3) and peer-vouching bar (D7) — are genuinely implemented, tested, and enforced, not merely designed.

No frozen decision is reopened. This mission's findings are additive and cross-domain-routed, not contradictory to any prior mission's conclusions.

---

## 2. Baseline

- Fetched `origin/main`, confirmed at `10c9cf0b8e2c53d69436c28b96376e1a0807f3de` (PR #168's merge commit).
- `docs/AUTHORITY_MODEL_DISCOVERY.md`, `docs/BACKLOG.md` item 45, `docs/PROJECT_CONTEXT.md` §2N all confirmed present.
- Issue #165 confirmed `OPEN`.
- Frozen distinctions from prior missions confirmed still in force and not contradicted by anything found this mission (see §8, Cross-Domain Inputs).
- Sequencing verdict entering this mission: `PROCEED_TO_POLICY_ELIGIBILITY_RISK`, confirmed.
- Tree clean except the unrelated, already-flagged `.claude/worktrees/` directory.
- Branch `mission/policy-eligibility-risk-discovery` created fresh from this baseline.

---

## 3. Sources Inspected

**Code** (read in full or exhaustively grepped): `src/common/execution-candidates.ts`, `src/common/settlement-scope-registry.ts`, `src/common/settlement-provider-registry.ts`, `src/common/errors/index.ts`, `src/common/settlement-cost/execution-cost-policy.ts` (`open-settlement/execution-cost-policy.ts`), `src/common/middleware/redis-rate-limit.ts`, `src/common/security/suspicious-activity.ts`, `src/core/capability-registry.ts`, `src/core/capability-grant-repository.ts`, `src/core/policy-engine.ts`, `src/core/intent-engine.ts`, `src/core/intent.routes.ts`, `src/modules/open-settlement/escrow.service.ts`, `escrow-lifecycle.ts`, `escrow-providers.ts`, `escrow-pending-tx.ts`, `escrow-circuit-breaker.ts`, `capability-profile.ts`, `dispute.service.ts`, `market-arbitration.provider.ts`, `arbitration-provider.ts`, `payment-account.service.ts`, `bounded-rpc.ts`, `multisig.provider.ts`, `lightning-hodl.provider.ts`, `safe-guard-evm.provider.ts`, `wdk-settlement.provider.ts`, `src/modules/open-p2p/trade.service.ts`, `src/modules/open-liquidity/liquidity.service.ts`, `src/modules/open-reputation/vouch.service.ts`, `reputation.service.ts`, `src/modules/open-agents/capability.routes.ts`, `agent.routes.ts`, `wallet-agent.ts`, `src/config/index.ts`, `prisma/schema.prisma`, `packages/sails-sdk/src/errors.ts`, `packages/sails-ui/src/**` (searched for `CapabilityDenialReason` consumption).

**Tests**: `tests/executionCandidates.test.ts`, `tests/capabilityRegistry.test.ts`, `tests/evaluateIntentPolicy.test.ts`, `tests/intentCapabilityCheck.test.ts`, `tests/fundMovementCapabilityCoverage.test.ts`, `tests/vouchService.test.ts`, `tests/marketArbitrationProvider.test.ts`, `tests/routes.test.ts`.

**Docs/RFCs/ADRs**: `docs/ADAPTIVE_EXECUTION_CAPABILITY_ROUTING.md`, `docs/adr/ADR-002-asset-settlement-rail-adapter-provider-architecture.md`, `docs/PRODUCT_UI_REALITY_RETURN.md`, `docs/rfcs/RFC-005-capability-model.md`, `RFC-013-capability-registry-and-wallet-adapter.md`, `RFC-014-capability-registry-enforcement.md`, `RFC-021-market-based-arbitration-and-payment-trust.md`, `RFC-019-settlement-custody-reference-vs-normative.md`, `RFC-016-qvac-crypto-native-agent-boundary.md`, `docs/PROTOCOL_SPECIFICATION.md` §1.10/§1.10.1, `docs/PROTOCOL_INVARIANTS.md` (INV-OP-4, INV-OP-5, INV-12), `docs/PROTOCOL_ECONOMY.md`, `docs/BUSINESS_RULES_DISCOVERY.md` (full BR-* catalogue and its own Policy/Risk/Eligibility column), `docs/STATE_LIFECYCLE_DISCOVERY.md`, `docs/AUTHORITY_MODEL_DISCOVERY.md`, `docs/M8_DISPATCH_GATE_FINDINGS.md`, `docs/TRUST_BOUNDARY.md`, `docs/THREAT_MODEL.md`, `docs/security/SYBIL_MITIGATION.md`, `docs/PROJECT_CONTEXT.md` (SDK use-case reality table, maturity-axis doctrine), `docs/BACKLOG.md` (Production Readiness Consolidated Gate).

---

## 4. Taxonomy

Distinctions preserved throughout, verified against real code where checkable, not assumed:

- **Technical Capability ≠ Protocol Permission ≠ Economic Authority ≠ Settlement Eligibility** — confirmed as a real, frozen ADR-002 §6 ruling (`"Permission Capability ≠ Settlement Capability ≠ Security/Evidence Property ≠ Production Eligibility"`), paraphrased verbatim in `execution-candidates.ts`'s own header.
- **Structural Compatibility ≠ Eligibility** — confirmed live in code (§7).
- **Registration ≠ Availability ≠ Health ≠ Eligibility** — confirmed: each concept has a different (or, for Health, *no*) code-level representation (§9).
- **Eligibility ≠ Authority; Authority ≠ Successful Execution** — confirmed (§5, §8).
- **Capability Grant ≠ Economic Consent** — reconfirmed, not re-derived, from the frozen Authority mission; additionally confirmed complementary-not-redundant against the Authority check in `releaseFunds()` (§7).
- **Recommendation ≠ Permission** — confirmed: QVAC output never reaches an eligibility or permission decision anywhere (§8.3).
- **Default ≠ Protocol Truth** — confirmed as a live, disclosed fact: `enforceCapabilities` defaults `false`, meaning in default configuration the capability layer of fund-movement eligibility does not run at all; this is disclosed (`BR-CAP-01`), not hidden.
- **A new distinction surfaced by this mission, not previously named**: the word "eligible/eligibility" is used in this codebase for at least **three structurally unrelated concepts** — (a) genuine economic/participant eligibility (RFC-021 arbiter/vouch bars), (b) a State/Lifecycle-domain "dispatch eligibility" (durable-record technical readiness, `dispute-dispatch.ts`/`expiry-authority.ts`), (c) a wallet capability-*profile* mismatch (`INELIGIBLE` in `escrow.service.ts`). None of the three is confused with another in code — each has its own call sites and none leaks into another's domain — but no document cross-references all three, so a reader searching "eligibility" in this codebase will find three unrelated stories without a map between them.

---

## 5. Participant Eligibility Matrix

| # | Action | Identity | Role | Authority (crypto/signed) | Capability (`CapabilityGrant`) | Policy/Eligibility | Current-State Gate | Evidence |
|---|---|---|---|---|---|---|---|---|
| 1 | Create Offer | `requireAuth` | None | None | None | None | None | `liquidity.routes.ts:98-106`, `liquidity.service.ts:424-463` |
| 2 | Accept/create Trade | `requireAuth` | None (not the offer owner) | None | None | None | Offer `status==='ACTIVE'`; amount within min/max | `trade.routes.ts:78-91`, `trade.service.ts:96-125` |
| 3 | Lock funds | `requireAuth` | Seller only | None | None | None | `CREATED→FUNDS_LOCKED` only | `escrow.service.ts:443-454`, `escrow-lifecycle.ts:40` |
| 4 | Mark payment sent | `requireAuth` | Buyer only | None | None | Funding-uncertainty gate (MULTISIG-only) | `FUNDS_LOCKED→…` only | `escrow.service.ts:540-555` |
| 5 | Release funds | `requireAuth` | Seller or assigned arbiter | None at this call (arbiter's crypto authority lives upstream, in #10) | Yes, opt-in (`enforceCapabilities`, default `false`) | RFC-015 dual-approval, opt-in, default `false`, disputed path always bypasses | `PAYMENT_PENDING`/`DISPUTED` only | `escrow.service.ts:610-667`, `escrow-lifecycle.ts:106-119,256-270` |
| 6 | Refund funds | `requireAuth` | Seller or assigned arbiter | None | Yes, opt-in | None additional | `CREATED`/`FUNDS_LOCKED`/`DISPUTED`/`EXPIRED` | `escrow.service.ts:756-768` |
| 7 | Split funds | `requireAuth` | Seller or assigned arbiter | None | Yes, opt-in | `buyerBps` strictly 0–10000; provider must support split | `DISPUTED` only | `escrow.service.ts:805-822` |
| 8 | Open dispute | `requireAuth` | Buyer or seller only | None | None | Rate-limited (operational) | Escrow must have a real escrow, transitionable to `DISPUTED`; one dispute per trade | `settlement.routes.ts:469-478`, `dispute.service.ts:90-137` |
| 9 | Submit evidence | `requireAuth` | Buyer or seller only | None | None | None | Dispute `OPENED`/`EVIDENCE_SUBMITTED` | `dispute.service.ts:890-902` |
| 10 | Arbitrate/resolve | `requireAuth` | Assigned arbiter only | **Yes — the one genuine cryptographic gate in this matrix** (Ed25519 signature over `AuthorityDecisionPayload`, verified against registered `User.publicKey`) | None directly (delegated to #5-7 inside `applyRuling`) | Dispute must not already be `RESOLVED` | Dispute status ≠ `RESOLVED` | `dispute.service.ts:521-624` |
| 11 | Appeal | `requireAuth` | Buyer or seller only | None | None | Real appeal fee charged; escrow must not have a script-committed (MULTISIG) arbiter; requires market-mode provider support | Dispute must be `RESOLVED` | `dispute.service.ts:749-813` |
| 12 | Vouch | `requireAuth` (voucher) | None on vouchee | None | None | **Real bar**: voucher `totalTrades ≥ 3` and `reputationScore > 0`; no self-vouch; one vouch per pair | None | `vouch.service.ts:42,53-68` |
| 13 | Rate counterparty | `requireAuth` | Rater must be the trade's buyer or seller; can only rate the other party | None | None | Score 1–5; one rating per trade | Trade must exist | `reputation.service.ts:104-136` |
| 14 | Use a settlement provider | N/A | N/A | N/A | N/A | **ABSENT** — no participant-level gate on which provider a participant may use; selection is asset-keyed only, never caller-keyed | N/A | `escrow.service.ts:224-243`, `escrow-providers.ts:341-345` |
| 15 | Use a capability | `requireAuth` | None | None | **Self-issued, unrestricted** — any authenticated participant may grant themselves any `capabilityName`/`scope`/`constraints`, no approval step | None (explicitly future work) | None | `capability.routes.ts:44-60`, `capability-registry.ts:65-99` |
| 16 | Act as agent | N/A | N/A | N/A | N/A | **Confirmed, not re-derived, theoretical today** — the one call site that could receive an `agent:...` identity (`executeSettlement()`'s `sellerAgentId`) is itself gated behind `config.features.autoSettleOnMatch` (default `false`) and never populated by its sole real caller | N/A | `escrow-lifecycle.ts:60-104`, `settlement-orchestrator.ts:34-45,62-67`, `config/index.ts:328` |

**Narrative summary**: Authentication (`requireAuth`) is universal and uniform. Role-based Authorization is the dominant gate for every action except arbitration resolution, which alone requires fresh cryptographic Authority. `CapabilityGrant` enforcement, where wired at all, is opt-in and off by default. Current-state gates are pervasive. Genuine Policy/Eligibility gates are narrow and concentrated almost entirely in vouching (#12) and, upstream of this table, arbiter selection (§6) — no analogous minimum-trades/reputation bar exists for offer creation, trade creation, or capability self-issuance.

---

## 6. Provider Eligibility Matrix

| Rail | Registered? | Structural scope? | Capability declared? | Runtime availability modeled? | Maturity/evidence modeled? | Production eligibility modeled? | Policy gate? | Risk gate? | Feature flag? | Selection | Fallback | Failure classification |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| MOCK | Yes (`PROVIDERS`) | N/A (simulated) | Yes (all) | N/A | **Default active provider** unless explicitly disabled; boot-fatal if ambiguous in production | Explicitly theater, never production-eligible | None | None | `mockEscrow`, default `true` | Default for any unspecified `type` | N/A | N/A |
| MULTISIG | Yes | BTC/BITCOIN_L1 | release/refund/split/signatureCollection | **ABSENT** | Real, tested, extensively (own test suite + integration tests) | **Not established** — testnet only, unaudited | Fee-collection-capable (only rail); script-committed-arbiter-capable (only rail) | Execution-cost/fee-skim ceiling (real, disclosed residual gap) | `MULTISIG_NETWORK` boot guards | Asset-keyed | None | `UNAVAILABLE`/`FORBIDDEN`/`INELIGIBLE`/`UNSUPPORTED` (real, used) |
| LIGHTNING_HODL | Yes | BTC/ARKADE | release/refund/signatureCollection (no split) | **ABSENT** | Real, tested; own test suite | Testnet/mutinynet only; not on M8-R Core-authoritative dispute path | None beyond structural | None specific | None dedicated | Asset-keyed | None | Same reasons available |
| SAFE_GUARD_EVM | Yes | (EVM) | release/refund/signatureCollection (no split) | **ABSENT** | Real, structural — **never live-exercised** against a funded account/bundler; own header discloses this | Never established | None beyond structural | None specific | None dedicated | Asset-keyed | None | Same |
| WDK_USDT_EVM | Yes | USDT/ETHEREUM | release/refund/split | **ABSENT** | Real, on-chain, tested; retry-safety hardened | **Categorically production-ineligible by CTO decision (RFC-019), enforced by a boot-time FATAL guard**, not merely disclosed in prose | None beyond structural | None specific | `WDK_SEED_PHRASE` + production-boot guard | Asset-keyed | None | Same |

**Narrative summary**: every rail's registration is unconditional at module load, independent of whether its configuration is actually filled in — the clearest proof that Registration ≠ Configured ≠ Available. No rail has any runtime availability or health concept; "availability" is discovered only reactively, by attempting the call and catching a timeout/error. Exactly one rail (WDK_USDT_EVM) has its production-ineligibility enforced in code rather than merely documented; every other rail's non-production-eligibility is disclosed in prose/table form only, not code-enforced.

---

## 7. Capability Semantics

- **Three unrelated concepts share the word "capability"**: RFC-005 `Capability`/`CapabilityGrant` (permission); `SettlementCapability` (a structural execution-feature tag on a provider registration — `'release'|'refund'|'split'|'signatureCollection'`); `EscrowParticipantKey.capabilityProfile` (a per-participant wallet/client compatibility declaration). None is confused with another in code; ADR-002 §6 is the canonical home naming all three as distinct.
- **Only `CapabilityGrant` has real persistence.** `Capability`/`CapabilityImplementation` exist only as a small static in-code map (`CAPABILITY_IMPLEMENTATIONS`), deliberately not backed by a Prisma model (RFC-013 Alternatives Considered #4 explicitly rejects this).
- **Grant/check/revoke mechanics**: self-issue only (`issuedBy === grantedTo`, no approval step); `check()` is a fresh, uncached DB read every call; `revoke()` requires the caller to own the grant, sets `revokedAt`. `GET /v1/capabilities/:participantId` has no `requireAuth` guard at all — any caller can list any participant's active grants (a real, minor finding not otherwise classified as risk/eligibility, noted for completeness).
- **No resource-instance scoping exists** — `scope: string[]` is action/event-shaped only; `constraints: Json?` is used only for `expiresAt`, never a resource id. Reconfirmed, not newly discovered.
- **Enforcement is a single flag**: `config.features.enforceCapabilities`, default `false`. Production boot requires the operator to set it *explicitly* (`true` or `false`) but does not mandate `true` — a deliberate choice, disclosed as such (automatic issuance for real users "isn't ready").
- **Temporal meaning — `ABSENT`, exhaustively confirmed.** No RFC, protocol-spec section, schema comment, or test states whether a grant authorizes initiation-only, the whole operation, a bounded window, or every stage independently. The Intent primitive checks capability at two separate lifecycle stages (creation and propose) with two different scope strings; the Escrow/settlement primitive checks it once, at initiate, never at finalize. This divergence is itself evidence no shared doctrine governs the question — different call sites independently invented different temporal behavior.
- **Interaction with Authority — complementary, not redundant, confirmed by direct code reading.** In `releaseFunds()`, the Authority check (`loadEscrowWithAuthorization`) is unconditional and runs first; the Capability check runs second and is opt-in. Same pattern in `initiateSignatureCollectionCore()`. Neither substitutes for the other.
- **Interaction with Eligibility — the same code path, by design, for Intent actions.** `evaluateIntentPolicy()` runs ownership → expiry → status → capability → amount-bounds as one sequential decision function; the file's own comment states this "proves by construction that a valid capability alone never reaches ALLOW." This is the one real, working Policy-decision primitive in the codebase.
- **Interaction with settlement availability — confirmed unrelated, by explicit ADR-002 §6 ruling.** `capability-registry.ts` and `execution-candidates.ts` import nothing from each other; ADR-002 states Permission Capability is "never reused as Provider Selection Policy."

---

## 8. Runtime Availability / Health Findings

- **A real taxonomy for *rejection reasons* exists** (`CapabilityDenialReason`: `UNSUPPORTED`/`UNAVAILABLE`/`FORBIDDEN`/`INELIGIBLE`/`DISABLED`/`NOT_IMPLEMENTED`) — but this classifies *why a synchronous call was just refused*, never a *queryable, standing status* consultable in advance. `DISABLED` and `NOT_IMPLEMENTED` are declared but never produced anywhere in `src/`.
- **Provider available/unavailable**: a real interface method exists only in OpenLiquidity (`LiquidityProvider.isAvailable()`), but its only implementation hardcodes `return true` — a stub with no real liveness logic behind it. `SettlementProvider` (OpenSettlement) has no availability method of any kind.
- **Provider healthy/degraded**: `ABSENT`, entirely — zero matches for any health/degraded concept anywhere near provider code.
- **Provider temporarily disabled**: `ABSENT` at the provider level. `escrow-circuit-breaker.ts` is real but scoped per-escrow (concurrency-conflict protection), explicitly not a provider-disable mechanism — its own header disclaims a global breaker as itself a DoS lever.
- **Network/external-dependency failure**: real, reactive handling exists (`bounded-rpc.ts`'s bounded timeout + safe-retry-only-on-transient-status), but there is no proactive pre-flight reachability check anywhere — failure is only ever discovered by attempting the call.
- **Settlement rail unavailable**: modeled only as a load-time registration fact (`UNAVAILABLE` when a type/asset has no registered provider); no code distinguishes "registered but currently down" from "never registered."
- **Capability unavailable**: exists only in the client-wallet-profile sense (`capability-profile.ts`'s `INELIGIBLE`), unrelated to rail-level runtime availability.
- **Maintenance mode**: `ABSENT`, zero matches anywhere in the codebase.
- **Stale provider state**: `ABSENT` as a provider concept; the "staleness" handling that does exist (event-store reclaim, dispute-pending reconciliation, MULTISIG reorg sweeps) is domain-specific data-consistency logic, not a provider-staleness model.
- **Seven-state trace (configured → registered → started → reachable → healthy → eligible → selected), done concretely for `WDK_USDT_EVM`**: `configured`, `registered`, `eligible` (boot-time only, RFC-019's FATAL guard), and `selected` all have real, distinct code-level meaning. `started` is conflated with lazy first-use (no separate lifecycle hook). `reachable` and `healthy` have **no representation at all** — both collapse into "the call either succeeded or threw." **This is Sails' central, honestly-answerable "if runtime health is not modeled, say so" finding: it is not modeled**, for any rail.

---

## 9. Risk-Rule Inventory

| Gate | Classification | Enforced? | Evidence |
|---|---|---|---|
| Vouching eligibility bar (RFC-021 D7) | Risk rule / eligibility rule | **Yes**, real, with a real consequence (`VOUCH_BURN_PENALTY`) | `vouch.service.ts:42,53-68`, `reputation.service.ts:83-98` |
| Arbiter eligibility formula (RFC-021 D2/D3) | Risk rule / eligibility rule | **Yes**, real, with slashing consequence | `market-arbitration.provider.ts:51,197-232,325-351` |
| Trusted-list arbitration mode | Deployment-configuration decision | Yes, but a simpler static-membership mechanism | `arbitration-provider.ts:58-66` |
| **Payment-account graduated trade-limit ramp (RFC-021 D5)** | Risk rule (as computed) | **`ABSENT` — computed for display only, never enforced** in trade/escrow creation or settlement | `payment-account.service.ts:31-35,169-175`; no call site found outside the same file except read-only view routes |
| Self-trade/counterparty restriction | Protocol/business rule with a risk dimension | Yes | `trade.service.ts:101-103` |
| Reputation-threshold matching filter | Policy/business rule (discovery-only, not a settlement-time block) | Yes, at discovery | `liquidity.service.ts:833,863,876-878` |
| RFC-015 dual-approval | Risk rule, deployment-gated | Opt-in, default `false`; bypassed unconditionally when disputed | `config/index.ts:358`, `escrow.service.ts:642` |
| Capability enforcement toggle | Policy gate / deployment-configuration decision | Opt-in, default `false` | `config/index.ts:342` |
| Auto-settle-on-match | Deployment-configuration decision with direct risk consequence | Opt-in, default `false`, bypasses dispute window | `config/index.ts:331`, `handlers.ts:554` |
| Execution-cost / fee-skim ceiling (MULTISIG) | Risk rule (fraud/skim-detection) | **Yes**, real, dual bound (rate + proportional), disclosed residual gap | `execution-cost-policy.ts:134-176` |
| Settlement-type/rail-capability restrictions | Protocol rule | Yes | `escrow-providers.ts:341-345,358,409` |
| Network (mainnet/testnet) constraints | Deployment-configuration decision (boot-time) | Yes, multiple FATAL guards | `config/index.ts:126-131,695-795` |
| Rate limits | **Not economically meaningful** — DoS-shaped (IP+route) only | Yes, but never amount/value-aware | `redis-rate-limit.ts:44-90` |
| Suspicious-activity detection | Explicitly non-blocking, detection/log only | N/A | `suspicious-activity.ts` |
| User/account suspension/ban | **`ABSENT`** — no such field exists on `User` at all | N/A | `prisma/schema.prisma:104-134` |
| Financial-sanity ceiling (`MAX_SANE_TRADE_VALUE`) | Explicitly excluded — ordinary validation, own comment calls the real ceiling "a governance decision, not an engineering one" | N/A | `policy-engine.ts:217,224-268` |

---

## 10. Maturity / Evidence Findings

Frozen doctrine used, not reinvented: `docs/PROJECT_CONTEXT.md` §4's seven-state lifecycle (`Product Direction → Representable → Implemented → Real → Evidenced → Beta Eligible → Production Eligible`) plus four never-collapsed axes (**Implementation Reality ≠ Journey Reality ≠ UX Evidence ≠ Production Eligibility**); `docs/BACKLOG.md`'s **"Provider implementation ≠ provider maturity ≠ production eligibility"** and **"Reference implementation success ≠ independent interoperability proof."**

Applying this doctrine per rail (full detail in §6): every non-MOCK rail has Implementation Reality = Yes; **zero rails have an established Production Eligibility** anywhere in the codebase. MOCK is theater and is, by default configuration, the active provider. WDK_USDT_EVM is the only rail whose ineligibility is enforced by code (a boot-time FATAL guard tied to RFC-019) rather than disclosed only in prose. MULTISIG is the most mature non-mock rail (real, extensively tested, own dispute-execution authority path) but remains explicitly "not established (testnet only, unaudited)." SAFE_GUARD_EVM is real but has never been live-exercised against a funded account or bundler — disclosed directly in its own header, not merely inferred.

---

## 11. Contradictions

1. **A documented, previously self-corrected doc-layer conflation, not a live code defect.** An earlier draft of `docs/PRODUCT_UI_REALITY_RETURN.md` claimed a `SINGLE_STRUCTURALLY_COMPATIBLE_CANDIDATE` result meant "sellable now" and proposed calling it a "Settlement Maturity Signal" — the document's own R1 correction (2026-09-14) names this the exact overclaim the code-layer mission had already corrected once. No other undisclosed instance of this specific conflation was found in `src/` or `docs/`.
2. **`PROTOCOL_INVARIANTS.md`'s INV-OP-4 ("Fraud/Risk Detection Never Acts Unilaterally") is titled generally but its binding text is scoped to one mechanism (`SocialEngineeringAgent`) only.** A second, real, independently-blocking risk mechanism (`escrow-circuit-breaker.ts`) exists and is never cross-referenced to INV-OP-4. Not a violation of the invariant's literal text, but a reader relying on the title alone would be misled about what the invariant actually covers.
3. **The word "eligible/eligibility" denotes three unrelated concepts with no cross-reference between them** (§4) — a genuine, if narrow, documentation-clarity issue, not a behavioral defect.
4. **RFC-014's own Decision-section text describes the capability check as living in `settlement-orchestrator.ts`; the real implementation centralizes it more strongly, inside `escrow.service.ts`'s `releaseFunds()`/etc. itself.** The implementation is *stronger* than the RFC's literal text, and the code's own comment says so explicitly — a drift in the RFC's favor of clarity, not a defect, but worth noting as an RFC-text/implementation mismatch.
5. **Two of three real "missing capability grant" denial call sites discard the `FORBIDDEN` reason before it reaches the caller** (`intent.routes.ts`, `intent-engine.ts`), while the third (`checkFundMovementCapability()`, added later) correctly attaches it — an inconsistency within the same reason-tagging discipline the codebase otherwise applies carefully.

---

## 12. Missing Semantics

- **No distinct Policy/Eligibility/Availability/Maturity stage exists in the settlement-eligibility pipeline** between structural-compatibility resolution and execution — confirmed `ABSENT`, not merely under-built, and explicitly disclosed as such by the pipeline's own code and design doc.
- **No runtime health/availability model exists for any settlement provider or rail** (§9) — "if runtime health is not modeled, say so": it is not modeled.
- **No enforcement mechanism exists for the payment-account trade-limit ramp** despite full computation (§9) — the mission's clearest standalone gap.
- **No temporal-meaning statement exists anywhere for `CapabilityGrant`** (§7) — genuinely undocumented, not merely dispersed.
- **No amount/value-aware rate limit exists anywhere** — every rate limit found is DoS-shaped (IP+route), never economically meaningful.
- **No user/account suspension or ban concept exists at all** on the `User` model.

---

## 13. Legitimate Deferrals

- The governed `PolicyEngine` (`get`/`propose`/`activate`, all stubbed, throwing "Not yet implemented") is explicitly real, out-of-current-MVP scope, corroborated independently by `PROTOCOL_ECONOMY.md`'s own Months 10-12 governance-layer plan. **`LEGITIMATE_DEFERRAL`**, not a gap needing urgent ownership.
- RFC-013/RFC-014's repeated, explicit refusal to bake a full policy-evaluation engine into the capability registry itself ("the registry itself would conflate 'store of grants' with 'policy engine'"). **`LEGITIMATE_DEFERRAL`**.
- RFC-021 D4's `cumulativeFeesObserved` fee-floor deliberately excluded from D3's baseline arbiter-eligibility gate, folded only into appeal-panel weighting — a presented, evidenced CTO tradeoff. **`LEGITIMATE_DEFERRAL`**.
- `Capability`/`CapabilityImplementation`'s lack of a real Prisma-backed store — RFC-013's own Alternatives Considered #4 explicitly rejects building this now, calling RFC-005's table "illustrative... a Reference Implementation detail." **`LEGITIMATE_DEFERRAL`**.
- Cross-instance scaling boundary of `escrowCircuitBreaker`'s in-memory counter (loses global coherence with >1 instance) — true only under the current, disclosed no-platform-operator single/few-instance deployment posture; not written down anywhere as a named limitation, but consistent with, not contradicting, that posture. **`IMPLICIT`, bordering `LEGITIMATE_DEFERRAL`** — flagged, not urgent.

---

## 14. Cross-Domain Inputs

- **Authority**: reconfirmed, not newly derived — capability/eligibility never creates economic authority anywhere; ordering in `releaseFunds()`/`evaluateIntentPolicy()` proves this by construction, not merely by absence of a counterexample.
- **State/Lifecycle**: eligibility genuinely depends on object state in two real, narrow instances not previously logged as Policy/Eligibility findings — `ArbiterProfile.slashedAt` (a slashed arbiter is categorically excluded from `eligibleFor()`) and `Vouch.burnedAt` (an active-vouch check gates payment-account bootstrap). Both are narrow and don't generalize into a broader state-eligibility pattern.
- **Business Rules**: six BR-* rules (`BR-ESCROW-09`, `BR-DISPUTE-02`, `BR-DISPUTE-03`, `BR-REP-04`, `BR-CAP-01`, `BR-CAP-02`) are already correctly identified by `docs/BUSINESS_RULES_DISCOVERY.md`'s own Policy/Risk/Eligibility column as Policy/Eligibility/Risk-shaped content — cross-referenced here, not duplicated as "new" findings.
- **Temporal/Concurrency** (carried forward, not solved): the capability initiate→finalize gap applies directly here, since `checkFundMovementCapability()` is exactly the Policy/Eligibility-relevant mechanism this window bypasses on the finalize leg. Arbiter assignment, by contrast, reads its eligible pool fresh and synchronously immediately before selection — no equivalent stale-candidate-pool pattern was found there. **`TEMPORAL_INPUT`** for the capability gap specifically; not present elsewhere in this domain's mechanisms.
- **Evidence** (input, not solved): the trade-limit-ramp non-enforcement (§9) and the `CapabilityDenialReason` UI-non-consumption (§7) are both candidates for a future Evidence-domain inventory of "computed truth that never reaches its consumer."

---

## 15. Beta Implications

Candidate future scenarios for Issue #165 (registered here only, per mission instruction not to update the issue unless specifically necessary — none of the following rises to that bar; these are evidence for a future Backlog Delta/Project Sync mission to register, not acted on here):

- A trade exceeding a payment account's computed (but unenforced) trade limit currently succeeds — expect FAIL against the ramp's own stated intent, until enforcement exists.
- Structurally compatible provider but policy-ineligible (theoretical today, since no policy stage exists to fail) — expect this scenario to become meaningful only once §12's missing pipeline stage is designed.
- Provider registered but unavailable (in the sense of currently down, not merely unregistered) — currently indistinguishable from "never registered" in code; a beta scenario here would surface that gap directly.
- Capability revoked during an in-flight release/refund/split operation — already a known Authority-domain scenario, reconfirmed here as also a Policy-domain one.
- Different clients (Sails Market vs. Satsails) reaching the same eligibility/policy result for vouching, arbitration, and capability enforcement — no evidence yet either way.

---

## 16. Normative-Domain Conclusion

**`MIXED`, leaning `PRESENT_BUT_DISPERSED`.** Canonical homes genuinely exist for the domain's strongest mechanisms — RFC-021 for arbiter/vouch eligibility, ADR-002 §6 for the capability-vs-settlement-eligibility layering, `execution-candidates.ts`'s own header for the settlement pipeline's honest scope disclosure. But no single document indexes Policy/Eligibility/Risk truth across the codebase the way `docs/BUSINESS_RULES_DISCOVERY.md` does for business rules — a reader would need to already know to look in RFC-021, `config/index.ts`, `policy-engine.ts`, `execution-cost-policy.ts`, and `payment-account.service.ts` independently, with no map between them.

**A new standalone `POLICY_STANDARD.md`/`ELIGIBILITY_STANDARD.md`/`RISK_STANDARD.md` is NOT recommended**, consistent with every prior mission's own conclusion in this chain. What's missing is not a document but two things: (1) the settlement-eligibility pipeline's own disclosed missing stage (an Architecture Decision, not a documentation gap), and (2) a thin cross-reference layer tying together the genuinely dispersed-but-real sources this mission found (RFC-021, ADR-002 §6, `policy-engine.ts`, config-as-policy flags). Consolidation over proliferation remains the right call.

---

## 17. Recommendations for Later Ownership — Not Implementation

- **The payment-account trade-limit non-enforcement** (§9) is the mission's highest-priority finding for a future Backlog Delta to register as an owned implementation defect — real, coded, disclosed by this mission, currently un-owned anywhere.
- **The capability-grant temporal-meaning question** (§7) should be registered as a `POLICY_DECISION_REQUIRED` (what should a grant mean over time) with a `TEMPORAL_INPUT` overlay (how should it be re-checked), building on the same finding Authority Model Discovery already flagged — a future Backlog Delta should determine whether this deserves its own owner or extends an existing one (likely the same owner as the capability initiate→finalize gap already registered under `docs/BACKLOG.md` item 45).
- **The settlement-eligibility pipeline's missing Policy/Availability/Maturity stage** (§6, §8, §12) is an `ARCHITECTURE_DECISION_REQUIRED`, already self-disclosed by `docs/ADAPTIVE_EXECUTION_CAPABILITY_ROUTING.md` as future work, not newly discovered here — this mission's contribution is confirming no code-level conflation has occurred despite the gap, and cross-referencing the one place a documentation-layer instance did occur and was corrected.
- **`CapabilityDenialReason`'s dead values and inconsistent tagging** (§7, §11) is a narrow `IMPLEMENTATION_DEFECT` candidate — low severity, precisely scoped, suitable for a small follow-up rather than a major mission.
- **The runtime-health-absence finding** (§8) should be registered as `ARCHITECTURE_DECISION_REQUIRED` for a future domain (likely Temporal/Concurrency or a dedicated infrastructure-reliability pass), not this domain's problem to solve.
- **The eligibility-terminology collision** (§4, §11) is a `DOCUMENTATION_DRIFT`-class finding, suitable for a cross-reference note rather than a renaming effort — renaming risks breaking working, correctly-separated code for cosmetic reasons.

---

## 18. High-Risk Blind Spot Falsification (Section 14 of the mission brief)

Each hypothesis was actively tested against real code, not assumed either way.

1. *Structurally compatible candidate treated as eligible?* **Falsified in live code.** No consumer of the five discovery outcomes skips a policy check because none exists to skip; the one place this conflation occurred was a documentation draft, already self-corrected.
2. *Registration treated as availability?* **Falsified as a code-level conflation** — every registry's own header explicitly disclaims this; `PROVIDERS` registering unconditionally regardless of config is the mechanism's own honest behavior, not a claim of availability.
3. *Availability treated as health?* **Moot, not falsifiable as stated** — availability itself is barely modeled (one stubbed interface method), so there is nothing substantive to conflate with health, which doesn't exist at all.
4. *Capability treated as permission?* **Falsified** — the three "capability" concepts are kept structurally separate in code; none leaks into another's call sites.
5. *Capability treated as authority?* **Falsified**, confirmed by direct ordering in `releaseFunds()`/`evaluateIntentPolicy()`.
6. *Provider implementation treated as maturity?* **Actively defended against, not naturally avoided** — WDK_USDT_EVM required a specific, named boot-time guard (RFC-019) precisely because implementation existing was not, by itself, going to stop it from reaching production; the guard's existence proves the distinction is maintained by deliberate effort, not by default.
7. *Maturity treated as production eligibility?* **Falsified as a live conflation** — `PROJECT_CONTEXT.md`'s four-axis doctrine explicitly separates these, and zero rails show an established Production Eligibility despite every non-mock rail being "Implemented/Real."
8. *Feature flag silently becomes policy?* **True, but disclosed, not silent.** `enforceCapabilities`, `arbitrationMode`, `requireDualApprovalForRelease`, `autoSettleOnMatch` are literally policy encoded as feature flags — this is real and worth naming, but each is commented/disclosed at its definition, not hidden.
9. *Current-state guard mislabeled eligibility?* **Confirmed as a real, narrow terminology issue** — the dispatch-gate/expiry-authority "eligibility" (State/Lifecycle-domain technical readiness) uses the same word as genuine economic eligibility, though never in the same code path.
10. *Config default mistaken for protocol truth?* **Confirmed as a live, disclosed fact**, not a defect — `enforceCapabilities=false` means the capability layer of fund-movement eligibility is absent by default; `BR-CAP-01` already names this correctly as a disclosed policy default, not an assumed-active Business Rule.
11. *Capability revocation semantics undefined?* **Partially true** — revocation itself is well-defined and immediately live; its interaction with an in-flight initiate→finalize operation is undefined, because nothing re-queries the registry during that window at all (an absence, not an undefined-behavior bug).
12. *Async execution continues after eligibility changes?* **True for capability** (the initiate→finalize gap); **falsified for arbiter assignment**, which reads its eligible pool fresh, synchronously, immediately before selection.
13. *Agent authority may eventually exist while policy eligibility still fails?* **Not yet answerable from current code** — this is a forward-looking design question. This mission lists (§14, cited from the policy-sources agent) the four concrete gates a future delegated OpenAgent would need to satisfy (economic-role check, `CapabilityGrant` check, `evaluateIntentPolicy()`'s identity-equality requirement, and the reputation-gated mechanisms), without designing how they'd be satisfied.

---

STOP. Awaiting CTO Gate.
