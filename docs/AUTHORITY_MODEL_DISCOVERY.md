# Authority Model Discovery — Evidence Report for CTO Gate

**Mission**: Sails Authority Model Discovery & Institutionalization (discovery/institutionalization, not implementation).
**Baseline**: `main@a47028387673394ac46d7e1730d5348ea84e10bc` (PR #166 merged/frozen).
**Branch**: `mission/authority-model-discovery`.
**Status**: Evidence only. No code, test, RFC, ADR, UI, capability, payout-address, signature, or governance mutation. No Product/Architecture Decision resolved.

---

## 1. Executive Summary

Sails' authority model is genuinely strong in exactly one place and structurally thin everywhere else that depends on it. Ed25519 signatures are used in two distinct roles that must not be conflated: a challenge-response signature at authentication time establishes *identity*, while `resolveDispute()`'s `AuthorityDecisionPayload` is **the only mechanism found that provides a cryptographically signed, independently verifiable discretionary economic authorization artifact** — verified against the arbiter's registered `User.publicKey`, over a canonicalized, domain-separated economic disposition. `Authentication ≠ Authorization` is preserved: the first proves who is calling; only the second proves that a specific discretionary economic disposition was authorized. Every other "authority" check found — Offer ownership, Trade party membership, Escrow seller/arbiter authorization, capability grants — is a durable-identity string comparison (`participantId === X`), not a cryptographic proof of a specific economic disposition. This is not itself a defect: for a system whose HTTP layer already converts a signed challenge-response into a trusted `participantId` at authentication time, a downstream string comparison against that value is a legitimate, safe pattern — confirmed, not merely assumed, by this mission's systematic trace of every route's `requireAuth` derivation.

Three findings rise above "known limitation" to genuine authority gaps:

1. **The only signed, independently verifiable discretionary economic authorization artifact does not reach the one place its own designers intended it to matter most.** `submitTransactionSignature()` — the finalize step for MULTISIG/LIGHTNING_HODL/SAFE_GUARD_EVM — has **zero code path back to `AuthorityDecisionPayload`**. Signer participation there is real cryptographic Execution Authority (proof that a required signer produced a valid signature over this pending transaction) but is not, by itself, proof that the Economic Disposition Authority currently governing the disputed settlement is still valid, and does not prove ruling-generation/appeal-round currency. This is the authority-angle explanation for the already-known State & Lifecycle finding that appeal leaves a prior ruling's pending instruction live: it isn't that invalidation was forgotten, it's that finalize never references or revalidates the currently authoritative ruling generation, for any ruling, appealed or not.
2. **The cited freshness check for appeal-round replay is tautological.** `assertExecutionMatchesAuthorization(payload, payload)` is called with the same object as both arguments — it verifies nothing about staleness. Real freshness protection is indirect (a stale-round signature fails cryptographic verification against a fresh read), and is not backed by an explicit re-check at commit time for four of five settlement rails.
3. **Old-arbiter authority after an appeal is prohibited for MULTISIG (atomic, optimistic-concurrency-guarded) but technically possible and untested for the other four rails** (an unconditional `update()` with no `arbiterId`/`appealRound` filter) — a genuine, evidenced, rail-scoped authority race.

Positively confirmed, not merely assumed: capability grants are strictly additive and cannot substitute for economic-role authority anywhere; no code path lets an arbiter override a beneficiary's registered payout address on any rail; `WalletAgent` (the one class that could construct an agent-execution identity) is never instantiated in any production path, meaning the "agent authority" question is theoretical, not live, today; and every mutating route in `open-settlement`/`open-p2p` requires authentication with no exception.

No frozen decision is reopened. Offer A3, RFC-021 B2, F-05/F-06/F-07, and the appeal/pending-instruction Architecture Decision are all carried forward unchanged — this mission's findings *sharpen* the appeal/pending-instruction question (it is now confirmed that finalize has no check or reference to the currently valid Economic Disposition Authority / ruling authority generation, not merely a state-tracking gap) without resolving it.

---

## 2. Mission Baseline

- Fetched `origin/main`, confirmed at `a47028387673394ac46d7e1730d5348ea84e10bc` (PR #166's merge commit).
- `docs/STATE_LIFECYCLE_DISCOVERY.md`, `docs/BACKLOG.md` item 44, `docs/PROJECT_CONTEXT.md` §2M all confirmed present.
- Issue #165 confirmed `OPEN`, correct title.
- Offer A3 confirmed owned by item 43 (not item 44).
- RFC-021 confirmed `**Status:** Proposed` — unchanged.
- `PROCEED_TO_AUTHORITY` confirmed as the frozen sequencing verdict.
- Tree clean except the unrelated, already-flagged `.claude/worktrees/agent-a0485ab5b840843fb/` directory.
- Branch `mission/authority-model-discovery` created fresh from this baseline.

---

## 3. Domain Boundary

| Domain | Governs | Boundary applied in this report |
|---|---|---|
| Business Rules | What may happen | Cited from prior missions, not re-derived |
| State & Lifecycle | How an object changes state | Cited from `docs/STATE_LIFECYCLE_DISCOVERY.md`, not re-derived |
| **Authority Model (this mission)** | **Who/what may cause the change, and where that authority comes from** | Primary subject |
| Policy/Eligibility/Risk | Whether current conditions permit participation | Findings crossing into this are labeled "Policy/Eligibility input," not resolved here |
| Temporal/Concurrency | Whether authority remains valid across time/retries/races | Findings crossing into this are labeled "Temporal/Concurrency input," not resolved here |
| Evidence | How authority and its use are independently provable | §21 records what evidence exists per mechanism; does not build an evidence framework |

---

## 4. Authority Taxonomy

Distinctions preserved throughout, verified against real code where checkable, not assumed:

- **Technical Capability ≠ Protocol Permission ≠ Economic Authority ≠ Settlement Eligibility** — confirmed: `CapabilityGrant` (technical/protocol layer) is strictly additive to, never a substitute for, economic-role checks (§13).
- **Authentication ≠ Authorization** — confirmed: `requireAuth` produces a trusted `participantId`; every mutating function then separately checks that id against a role (buyer/seller/arbiter/owner).
- **Identity ≠ Authority** — confirmed: being `trade.sellerId` is identity; being *permitted* to release funds *right now* is authority, and the mission found at least one place (§15.4, §15.5) where identity alone is treated as sufficient authority regardless of intervening state.
- **Agent Access ≠ Agent Authority** — confirmed, and found to be currently moot in production: no code path lets an agent identity execute a fund movement today (§12).
- **Recommendation ≠ Authority** — confirmed structurally: QVAC's outputs never reach a fund-moving call directly (§12).
- **Capability Grant ≠ Economic Consent** — confirmed: registering a `PayoutAddress` is the beneficiary directly exercising their own authority, not granting anyone else anything; a `CapabilityGrant` is a coarse, non-resource-scoped technical permission, never itself economic consent (§9, §13).
- **Economic Disposition Authority ≠ Destination Authority ≠ Execution Authority** — carried forward from `DESTINATION_AUTHORITY_ARCHITECTURE.md`, re-confirmed live in current code (§9).
- **Possession of a session token ≠ fresh economic authorization** — confirmed: no route anywhere re-verifies session *freshness* beyond ordinary validity; carried forward as F-08A, not solved (§11).
- **Retry permission ≠ authority to create a new economic action** — confirmed via idempotency-key scoping, cited not re-derived (Business Rules Discovery's own BR-* findings on `IdempotencyKeyStatus`).
- **Arbiter identity ≠ authority over destination** — confirmed, re-verified against current code, not merely cited (§9, §16 item B7).

---

## 5. Authority Sources Inventory

Discovered, not assumed, by tracing real call sites:

| Source | Real? | Where |
|---|---|---|
| Authenticated participant identity (`requireAuth` → `participantId`) | Yes, universal | Every mutating route in `open-settlement`/`open-p2p` |
| Durable `User.id` | Yes | The identity every role check compares against |
| Ed25519 signature (challenge-response) | Yes | `auth.ts` (session issuance), `arbitration-authority.ts` (ruling execution) |
| Session token | Yes, but proves only "session is valid," nothing more (§11) | `auth.ts` |
| Buyer/seller role | Yes | Trade/Escrow party checks throughout |
| Offer ownership | Yes | `updateOfferStatus()` |
| Trade-party / Escrow-party membership | Yes | `isPartyOrAgent()`, `updateStatus()`, `markPaymentSent()` |
| Assigned arbiter | Yes | `Dispute.arbiterId` comparison |
| Script-committed arbiter | Yes | MULTISIG's on-chain-committed key |
| Market-selected arbiter | Yes (role assignment, not delegation — §12) | `market-arbitration.provider.ts` |
| Previous/appeal-panel arbiter | Yes, but superseded (with a rail-scoped race — §15.1) | `appeal()` |
| Participant agent (`agent:{label}:{id}`) | **Specified but not live** — no production instantiation found | `isPartyOrAgent()`, `WalletAgent` |
| QVAC/agent execution path | **Does not exist** — QVAC never executes, only recommends | §12 |
| Capability grants | Yes, additive-only, off by default | `capability-registry.ts` |
| Dual approval (RFC-015) | Yes, off by default | `escrow-dual-approval.ts` |
| Settlement-provider rules | Not an authority source — a technical adapter (§12) | `escrow-providers.ts` |
| Registered payout addresses | Yes — direct beneficiary self-authorization, not delegation | `payout-address.service.ts` |
| Beneficiary-controlled destination bindings | Yes, same as above | `resolvePayoutAddress()` |
| Admin/operator mechanisms | **Confirmed absent** — no operator/admin role exists anywhere | (searched, none found) |
| Trusted internal callers | Yes, extensively — see §20 | Sweepers, `settlement-orchestrator.ts` |
| Signed authority decisions | Yes — the only mechanism found providing a cryptographically signed, independently verifiable discretionary economic authorization artifact | `arbitration-authority.ts` |
| Idempotency context | Not an authority source — governs retry safety only | `idempotency.ts` |
| Protocol events | Not an authority source — a notification/reaction mechanism | `handlers.ts` |
| Local UI state | Not an authority source, confirmed — no server-side check ever reads client UI state | — |

---

## 6. Offer Authority

- **Creation**: authority = the authenticated caller only; `Offer.userId` is set from `requireAuth`'s `participantId`, never client-supplied.
- **Status changes** (pause/cancel/complete): `updateOfferStatus()` (`liquidity.service.ts:667-684`) checks exactly one thing: `offer.userId !== triggeredBy → ForbiddenError`. Durable-identity ownership, not session-scoped — a re-authenticated session with the same `participantId` retains full authority.
- **Agent-for-owner**: no evidence found that an agent identity may act as an Offer owner — `updateOfferStatus()`'s comparison is a plain equality check, not `isPartyOrAgent()`; the agent convention is not wired into Offer authority at all.
- **Authority after publication**: unchanged — the owner retains full, unrestricted status-change authority for the Offer's entire life (subject to A3's now-frozen Product truth about which transitions are *valid*, a Business-Rules/Lifecycle question, not an authority one).
- **A3's effect on authority**: **none.** A3 decides which transitions are valid Product truth; it says nothing about who may attempt them. The owner's authority to call `updateOfferStatus()` is identical before and after A3.
- **`Offer.PAUSED`**: confirmed to be **purely a Product/Lifecycle semantics question, not an authority question** — the same single owner-ownership check governs the transition into and out of `PAUSED` as governs every other Offer status change. This mission does not resolve `Offer.PAUSED`, consistent with the mission brief.

---

## 7. Trade Authority

- **Creation**: authority = any authenticated participant other than the Offer's owner (`persistTrade()`'s self-trade check); counterparty role (buyer/seller) is *derived* from `Offer.side`, not separately granted.
- **Manual `PENDING→ACTIVE`**: authority = either trade party (`MANUAL_TRADE_TRANSITIONS`, checked via `trade.buyerId`/`sellerId` equality in `updateStatus()`). **This is a real Authority finding, not merely lifecycle drift, carried forward and sharpened from BR-TRADE-05**: the client (either party) possesses standing authority to manually force this exact transition — the same transition that, on the automatic path, is meant to be a downstream *consequence* of Escrow reaching `FUNDS_LOCKED`, not an independently client-authorized act. No check in the manual path confirms the Escrow has actually locked funds. This means Trade's own authority model currently allows a party to unilaterally assert "we are now ACTIVE" without the underlying economic fact (funds locked) that path is supposed to represent — an authority/state mismatch, not just a comment-drift issue.
- **Cancellation**: symmetric, either party, durable-identity-based, confirmed no buyer/seller asymmetry (`tests/tradeUpdateStatus.test.ts` exercises both roles identically).
- **Raising a dispute**: authority = either trade party only (`raiseDispute()`'s independent `raisedBy` check).
- **Payment evidence**: authority = either trade party (`persistEvidence()`).
- **Agent actions**: no evidence found that any Trade-authority check (`updateStatus()`, `raiseDispute()`) accepts an `agent:...`-shaped identity — these checks use plain `===` comparison against `buyerId`/`sellerId`, not `isPartyOrAgent()`. Agent delegation, where it exists at all (Escrow layer only), does not extend to Trade-level authority.

---

## 8. Escrow Authority

| Action | Actor | Authority Source | Preconditions | Scope | Delegation | Freshness | Revocable? | Evidence | Enforcement Point |
|---|---|---|---|---|---|---|---|---|---|
| Create | buyer or seller | Trade-party membership | Trade exists, no prior escrow | This trade only | None | N/A | N/A | DB role relation | `escrow.service.ts:298-300` |
| Lock funds | seller (or agent) | `isPartyOrAgent(sellerId)` | `CREATED`→`FUNDS_LOCKED` valid | This escrow only | Theoretical (agent), unexercised | N/A | N/A | DB relation + trusted-caller convention | `escrow.service.ts:452` |
| Mark payment sent | buyer (or agent) | `isPartyOrAgent(buyerId)` | funding not uncertain | This escrow only | Theoretical (agent), unexercised | N/A | N/A | Same | `escrow.service.ts:553` |
| Initiate/execute release, refund, split (cooperative) | **seller unconditionally, or assigned arbiter** | `isSellerOrAssignedArbiter()` | valid transition | This escrow only | Theoretical (agent) | **None — no Dispute-state dependency at all** | N/A | DB relation | `escrow-lifecycle.ts:115-119` |
| Submit PSBT signature (finalize) | any of `requiredSigners` | Cryptographic Execution Authority (signer-list membership + collected signature) | pending row exists, `participantId ∈ requiredSigners` | This pending tx only | N/A | **Execution Authority is checked; Economic Disposition Authority (`AuthorityDecisionPayload`/ruling generation) is never referenced or revalidated** | N/A | Signature-list check + collected signatures | `escrow-pending-tx.ts:293-297` |
| Open dispute | either trade party | Trade-party membership, re-checked independently | Escrow exists | This escrow | None | N/A | N/A | DB relation | `escrow.service.ts:718-732` |
| Execute dispute ruling | assigned arbiter, cryptographically proven | **Ed25519 signature over `AuthorityDecisionPayload`** | signature verifies, execution matches | This dispute/escrow/round | None | **Bound to round at signing, not re-verified at commit for 4/5 rails (§15.2)** | N/A (superseded by new ruling, rail-dependent — §15.1) | **Signed payload — the only cryptographically signed, independently verifiable discretionary economic authorization artifact found** | `dispute.service.ts:606-624` |
| Expire/recover | seller (recovery), system (observation only) | Role + hardcoded system constant | `EXPIRED` reachable | This escrow | None | N/A | N/A | DB relation / hardcoded constant | `escrow.service.ts:998` |

**Critical test applied throughout**: is the actor authorized because of economic role, key possession, a DB role check, or merely because a caller reached the function? **Answer, uniformly**: economic role via DB-relation comparison, for every mechanism except the signed `AuthorityDecisionPayload` path (the only signed, independently verifiable discretionary economic authorization artifact found). No mechanism found relies on "merely reached the function" as its *only* protection — `submitTransactionSignature()` does perform real signer authorization (pending row exists, `participantId ∈ requiredSigners`, required signatures collected before finalize), but for the specific question of "does this finalize reflect the currently-authoritative ruling generation," nothing there checks or references the currently valid Economic Disposition Authority at all (§15.5).

---

## 9. Destination Authority

Carried forward, re-verified against current code, not merely cited: **Economic Disposition Authority ≠ Destination Authority.**

- **Who determines the beneficiary and how much**: the arbiter, via a signed `AuthorityDecisionPayload` (disputed path) or the escrow's own cooperative-release logic (undisputed path).
- **Who determines the destination address**: **always the beneficiary's own registered `PayoutAddress`**, resolved by `resolvePayoutAddress()`, re-confirmed this mission by re-reading `dispute.service.ts`'s current `applyRuling()`: every call to a settlement action passes `undefined` for the destination parameter — never the arbiter's own request. For MULTISIG, `applyRulingCoreAuthoritative()` sources destinations exclusively from a transactional `payoutAddress.findUnique` read, never a caller-supplied value.
- **Can an arbiter ever substitute a destination?** **No, confirmed on every rail, this mission, against current code — not merely cited from the prior mission's finding.** `resolveDispute()`'s own `releaseToAddress`/`refundToAddress` parameters remain structurally inert for every rail (the M8-R2 fix).
- **Is destination bound before execution?** Yes, for signature-collection rails: `resolvePayoutAddress()` runs once at `initiate*` time and is persisted into `EscrowPendingTransaction.toAddress`; a later `PayoutAddress` rotation cannot rewrite an already-initiated transaction.
- **F-06 remains correctly superseded** — this mission found no new evidence contradicting the already-established supersession (the gap was closed by commit `e4cd207`, predating even the Foundational Inventory's own baseline). Not reopened.

---

## 10. Dispute / Arbitration Authority

**Opening**: either trade party, independently checked. **Evidence submission**: either trade party, status-gated. **Arbiter establishment** — four distinct mechanisms, not one:

| Mechanism | How authority is established |
|---|---|
| Trusted-list arbiter | Configured per-deployment list, no market mechanism |
| Market-selected arbiter | Weighted-random draw over collateral+reputation (`assign()`) — **a role assignment, not delegation**: the provider's own comment states "an arbiter never moves funds directly... `assign()` only returns a participantId" |
| Script-committed arbiter (MULTISIG) | Cryptographically fixed at escrow creation, immutable, DB-trigger-protected |
| Appeal-panel arbiter | Fresh weighted draw, excluding the original arbiter and both trade parties |

**Resolution authority**: the only mechanism found that provides a cryptographically signed, independently verifiable discretionary economic authorization artifact — Ed25519 signature over `AuthorityDecisionPayload`, verified against the arbiter's registered public key, plus `assertExecutionMatchesAuthorization()`, cited as confirming the signed payload matches the requested execution exactly (disputeId, escrowId, appealRound, authorityId, outcome, buyerBps) — though the actual call site makes this a tautological self-comparison (see below), so this correspondence check should not be read as an independent freshness guarantee.

**Authority after appeal — the mandatory deep dive**:

- **Does the original authority remain valid?** No — `appeal()` overwrites `Dispute.arbiterId` to the new arbiter; a *sequential* call from the old arbiter after this point is cleanly rejected (fresh read, identity mismatch).
- **Is it logically superseded?** Yes, in the data model (`previousArbiterId`/`previousRuling` are recorded, never re-consulted for authorization).
- **Does the pending instruction carry Economic Disposition Authority provenance?** **No — confirmed structurally absent, not merely missing.** `submitTransactionSignature()` does check Execution Authority (signer-list membership, collected signatures) but never references `AuthorityDecisionPayload`, the dispute row, or any Economic-Disposition-Authority-provenance field. It trusts the PSBT built at initiate time purely because it was built then; signer participation is real execution consent, but it is not, by itself, proof that the ruling authority governing that PSBT is still the currently valid one.
- **Does a new ruling invalidate prior authority?** Only for MULTISIG, and only incidentally (via an atomic `updateMany` filtered on `arbiterId`+`status`, not an explicit `appealRound` check). For LIGHTNING_HODL/SAFE_GUARD_EVM/MOCK/WDK_USDT_EVM, the Dispute write in `applyRuling()` is unconditional — no filter at all.
- **Can two authorities coexist?** **Yes, for the non-MULTISIG signature-collection rails specifically (LIGHTNING_HODL, SAFE_GUARD_EVM), in a genuine race window**: if `appeal()` runs between `resolveDispute()`'s identity check and its Dispute-row write, the old arbiter's already-in-flight call can still land, silently reverting an appealed dispute back to `RESOLVED` under the old ruling. **Untested** — no test exercises this concurrency, and the MULTISIG guard's own rejection code (`DISPUTE_STATE_LOST_RACE`) has zero test references.
- **Does execution code distinguish authoritative generation/appeal round?** Only nominally — the payload *contains* `appealRound`, but the cited verification (`assertExecutionMatchesAuthorization(payload, payload)`) is a tautological self-comparison, proving nothing. Real round-freshness protection is indirect, via the signature failing if a stale round's signed string doesn't match a fresh read.
- **Classification**: this is **both** an architecture gap (finalize has real Execution Authority checks but no check or reference to the currently valid Economic Disposition Authority / ruling authority generation — an Architecture Decision, per the carried-forward Architecture Decision requirement) **and** exposes an already-implied authority invariant (`INV-12`, Attributed Authority Integrity) not fully extended to this specific execution path. It is not purely architecture in the sense of "nothing relevant exists" — `INV-12` already states the principle this gap violates; what's missing is its application to the finalize step specifically.

---

## 11. Session / Authentication Boundary

Narrow, per mission instruction — F-08A carried forward, not solved.

- **What a valid session proves**: the holder previously completed a real Ed25519 challenge-response and the resulting token has not yet hit its TTL.
- **What it does not prove**: freshness beyond TTL validity; that the holder is not a session token stolen after issuance; anything about the specific economic action about to be performed.
- **Does session possession authorize every economic action available to that participant?** **Yes, confirmed uniformly** — no route found requires anything beyond ordinary session validity, re-confirmed this mission by re-enumerating every mutating route's `preHandler`.
- **Does any action require fresh signature/authorization?** **Yes — exactly one: `resolveDispute()`'s `AuthorityDecisionPayload`.** This is the only economic action in the entire system requiring anything beyond session validity.
- **Is session age considered anywhere?** No — confirmed absent.
- **Does session revocation exist?** No — F-08A, unchanged, not solved here.
- **Preserved distinctions, all confirmed**: No session ≠ observed session expiry ≠ locally active authenticated context ≠ proven currently-valid remote session — the codebase's own session model only ever operationalizes the last of these (a live Redis key), never distinguishing the others explicitly. Client Logout ≠ Server Session Revocation — re-confirmed unchanged (client `logout()` clears local state only).

---

## 12. Agent / QVAC Authority

**`isPartyOrAgent()` and the `agent:{label}:{participantId}` convention**: a pure string-shape comparison, zero cryptographic or database proof. Protected entirely by a **compile-time-only** `TrustedActorId` brand (identical to `string` at runtime) — a naming/review convention, not a runtime guard. The codebase's own audit comment confirms this was found, triaged, and deliberately downgraded from P1 to design debt specifically *because* every real call site today is verified safe by inspection, not because the mechanism itself proves anything.

**`WalletAgent` — never instantiated in any production code path.** Its `agentId` getter (the only producer of an `agent:...` string) is never called anywhere in `src/`. **The entire "agent execution authority" question is theoretical today, not live.**

**QVAC's authority chain — cleanly separated, confirmed by tracing every step**: `assessIntentRisk()`/`assessDisputeEvidence()` produce advisory objects only. `proposeAutoResolution()` only sets status/metadata, no fund movement. The one path that historically came close to treating recommendation as authority — auto-executing an uncontested `AUTO_PROPOSED` ruling via the arbiter's own slot — was found to violate INV-12 and was **removed**; `sweepExpiredAutoResolutions()` now only reverts to human review. **Confirmed, scoped specifically to discretionary disputed settlement: no QVAC-driven or automated disputed-settlement path was found that executes a discretionary ruling without the human arbiter's verified authority signature.** This is not a claim about all fund movements — cooperative (undisputed) settlement is authorized separately, by the seller's own standing role authority (§8, §18), with no signature involved at all.

**`buyer-agent.ts`/`seller-agent.ts`**: confirmed, by full file reading, to contain zero imports of or calls to `intentEngine`, `escrowService`, `tradeService`, or `liquidityService` — pure payload producers.

**Capability grants and agents**: no grant is ever issued to an agent identity; nothing in `open-agents/*.ts` checks a capability grant; capability cannot substitute for or bypass any economic-role check anywhere.

**Layer classification, per the mission's own framework, for what actually exists today**: `observe`/`infer`/`recommend`/`propose` are real and implemented (QVAC's risk/evidence assessment, intent/offer generation). `prepare` is real (a `TradeIntentPayload`/`GeneratedOffer` object). `execute` and `economically authorize` **do not exist for agents in any live code path** — every execute/authorize step requires a human-triggered call using the human's own authenticated identity or signature.

**Delegation, if code ever did let an agent execute under party authority**: would be proven only by the `agent:{label}:{participantId}` string convention — a trusted-caller assumption, not cryptographic proof. Stated precisely, per instruction, as a convention, not invented as a new model.

---

## 13. Capability vs. Authority

- **Does a capability grant confer authority, or merely enable a technically available action?** Confirmed: **strictly additive, never sufficient alone.** Every real call site (`escrow.service.ts`, `escrow-pending-tx.ts`) runs the economic-role check (`isSellerOrAssignedArbiter`/`isPartyOrAgent`) first, unconditionally; the capability check runs second and, when the feature flag is off (the shipped default), evaluates to nothing.
- **Who grants/revokes?** Self-service only, by explicit design (`capability.routes.ts`'s own header comment names this as a deliberate scope boundary, not a gap) — no cross-participant grant/revoke path exists.
- **Scoping**: `(grantedTo, capabilityName, scope[])` only — **no resource-instance id anywhere in the schema.** A grant means "this participant may in general produce event X," never "this participant may act on trade/escrow Y specifically." This is structural, not a current oversight — even with enforcement fully turned on, a capability grant could never substitute for a resource-specific check.
- **Can capability override economic-role authority?** **No, confirmed absent everywhere checked.**
- **Can a capability grant itself move funds?** **No** — it is one of two conjunctive gates, never sufficient alone.
- **Revocation timing**: immediate, no caching layer anywhere — but subject to ordinary check-then-act TOCTOU (§15.3), the same window any authorization pattern without a lock has, not a caching defect.
- **Where the current implementation genuinely conflates layers**: nowhere found — the separation (Technical Capability → Protocol Permission → Economic Authority → Settlement Eligibility) holds structurally throughout, precisely because capability is additive-only and non-resource-scoped.

---

## 14. Delegation Model

| Relationship | Classification | Basis |
|---|---|---|
| party → agent | (d) Trusted-caller/technical proxy, currently unexercised in production | `isPartyOrAgent`, no live producer |
| participant → QVAC | Not delegation — recommendation/data-generation only | `intent-engine.ts` never treats `agentId` as an authority signal |
| market → arbiter | (b) Role assignment, not delegation | `assign()`'s own comment: "never moves funds directly" |
| protocol → settlement-provider | Not economic delegation — a technical adapter | `escrow-providers.ts`, no independent authority |
| beneficiary → payout-destination | Not delegation — direct self-authorization | `PayoutAddress` registration is the beneficiary acting for themselves |
| signer → multisig execution | Not delegation — direct exercise of one's own key, but of **Execution Authority**, not a grant of **Economic Disposition Authority** | A PSBT signature is cryptographic proof of execution consent for that specific transaction; it is not, by itself, proof that the Economic Disposition Authority currently governing a disputed settlement is still valid, and it does not prove ruling-generation/appeal-round currency — see §10's finalize finding |
| dual approval (RFC-015) | (b)+(d) hybrid — composite/joint authorization | Two independent direct approvals required together, neither delegates to the other |

**True cryptographic/database-provable delegation (category a) exists in exactly one place**: `resolveDispute()`'s `AuthorityDecisionPayload` — and even this is arguably not "delegation" in the principal→agent sense so much as direct exercise of the arbiter's own already-established authority, proven cryptographically rather than merely asserted. **No relationship examined in this codebase is delegation in the fullest sense of "principal grants a distinguishable, provable, scoped authority to a delegate who then exercises it as the principal."** Note that PSBT signer participation (above) is Execution Authority, a distinct category from this delegation table's Economic Disposition Authority focus — it is real cryptographic consent for the individual signer's own execution act, not delegation of anyone else's authority, and not itself proof that the disposition it executes is still the current one.

---

## 15. Authority Freshness

| Mechanism | Classification |
|---|---|
| `resolveDispute()`'s identity check against a fresh row read (sequential calls) | `AUTHORITY_DEFINED` |
| Old-arbiter race, MULTISIG (atomic `updateMany` w/ `arbiterId`+`status`) | `AUTHORITY_WITH_TEMPORAL_DEPENDENCY` — closed in practice, incidentally, untested |
| Old-arbiter race, non-MULTISIG `applyRuling()` (unconditional `update()`) | `TEMPORAL_DOMAIN_REQUIRED` — no guard exists |
| `AuthorityDecisionPayload.appealRound` vs. current round at commit | `AUTHORITY_WITH_TEMPORAL_DEPENDENCY` — protected only indirectly via signature-over-stale-round failing; the cited explicit check is a no-op |
| Capability enforcement, initiate → finalize | `TEMPORAL_DOMAIN_REQUIRED` — checked once at creation only, by design of current code, never re-checked |
| Seller's standing DISPUTED-state authority vs. an in-flight ruling | `TEMPORAL_DOMAIN_REQUIRED` — the same already-known gap, not newly closed |
| `submitTransactionSignature()` finalize Economic Disposition Authority provenance | `UNDEFINED` — not temporal drift; Execution Authority (signer/signature) is checked, but structural absence of any Economic Disposition Authority / ruling-generation reference |
| `createEscrow()` trade-party gate | `AUTHORITY_DEFINED` |
| Arbiter-vs-destination | `AUTHORITY_DEFINED` |

---

## 16. Authority Revocation

| Mechanism | Removes authority, capability, state, or just metadata? |
|---|---|
| Session expiry (TTL) | Removes the *session*, not any specific action's authority — the participant regains full authority immediately on re-authentication |
| Capability revoke | Removes future `check()` passes immediately (no cache); does not retroactively stop an already-in-flight call that already passed `check()` |
| Arbiter reassignment (appeal) | Removes the old arbiter's authority for *sequential* calls; **does not structurally remove it for concurrent, already-in-flight calls on 4/5 rails** (§10, §15) |
| Appeal supersession | Same as above — data-model supersession (`previousRuling`), not an execution-time invalidation |
| Offer cancellation | Removes discoverability, not the owner's own continuing authority to further change the Offer's own status |
| Participant-agent relationship removal | **No such relationship exists to remove** — there is no durable agent-registration record anywhere |
| Payout-address replacement | Changes future resolution only; an already-initiated pending transaction's bound destination is immune (by design, a feature not a gap) |
| Key rotation | **Does not exist**, disclosed elsewhere (`DESTINATION_AUTHORITY_ARCHITECTURE.md`) as OpenIdentity-territory, carried forward unchanged |
| Dual-approval withdrawal | **No withdrawal mechanism found** — once approved, `EscrowReleaseApproval` rows were not found to have any delete/revoke path in the reviewed code |

F-08A and key-rotation deferrals carried forward exactly as previously frozen — not solved, not deepened beyond what's stated above.

---

## 17. Authority vs. Execution

For every major action, whether Sails separates (1) authority decision, (2) execution request, (3) execution mechanism, (4) economic outcome:

- **Arbitration**: cleanly separated for the *decision* step (signed payload = 1, `resolveDispute()`'s call = 2, provider dispatch = 3, on-chain/DB result = 4) — **but this separation collapses at the signature-collection finalize step specifically for Economic Disposition Authority**, where (1) is never referenced again and (2)-(4) proceed on (3)'s own historical artifact (the PSBT) plus a real, separate Execution Authority check (signer-list membership, collected signatures). This is the report's clearest instance of "Execution Authority is present" being silently treated as sufficient for "the currently valid Economic Disposition Authority is confirmed" — not because no check exists at that step, but because the check that exists (signer authorization) answers a different question than the one that matters for ruling currency.
- **Cooperative release/refund/split**: (1) and (2) are collapsed by design — the seller's own role IS the authority decision, exercised directly via the same call that requests execution. This is coherent, not a gap, for the undisputed case; it becomes the gap described in §10/§15 only when a Dispute exists and the seller's standing role-authority is never checked against it.
- **Client signature collection generally**: (1) happens once, at PSBT-build time (destination resolution, capability check); (3)/(4) happen later, asynchronously, with no re-verification of (1) — the general pattern behind the specific appeal-authority gap.

---

## 18. Cross-Object Authority Consistency

| # | Combination | Verdict |
|---|---|---|
| 1 | Trade party vs. Escrow party | Coherent by design — both derive from the same Trade row |
| 2 | Offer owner vs. Trade party | Coherent by design — fully independent authority domains, confirmed no interaction |
| 3 | Seller authority while Dispute open | **Authority violation** — carried forward from State & Lifecycle, re-confirmed from the authority angle: no Dispute-state dependency anywhere in `isSellerOrAssignedArbiter()` |
| 4 | Arbiter authority after appeal | **Prohibited (MULTISIG) / technically possible, untested (4 other rails)** — new, precise finding this mission |
| 5 | Previous arbiter authority after reassignment | Same as #4 |
| 6 | Session expires while Trade/Escrow active | Coherent by design — session expiry never touches object state, only gates the next call |
| 7 | Agent authority after principal state/session changes | Not applicable — no live agent-execution path exists to have this property |
| 8 | Payout address changes after authority decision | Coherent by design — binding-at-initiate-time is a deliberate, tested feature |
| 9 | Provider capability changes after user authorization | Not investigated as a distinct question this mission — no evidence of provider-level "capability" separate from `SettlementProvider` registration, which is a Policy/Eligibility-domain concept, not Authority |
| 10 | Capability revoked after prepared but before executed | **Technically possible, untested, authority violation by design gap** |
| 11 | Dispute resolved but settlement pending | **Authority violation** — the same standing seller authority from #3, at its most acute window |
| 12 | Multiple pending instructions, different authority generations | **Authority violation, confirmed structurally** — finalize has no authority-generation concept to check against at all |

---

## 19. Negative Authority

| Forbidden action | Prevented? | Evidence |
|---|---|---|
| Third party creates Escrow for someone else's Trade | **Yes, prohibited** | `escrow.service.ts:298-300` |
| Arbiter chooses payout destination | **Yes, prohibited on every rail**, re-verified against current code | `applyRuling()`'s destination params confirmed inert |
| Seller bypasses an open Dispute | **No — technically possible**, confirmed | §18 item 3 |
| Agent self-authorizes | Not applicable — no live agent-execution path | §12 |
| Provider decides economic beneficiary | **Yes, prohibited** | Destination always resolved from `PayoutAddress`, never provider-supplied |
| UI decides protocol permission | Not evidenced either way — out of this mission's code-reading scope (no server-side check reads UI state, confirmed) | — |
| Stale arbiter executes after supersession | **Prohibited for MULTISIG; technically possible for 4 other rails** | §18 items 4-5 |
| Unauthenticated caller causes persisted economic mutation | **No, prohibited**, confirmed across every `open-settlement`/`open-p2p` mutating route | Route enumeration, 100% `requireAuth` coverage within scope |
| Capability grant bypasses party membership | **Not applicable — no capability check exists in the one function tested (`markPaymentSent()`) for this to bypass** | `escrow.service.ts:540-556` |

---

## 20. Trusted-Caller Assumptions

| Location | Type | Classification |
|---|---|---|
| `isPartyOrAgent()` / `TrustedActorId` brand | Compile-time-only, no runtime proof | Hidden authority assumption, currently safe in practice (every real call site verified by inspection) |
| `applyRuling()` trusting `resolveDispute()`'s prior checks | Private method, single call site | **Safe internal boundary** — compiler-enforced, not merely conventional |
| `executeSettlement()`'s `sellerAgentId` field | Unguarded, unbranded `string`, no live caller populates it | **Architecture debt / latent hidden authority assumption** — the one place this exact pattern lacks even the compile-time protection used elsewhere |
| Sweeper `triggeredBy` constants (`'system:expiry-sweeper'`, etc.) | Hardcoded, not caller-influenced | Safe |
| Route-layer `participantId` derivation (all mutating routes) | `requireAuth`, same call frame | Safe internal boundary, uniformly confirmed |

**For future AI-oriented development, stated explicitly per the mission's own instruction**: a future executor must not mistake `isPartyOrAgent()`'s trusted-caller convention, or `executeSettlement()`'s `sellerAgentId` field, for protocol-level cryptographic authority. Neither is — both are safe only because of the current, specific, auditable set of call sites, not because of anything the mechanism itself proves.

---

## 21. Authority Evidence

| Mechanism | Durable evidence |
|---|---|
| Offer/Trade/Escrow role checks | DB role relation (a column equality check) |
| Session validity | Redis key existence — not independently durable/auditable after expiry |
| Dispute ruling execution (Economic Disposition Authority) | **Signed `AuthorityDecisionPayload`** — the only mechanism found with independently-verifiable, cryptographically signed durable evidence of a discretionary economic authorization |
| Script-committed arbiter | On-chain/DB-trigger-protected key commitment |
| Capability grant | DB record, immediately consistent |
| Payout address | DB record, snapshotted at bind time |
| Agent delegation | **No durable proof exists — trusted caller only, and currently unexercised** |
| PSBT signer participation (Execution Authority) | Collected signatures — real, durable evidence of execution consent for that transaction |
| Finalize-time Economic Disposition Authority (signature-collection rails) | **No durable proof referenced at finalize** — the collected signatures above prove signer participation, not that the ruling they execute is still the currently authoritative one |

**Authority exists ≠ authority use is independently provable**: sharply illustrated by the finalize gap — the *initial* ruling has strong, durable, independently-verifiable evidence (the signature); its eventual *use*, at finalize, has none referencing that evidence at all.

---

## 22. Central Authority Matrix

| Economic Action | Actor | Authority Type | Source | Scope | Delegable? | Freshness | Revocable? | Enforcement | Durable Evidence | Gap |
|---|---|---|---|---|---|---|---|---|---|---|
| Offer status change | Owner | Identity | `Offer.userId` | This offer | No | N/A | N/A | `updateOfferStatus()` | DB relation | A3 implementation delta (carried) |
| Trade creation | Non-owner participant | Identity | Session→participantId | This trade | No | N/A | N/A | `persistTrade()` | DB relation | None |
| Trade `PENDING→ACTIVE` (manual) | Either party | Role | Trade party | This trade | No | **None — no Escrow-lock check** | N/A | `updateStatus()` | DB relation | Authority/state mismatch (§7) |
| Escrow release/refund/split (cooperative) | Seller | Role | `isSellerOrAssignedArbiter` | This escrow | Theoretical (agent) | **None — no Dispute check** | N/A | `escrow-lifecycle.ts:115` | DB relation | **Seller bypasses open Dispute** |
| Dispute ruling execution | Assigned arbiter | **Cryptographic signature** | `AuthorityDecisionPayload` | This dispute/round | No | Bound at signing, incomplete at commit for 4/5 rails | Superseded, rail-dependent | `dispute.service.ts:606` | **Signed payload** | Old-arbiter race, non-MULTISIG |
| PSBT finalize | Any required signer | Cryptographic Execution Authority (signer-list membership + collected signature) — not Economic Disposition Authority | `EscrowPendingTransaction` | This pending tx | No | **Undefined for Economic Disposition Authority — no reference to `AuthorityDecisionPayload`/ruling generation** | N/A | `escrow-pending-tx.ts:293` | Signature list + collected signatures | **No check/reference to the currently valid Economic Disposition Authority / ruling authority generation** |
| Agent-triggered action | N/A (theoretical) | String convention | `agent:...` | N/A | N/A | N/A | N/A | N/A | None | Not live, not exploitable today |
| Capability-gated fund action | Same as underlying role | Additive | Capability grant | Actor-general, not resource-scoped | No | Live, uncached | Immediate for future checks | `checkFundMovementCapability` | DB record | None found (off by default) |

---

## 23. Contradictions & Ambiguities

1. **`INV-12` (Attributed Authority Integrity) is already frozen constitutional truth, but its own logic is not extended to the finalize step of signature-collection settlement** — a real contradiction between a stated invariant and an unaddressed execution path, not a new invariant needed.
2. **The code's own comment names `assertExecutionMatchesAuthorization` as the freshness guard against round-replay, but its only call site makes the check tautological** — a contradiction between documented intent and actual protective value.
3. **`TrustedActorId`'s compile-time-only protection pattern is applied to `isPartyOrAgent()` but not to `executeSettlement()`'s structurally identical `sellerAgentId` field** — an inconsistency in how the same known risk pattern is defended across the codebase.

---

## 24. Product Decisions Required

None newly surfaced by this mission. `Offer.PAUSED` (carried forward) remains the only open Product Decision touching an authority-adjacent object, and this mission confirms it is purely a lifecycle question, not an authority one.

---

## 25. Architecture Decisions Required

- **Whether/how PSBT finalize should reference ruling authority** — new, this mission. Directly informs, and is likely the same underlying question as, the already-carried-forward appeal/pending-instruction Architecture Decision — this mission's evidence should be read as that decision's authority-domain half.
- **Whether the non-MULTISIG old-arbiter race (§10, §18 items 4-5) needs an optimistic-concurrency guard analogous to MULTISIG's** — new, this mission.
- **Whether `executeSettlement()`'s `sellerAgentId` field should receive the same compile-time protection `isPartyOrAgent()` already has** — new, this mission, low urgency (no live exploitability found).

---

## 26. Implementation / Security / Institutional Debt

- **Seller bypasses open Dispute** — already registered (`docs/BACKLOG.md` item 44) as an implementation defect; this mission's evidence is additive confirmation from the authority angle, not a new registration.
- **Capability-vs-finalize gap (§18 item 10)** — new implementation debt, narrowly scoped: capability enforcement (when on) does not extend to signature-collection finalize.
- **`sellerAgentId` unguarded field** — new, low-severity architecture/security debt (§20).

---

## 27. Inputs to Temporal / Policy / Evidence Domains

- **Temporal/Concurrency inputs**: the non-MULTISIG old-arbiter race (§10, §15); the appeal-round freshness gap (§15); the capability initiate-vs-finalize gap (§13, §18 item 10); the standing-seller-authority-during-Dispute window (§18 items 3, 11) — all explicitly NOT solved here, queued for that future domain, consistent with the already-carried-forward Dispute/Escrow crash-window queuing from `docs/BACKLOG.md` item 44.
- **Policy/Eligibility input**: none found this mission requiring that domain specifically — capability's non-resource-scoping (§13) borders Policy/Eligibility but is fully an Authority-domain fact as evidenced (capability's *scope shape*, not a policy *decision*).
- **Evidence-domain input**: the finalize-step evidence gap (§21) — a candidate for that future domain's own inventory, not solved here.

---

## 28. Normative-Domain Assessment

**`MIXED`.** Authority is `EXPLICIT_AND_ENFORCED` for the overwhelming majority of actions (every DB-role check, the signed ruling mechanism) — genuinely strong, not merely assumed. It is `EXPLICIT_BUT_PARTIAL` for the signed-ruling mechanism specifically once appeal/finalize timing is considered. It is `TRUSTED_CALLER_ASSUMPTION` for the agent-delegation convention (currently safe only because unexercised) and for `executeSettlement()`'s unguarded field. No canonical single document currently states "here is the Sails authority model" — the truth is genuinely dispersed across `escrow-lifecycle.ts`, `arbitration-authority.ts`, `DESTINATION_AUTHORITY_ARCHITECTURE.md`, `PROTOCOL_INVARIANTS.md` (INV-01/INV-12), and this report.

**A new `AUTHORITY_MODEL_STANDARD.md` is NOT recommended.** The existing canonical homes (`PROTOCOL_INVARIANTS.md`'s INV-01/INV-12, `DESTINATION_AUTHORITY_ARCHITECTURE.md`) already state the correct principles precisely; what was missing was not a document but this inventory itself, cross-referencing what already exists and naming the specific places (finalize, non-MULTISIG appeal race) where an already-frozen principle (INV-12) has not yet been extended into code. Consolidation/cross-reference, not proliferation, is the right action — consistent with every prior mission's own conclusion in this chain.

---

## 29. Product/UI Consequences — Evidence Only

- If any UI ever exposes a "release funds" control to a seller, it can currently be exercised while a Dispute is open, with no UI signal distinguishing this from the safe case.
- If any UI displays "your appeal was successful, a new arbiter has been assigned," it would currently be showing a state that, for two rail types, does not yet guarantee the *old* ruling's pending fund movement has been stopped — a UI truth-gap directly downstream of §10/§18.
- No UI anywhere was found to imply an agent autonomously executes fund movements — consistent with the finding that no such path exists to misrepresent.
- No UI re-authorization/fresh-auth signal exists for any action beyond ordinary session validity — consistent with F-08A, not a new finding.

---

## 30. Beta Readiness Consequences

Candidate future scenarios for Issue #165's Failure & Recovery Campaign (Section E), **not added to that issue in this pass** — registered here only, per instruction:

- Seller attempts release while Dispute open (already listed in #165, `BLOCKED`).
- Appeal filed, then old arbiter's in-flight `resolveDispute()` call races the appeal (new candidate — not yet in #165).
- Old arbiter attempts `resolveDispute()` after sequential reassignment — expect clean rejection (new candidate, expected-PASS scenario).
- Capability revoked between `initiateRelease()` and `submitTransactionSignature()` — expect (currently, incorrectly) that finalize still succeeds (new candidate).
- Cross-client authority consistency between Sails Market and Satsails for the same Dispute/appeal state (new candidate, feeds Issue #165 Sections B/C).

---

## 31. Prior Frozen Findings Superseded, If Any

**None superseded.** This mission's findings sharpen, not contradict:

- The appeal/pending-instruction Architecture Decision (carried forward from `docs/BACKLOG.md` item 44) is now understood, from the authority angle, to be caused by finalize checking Execution Authority (signer participation) but having **no check or reference to the currently valid Economic Disposition Authority / ruling authority generation**, not merely an unaddressed invalidation step. This is additive precision, not a correction — the original finding's substance (an Architecture Decision is required) stands exactly as frozen.
- F-06 (Destination Authority) — re-verified against current code this mission, found still correctly superseded, not reopened.
- Offer A3, RFC-021 B2, F-05, F-07, F-08A — all carried forward unchanged, none touched by this mission's evidence.

---

## 32. Stranger Developer Test

A capable developer with no tribal knowledge could determine, from the code alone: who owns an Offer (a plain equality check, easy to find); who may act on a Trade/Escrow (DB-role comparisons, consistently named and located); that a Dispute ruling requires a real signature (well-commented, self-documenting). They would **not** easily determine, without this report or equivalent tracing: that `submitTransactionSignature()` checks signer Execution Authority but never re-checks the currently valid Economic Disposition Authority / ruling generation (nothing in that function's own code or comments says so — its absence is the finding); that the appeal-round freshness check is a no-op (the function name `assertExecutionMatchesAuthorization` actively suggests it does something it doesn't); that `WalletAgent` is dead code in production (only confirmable by a repo-wide grep, not from reading any one file). These three are genuine institutional findings by the Stranger Developer Test's own standard — not privileged knowledge, but knowledge that required this mission's systematic search to surface.

---

## Executor Self-Audit

1. *Did I confuse authentication with authority?* No — §11 explicitly separates what a session proves from what it authorizes, and §6-§10 each ask "why is this actor authorized" independently of "is this caller authenticated."
2. *Did I confuse capability with authority?* No — §13 explicitly confirms capability is additive-only and states this as a verified fact, not an assumption.
3. *Did I confuse economic role with key possession?* No — §22's matrix explicitly separates "role" mechanisms (DB comparison) from the signed `AuthorityDecisionPayload` mechanism and from PSBT signer-key possession (Execution Authority), never conflating any of the three.
4. *Did I infer authority from a UI button?* No — §29 explicitly states no server-side check reads UI state, and no finding in this report is sourced from UI behavior.
5. *Did I treat an internal trusted caller as protocol proof?* No — §20 explicitly classifies every trusted-caller pattern found, distinguishing "safe because compiler-enforced" from "hidden assumption," never treating either as cryptographic proof.
6. *Did I treat an agent as a principal when it is only a delegate?* No — §12/§14 explicitly conclude no code path currently lets an agent act as anything but a payload producer; the delegate/principal question is found moot in production, not resolved by assumption.
7. *Did I let an arbiter's economic disposition imply destination authority?* No — §9 explicitly re-verifies, against current code, that this collapse does not occur anywhere.
8. *Did I treat execution capability (or Execution Authority) as Economic Disposition Authority?* No — §17 and the R1-corrected §10/§14 are built specifically to keep these distinct, and name the one place (finalize) where the codebase itself lets a real Execution Authority check stand in for an unreferenced Economic Disposition Authority.
9. *Did I ignore authority revocation?* No — §16 inventories every revocation mechanism found and states precisely what each does and does not remove.
10. *Did I ignore stale authority after state changes?* No — §10, §15, §18 are built specifically around this question and found a real, evidenced gap.
11. *Did I pull Temporal/Concurrency decisions into this domain?* No — §27 explicitly routes freshness/race findings to that future domain rather than resolving them here.
12. *Did I pull Policy/Eligibility decisions into this domain?* No — §27 explicitly checked and found no Policy/Eligibility-domain resolution was made.
13. *Did I reopen frozen decisions without stronger evidence?* No — §31 explicitly confirms no frozen finding is superseded, only sharpened.
14. *Did I create a new authority abstraction where discovery was enough?* No — §28 explicitly recommends against a new Standard document.
15. *Did I assume signatures are sufficient without checking what exactly they bind?* No — §10/§15 traced `AuthorityDecisionPayload`'s exact fields and found the specific place (finalize) where the signature's binding, real as it is, never gets consulted again.

---

## 35. CTO Gate Summary

The authority model is stronger than a first read of "mostly string comparisons" would suggest — every comparison is fed by a genuinely trusted, authenticated identity (Authentication), and the only signed, independently verifiable discretionary economic authorization artifact found (`AuthorityDecisionPayload`, Economic Disposition Authority) is well-built. The gap is not in the mechanisms that exist, but in one mechanism's reach: at the finalize step for signature-collection settlement, on any rail, for any ruling, real Execution Authority is checked (signer participation, collected signatures) but the currently valid Economic Disposition Authority is never referenced or revalidated — which is the authority-domain root cause of the already-known appeal/pending-instruction Architecture Decision. Two new, narrower findings (the non-MULTISIG old-arbiter race, the capability-vs-finalize gap) are evidenced and queued to the same or a future Temporal/Concurrency pass. No frozen decision is touched. No new Standard is recommended.

---

STOP. Awaiting CTO Gate.
