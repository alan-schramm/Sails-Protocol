# State & Lifecycle Discovery — Evidence Report for CTO Gate

**Mission**: Sails State & Lifecycle Discovery & Institutionalization (discovery/institutionalization, not implementation).
**Baseline**: `main@0096c477dfa5764bdc02a2474b2067532d5ba1c3` (PR #163 merged/frozen — Offer A3 and RFC-021 B2 both institutionalized).
**Branch**: `mission/state-lifecycle-discovery`.
**Status**: Evidence only. No code, RFC, ADR, UI, test, or governance document was modified. No implementation, transition guard, status field, or new abstraction was created.

---

## 1. Executive Summary

Sails' stateful objects fall into three tiers of lifecycle rigor: **Escrow and Intent** have explicit, centrally-enforced, doubly-guarded transition maps; **Dispute** has an explicit enum with real but *scattered* per-method guards (no single map) and one vestigial value (`ARBITRATED`, never set anywhere); **Offer** has no transition guard at all, now carrying a frozen Product Decision (A3) its implementation has not yet caught up to.

The dominant discovery this mission adds, beyond re-confirming known object-level lifecycle facts, is at the **cross-object** level: two real, previously-undocumented contradictions were found by direct code tracing, not assumed from absence of tests. **(1) is not an open question — corrected after CTO Gate R1**: a seller can release escrowed funds while a Dispute the buyer raised is still open (`releaseFunds()`'s authorization check never queries the `Dispute` table at all), and this directly violates existing institutional truth — `docs/PROTOCOL_SPECIFICATION.md` §1.9 and `docs/BACKLOG.md`'s own dispute-persistence entry both independently describe opening a dispute as freezing the escrow via its `DISPUTED` transition. This is classified `IMPLEMENTATION DEFECT / CROSS-OBJECT LIFECYCLE VIOLATION` (§18), not a Product Decision. **(2) remains a genuine open Architecture Decision**, distinct in kind: for two of five escrow rail types (LIGHTNING_HODL, SAFE_GUARD_EVM), a Dispute appeal can produce two independently-valid, conflicting pending fund-movement instructions — the original ruling's unsigned transaction is never invalidated when `appeal()` draws a new arbiter, because `appeal()` never touches `Escrow`/`EscrowPendingTransaction` state at all. No existing document was found stating what should happen to a superseded ruling's pending transaction, so this one is left as an Architecture Decision (§17), not reclassified. Both are real, reachable code paths, not theoretical.

A third major finding **narrows** a prior open question rather than raising a new one: `EscrowPendingTransaction`'s lack of a status field (F-07) turns out to be **sufficiently defined** for its own existence-based lifecycle, backed by a dedicated, already-built reconciliation subsystem (`escrow-settlement-reconciliation.service.ts`) that resolves the real broadcast-ambiguity risk by checking chain truth before ever re-acting — but that subsystem is **explicitly MULTISIG-only**; every other rail "fails closed to manual review," per its own header comment. F-07 is refined, not resolved, and not contradicted.

No frozen Product or Governance Decision is reopened. Offer A3 and RFC-021 B2 are carried forward exactly as institutionalized.

---

## 2. Mission Baseline

- Fetched `origin/main`, confirmed at `0096c477dfa5764bdc02a2474b2067532d5ba1c3`.
- PR #163 confirmed merged (this is that merge commit).
- `docs/BACKLOG.md` item 43 confirmed present.
- `docs/PROJECT_CONTEXT.md` §2L confirmed to state both Offer A3 and RFC-021 B2 as DECIDED.
- Tree clean except the unrelated, already-flagged `.claude/worktrees/agent-a0485ab5b840843fb/` directory.
- Branch `mission/state-lifecycle-discovery` created fresh from this baseline.

---

## 3. Domain Boundary

Applied throughout, per the mission's own framework:

| Domain | Governs |
|---|---|
| Business Rules | What may happen, under what conditions |
| **State & Lifecycle (this mission)** | **How an object moves between meaningful states** |
| Authority | Who is allowed to cause the move |
| Policy/Eligibility | Under which policy conditions participation may occur |
| Temporal/Concurrency | Retries, races, ordering, expiry, duplicate delivery |
| Evidence | How a transition is proven to have occurred correctly |

Where a finding touches another domain (e.g., "the seller is *authorized* to release" is Authority; "release *while Dispute is open* is technically possible" is State & Lifecycle), only the lifecycle-mechanics half is asserted here; the authority/business-rule half is cited from prior missions, not re-derived.

---

## 4. Stateful Object Inventory

| Object | Enum location | Guard mechanism | Rigor |
|---|---|---|---|
| `Offer` | `prisma/schema.prisma:32-37` | None — ownership-only | ABSENT |
| `Trade` | `prisma/schema.prisma:39-45` | `MANUAL_TRADE_TRANSITIONS`, partial (client-triggered edges only) | PARTIAL |
| `Escrow` | `prisma/schema.prisma:56-64` | `VALID_TRANSITIONS`, explicit, doubly-enforced (map + atomic claim) | CANONICAL |
| `EscrowPendingTransaction` | `prisma/schema.prisma:2161-2226` | None (existence-based); real reconciliation subsystem covers the risk it could otherwise create | IMPLICIT, but backed by real recovery machinery |
| `Dispute` | `prisma/schema.prisma:1351-1358` | Scattered per-method guards, no single map; one vestigial enum value | PARTIAL |
| `Intent` | `common/types/intent.ts` + `state-machine.ts:28-41` | `VALID_TRANSITIONS`, explicit, single enforcement point | CANONICAL, with one latent internal inconsistency (§12.5) |
| `WdkTransferAttempt` | `prisma/schema.prisma:697-704` | Explicit, `wdk-execution-truth.ts` | CANONICAL |
| `EscrowFundingEvidence` | (append-only, no enum transitions, only "latest row wins") | Append-only repository, no update/delete method exists | CANONICAL for its own narrow question |
| Session (Redis) | `auth.ts` | TTL-only | Narrow scope, F-08A not re-litigated here |
| `CapabilityGrant` | `prisma/schema.prisma` (via `core/capability-registry.ts`) | Grant/revoke only, no richer lifecycle found — not investigated further per mission's explicit instruction not to become a Policy/Eligibility mission |

---

## 5. Offer Lifecycle

**Frozen Product truth, carried forward, not reopened**: a published `Offer` is one concrete publication instance of economic terms (A3, `docs/BACKLOG.md` item 43). `CANCELLED → ACTIVE` and `COMPLETED → ACTIVE` are not valid Product truth; re-entry requires a new publication.

**Current states**: `ACTIVE`, `PAUSED`, `COMPLETED`, `CANCELLED` (`schema.prisma:32-37`). Creation state: `ACTIVE` (default, `schema.prisma:155`).

**Implementation delta (registered by A3's own institutionalization, re-confirmed here, not newly discovered)**: `updateOfferStatus()` (`liquidity.service.ts:667-684`) has no transition-validity map — only an ownership check. `CANCELLED → ACTIVE` and `COMPLETED → ACTIVE` remain technically reachable through this method and the unguarded SDK passthrough, in direct contradiction of the now-frozen Product truth.

**`PAUSED` semantics — checked, found underspecified.** `PAUSED` is a real enum value, reachable via the same unguarded `updateOfferStatus()`, and is one of the two values (`ACTIVE`/`PAUSED`) the reference UI's own `canManage` gate (`Profile.tsx:242`) treats as manageable. No document or code anywhere defines what `PAUSED` is *for* distinctly from `CANCELLED` (e.g., "temporarily off-market, intending to return" vs. "permanently withdrawn") — both are equally reachable, equally unguarded, and `buildOfferWhere()`'s discovery query (`liquidity.service.ts:265-280`) excludes both identically (only `ACTIVE` is discoverable). Searched `docs/PROTOCOL_SPECIFICATION.md`, `docs/BUSINESS_RULES_DISCOVERY.md`, and `docs/PRE_STATE_LIFECYCLE_DECISION_GATE.md` for a `PAUSED`-specific rationale — none found. **This is a real, open sub-question A3 does not answer**: does pausing (as opposed to cancelling) legitimately survive as a *reactivatable* state under A3, since A3's own text names "publication instance" as terminal only for `CANCELLED`/`COMPLETED`, not `PAUSED`? This mission does not resolve it — flagged as a Product Decision candidate in §16.

**Completion — confirmed manual-only, never automatic** (cross-object agent, item 5): no event handler reacts to Trade/Escrow completion by writing `Offer.status`; the only writer is the direct, owner-triggered route.

**Relation to Trade — confirmed fully independent after creation** (cross-object agent, item 4): `persistTrade()` checks `Offer.status === 'ACTIVE'` only once, at creation; no code path re-reads it afterward for any purpose beyond a display projection. Offer and Trade genuinely cannot corrupt each other post-creation, in either direction.

**Relation to republication — no canonical mechanism exists locally.** The already-Accepted `ADR-001` `OfferEnvelope` design (real code: `offer-envelope.ts`) has its own, narrower two-value status enum (`ACTIVE`/`CANCELLED` only) and a separate revision mechanism for republication under a persistent logical identity — but A3's own institutionalization explicitly declined to import that machinery into the local model. Locally, "republication" today means nothing more than calling `createOffer()` again, a brand-new row with no linkage to the old one.

**State classification**: `ACTIVE` = `ACTIVE`; `PAUSED` = `UNKNOWN/UNDEFINED` (purpose unspecified); `COMPLETED`/`CANCELLED` = `TERMINAL_SUCCESS`/`TERMINAL_NEUTRAL` by Product truth (A3), but `IMPLEMENTATION_ONLY` reopenable in the current code — a direct, named contradiction between classification layers, carried into §15.

---

## 6. Trade Lifecycle

**States**: `PENDING`, `ACTIVE`, `COMPLETED`, `DISPUTED`, `CANCELLED` (`schema.prisma:39-45`). Creation state: `PENDING` (`trade.service.ts:59-149`).

**`MANUAL_TRADE_TRANSITIONS`** (`trade.service.ts:51-54`): `PENDING → [ACTIVE, CANCELLED]`, `ACTIVE → [CANCELLED]` — the only client-reachable edges. `COMPLETED`/`DISPUTED` are unreachable through this map by design (`updateStatus()`'s own type signature restricts input to `'ACTIVE'|'CANCELLED'`, `trade.service.ts:276`).

**Automatic transitions**, all via `common/events/handlers.ts`'s ownership map: `PENDING→ACTIVE` (via `settlement.escrow.locked`, `handlers.ts:246-268`), `ACTIVE→COMPLETED` (via `settlement.escrow.released`/`.split`, `handlers.ts:270-274,370-374`), `ACTIVE→CANCELLED` (via `settlement.escrow.refunded`, `handlers.ts:325-352`), `ACTIVE→DISPUTED` (via `settlement.escrow.disputed`).

**BR-TRADE-05, carried forward and re-confirmed**: `PENDING → ACTIVE` has a genuine dual path — reachable both automatically (escrow-lock reaction) and manually (direct client call to the same `MANUAL_TRADE_TRANSITIONS` map) — contrary to the file's own comment claiming only the two client-triggerable targets need the manual map "since every other transition is already driven automatically." This is a self-description drift in the code's own comment, not a behavioral contradiction (both paths converge on the same, valid target state).

**Business permission vs. state mechanics, explicitly distinguished**: the *business rule* "either party may cancel before completion" (Business Rules Discovery, BR-TRADE-03) is a separate fact from the *lifecycle mechanic* that `updateStatus()`'s target is checked only against `MANUAL_TRADE_TRANSITIONS[trade.status]`, with **no cross-object check against the linked Escrow's own status** — this is the mechanical root cause of §11's Contradiction #1.

**Cross-object finding (new precision, cross-object agent item 1)**: `Trade.CANCELLED` while the linked `Escrow` remains `FUNDS_LOCKED`/`PAYMENT_PENDING`/`DISPUTED` is **technically possible today** — `updateStatus()` performs zero Escrow lookup. The code's own "Missão 04 hardening" comment (`trade.service.ts:35-50`) already discloses this as an accepted data-integrity gap ("not a path to re-move funds... a real state-integrity/audit-trail corruption"), so it is a *known, disclosed* implementation limitation, not a silent one — but it had not previously been precisely re-confirmed at the exact mechanical level this mission establishes.

**State classification**: `PENDING` = `INITIAL`; `ACTIVE` = `ACTIVE`; `COMPLETED` = `TERMINAL_SUCCESS`, structurally enforced (unreachable input); `DISPUTED` = `INTERMEDIATE`/`WAITING_HUMAN` (feeds into Dispute's own graph); `CANCELLED` = `TERMINAL_NEUTRAL` (but see the audit-trail-integrity caveat above — terminal in the sense that no further Trade transition is possible, not in the sense that the underlying economic situation is settled).

---

## 7. Escrow Lifecycle

**States**: `CREATED`, `FUNDS_LOCKED`, `PAYMENT_PENDING`, `COMPLETED`, `DISPUTED`, `REFUNDED`, `SPLIT`, `EXPIRED` (`schema.prisma:56-64`).

**`VALID_TRANSITIONS`** (`escrow-lifecycle.ts:29-58`), verbatim:
```
CREATED:         [FUNDS_LOCKED, REFUNDED]
FUNDS_LOCKED:    [PAYMENT_PENDING, DISPUTED, REFUNDED, EXPIRED]
PAYMENT_PENDING: [COMPLETED, DISPUTED]
COMPLETED:       []
DISPUTED:        [COMPLETED, REFUNDED, SPLIT]
REFUNDED:        []
SPLIT:           []
EXPIRED:         [DISPUTED, REFUNDED]
```
Enforced twice: an in-memory pre-check (`assertEscrowTransition()`) and an atomic, DB-level compare-and-swap (`claimEscrowTransition()`) immediately before the write — closing the exact race a pre-check-only design would leave open.

**`EscrowPendingTransaction` — real lifecycle, precisely mapped this mission** (existence-based, three real deletion paths: normal completion `escrow-pending-tx.ts:430`; crash-recovery completion via `escrow-settlement-reconciliation.service.ts:213`; a narrow disputed-MULTISIG-only stale-artifact cleanup via `dispute-pending-reconciliation.ts:122,140`). **Genuinely new gap found**: no abandonment/cleanup mechanism exists for a *cooperative* (non-disputed) pending row with zero collected signatures — such a row permanently blocks any new `initiate*` call for that escrow until manually deleted from the database. This is an availability/UX gap (a stuck flow), not a fund-safety gap — no code path allows a double-broadcast or lost broadcast obligation (see §12.1 for the full crash-window analysis).

**Manual recovery paths**: dispute-raising (`raiseDispute()`, always available regardless of funding uncertainty); refund (exempted from funding-uncertainty gating by design, `escrow-lifecycle.ts:169-179`); expiry-recovery (`initiateExpiryRecovery()`, seller-only, from `EXPIRED`).

**Sweepers**: `sweepExpiredEscrows()` — two disjoint branches by rail type (Core-authoritative `EXPIRED` observation for signature-collection rails; automatic `refundFunds()` for legacy rails) — both real, tested, and (per Business Rules Discovery) wired.

**State classification**: `CREATED` = `INITIAL`; `FUNDS_LOCKED`/`PAYMENT_PENDING` = `ACTIVE`; `DISPUTED` = `WAITING_HUMAN`; `EXPIRED` = `RECOVERY` (per its own transition set, `[DISPUTED, REFUNDED]` — a recovery state, not terminal); `COMPLETED`/`REFUNDED`/`SPLIT` = `TERMINAL_SUCCESS`/`TERMINAL_NEUTRAL`, structurally enforced (empty transition arrays, doubly-guarded).

---

## 8. Dispute / Arbitration Lifecycle

**Carried forward, not re-litigated**: RFC-021 remains `IMPLEMENTED / TESTED / EVIDENCED / FORMALLY PROPOSED`, B2 correction pending (not Accepted, not Rejected). `RESOLVED → APPEALED` is a valid same-row transition; F-05's prior "misleading comment" framing remains superseded (row-cardinality vs. state-transition conflation, not a real contradiction).

**States**: `OPENED`, `EVIDENCE_SUBMITTED`, `ARBITRATED`, `RESOLVED`, `APPEALED`, `AUTO_PROPOSED` (`schema.prisma:1351-1358`).

**`ARBITRATED` is confirmed vestigial** — zero occurrences of `'ARBITRATED'` anywhere in `src/`'s live code; it exists only in the schema, the type union, and stale prose in `docs/P2P_PRODUCT_JOURNEY.md`. Already independently flagged by `docs/CROSS_LAYER_SEMANTIC_CONTRACT_AUDIT.md` (CSC-C02) as a UI-visibility gap, not newly discovered — but this mission independently confirms, at the code level, that no write path ever sets it.

**Real transition table** (function : line, trigger type):

| From → To | Function : line | Trigger |
|---|---|---|
| (none) → `OPENED` | `raiseDispute()` : 122-131 | Human (buyer/seller) |
| `OPENED`/`EVIDENCE_SUBMITTED` → `EVIDENCE_SUBMITTED` | `persistEvidence()` : 907-910 | Human (either party) |
| `OPENED`/`EVIDENCE_SUBMITTED` → `AUTO_PROPOSED` | `proposeAutoResolution()` : 960-969 | Internal (QVAC pipeline reaction, atomic claim) |
| `AUTO_PROPOSED` → `EVIDENCE_SUBMITTED` | `contestAutoResolution()` : 1010-1019 | Human (either party, before deadline) |
| `AUTO_PROPOSED` → `EVIDENCE_SUBMITTED` | `sweepExpiredAutoResolutions()` : 1075-1078 | Automatic sweep (conditionally wired, see below) |
| `OPENED`/`EVIDENCE_SUBMITTED`/`AUTO_PROPOSED` → `RESOLVED` | `applyRuling()`/`applyRulingCoreAuthoritative()` : 310-324 / via `dispute-outcome.ts` | Human (arbiter, signed) |
| `RESOLVED` → `APPEALED` | `appeal()` : 815-826 | Human (either trade party) |

**`RESOLVED` is not terminal — confirmed, no finality window exists.** No time-based or count-based cap on appeal was found anywhere (`appealDeadline`/`finality`/similar searched, zero hits); `appealRound` increments without an enforced ceiling. The only deterrent is escalating economic cost (`APPEAL_FEE_MULTIPLIER = 2`, doubling panel size per round). `RESOLVED` remains appealable indefinitely in principle.

**`AUTO_PROPOSED`'s full lifecycle — a third exit path found, not previously documented.** Beyond the two known exits (contest → `EVIDENCE_SUBMITTED`; expire-uncontested sweep → `EVIDENCE_SUBMITTED`), **a human arbiter may call `resolveDispute()` directly while status is `AUTO_PROPOSED`**, transitioning straight to `RESOLVED` — `resolveDispute()`'s own guard only excludes `RESOLVED` itself, not `AUTO_PROPOSED`/`OPENED`/`EVIDENCE_SUBMITTED`. This is a real, code-confirmed early-intervention path the "only two ways out" framing in this mission's own brief did not anticipate. Additionally, the automatic sweep requires **two independent, off-by-default environment flags** (`DISPUTE_AUTO_RESOLUTION_SWEEPER` and `QVAC_AUTO_RESOLUTION_ENABLED` equivalents) to run at all — a deployment enabling one without the other leaves `AUTO_PROPOSED` disputes that never auto-revert, relying entirely on a human party contesting or a human arbiter ruling directly.

**Arbiter assignment is fixed except via a new appeal round.** No recusal or mid-round reassignment mechanism exists anywhere (searched `recuse`/`reassign`, only hits are appeal's own arbiter-swap and unrelated access-control comments). For MULTISIG, arbiter identity is permanently fixed for the escrow's entire life (script-committed, and appeal is structurally blocked for this rail).

**Dispute/Escrow write ordering — the historical bug's fix confirmed current, but a real non-atomicity gap remains.** `applyRuling()` commits `Dispute.status = 'RESOLVED'` **first**, then calls the Escrow-side settlement action, with an explicit in-process revert-on-failure catch. This closes the *previously real* bug (funds moved before RESOLVED was set, racing `handlers.ts`'s dispute-aware reputation branch). It does **not** close a hard-crash window: if the process is killed between the Dispute commit and the Escrow call completing, a Dispute can be left `RESOLVED` with no corresponding Escrow transition — the revert-on-failure logic only runs for in-process exceptions, not a kill/crash between two non-transactional calls. MULTISIG's `applyRulingCoreAuthoritative()` uses a stronger three-phase commit-then-recheck-then-dispatch pattern with its own revert path, explicitly designed against this exact class of gap; the other rails rely on the simpler, non-atomic ordering.

**State classification**: `OPENED` = `INITIAL`; `EVIDENCE_SUBMITTED` = `ACTIVE`/`WAITING_HUMAN`; `AUTO_PROPOSED` = `WAITING_EXTERNAL`/`WAITING_HUMAN` (contestable by a human, resolvable by a human, or auto-reverted); `ARBITRATED` = `UNKNOWN/UNDEFINED` (vestigial, never entered); `RESOLVED` = `REOPENABLE` (explicitly not `TERMINAL_*` — this is the mission's own worked example); `APPEALED` = `INTERMEDIATE` (loops back into a fresh arbitration cycle).

---

## 9. Intent Lifecycle

**States** (12, `common/types/intent.ts`, transitions in `state-machine.ts:28-41`), verbatim:
```
CREATED:      [VALIDATED, CANCELLED, EXPIRED]
VALIDATED:    [COORDINATED, CANCELLED, EXPIRED]
COORDINATED:  [DISCOVERING, CANCELLED, EXPIRED]
DISCOVERING:  [MATCHED, EXPIRED, CANCELLED]
MATCHED:      [NEGOTIATING, CANCELLED]
NEGOTIATING:  [COMMITTED, CANCELLED]
COMMITTED:    [SETTLING, FAILED]
SETTLING:     [FULFILLED, FAILED]
FULFILLED:    []
EXPIRED:      []
CANCELLED:    []
FAILED:       []
```
This is the codebase's most rigorously explicit state machine — a single, centralized `assertValidTransition()` enforcement point, every real transition traced to a specific call site, no orphaned edges found.

**Creation**: `create()` synchronously drives `CREATED → VALIDATED → COORDINATED` before returning (three real, durable writes in one call). **Not atomic with Offer creation** — `persistOffer()` performs the Intent creation and the Offer row insert as two independently-durable writes, and the code's own comment states this explicitly, mitigated by idempotency-claim-based reconciliation on retry (`Intent.idempotencyClaimId`), not by a shared transaction.

**Terminality confirmed absolute**: all four terminal states (`FULFILLED`/`EXPIRED`/`CANCELLED`/`FAILED`) have empty transition arrays; `assertValidTransition()` throws unconditionally for any attempted transition out of them. No resurrection path exists anywhere — a new attempt after a terminal Intent always creates a brand-new Intent row, never reuses the old one.

**Authority model — explicitly trust-based, not itself enforced.** `transition()` performs no ownership/identity check of its own; legitimacy rests entirely on which code calls it, not on anything the function verifies. Every real call site found is internal and already-gated one level up (ownership-checked in `cancel()`, event-driven from an already-authorized domain event). This matches RFC-018's own documented design posture — a real, disclosed trust boundary, not a currently-exploited gap.

**Expiry is lazy, confirmed no sweeper exists.** `isExpired()` is evaluated only when something else touches the Intent; nothing proactively sweeps for expired Intents. An expired-but-unread Intent is purely inert — no downstream counting/blocking bug was found; the only real consequence is that a stale Intent simply sits in its last real status forever.

**A latent internal inconsistency, newly surfaced this mission**: `EXPIRABLE_STATES` (`state-machine.ts:51-53`) includes `COMMITTED`/`SETTLING`, but `VALID_TRANSITIONS` has no `EXPIRED` edge from either state. `isExpired()` would return `true` for a stale `COMMITTED`/`SETTLING` Intent, but any code path that then attempted `transition(id, 'EXPIRED', ...)` would be rejected by `assertValidTransition()` with an "Invalid Intent transition" error — a real, undiscovered-until-now design gap between two supposedly-authoritative lists in the same file. No test was found exercising this exact path, so its practical severity (does anything actually attempt this transition today) is unconfirmed — flagged as an implementation defect candidate in §18, not asserted as an active bug.

**Reuse/multiplicity**: `Offer.intentId` is DB-enforced 1:1 (`@unique`); `Trade.intentId` is genuinely N:1 by design — multiple Trades against one still-`ACTIVE` Offer legitimately share the same Intent, confirmed both by schema comment and by the actual `trade.service.ts` code path that copies `offer.intentId` onto every new Trade.

**Explicit vs. emergent, precisely**: the state graph itself is explicit and centrally enforced. Two things about it are emergent, not explicit, and both are self-acknowledged in code comments: (1) *when* an Intent reaches `EXPIRED` depends entirely on an unrelated external event happening to touch it — the state is explicit, its trigger timing is opportunistic; (2) *authorization* to call `transition()` is a trust convention among callers, not a codified rule.

**State classification**: `CREATED` = `INITIAL`; `VALIDATED`/`COORDINATED`/`DISCOVERING`/`MATCHED`/`NEGOTIATING` = `INTERMEDIATE`; `COMMITTED`/`SETTLING` = `WAITING_EXTERNAL`; `FULFILLED` = `TERMINAL_SUCCESS`; `CANCELLED`/`EXPIRED` = `TERMINAL_NEUTRAL`; `FAILED` = `TERMINAL_FAILURE`.

---

## 10. Authentication/Session Lifecycle — Narrow

Scope strictly limited to lifecycle mechanics necessary for the cross-object analysis in §11; **F-08A is not re-litigated, solved, or deepened here.**

- **Challenge creation/consumption**: `issueChallenge()` writes a Redis key with `challengeTtlSeconds` TTL; `verifySignedChallenge()` verifies and immediately deletes it (one-time use) before issuing a session token.
- **Session creation**: a random token written to Redis (`SESSION_PREFIX`), TTL = `sessionTtlSeconds` (default 3600s).
- **Natural expiry**: TTL-only — no other mechanism ends a session.
- **Absence of explicit revocation**: confirmed, unchanged from prior missions — not re-derived here.

**Lifecycle-relevant fact newly confirmed this mission (cross-object agent, item 6)**: session expiry **never** touches a Trade/Escrow object's own persisted state. Every authorization check on Trade/Escrow objects is keyed to the durable `participantId` (`User.id`), never a session token — the session is consumed once, at the HTTP auth layer, to produce a trusted `participantId`, and nothing downstream re-validates session freshness. Session expiry can only block the *next* authenticated call; it cannot alter an in-flight or completed Trade/Escrow.

---

## 11. Cross-Object Lifecycle Consistency

All eight combinations investigated by direct code tracing (cross-object agent), verdicts below. This is the mission's most consequential section.

| # | Combination | Verdict | Key evidence |
|---|---|---|---|
| 1 | Trade terminal (CANCELLED) but Escrow non-terminal | **Technically possible, disclosed** | `updateStatus()` performs zero Escrow lookup; the code's own "Missão 04" comment already names this as a known audit-trail-integrity gap, not a fund-safety one |
| 2 | Escrow released while Dispute open | **`IMPLEMENTATION DEFECT / CROSS-OBJECT LIFECYCLE VIOLATION` — corrected after CTO Gate R1.** Existing institutional truth was found and searched for explicitly; this is not an open question. | `releaseFunds()`'s `isSellerOrAssignedArbiter()` (`escrow-lifecycle.ts:115-119`) returns `true` unconditionally for the seller — `Dispute` is queried only on the arbiter-check branch, never on the seller branch — directly violating `docs/PROTOCOL_SPECIFICATION.md` §1.9's own text: raising a dispute "**freeze[s] via the existing Escrow `DISPUTED` transition**," independently corroborated by `docs/BACKLOG.md`'s dispute-persistence entry ("`dispute.service.ts` (**freeze via existing `escrowService.openDispute()`**...)"). See §16/§18 for the full evidence chain and corrected classification. |
| 3 | Dispute appealed after settlement | **Split by rail**: impossible (MULTISIG, appeal structurally blocked); no window (MOCK/WDK_USDT_EVM, synchronous same-call-stack settlement); **real** for LIGHTNING_HODL/SAFE_GUARD_EVM — the original ruling's pending signed transaction is never invalidated by `appeal()`, which never touches Escrow state |
| 4 | Offer cancelled while Trade active | **Invalid concern — fully independent, confirmed** | Only two `Offer.status` read sites in the whole codebase (creation-time check, display projection); no cascade exists |
| 5 | Offer completed while multiple Trades exist | **Confirmed fully manual, no auto-transition** | `updateOfferStatus()` is the only writer, always owner-triggered; no handler reacts to Trade completion |
| 6 | Session expires while Trade/Escrow active | **Confirmed no effect on object state** | See §10 |
| 7 | External settlement succeeds, local status uncommitted | **Reconciled for MULTISIG only; every other rail "fails closed to manual review" by the reconciliation service's own explicit code comment** | `escrow-settlement-reconciliation.service.ts:333-343` |
| 8 | External outcome UNKNOWN collapsed into FAILED | **Invalid concern — kept correctly, structurally distinct everywhere** | `SUBMISSION_UNKNOWN` is its own switch case, always throws for manual reconciliation, never silently retried as if FAILED |

**Findings #2 and #3 are the most severe new discoveries in this mission.** Neither is a theoretical crash-window or a documentation gap — both are reachable through ordinary, already-implemented HTTP routes, under ordinary (non-crash) operation. Neither is assessed here as to whether it constitutes an urgent defect requiring immediate action — that determination belongs to §18 (Implementation Defects/Debt) and ultimately the CTO — but their reachability is fully evidenced, not inferred from absence of a test.

---

## 12. Crash / Restart / Unknown Outcome Analysis

### 12.1 `EscrowPendingTransaction` creation window
Last durable fact before any (read-only) external call: none required — PSBT-building I/O (UTXO/fee-rate lookups) happens before the DB write but has no side effect. After the DB write commits, the row is a durable, uniquely-keyed (`@@unique` on `escrowId`), fully resumable artifact — any client can fetch `unsignedPsbtBase64`/`requiredSigners` and continue signing. **Classification: sufficiently defined.** The one real gap is availability-only: no staleness/cleanup mechanism exists for an abandoned, zero-signature cooperative row (it blocks new `initiate*` calls for that escrow until manually deleted) — **merely undocumented/unbuilt tooling**, not unsafe.

### 12.2 `EscrowPendingTransaction` delete-on-completion window
Exact ordering confirmed: atomic status claim → provider broadcast → `txReleaseId` persistence → `EscrowEvent` idempotency-claimed write → **only then** row deletion. Three sub-windows, each with a confirmed recovery mechanism:
- **Claim committed, broadcast not yet attempted/succeeded** ("Estado A"): `reconcilePendingSettlement()` rebuilds the exact transaction from persisted PSBT+signatures, checks the chain, broadcasts once if genuinely never sent.
- **Broadcast succeeded, not yet persisted locally** ("Estado B"): the same function checks the chain first, finds the tx already exists, converges **without re-broadcasting** — the exact double-spend risk is closed by asking the chain, never trusting local state.
- **`txReleaseId` persisted, row not yet deleted**: `Escrow.status` is already terminal; `VALID_TRANSITIONS`'s own empty array for terminal states makes any retried write fail immediately and loudly (no self-transition on terminal status) — this is closed by a *different*, pre-existing invariant, not a purpose-built fix for this exact window, but closed nonetheless. Orphaned rows are separately caught by a dedicated PASS 2 sweep.

**Classification: sufficiently defined, non-trivially so** — a real, documented reconciliation subsystem exists, not merely an accidentally-safe sequence of operations.

### 12.3 Dispute/Escrow settlement crash window (§8)
Between the Dispute→`RESOLVED` commit and the Escrow settlement call completing, for non-MULTISIG rails: a hard process kill (not merely an exception) could leave a `RESOLVED` Dispute with no corresponding Escrow transition. **Classification: ambiguous** — the in-process revert-on-failure logic handles ordinary exceptions correctly; a genuine crash between two non-transactional Prisma calls is not covered by anything found in this mission's evidence, and no reconciliation-on-restart mechanism analogous to `escrow-settlement-reconciliation.service.ts` was found scoped to this specific pairing.

### 12.4 Rail-scoped reconciliation gap (§11, item 7)
`escrow-settlement-reconciliation.service.ts` explicitly, in its own code comment, limits automated crash-recovery reconciliation to MULTISIG — "the only rail with an authoritative, independently-queryable truth source... every other rail fails closed [to manual review]." **Classification: legitimate deferral, explicitly disclosed** — not ambiguous or unsafe, because the code names its own boundary rather than silently assuming coverage it doesn't have; but it is a real, current gap for LIGHTNING_HODL, SAFE_GUARD_EVM, MOCK, and WDK_USDT_EVM specifically for this exact scenario.

---

## 13. Terminality Matrix

| Object.State | Structurally terminal? | Terminal by Product truth? | Terminal by implementation only? | Reopenable via another path? | Does another object keep evolving? |
|---|---|---|---|---|---|
| `Offer.CANCELLED`/`COMPLETED` | No (no guard) | **Yes (A3, frozen)** | N/A — currently reopenable in code, contradicting Product truth | Yes, today (implementation delta) | Trade/Escrow already fully independent regardless |
| `Trade.COMPLETED` | Yes (unreachable client input) | Yes | Yes | No | Escrow already terminal by the time this fires |
| `Trade.CANCELLED` | Yes, for further Trade transitions | Ambiguous — see §11 item 1 | Yes, for Trade itself | No (Trade side) | **Yes — linked Escrow may remain fully active**, the core of Contradiction #1 |
| `Escrow.COMPLETED`/`REFUNDED`/`SPLIT` | Yes (empty transition array, doubly enforced) | Yes | Yes | No | Dispute may still evolve afterward (appeal) — see below |
| `Escrow.EXPIRED` | **No** — has real outbound edges (`[DISPUTED, REFUNDED]`) | No | No | Yes, structurally | N/A — this is a recovery state, not terminal, despite its name |
| `Dispute.RESOLVED` | **No — the mission's own worked example.** Appealable indefinitely | No | No | **Yes, always, by design (appeal), cost-gated only** | Escrow's own settlement may have already fully executed and become irreversible even while Dispute keeps evolving — Contradiction #3 |
| `Dispute.ARBITRATED` | N/A | N/A | N/A | N/A | **Vestigial — never entered, not a real terminality question** |
| `Intent.FULFILLED`/`EXPIRED`/`CANCELLED`/`FAILED` | Yes, absolutely (empty arrays, single enforcement point, no resurrection path found) | Yes | Yes | No | N/A |

Do not use enum naming as proof of terminality: `EXPIRED` (Escrow) and `RESOLVED` (Dispute) both read as final and are not; `COMPLETED`/`CANCELLED` (Offer) read as final and are Product-decided to be so but are not yet implementation-enforced.

---

## 14. Recovery Semantics

| Mechanism | Recovers | Object |
|---|---|---|
| `sweepExpiredEscrows()` | Operation (fund return) or state observation (EXPIRED marking) | Escrow |
| `reconcilePendingSettlement()` / `escrow-settlement-reconciliation.service.ts` PASS 0/1/2 | Operation (correct broadcast state) and state (Escrow status convergence) | Escrow / `EscrowPendingTransaction` |
| `raiseDispute()` / `initiateExpiryRecovery()` | User workflow (a path forward for a stuck trade) | Escrow, via Dispute |
| `appeal()` | Economic outcome (a chance to reverse an incorrect ruling) — explicitly NOT state recovery from a crash, a distinct kind of "recovery" from the others in this table | Dispute |
| `contestAutoResolution()` / `sweepExpiredAutoResolutions()` | User workflow (return to human review) | Dispute |
| `multisig-funding-reorg-sweep.ts` | State (funding-trustworthiness re-assessment after a reorg) | `EscrowFundingEvidence` |
| `wdk-execution-truth.ts`'s `SUBMISSION_UNKNOWN` handling | Explicitly **none automatically** — by design, requires manual/operator reconciliation | `WdkTransferAttempt` |
| Session TTL expiry + re-authentication | User workflow only (never object state) | Session |

These four kinds (state, operation, user workflow, economic outcome) are not interchangeable, per the mission's own instruction — `appeal()` in particular recovers an *economic outcome* the parties disagree with, not a crashed or ambiguous *state*, and should not be read as the same category of "recovery" as `reconcilePendingSettlement()`.

---

## 15. Contradictions & Ambiguities

Real contradictions only, distinguished from different abstraction levels:

1. **Offer's Product-decided terminality (A3) vs. its implementation's continued permissiveness** — a genuine, already-named (§18) implementation delta, not a design contradiction; A3 itself anticipated and registered this gap at institutionalization time.
2. **Escrow release with no Dispute-open check** (§11 item 2) — a real contradiction between `docs/PROTOCOL_SPECIFICATION.md` §1.9's own stated design (dispute-opening "freeze[s] via the existing Escrow `DISPUTED` transition," independently corroborated by `docs/BACKLOG.md`) and the Lifecycle-level fact that `isSellerOrAssignedArbiter()` enforces no such freeze. Reclassified `IMPLEMENTATION DEFECT / CROSS-OBJECT LIFECYCLE VIOLATION` after CTO Gate R1 (§18) — not merely a Business-Rules-level expectation.
3. **Appeal leaving a prior ruling's pending transaction live** (§11 item 3, LIGHTNING_HODL/SAFE_GUARD_EVM only) — a real contradiction between Dispute's own state graph (which treats the ruling as superseded once appealed) and Escrow's state graph (which has no notion that the ruling backing its pending transaction was ever appealed).
4. **`EXPIRABLE_STATES` vs. `VALID_TRANSITIONS`** (Intent, §9) — an internal contradiction between two lists in the same file, not yet confirmed to be reachable in practice.
5. **Trade's own comment vs. its own transition table** (BR-TRADE-05, carried forward) — a documentation-drift contradiction, not a behavioral one.

Not contradictions, re-confirmed: Offer/Trade independence (§11 item 4); Offer/multiple-Trades (§11 item 5); session/object-state independence (§11 item 6); `SUBMISSION_UNKNOWN` handling (§11 item 8).

---

## 16. Product Decisions Required

- **`Offer.PAUSED`'s intended semantics** (§5) — is it a reactivatable state distinct from A3's terminal `CANCELLED`/`COMPLETED`, or should it be folded into the same terminal treatment? Not resolved by A3's own text, which never mentions `PAUSED`.

**Corrected after CTO Gate R1 — removed from this section.** The "should Escrow release check for an open Dispute" question was originally placed here as an open Product Decision. Direct search (per CTO Gate R1's own instruction) found existing institutional truth already answers it — see §18, where this finding is now correctly classified as an Implementation Defect / Cross-Object Lifecycle Violation, not a Product Decision.

---

## 17. Architecture Decisions Required

- **Whether appeal (for LIGHTNING_HODL/SAFE_GUARD_EVM) should invalidate or hold the original ruling's pending transaction** (§11 item 3) — a real architecture question: should `appeal()` be required to touch `EscrowPendingTransaction`/`Escrow` state at all, given it currently doesn't for any rail?
- **Whether the Dispute/Escrow settlement write pair should be made atomic, or given a restart-reconciliation path analogous to `escrow-settlement-reconciliation.service.ts`** (§12.3) — currently covered only by in-process exception handling, not crash-safe.
- **Whether the rail-scoped reconciliation gap (§12.4, §11 item 7) should be extended beyond MULTISIG** — already disclosed as a known boundary by the code itself, not a new discovery, but worth a deliberate scoping decision now that this mission has re-confirmed its exact reach.

---

## 18. Implementation Defects / Debt

- **Escrow release does not honor the Dispute-open freeze — `IMPLEMENTATION DEFECT / CROSS-OBJECT LIFECYCLE VIOLATION`, corrected after CTO Gate R1.** Existing institutional truth, searched for explicitly rather than assumed absent: `docs/PROTOCOL_SPECIFICATION.md` §1.9 (the canonical, frozen v1.0 protocol spec) states directly, in its own implementation note on the Dispute primitive: *"dispute-flow work, post-RFC-011... `modules/open-settlement/dispute.service.ts` implements `raiseDispute()`/`resolveDispute()` — **freeze via the existing Escrow `DISPUTED` transition**."* This is independently corroborated, in different words but the same claim, by `docs/BACKLOG.md`'s own dispute-persistence entry: *"`dispute.service.ts` (**freeze via existing `escrowService.openDispute()`**, arbiter assignment, pubsub notification..., ruling → release/refund mapping)."* Both documents describe the `DISPUTED` transition itself as a freeze mechanism for the escrow. The actual authorization code does not implement this: `isSellerOrAssignedArbiter()` (`escrow-lifecycle.ts:115-119`) returns `true` immediately for the seller (or seller's agent) with **zero query of the `Dispute` table** — `Dispute` is only consulted on the separate arbiter-check branch, reached only after the seller check has already failed. The function's own header comment (`escrow-lifecycle.ts:106-114`) describes the seller path as "the normal path," with no carve-out for an open dispute. **Searched and confirmed absent**: no Issue, no `docs/BACKLOG.md` entry, no `docs/ROADMAP.md` entry, and no test (`tests/escrowReleaseControls.test.ts`, `tests/disputeFlow.test.ts`) exercises or tracks this specific gap between the documented "freeze" intent and the actual unconditional seller authorization. This is not a new Product Decision — the freeze was already decided; the implementation does not yet enforce it. Not fixed by this mission.
- **Offer transition guard absent, contradicting A3** — already registered (`docs/BACKLOG.md` item 43), not newly discovered, re-confirmed here as still unfixed. Not fixed by this mission.
- **`Trade.CANCELLED` possible while Escrow non-terminal** (§11 item 1) — disclosed by the code's own comment as accepted debt, re-confirmed.
- **`EscrowPendingTransaction` cooperative-path abandonment gap** (§12.1) — newly found this mission; availability-only, not fund-safety.
- **Intent's `EXPIRABLE_STATES`/`VALID_TRANSITIONS` inconsistency** (§9) — newly found; unconfirmed whether it is ever actually triggered in practice (no test found exercising it).
- **`ARBITRATED` enum value, vestigial** — already flagged by `CROSS_LAYER_SEMANTIC_CONTRACT_AUDIT.md` (CSC-C02) for its UI consequence; this mission independently confirms the code-level fact (never written anywhere).

---

## 19. Legitimate Deferrals

- The MULTISIG-only scope of `escrow-settlement-reconciliation.service.ts` (§12.4) — explicitly disclosed in the code's own comment as a deliberate boundary, not an oversight.
- The two-flag-gated, off-by-default QVAC auto-resolution sweep (§8) — consistent with every other automated-money-action flag in this codebase defaulting off, per established precedent.
- `EscrowPendingTransaction`'s existence-based (rather than enum-based) lifecycle for its *own* creation/deletion mechanics (§12.1/12.2) — sufficiently defined by real reconciliation machinery; not a deferral needing correction, included here for completeness since F-07 originally framed it as an open question.

---

## 20. Documentation Drift

- `trade.service.ts`'s own comment overstating which transitions are "already driven automatically" (BR-TRADE-05, carried forward, not newly found).
- `docs/P2P_PRODUCT_JOURNEY.md`'s stale prose referencing `ARBITRATED` as if live.
- No other new documentation-drift instance was found distinct from the implementation-defect findings above (the Offer/A3 gap and the Intent list inconsistency are implementation/design facts, not merely stale prose, and are classified under §18 instead).

---

## 21. State & Lifecycle Normative-Domain Assessment

**Mixed by subdomain, not a single answer:**

- **Escrow, Intent**: `CANONICAL_HOME_EXISTS` — real, explicit, doubly-or-singly-enforced transition maps in code, cross-referenced by `PROTOCOL_INVARIANTS.md` for the principles they satisfy.
- **Dispute**: `PRESENT_BUT_DISPERSED` — a real enum and real per-method guards exist, but no single canonical transition map, and RFC-021's own governance status (B2) means even its normative text is mid-correction.
- **Offer**: `IMPLICIT` shading into `ABSENT` — a Product Decision (A3) now exists, but no canonical *implementation-facing* lifecycle document exists anywhere, and the code itself has no guard at all.
- **Cross-object lifecycle consistency coverage** (§11): **`ABSENT` within the State & Lifecycle normative domain — corrected after CTO Gate R1, not a ninth normative domain.** No document anywhere previously stated any of the eight combinations' intended behavior; this report is the first place any of them is written down. This coverage gap may later interact with Authority (who is allowed to cause a cross-object-inconsistent transition), Temporal/Concurrency (races that produce the same inconsistency), and Evidence (proving which of two disagreeing objects is authoritative) — but it is not itself a separate domain alongside those eight; it is a property State & Lifecycle itself has not yet fully addressed.

**Recommended minimum institutional action**: do **not** create `STATE_AND_LIFECYCLE_STANDARD.md`. The canonical homes that already exist (Escrow's `VALID_TRANSITIONS` + inline comments, Intent's `state-machine.ts`, `PROTOCOL_INVARIANTS.md`'s relevant invariants) are sufficient and well-maintained for the objects that have them. What is missing is not a document but **decisions** (§16/§17) and **backlog visibility** for the two new cross-object contradictions (§11 items 2 and 3) — the same pattern every prior mission in this chain has found: the gap is in decision-sequencing and cross-referencing, not in the absence of places for truth to live.

---

## 22. Product/UI Consequences — Evidence Only

- If any future UI ever exposes a "release funds" action to a seller, it can currently be exercised while a Dispute the buyer raised is open, with no UI signal that this is even possible — a real consequence of §11 item 2, recorded, not designed around.
- `ARBITRATED`'s vestigial status (already known via CSC-C02) means any UI rendering it as a distinct visual state is rendering something that never occurs — recorded, not fixed.
- `Dispute.RESOLVED` being non-terminal means any UI treating it as a final state (e.g., hiding an "appeal" action once RESOLVED is reached) would misrepresent the object's real lifecycle — a consequence for whoever eventually reviews Product/UI, not designed here.
- `Offer.PAUSED`'s undefined semantics mean any UI copy describing what "pausing" does versus "cancelling" is currently making a claim the backend does not itself define.

No UI change is proposed or implied beyond recording these.

---

## 23. Prior Frozen Findings Superseded By New Evidence

**None of Offer A3, RFC-021 B2, F-05, or F-06 are superseded, reopened, or altered by this mission.** One prior finding is **refined** (not superseded — the original claim remains technically accurate, this mission adds precision that changes its practical weight):

| Prior finding | New evidence | Current interpretation |
|---|---|---|
| F-07 (`EscrowPendingTransaction` has no status field) | This mission's full crash-window trace (§12.1/12.2), the discovery of `escrow-settlement-reconciliation.service.ts`'s PASS 0/1/2 subsystem | **Refined, not superseded.** The literal claim ("no status field exists") remains true. Its implied risk is now shown to be substantially mitigated by a real, dedicated reconciliation subsystem for the existence-based lifecycle's own crash windows — but that subsystem is explicitly MULTISIG-only, so the refined, current framing is: "the row's own create/delete lifecycle is sufficiently defined; the broader question of rail-scoped reconciliation coverage (§12.4) is the part that remains genuinely open," not "no status field, therefore ambiguous." |

BR-TRADE-05 is carried forward and re-confirmed unchanged, not refined.

---

## 24. Stranger Developer Test

- **Escrow/Intent**: a stranger reading `escrow-lifecycle.ts`/`state-machine.ts` directly would reconstruct the real state graphs accurately and quickly — both are genuinely self-documenting.
- **Dispute**: a stranger would need to read `dispute.service.ts` end-to-end (no single map) to learn the real graph, and would likely be misled by the `ARBITRATED` enum value into thinking it's live — a real Stranger Developer Test failure this mission's own investigation had to actively work around by grepping for actual writes, not trusting the enum.
- **Offer**: a stranger reading the code alone would conclude Offer has no lifecycle discipline at all; a stranger who also read `docs/BACKLOG.md` item 43 would learn the Product truth (A3) but would find no code artifact reflecting it — the decision and the implementation are in two different places with nothing connecting them from the code side.
- **Cross-object combinations** (§11): none of the eight questions this section answers could have been answered by a stranger reading any single existing document — each required tracing multiple files' real call chains. This report is the first artifact where a stranger could learn any of them without doing that tracing themselves.

---

## 25. Executor Self-Audit

1. *Did I infer lifecycle truth from enum names?* No — `Dispute.RESOLVED` and `Escrow.EXPIRED` are both explicitly treated as non-terminal despite their naming (§13), and `ARBITRATED`'s vestigial status was confirmed by grepping real writes, not assumed from its presence in the enum.
2. *Did I confuse Business Rules with state transitions?* No — §11 item 2's finding is stated as a lifecycle-mechanics fact (no Dispute check exists in the transition path), with the separate Business-Rules question ("should it check") explicitly deferred to §16, not answered here.
3. *Did I confuse authority with transition existence?* No — Intent's `transition()` authority model (§9) is explicitly described as a trust convention distinct from the transition graph's own validity enforcement, matching the mission's own "State ≠ Authority" instruction.
4. *Did I call an external failure a failed economic outcome without proof?* No — §11 item 8 and §12 throughout distinguish `SUBMISSION_UNKNOWN` from `FAILED` explicitly, and no crash window in §12 is asserted to have caused an actual loss; each is scoped to "what is unknowable," not "what failed."
5. *Did I collapse UNKNOWN into FAILED?* No — confirmed the opposite is true in the code (§11 item 8) and did not do so myself anywhere in this report.
6. *Did I assume restart safety because retries exist?* No — §12.3's Dispute/Escrow crash window is explicitly classified "ambiguous," not assumed safe merely because a retry/revert mechanism exists for the non-crash case.
7. *Did I assume a persisted row fully captures external process state?* No — §12.1/12.2 explicitly distinguish the persisted `EscrowPendingTransaction` row from the actual on-chain broadcast state, and credit the reconciliation subsystem specifically for checking the latter rather than trusting the former.
8. *Did I infer terminality from naming?* No — see item 1 above; §13 is built specifically to counter this.
9. *Did I reopen Offer A3?* No — §5 states A3 as frozen input, investigates only what A3 leaves open (`PAUSED`, the implementation delta already registered elsewhere), and does not revisit the A3 decision itself.
10. *Did I accidentally treat RFC-021 as Accepted?* No — §8's opening line restates B2 exactly as frozen; no D-item's normative status is altered.
11. *Did I create architecture where discovery was enough?* No — §21 explicitly recommends against a new Standard document and against any new abstraction; no state-machine framework, event-sourcing layer, or generic lifecycle engine is proposed anywhere.
12. *Did I search adjacent/differently-named mechanisms?* Yes — `EscrowFundingEvidence` and `WdkTransferAttempt` were both actively compared against `EscrowPendingTransaction`'s own problem, per the explicit root-cause lesson from `docs/BACKLOG.md` item 41 ("search the subject matter, not just prior names").
13. *Did I inspect tests instead of trusting comments?* Partially — this mission relied on direct code tracing (function bodies, call sites) rather than test files as primary evidence throughout, which is a stronger standard than trusting comments; test coverage itself was not separately re-audited object-by-object in this pass, since the mission's own scope was lifecycle mechanics, not test-evidence completeness (already covered by Business Rules Discovery for the objects it touched).
14. *Did I prove negative claims strongly enough?* Yes for the load-bearing ones — the "no Dispute check in release," "no recusal mechanism," "no finality window," and "no atomic Dispute/Escrow write" claims were each confirmed by direct reading of the relevant function bodies and targeted greps, with the search terms named in the underlying agent reports.
15. *Can the CTO independently reproduce every load-bearing finding?* Yes — every finding in §7 through §12 cites specific files, functions, and (where available) line numbers, all independently re-readable in the repository.

---

## 26. CTO Gate Summary

Two genuinely new, reachable cross-object contradictions (§11 items 2 and 3) are this mission's highest-value discovery — neither requires a crash, a race, or an edge case to reach; both are ordinary-path findings. **Corrected after CTO Gate R1**: item 2 (Escrow release with no Dispute-open check) is not an open Product Decision — existing institutional truth (`PROTOCOL_SPECIFICATION.md` §1.9, corroborated by `docs/BACKLOG.md`) already establishes that dispute-opening should freeze the escrow, so it is classified `IMPLEMENTATION DEFECT / CROSS-OBJECT LIFECYCLE VIOLATION`. Item 3 (appeal leaving a prior ruling's pending transaction live) remains a genuine Architecture Decision — no equivalent existing truth was found deciding it. One prior open question (F-07) is substantially de-risked by evidence of an existing, real reconciliation subsystem, though its rail-scoped boundary (MULTISIG-only) remains a genuine, disclosed gap. No frozen Offer A3 or RFC-021 B2 decision is touched. One Product Decision (`Offer.PAUSED` semantics) and three Architecture Decisions are surfaced for CTO adjudication; no Standard document is recommended.

---

STOP. Awaiting CTO Gate.
