# Business Rules Discovery — Evidence Report for CTO Gate

**Mission**: Sails Business Rules Discovery & Institutionalization.
**Baseline**: `main@8674734d9658c83b18dcc8f255a0ae9bc1a8fe94` (PR #159 merged/frozen, includes `docs/FOUNDATIONAL_RULES_STANDARDS_INVENTORY.md`).
**Branch**: `mission/business-rules-discovery`.
**Status**: Evidence only. No code, RFC, ADR, governance document, backlog, roadmap, or Issue was modified to produce this report. No implementation, fix, or new standalone standard is created by this document.

---

## 1. Executive Finding

**Are Business Rules currently explicit or mostly implicit?** Mixed, and unevenly so by domain. Dispute/Arbitration and Agent-recommend-vs-execute are the best-documented domains found (RFC-021's D-numbered items and RFC-016 + inline INV-12 rationale respectively) — a rule usually has a name, a rationale, and a citable D-item. Escrow's role/destination/expiry rules are real and code-enforced but their *institutional home* is split across `docs/DESTINATION_AUTHORITY_ARCHITECTURE.md`, `PROTOCOL_INVARIANTS.md`, and code comments, with no single index. Offer, Trade-transition, and Reputation-portability rules are the most implicit: real behavior exists, but in Offer's case with **no canonical home at all on either side** (nothing says it's intentional, nothing says it's a gap), and in Reputation-portability's case the openness is itself the documented, correct state (an explicitly undecided question, not a silent gap).

**Where does Business Rule truth currently live?** Primarily in **code + tests**, secondarily in **narrow, purpose-built architecture notes** (`DESTINATION_AUTHORITY_ARCHITECTURE.md`, `docs/security/SYBIL_MITIGATION.md`, `docs/THREAT_MODEL.md`), and in **RFC D-items** for anything arbitration-shaped. `PROTOCOL_INVARIANTS.md` supplies the handful of rules that have been promoted to constitutional status (INV-12's ruling-signature requirement). No single document currently answers "what may happen, under which conditions, to whom" for more than one domain at a time — a reader must already know which of five-plus documents to open for a given object.

**What is the dominant failure mode?** Not contradiction, and not a shortage of rules. The dominant failure mode is **provenance ambiguity and staleness of self-description**: (a) real, shipped, tested rules whose formal governance status trails their implementation (every RFC-021 D-item, carried over from the prior mission's F-01), (b) a comment or doc section describing a state of the world that has since changed underneath it without the comment being updated (two concrete instances found this mission: `escrow.service.ts:601-609`'s destination-authority comment, now stale after a real fix; `tests/sweepers.test.ts`'s header, describing tests whose bodies were later emptied), and (c) one real domain (Offer lifecycle) where the absence of a rule is not itself institutionally acknowledged from either direction — nobody has said "this is fine" or "this is a gap," it has simply never been reached.

---

## 2. Business Rule Domain Map

| Domain | Primary object(s) | Canonical/primary evidence home | Richness found |
|---|---|---|---|
| Offer | `Offer`, `OfferStatus` | Code-only (`liquidity.service.ts`, `liquidity.routes.ts`); RFC-018 for its Intent-linkage | Low — real behavior, near-zero institutional description |
| Trade | `Trade`, `TradeStatus` | RFC-018 (Accepted) for lifecycle wiring; code for transition/immutability specifics | Medium — canonical for the Intent-linked parts, implicit for the rest |
| Escrow | `Escrow`, `EscrowStatus`, `EscrowPendingTransaction` | Code (`escrow.service.ts`, `escrow-lifecycle.ts`) + `DESTINATION_AUTHORITY_ARCHITECTURE.md` + `PROTOCOL_INVARIANTS.md` | High in code/test density, medium in single-home discoverability |
| Dispute/Arbitration | `Dispute`, `DisputeRuling` | RFC-021 (D2/D3/D4/D6/D8/D9), `PROTOCOL_INVARIANTS.md` INV-12 | High — best-documented domain, but formally unaccepted RFC |
| Identity/Auth | `User`, session tokens | Code (`auth.ts`) + `docs/PARTNER_WALLET_INTEGRATION_IDENTITY_CONTINUITY.md` | Medium — authentication itself is simple and consistent; the interesting rules are about what does *not* depend on session |
| Reputation | `User.reputationScore`, `Vouch` | Code (`reputation.service.ts`, `vouch.service.ts`) + `docs/security/SYBIL_MITIGATION.md` + `docs/THREAT_MODEL.md` + RFC-021 D7 | Medium-high — the asymmetry rule has a real paper trail; portability is disclosed-open |
| Capability/Eligibility | `CapabilityGrant`, vouch eligibility | RFC-005/013/014 (capability), code-only (vouch eligibility bar) | Bifurcated — capability enforcement is a disclosed policy default; vouch eligibility is an always-on business rule |
| Agent-assisted behavior | QVAC-generated `TradeIntent`/`Offer` proposals | RFC-016 + inline INV-12 rationale + UI (`AgentIntentionPanel.tsx`) | High — structurally enforced, well-documented boundary |

No additional domain met this mission's bar for a dedicated inventory pass; `NegotiationChannel` (in-memory, never persisted) and `EscrowPendingTransaction`'s own status-free lifecycle were already flagged as State/Lifecycle gaps (not Business Rule gaps) by the prior Foundational Inventory (F-07) and are not re-litigated here.

---

## 3. Rule Inventory

Provenance vocabulary used throughout: `CANONICAL` (frozen elsewhere, e.g. an Invariant or an Accepted RFC), `IMPLEMENTED / RFC FORMALLY UNACCEPTED` (sourced from an RFC still in "Proposed" status), `CODE-ONLY, NO RFC/ADR`, `DOCUMENTED-ARCHITECTURE-NOTE` (a narrow, dedicated doc like `DESTINATION_AUTHORITY_ARCHITECTURE.md` that has not itself been run through a formal RFC/ADR gate).

### Offer

**BR-OFFER-01 — Offer creation identity and validation.**
Rule statement: An Offer's owner is always the authenticated caller (`participantId`), never a body-supplied value; `priceUsd`/`minAmount`/`maxAmount` must be positive decimals and `paymentMethod` a non-empty string.
Why it exists: prevents identity spoofing and malformed economic terms at the one entry point for a new market listing.
Trigger: `POST /v1/liquidity/offers`.
Preconditions: valid session (`requireAuth`); schema-validated body.
Allowed action: create an `Offer` row, `status` defaulting to `ACTIVE`, and a linked `Intent` (RFC-018).
Forbidden action: creating an Offer on another participant's behalf.
Actors: the authenticated caller only.
Economic consequence: a new, immediately-discoverable market listing.
Affected object/state: `Offer` (new row), `Intent` (new row, RFC-018).
Authority dependency: session authentication only (no capability check).
Temporal dependency: none.
Evidence dependency: none beyond the write itself.
Current canonical home: `liquidity.routes.ts:43-63` (schema), `liquidity.service.ts:424-565` (`createOffer`/`persistOffer`) — CODE-ONLY for field-level validation; RFC-018 (Accepted) for the Intent-linkage half.
Implementation locations: as above.
Test evidence: idempotency-safe reconciliation covered per the prior mission's Pillar B notes; RFC-018's own `tests/routes.test.ts` offer-publish assertions (EXISTS/PROVES the Intent chain fires).
Product/UI consequence: none beyond ordinary form validation.
Status: PRESENT_BUT_DISPERSED.
Contradictions: none.
Open questions: none.
Decision required?: No.
Recommended destination: cross-reference only; no new document.

**BR-OFFER-02 — Publication is not a separate step.**
Rule statement: An Offer becomes discoverable the instant it is created; there is no distinct "publish"/"activate" action, gate, or review step.
Why it exists: this is an absence, not a designed mechanism — no document states this was a deliberate simplicity choice, but no document states a gate was ever intended either.
Trigger: N/A (implicit in creation).
Preconditions: N/A.
Allowed/forbidden action: N/A.
Actors: N/A.
Economic consequence: immediate market visibility with no cooling-off or moderation window.
Affected object/state: `Offer.status` (defaults `ACTIVE`).
Authority/Temporal/Evidence dependency: none.
Current canonical home: **none** — `prisma/schema.prisma:155`'s default value is the only "specification."
Implementation locations: as above.
Test evidence: none specific to this absence (nothing to test — there is no gate to verify).
Product/UI consequence: none currently, since the UI has no moderation/review concept either.
Status: IMPLICIT.
Contradictions: none.
Open questions: is immediate publication the intended Product behavior, or was a review/moderation step simply never designed? Not answerable from evidence found.
Decision required?: Product Decision, but low urgency (no incident, no complaint, no doc gestures toward wanting one).
Recommended destination: no action — legitimate deferral pending real need.

**BR-OFFER-03 — Offer status transitions are unguarded (F-03, deepened).**
Rule statement, stated falsifiably: *no rule currently exists* preventing `updateOfferStatus()` from moving an Offer from `COMPLETED` or `CANCELLED` back to `ACTIVE`; ownership is the only checked precondition.
Why it (does not) exist: no evidence found on either side — no document states Offer is intentionally exempt from transition guarding (as, e.g., its non-binding nature might justify), and no document flags the absence as a known gap.
Trigger: `PATCH /v1/liquidity/offers/:id/status`.
Preconditions today: caller must be the offer's owner (`liquidity.service.ts:667-684`). No transition-validity check.
Allowed action (today): any status → any other status, by the owner.
Forbidden action: none enforced.
Actors: offer owner.
Economic consequence, precisely bounded by this mission's fresh evidence:
  - An Offer is **fully decoupled** from any Trade already created against it — `persistTrade()` checks `offer.status === 'ACTIVE'` **only once**, at Trade-creation time (`trade.service.ts:98-100`); nothing downstream re-reads `Offer.status`. Confirmed as *deliberate*, not incidental, by `docs/BACKLOG.md:3893-3897`'s own statement that multiple Trades may legitimately share one still-ACTIVE Offer. So reactivating a stale Offer cannot retroactively corrupt an existing Trade.
  - Reactivation **would** make the Offer newly discoverable again through the aggregated Marketplace/order-book query (`buildOfferWhere()`, `liquidity.service.ts:265-280`, hardcoded `status: 'ACTIVE'`) — a real counterparty-facing consequence if it happened.
  - No route or service method exists, anywhere, to edit `priceUsd`/`minAmount`/`maxAmount`/`paymentMethod` after creation — reactivation cannot combine with a stale-price edit, because editing itself is impossible. The only "staleness" risk is the offer's original, unedited price relative to a moved market.
  - The **reference UI's own shipped screen** (`packages/sails-ui/src/pages/Profile.tsx`) does not expose a reachable path to this transition: its status controls are gated by `canManage = o.status === 'ACTIVE' || o.status === 'PAUSED'` (line 242) — a COMPLETED/CANCELLED offer renders no button at all. The UI's own cancel-confirmation copy states intended one-way semantics ("cannot be reactivated") that the backend does not enforce.
  - The gap **is** reachable one layer down: `packages/sails-sdk/src/modules/liquidity.ts:176-178`'s `updateStatus()` is an unguarded passthrough accepting any of the four status values, callable by any SDK consumer or a raw `PATCH` request, with no UI in the way.
Authority dependency: ownership only.
Temporal dependency: none.
Evidence dependency: none.
Current canonical home: **ABSENT on both sides — negative-evidence sweep now complete.** Searched `docs/PROTOCOL_SPECIFICATION.md` §1.11, `PROTOCOL_INVARIANTS.md` (no Offer-specific invariant exists at all), both ADRs (neither addresses Offer status), all 24 RFC titles/scopes, `docs/BACKLOG.md` (targeted greps for "Offer"+"lifecycle"/"transition"/"reactivat" — only two unrelated F-03/F-04 hits about a different mission's session-expiry UI numbering), open GitHub issues (targeted searches for "Offer lifecycle", "reactivate", "OfferStatus", etc. — zero matches), and, closing the gap flagged at CTO Gate R1, `docs/ROADMAP.md` directly (searched for "Offer"/"reactivat"/"lifecycle"/"transition", case-insensitive — the only hit, line 209, is a generic architecture-scope bullet — "Sails OpenP2P core logic (Trade lifecycle, escrow state machine, liquidity...)" — naming Trade and Escrow's lifecycles as existing concepts, with no mention of Offer status transitions at all). With all materially relevant surfaces now checked and none showing evidence on either side, `ABSENT` is retained as the supported classification, not merely assumed — this is the outcome, not a shortcut past, this mission's own negative-evidence doctrine.
Implementation locations: `liquidity.service.ts:667-684`, `liquidity.routes.ts`, `trade.service.ts:98-100`, `packages/sails-ui/src/pages/Profile.tsx:242,258,287`, `packages/sails-sdk/src/modules/liquidity.ts:176-178`.
Test evidence: none found testing transition validity (there is no guard to test); the UI gate itself is not unit-tested for this specific property beyond ordinary component tests, per the investigation's own scope.
Product/UI consequence: reachable via SDK/raw HTTP today, not via the shipped reference UI's normal flow. Any future UI that reuses the SDK method directly, or a script/partner integration, has no protection at all.
Status: ABSENT.
Contradictions: the UI's own copy ("cannot be reactivated") versus the backend's actual permissiveness is a genuine, if narrow, **contradiction between stated product intent and enforced behavior** — see §7.
Open questions: is Offer purely a non-binding discovery pointer (making this a non-issue), or does discoverability-of-stale-terms constitute a real Product-relevant deception risk? Evidence does not resolve this; a Product Decision is needed, not an executor guess.
Decision required?: **Product Decision** — required, not automatic. Do not resolve here.
Recommended destination: Product Decision first; if a guard is wanted, extend `docs/adr/ADR-002-...md`'s scope or add a narrow, Offer-specific note — not a new document, and not by inferring the answer from code absence.

**BR-OFFER-04 — Offer economic terms are frozen at creation.**
Rule statement: no mutation path exists, at any layer (route, service, UI, SDK), for `priceUsd`/`minAmount`/`maxAmount`/`paymentMethod` after an Offer is created; the only ever-mutable field is `status`.
Why it exists: not stated anywhere as a deliberate rule; an artifact of "this was never built," same evidentiary posture as BR-OFFER-02.
Current canonical home: ABSENT as a stated rule; PRESENT as an accurate description of shipped code.
Status: IMPLICIT.
Decision required?: No — flagged only because BR-OFFER-03's economic-consequence analysis depends on it.
Recommended destination: no action.

### Trade

**BR-TRADE-01 — Trade acceptance preconditions.**
Rule statement: A Trade may only be created against an `ACTIVE` Offer, by a participant other than the Offer's owner, for an amount that is a finite positive decimal within `[offer.minAmount, offer.maxAmount]`.
Why it exists: prevents self-trading and out-of-band amounts; RFC-018's own motivation section frames Trade creation as the one real trade-entry code path that must not silently violate the Offer's own published bounds.
Trigger: `POST /v1/openp2p/trades`.
Preconditions: as stated; buyer/seller role derived from `offer.side`.
Allowed action: create the Trade, snapshotting `priceUsd`/`totalUsd` from the Offer at that moment, and (RFC-018) walk the linked Intent through `DISCOVERING → MATCHED → NEGOTIATING`.
Forbidden action: self-trading; out-of-bounds amount.
Actors: the offer owner (implicitly) and the accepting counterparty.
Economic consequence: a binding trade record begins to exist.
Affected object/state: `Trade` (new row), `Intent` (transitioned, if linked).
Authority dependency: session authentication only.
Temporal dependency: none at creation.
Evidence dependency: none.
Current canonical home: `trade.service.ts:59-149` (CODE-ONLY for the specific numeric bounds check, itself flagged in its own comment as a "Robustness-audit fix 2026-07-20") + RFC-018 (Accepted) for the Intent-walk consequence.
Test evidence: `tests/fullTradeLifecycle.test.ts` (EXISTS/PROVES the real chained happy path).
Product/UI consequence: an amount-out-of-bounds attempt must be rejected with a clear reason before commitment.
Status: PRESENT_BUT_DISPERSED.
Decision required?: No.
Recommended destination: cross-reference only.

**BR-TRADE-02 — Offer values are snapshotted, never read live.**
Rule statement: `priceUsd`/`totalUsd` are computed from the Offer and persisted onto the Trade at creation time; `minAmount`/`maxAmount` are a one-time validation gate, never persisted or re-checked. No later edit to the Offer (even if one existed) could retroactively alter an already-created Trade's economic terms.
Why it exists: economic finality at the moment of mutual commitment — a Trade's terms must not shift underneath a party who already committed.
Current canonical home: CODE-ONLY (`trade.service.ts:121-146`), not stated as a rule anywhere, but directly falsifiable and confirmed true by direct code reading.
Status: IMPLICIT.
Contradictions: none.
Decision required?: No.
Recommended destination: this is a good candidate for a one-line addition to whichever future canonical Trade-lifecycle doc exists, but does not by itself justify creating one.

**BR-TRADE-03 — Trade cancellation is symmetric, not asymmetric.**
Rule statement: either the buyer or the seller may cancel a Trade, with no procedural distinction between the two roles; cancellation is reachable only from `PENDING` or `ACTIVE`.
Why it exists: no document states a rationale; the guard exists specifically to prevent overwriting COMPLETED/DISPUTED trades (a 2026-07-19 "Missão 04 hardening finding" fixing a real corruption incident — a stale `Trade.status` overwrite that would have broken the audit trail).
Trigger: `PATCH /v1/openp2p/trades/:id/status` with `{status: 'CANCELLED'}`.
Preconditions: caller is `buyerId` or `sellerId`; current status is `PENDING` or `ACTIVE`.
Allowed/forbidden: as stated; COMPLETED/DISPUTED/CANCELLED-already are all rejected.
Actors: buyer or seller, symmetrically — confirmed by test evidence, not merely inferred (`tests/tradeUpdateStatus.test.ts` exercises both roles against identical rules).
Economic consequence: on cancel, if `Trade.intentId` is set, the linked Intent is also transitioned to `CANCELLED`.
Current canonical home: CODE-ONLY, with a dated inline incident rationale (`trade.service.ts:35-54`).
Test evidence: `tests/tradeUpdateStatus.test.ts` (EXISTS/PROVES both role symmetry and the terminal-state rejection).
Status: PRESENT_BUT_DISPERSED (explained, not doc-homed).
Decision required?: No.
Recommended destination: cross-reference only.

**BR-TRADE-04 — Trade completion is exclusively event-driven.**
Rule statement: `COMPLETED` is not a reachable value through any client-facing route; `updateStatus()`'s own type signature restricts client input to `'ACTIVE'|'CANCELLED'` only. A Trade becomes COMPLETED only as a reaction to `settlement.escrow.released` or `settlement.escrow.split`.
Why it exists: completion must reflect real settlement, never a client's own claim.
Current canonical home: CODE-ONLY (`trade.service.ts:272-276`, `handlers.ts:270-274,370-374`), stated explicitly in an inline comment, not in any doc.
Test evidence: `handlers.ts`'s own reactions, exercised via `tests/fullTradeLifecycle.test.ts` and `tests/reputationOutcome.test.ts`.
Status: PRESENT_BUT_DISPERSED.
Decision required?: No.
Recommended destination: cross-reference only.

**BR-TRADE-05 — `PENDING → ACTIVE` has two independent paths (implicit inconsistency found).**
Rule statement: contrary to `trade.service.ts`'s own comment (lines 47-50, "every other Trade.status transition is already driven automatically"), `PENDING → ACTIVE` is reachable **both** automatically (via the `settlement.escrow.locked` reaction in `handlers.ts:246-250`, which writes `status: 'ACTIVE'` directly via Prisma, bypassing `updateStatus()` entirely) **and** manually, by a client calling `PATCH /v1/openp2p/trades/:id/status` directly — both paths are live and tested (`tests/tradeUpdateStatus.test.ts:57-63`, `"allows PENDING -> ACTIVE"`).
Why this matters: this is a real, if narrow, instance of "the code's own self-description is imprecise" — not a contradiction in behavior, but evidence that even the file's own author-facing comment did not fully track its own transition table by the time this mission re-verified it.
Current canonical home: none; this mission's own research is the only place this dual-path fact is stated explicitly.
Status: IMPLICIT (now made explicit by this report).
Contradictions: the code comment vs. the code's own transition table — a real, if minor, self-description drift (see §7).
Decision required?: No — flagging for correction is enough; this is not a Product or Architecture question, only a code-comment accuracy defect.
Recommended destination: implementation defect (comment correction), trivial, RESOLVE_NOW candidate — not performed by this evidence-only mission.

### Escrow

**BR-ESCROW-01 — Escrow creation is singular per Trade, buyer/seller only.**
Rule statement: only the Trade's buyer or seller may create its Escrow, and a Trade may never have more than one.
Current canonical home: CODE-ONLY (`escrow.service.ts:292-346`), with an inline note that the duplicate-escrow guard was itself a real security fix (previously any counterparty could create an escrow against any trade and permanently brick it).
Test evidence: `tests/escrowProviderWiring.test.ts:524`, `tests/integration/feeSnapshotPreFundingIntegration.test.ts:227` (EXISTS/PROVES both checks).
Status: PRESENT_BUT_DISPERSED.
Decision required?: No.

**BR-ESCROW-02 — Funding/locking is seller-side only.**
Rule statement: only the seller (or an agent acting for the seller, via the `agent:{label}:{sellerId}` convention) may lock funds into escrow; the buyer is forbidden.
Current canonical home: CODE-ONLY (`escrow.service.ts:443-538`, `isPartyOrAgent()`).
Test evidence: `tests/escrowReleaseControls.test.ts` (EXISTS/PROVES seller-only + agent-eligible).
Temporal dependency: an atomic DB-level claim precedes the real provider call, closing a double-lock race.
Status: PRESENT_BUT_DISPERSED.
Decision required?: No.

**BR-ESCROW-03 — Marking payment sent is buyer-side only.**
Rule statement: only the buyer (or buyer's agent) may mark payment as sent; this is additionally blocked if MULTISIG funding evidence is "uncertain" (a reorg concern).
Current canonical home: CODE-ONLY (`escrow.service.ts:540-599`) for the actor rule; `escrow-funding-evidence.service.ts` + `docs/WDK_UNKNOWN_OUTCOME_RETRY_SAFETY.md` for the evidence-gating half.
Test evidence: `tests/escrowReleaseControls.test.ts` (EXISTS/PROVES buyer-only).
Status: PRESENT_BUT_DISPERSED.
Decision required?: No.

**BR-ESCROW-04 — Release/refund actor constraint: seller or assigned arbiter only.**
Rule statement: fund release and refund may only be triggered by the escrow's seller or the arbiter currently assigned to an open dispute on it — never the buyer directly, never an unassigned arbiter.
Current canonical home: CODE-ONLY (`escrow-lifecycle.ts`'s `isSellerOrAssignedArbiter`/`loadEscrowWithAuthorization`).
Test evidence: `tests/escrowReleaseControls.test.ts` (EXISTS/PROVES role gating for both release and refund).
Status: PRESENT_BUT_DISPERSED.
Decision required?: No.

**BR-ESCROW-05 — Split is arbitration-only; the ratio is never mutually agreed or unilateral.**
Rule statement: `SPLIT` is reachable **only** from `DISPUTED` — there is no cooperative/mutual-agreement split path. The `buyerBps` ratio is a caller-supplied parameter bounded `0 < buyerBps < 10000`, but in practice its value always originates from an arbiter's signed ruling, never from either party directly.
Why it exists: an economic split of disputed funds must be adjudicated, not negotiated unilaterally under duress or asymmetric leverage.
Current canonical home: RFC-021 D9 (`IMPLEMENTED / RFC FORMALLY UNACCEPTED`) for the arbitration-driven design; CODE-ONLY for the exact bps bound.
Test evidence: `tests/escrowReleaseControls.test.ts:550-595`, `tests/disputeDestinationAuthorityConformance.test.ts:467` (EXISTS/PROVES both boundary validation and independent buyer/seller destination resolution).
Status: PRESENT_BUT_DISPERSED.
Decision required?: No.

**BR-ESCROW-06 — Destination resolution: beneficiary's own registered address, never caller-supplied (now fully closed — see Finding BRD-01 below).**
Rule statement: for every escrow type and every fund-moving action (release, refund, split), the destination address is resolved from the beneficiary's own registered `PayoutAddress`, never from a value supplied by the arbiter, the caller, or any other actor.
Dependency map (new evidence this mission): `createEscrow`, `lockFunds`, `markPaymentSent`, `openDispute` — **no** destination dependency at all. `releaseFunds`/`initiateRelease` — resolves the buyer's address, once. `refundFunds`/`initiateRefund` — resolves the seller's address for signature-collection rails (MULTISIG/LIGHTNING_HODL/SAFE_GUARD_EVM); for MOCK/WDK_USDT_EVM's direct refund, there is **no caller-facing destination concept at all** (provider-internal logic; not a Destination Authority question in the same sense). `splitFunds`/`initiateSplit` — resolves **both** parties' addresses, independently, never collapsed into one value.
Current canonical home: `docs/DESTINATION_AUTHORITY_ARCHITECTURE.md` (`DOCUMENTED-ARCHITECTURE-NOTE` — a real, adversarially-reviewed companion document, not itself run through `GOVERNANCE.md`'s RFC gate) + `PROTOCOL_INVARIANTS.md` INV-01 (`CANONICAL`, the frozen invariant this document records a newly-recognized conformant/non-conformant instance of).
Test evidence: `tests/settlementReleaseDestinationAuthority.test.ts`, `tests/escrowPendingReleaseDestinationBinding.test.ts`, `tests/disputeDestinationAuthorityConformance.test.ts`, `tests/payoutAddress.test.ts` (EXISTS/PROVES fail-closed behavior, rotation-survival, and per-rail conformance).
Status: **CANONICAL for the design; now CANONICAL for the implementation too — see BRD-01.**
Decision required?: No.
Recommended destination: no action, subject to BRD-01's stale-comment correction below.

**BR-ESCROW-07 — Payout-address binding happens at initiate-time, not finalize-time.**
Rule statement: for signature-collection rails, the resolved destination is persisted into `EscrowPendingTransaction.toAddress`/`toAddressSecondary` at the moment release/refund/split is *initiated*; the finalize step (`submitTransactionSignature()`) never re-resolves it. A `PayoutAddress` rotation after initiation, before the final signature lands, therefore has no effect on that already-initiated transaction.
Current canonical home: CODE-ONLY (`escrow-pending-tx.ts:150-174`, referenced by a comment at `settlement.routes.ts:364`).
Test evidence: `tests/escrowPendingReleaseDestinationBinding.test.ts:197-243` ("binding survives rotation and retry" — EXISTS/PROVES directly).
Status: IMPLICIT (real, precise, undocumented outside code/tests).
Decision required?: No.
Recommended destination: cross-reference only — this is exactly the kind of precise mechanical fact `DESTINATION_AUTHORITY_ARCHITECTURE.md` §13's timing table already describes at the architecture level; a pointer from that table to this code location would close the gap cheaply.

**BR-ESCROW-08 — Expiry has two disjoint paths by rail type.**
Rule statement: for signature-collection rails, expiry is a pure Core-authoritative *observation* (`FUNDS_LOCKED → EXPIRED`, no signature, no fund movement, recovery requires the seller to raise a dispute); for legacy rails (MOCK/WDK_USDT_EVM), expiry directly triggers an automatic `refundFunds()` with `triggeredBy = trade.sellerId` (real, not fabricated).
Current canonical home: `PROTOCOL_INVARIANTS.md` INV-04/INV-07 (`CANONICAL`, the general verify-before-transition/explicit-failure principles) for the *why*; CODE-ONLY (`escrow.service.ts:982-1112`, `expiry-authority.ts`) for the exact mechanics.
Test evidence: `tests/sweepers.test.ts` (extensive — EXISTS/PROVES both branches, boundary timing, idempotency, per-escrow failure isolation).
Status: PRESENT_BUT_DISPERSED.
Decision required?: No.

**BR-ESCROW-09 — Funding-uncertainty gating is narrowly scoped by design.**
Rule statement: only `markPaymentSent`, `initiateRelease`, and `initiateSplit` are gated by funding-uncertainty (a MULTISIG reorg concern); refund, dispute-raising, the EXPIRED transition, and expiry-recovery are explicitly exempt, because blocking those would create the exact "permanent fund denial" the mechanism exists to prevent.
Current canonical home: `PROTOCOL_INVARIANTS.md` DP-1/DP-3 (`CANONICAL`) for the general principle; `docs/WDK_UNKNOWN_OUTCOME_RETRY_SAFETY.md` for the WDK-specific framing; CODE-ONLY (`escrow-lifecycle.ts:163-195`) for the exact call-site list.
Test evidence: `tests/escrowFundingEvidenceService.test.ts`, `tests/integration/escrowFundingUncertainty.test.ts`, `tests/integration/escrowFundingConcurrency.test.ts` (EXISTS/PROVES both the gating and the exemptions).
Status: CANONICAL (principle) + PRESENT_BUT_DISPERSED (exact scope).
Decision required?: No.

**BR-ESCROW-10 — Post-commitment field immutability is inferred, not stated, and only partially DB-enforced.**
Rule statement: once an Escrow exists, `lockedAmount`, `asset`, `type`, `tradeId`, and `timelockHours` have no application-level mutator at all (only 6 narrow, purpose-specific update methods exist in `escrow-repository.ts`); this immutability is nowhere stated as a rule. DB-level enforcement exists but is narrower than a prior hypothesis assumed: **two** Postgres triggers exist for Escrow-adjacent immutability (a fee-snapshot guard scoped to 4 fee-related columns, and an arbiter-key immutability guard on a child table) — neither covers `lockedAmount`/`asset`/`type`/`tradeId`/`timelockHours` specifically, which remain immutable purely by absence of a mutator.
Current canonical home: **ABSENT as a stated rule**; PARTIAL as DB-enforced fact.
Status: IMPLICIT.
Decision required?: No — flagged for completeness, not urgency.
Recommended destination: no action; a candidate line item if `docs/DESTINATION_AUTHORITY_ARCHITECTURE.md`'s companion documents are ever consolidated, not a reason to create anything new now.

### Dispute / Arbitration

**BR-DISPUTE-01 — Opening conditions.**
Rule statement: only a Trade's buyer or seller may open a Dispute, and a Trade may have at most one, database-enforced.
Current canonical home: originates in **RFC-007 D4** (`IMPLEMENTED / RFC FORMALLY UNACCEPTED` — a separate RFC from RFC-021, not re-verified for acceptance status in this pass) for the escalation flow itself; the `@@unique([tradeId])` DB guard is `CODE-ONLY, NO RFC/ADR`, added later as a named 2026-07-19 security-validation fix for a real double-dispute race.
Test evidence: covered by `tests/disputeFlow.test.ts`'s creation-path tests.
Status: PRESENT_BUT_DISPERSED.
Decision required?: No.

**BR-DISPUTE-02 — Arbiter eligibility formula.**
Rule statement: a candidate is eligible to arbitrate iff `effectiveStake (monetaryCollateral + reputation × 0.01) ≥ 1.5 × disputeValue`, and is never the trade's own buyer or seller.
Current canonical home: RFC-021 D3 (`IMPLEMENTED / RFC FORMALLY UNACCEPTED`) for the formula/threshold; the buyer/seller exclusion is narrated inside D2's text as a correction but was never independently, separately accepted — treat its provenance as the same unaccepted status by association, not as a freestanding CODE-ONLY fact.
Test evidence: `tests/marketArbitrationProvider.test.ts` (EXISTS/PROVES the formula, threshold, and exclusion; does **not** prove the specific constants `K_ELIGIBILITY=1.5`/`REPUTATION_STAKE_FACTOR=0.01` are the *correct* economic parameters — RFC-021 itself calls these "starting parameters... not fixed forever").
Status: `IMPLEMENTED / RFC FORMALLY UNACCEPTED`.
Decision required?: Governance Decision (RFC-021 acceptance) — carried forward from the frozen prior mission's F-01, not reopened here.

**BR-DISPUTE-03 — Arbiter assignment mechanism.**
Rule statement: first-instance assignment is a weighted-random draw over eligible candidates (weight = effectiveStake); a script-committed arbiter identity (MULTISIG's on-chain key) always overrides the provider's own pick when one exists.
Current canonical home: RFC-021 D2/D3 (`IMPLEMENTED / RFC FORMALLY UNACCEPTED`).
Test evidence: `tests/marketArbitrationProvider.test.ts:159-180` (EXISTS/PROVES statistical weighting over many draws).
Status: `IMPLEMENTED / RFC FORMALLY UNACCEPTED`.
Decision required?: Same Governance Decision as BR-DISPUTE-02.

**BR-DISPUTE-04 — Evidence submission has no time window, only a status gate.**
Rule statement: either trade party may attach evidence while the dispute is `OPENED` or `EVIDENCE_SUBMITTED`; there is no deadline distinct from that status check (do not confuse this with the separate, real 24h QVAC auto-resolution contest window, which is a different mechanism entirely).
Current canonical home: RFC-021 D8 (`IMPLEMENTED / RFC FORMALLY UNACCEPTED`).
Test evidence: `tests/disputeFlow.test.ts:752` (EXISTS/PROVES the status gate; confirms no time-window test exists because no time window exists).
Status: `IMPLEMENTED / RFC FORMALLY UNACCEPTED`.
Decision required?: No new decision beyond the general RFC-021 acceptance question.

**BR-DISPUTE-05 — Ruling requires a verified signature, for every rail.**
Rule statement: `resolveDispute()` requires a verified Ed25519 signature over the exact `AuthorityDecisionPayload`, checked against the arbiter's registered public key, for **every** escrow type — not merely MULTISIG. `assertExecutionMatchesAuthorization()` fails closed on any mismatch.
Current canonical home: `PROTOCOL_INVARIANTS.md` INV-12 (`CANONICAL`) — with its own precise caveat preserved: the document's claimed `EVIDENCE` is scoped to "MULTISIG scope only," referring to the *stronger commit-then-dispatch-eligibility ordering* guarantee, not to whether a signature is checked at all (the signature gate itself runs unconditionally, confirmed by direct code reading this mission).
Test evidence: `tests/arbitrationAuthority.test.ts`, `tests/disputeFlow.test.ts:317,331` (EXISTS/PROVES both the crypto-primitive level and service-integration level, including forged-signature and wrong-keypair rejection).
Status: CANONICAL.
Decision required?: No.

**BR-DISPUTE-06 — Appeal rule, precisely bounded (F-05, refined).**
Rule statement: a `RESOLVED` dispute may be appealed, by either trade party only, unless the escrow has a script-committed arbiter (MULTISIG) or the deployment is not in market-arbitration mode. There is **no time-based deadline** and **no cap on the number of appeal rounds** — only an escalating economic cost (panel size doubles per round; an `APPEAL_FEE_MULTIPLIER`-scaled fee is charged and forfeited on an upheld ruling, refunded on an overturned one). The prior ruling is preserved as history (`previousRuling`/`previousArbiterId`), never overwritten in place until a new ruling actually lands.
**Refinement of the prior mission's F-05, established as new evidence this mission**: the `prisma/schema.prisma:1447-1449` comment ("no reopen-after-RESOLVED path exists") does **not** actually contradict `appeal()`'s behavior — read in its full original context, that comment is about **row cardinality** (why `@@unique([tradeId])` is a full unique constraint: no *second Dispute row* is ever created for a trade, even after RESOLVED), not about `DisputeStatus` transitions. `appeal()` reopens the *same row* in place (`update`, never `create`). Both "no second row is ever created" and "a RESOLVED dispute can transition to APPEALED" are true simultaneously — there is no real contradiction, only an ambiguously-worded comment that a reader unaware of the row-vs-state distinction could reasonably misread, which is exactly what happened in the prior mission. This mission's evidence supersedes that framing without reopening or editing the already-frozen `FOUNDATIONAL_RULES_STANDARDS_INVENTORY.md`.
Current canonical home: RFC-021 D6 (`IMPLEMENTED / RFC FORMALLY UNACCEPTED`).
Test evidence: `tests/disputeFlow.test.ts` (extensive — EXISTS/PROVES status/party/escrow-type gates, fee computation, slashing outcome; does **not** prove any round cap or deadline, because none exist to test).
Status: `IMPLEMENTED / RFC FORMALLY UNACCEPTED`.
Contradictions: **none, once precisely read** — see refinement above; this replaces, for this mission's own purposes, the prior mission's looser "stale duplicate" framing.
Decision required?: the *absence of any appeal-round cap* is not flagged as risky anywhere in RFC-021's own "Known Risks" section — this is a genuine gap in the RFC's own risk enumeration, worth surfacing as an open question, not a decided Business Rule either way.
Recommended destination: Governance Decision (general RFC-021 acceptance) covers the mechanism; the round-cap risk-enumeration gap is a candidate RFC-021 amendment note, not a new document.

**BR-DISPUTE-07 — RESOLVED is not a terminal state.**
Rule statement, falsifiable: a Dispute's `RESOLVED` status is not terminal — it remains appealable indefinitely (subject only to escalating cost), so any code or documentation that treats RESOLVED as final is incorrect.
Current canonical home: same as BR-DISPUTE-06 — this is a restatement of the same evidence from the state-machine angle rather than the appeal-mechanism angle, kept separate per this mission's own instruction to distinguish Business Rules from State/Lifecycle rules (see §4).
Status: `IMPLEMENTED / RFC FORMALLY UNACCEPTED`.
Decision required?: No, beyond BR-DISPUTE-06's.

**BR-DISPUTE-08 — QVAC dispute auto-resolution is advisory-only, with a 24h contest window.**
Rule statement: an uncontested QVAC recommendation on a disputed evidence set is proposed (`AUTO_PROPOSED`), never auto-executed; if unresolved after `config.settlement.qvacAutoResolutionWindowHours` (24h default), it reverts to human arbitration (`EVIDENCE_SUBMITTED`) rather than settling automatically. This was a real downgrade from an earlier design that *did* auto-execute, corrected specifically because it was found to violate INV-12 (an execution indistinguishable on-chain from a human ruling, attributed to an arbiter who never signed anything for that instance).
Current canonical home: RFC-021 D8 (`IMPLEMENTED / RFC FORMALLY UNACCEPTED`) + the INV-12 rationale inline in `dispute.service.ts:1032-1065` (referencing `PROTOCOL_INVARIANTS.md`, `CANONICAL` for the *principle* the downgrade satisfies, even though the mechanism itself is RFC-021-sourced).
Test evidence: `tests/disputeFlow.test.ts:862-923` (EXISTS/PROVES the advisory-only, revert-to-human contract). **Separately noted defect**: `tests/sweepers.test.ts`'s own header comment describes coverage for this exact sweeper, but the file body is `export {}` — a stale, misleading test-file header with zero actual test bodies. The real coverage lives in `disputeFlow.test.ts`, not where the stale header implies.
Status: `IMPLEMENTED / RFC FORMALLY UNACCEPTED` for the mechanism; CANONICAL for the underlying INV-12 principle it was corrected to satisfy.
Decision required?: No new decision; the stale test header is an implementation/evidence-hygiene defect (see §10, Finding BRD-02).

### Identity / Authentication

**BR-AUTH-01 — Every economically-material write requires authentication; no gap found.**
Rule statement: every route across `open-p2p`, `open-settlement`, `open-liquidity`, `open-reputation`, `open-agents`, and `open-agents`'s capability routes that performs a persisted, economically-material write carries `requireAuth`. The only unauthenticated routes are pure reads with no state mutation (public offer/participant/reputation lookups; `POST /v1/liquidity/match`, independently verified to be read-only despite its verb).
Why this matters as a Business Rule, not merely an implementation fact: it establishes the baseline precondition every other rule in this report assumes — "the actor" in every BR-* entry above is only knowable because this holds.
Current canonical home: CODE-ONLY, consistently applied but never stated as a cross-cutting rule in any single document.
Test evidence: route-level `requireAuth` tests are pervasive across `tests/routes.test.ts` (dozens of "rejects without a session token" assertions).
Status: PRESENT_BUT_DISPERSED (true everywhere, stated nowhere as one rule).
Decision required?: No.
Recommended destination: a strong candidate for a one-line cross-cutting statement if a future Authority-domain document is ever written — not sufficient reason alone to write one now.

**BR-AUTH-02 — No re-authentication/step-up requirement exists anywhere (confirmed absence, not merely unfound).**
Rule statement: no economically high-value action (destination-address change, fund release) requires anything beyond ordinary session validity — no session-age check, no second factor, no "re-enter your passphrase for this specific action" gate exists anywhere in the codebase.
Evidence standard applied: searched `auth.ts` (full read), `payout-address.service.ts` (full read), the release/initiate-release/payout-address route sections of `settlement.routes.ts` directly, and a repo-wide grep for step-up/re-auth/MFA/session-age vocabulary (`step-up|stepup|re-?auth(entic)?ate.*within|recentAuth|reauthWindow|mfa|second-factor|freshSession|sessionAge`) — no relevant hits (only an unrelated idempotency-store method name superficially matching).
Why this matters: this is the one place a Business Rule could plausibly have depended on session-termination semantics (F-08A's absence) — it does not. High-value actions are gated by ordinary session validity plus role/capability checks, never by anything session-*freshness*-related.
Current canonical home: ABSENT (confirmed, not merely unsearched).
Status: NOT_APPLICABLE as a "gap" — this is a clean negative finding, not a hole needing a decision. **Correction after CTO Gate R1**: this finding clarifies F-08A's threat model — a stolen, still-valid session token inherits exactly the same authority an ordinary valid session already has, since no additional fresh-authentication barrier exists anywhere for high-value actions — but it does not by itself reduce F-08A's frozen severity (Security/Institutional/Operational-Auth Debt, unchanged), and it must not be read as implying that step-up authentication or MFA is the required or even recommended fix; that remains an entirely open future Security/Authority design question, not decided or favored here.
Decision required?: No — this finding sharpens the threat model, it does not open or close a decision on its own.
Recommended destination: no action; useful context to cite if F-08A is ever revisited, so a future mission does not have to re-derive the threat model from scratch.

**BR-AUTH-03 — Trade/Escrow identity binding is exclusively the durable `User.id`; session/Transport-Identity churn has no effect on in-flight economic state.**
Rule statement: `Trade.buyerId`/`sellerId` (and by extension every Escrow reference) are `User.id` values throughout — a grep for `peerId` across the entire `open-p2p`/`open-settlement` tree returns zero matches. A session ending and a fresh re-authentication (which only re-derives which session token maps to the same durable `User.id`) changes nothing about an in-flight Trade or Escrow.
Current canonical home: `docs/PARTNER_WALLET_INTEGRATION_IDENTITY_CONTINUITY.md` §1.3-1.4 (`DOCUMENTED-ARCHITECTURE-NOTE`) for the Economic-Identity-vs-Transport-Identity framing; CODE-ONLY for the specific confirmation that Trade/Escrow never reference `peerId`.
Status: PRESENT_BUT_DISPERSED.
Decision required?: No.

**BR-AUTH-04 — Session-expiry mid-trade is a UI/UX continuity concern, not a Business Rule affecting server-side state (do not confuse the two).**
Rule statement: the only thing session expiry can cost a user, per this mission's evidence, is ephemeral, un-persisted **UI draft state** (a half-typed chat message, an in-progress dispute-evidence textarea, a not-yet-submitted payout-address field) on forced remount — never a signing key, never an in-progress PSBT (no evidence of either concept existing client-side was found), and never any change to the Trade/Escrow row itself, which is entirely independent of session lifecycle per BR-AUTH-03.
Current canonical home: `docs/PARTNER_WALLET_INTEGRATION_IDENTITY_CONTINUITY.md` §1.6, §7, §8, §15 — a real, detailed design (the `onSessionExpired` SDK hook, `sessionEpochGate.ts`, return-path continuity), explicitly scoping what "trade context" preservation means (which page the user returns to) and explicitly *not* covering ephemeral form-state loss.
Status: DOCUMENTED-ARCHITECTURE-NOTE, correctly scoped.
Decision required?: No — this is exactly the "UI may communicate a rule; UI must not silently create one" boundary (§14 of the mission brief) applied correctly: the doc itself draws this line already.
Recommended destination: no action.

### Reputation

**BR-REP-01 — Reputation event triggers and exact deltas.**
Rule statement: `POSITIVE_DELTA = +2`, `NEGATIVE_DELTA = -5`, `VOUCH_BURN_PENALTY = -5`. A cooperative release/refund yields symmetric outcomes (both POSITIVE for release, both NEUTRAL for refund); a dispute-adjudicated release/refund yields an asymmetric outcome (winner POSITIVE, loser NEGATIVE, loser's voucher penalized); a dispute-adjudicated split always yields NEUTRAL for both, with no vouch burn.
Current canonical home: `common/events/handlers.ts`'s ownership map (`CODE-ONLY` for the general mapping) is the **sole** dispatcher — confirmed by a repo-wide search for every call site that mutates `reputationScore`; no route, controller, or other module calls `reputationService.recordOutcome()`/`penalizeForBurnedVouch()` directly. RFC-021 D7 (`IMPLEMENTED / RFC FORMALLY UNACCEPTED`) covers vouch-burn specifically.
Test evidence: `tests/reputationOutcome.test.ts` (EXISTS/PROVES every delta/outcome combination listed above, exhaustively).
Status: CODE-ONLY (general mapping) + `IMPLEMENTED / RFC FORMALLY UNACCEPTED` (vouch burn specifically).
Decision required?: No.

**BR-REP-02 — Rating authority: real trade party, real counterparty only.**
Rule statement: `raterId` is always the authenticated session (never body-supplied); the rater must be a real party to the named Trade, and `ratedId` must be exactly the *other* party — enforced at the service layer with `ForbiddenError`/`ValidationError`, not merely documented.
Test evidence gap found: `tests/routes.test.ts:1888-1925` proves the happy path and duplicate-rating rejection; **no test exercises the negative path specifically for this route** (a non-party rater, or a mismatched `ratedId`) — the guard code is real and was read directly, but this specific negative path has no dedicated regression test, unlike equivalent guards on other routes which do.
Current canonical home: CODE-ONLY (`reputation.service.ts:104-137`).
Status: PRESENT_BUT_DISPERSED, with a real test-coverage gap.
Decision required?: No — Evidence/test obligation only.
Recommended destination: evidence/test obligation (add the missing negative-path test); not a Product or Architecture question.

**BR-REP-03 — Pre-escrow cancellation produces no reputation event; post-escrow-refund cancellation always produces one.**
Rule statement, precisely bounded: a Trade cancelled manually before its escrow ever locks (`updateStatus()`, reachable from PENDING/ACTIVE) emits only `openp2p.trade.status_changed`/`intent.cancelled` — no reputation event of any kind fires, since `handlers.ts` has no listener on that event. A Trade that reaches CANCELLED **via an escrow refund** always triggers `applyRefundOutcomes()` (NEUTRAL at minimum, or asymmetric if dispute-adjudicated). Both are labeled `CANCELLED` in `TradeStatus`, but only the second is reputation-relevant — `reputation.service.ts`'s own header comment ("a trade cancelled by mutual agreement always classifies Neutral, never Negative") is accurate only for the second flavor, not the first, which never enters the reputation system at all.
Current canonical home: CODE-ONLY; the distinction itself is not stated anywhere as a rule — it is only derivable by reading both code paths side by side, which this mission did.
Status: IMPLICIT.
Decision required?: No.
Recommended destination: cross-reference only — a strong candidate for a one-line clarifying note wherever `reputation.service.ts`'s header comment is next touched, but not urgent enough to justify a standalone action now.

**BR-REP-04 — The positive/negative asymmetry is a genuine, cross-referenced Business Rule, not a bare implementation constant.**
Rule statement: the deliberate asymmetry (a single lost dispute costs more reputation than two clean trades recover) traces to `docs/security/SYBIL_MITIGATION.md:10-21` (marked ✅ Proven) and is independently corroborated by `docs/THREAT_MODEL.md` and reused by RFC-021's own vouch-burn/arbiter-slashing magnitude choices. This is a positive example of the "Code correctly implements an existing rule" outcome named in the mission brief §9 — not an arbitrary constant, and not a rule this mission needed to invent.
Current canonical home: `docs/security/SYBIL_MITIGATION.md` + `docs/THREAT_MODEL.md` (both `DOCUMENTED-ARCHITECTURE-NOTE`, security-track documents rather than RFCs, but genuinely explaining and justifying the rule, not merely restating the code).
Status: CANONICAL in substance, though housed in a security document rather than a Business Rules or Product document — a cross-referencing opportunity, not a gap.
Decision required?: No.
Recommended destination: cross-reference only.

**BR-REP-05 — Reputation portability across identity representations is a disclosed, open question — not a silent gap.**
Rule statement: reputation is stored and computed exclusively keyed on `User.id`; whether it should or does travel across a wallet/key switch is explicitly framed as **undecided** in `docs/PARTNER_WALLET_INTEGRATION_IDENTITY_CONTINUITY.md` (three competing hypotheses R1/R2/R3 are laid out, with R3 — "losing reputation continuity by design" — explicitly named as a candidate default, not yet chosen).
Why this is a good example, not a bad one: the mission brief's own "possible outcomes" list includes "Code exposes a Product Decision that was never made" — this is exactly that, and the encouraging fact is that it is already *institutionally disclosed as open*, not silently assumed either way.
Current canonical home: `docs/PARTNER_WALLET_INTEGRATION_IDENTITY_CONTINUITY.md` §R1/R3 (`DOCUMENTED-ARCHITECTURE-NOTE`, explicitly marked as an open item).
Status: an Open Obligation already correctly tracked, not a new finding requiring action.
Decision required?: Product Decision — already named as needed in the source document; not newly discovered here, only cross-referenced.
Recommended destination: no action; already correctly disclosed and tracked.

### Capability / Eligibility

**BR-CAP-01 — Capability enforcement is a disclosed policy default; no Business Rule silently assumes it is active.**
Rule statement: `config.features.enforceCapabilities` defaults `false`. This mission specifically checked, for the Reputation and Agent-behavior domains, whether any Business Rule's code path behaves as if enforcement were always on (a latent inconsistency the flag's off-default could expose) — **none was found**. `reputation.service.ts`/`vouch.service.ts` import no capability-check helpers at all; their authority checks are self-contained. The open-agents recommend-vs-execute boundary is structural (no execute-capable route exists at all), not a capability check that could be silently defeated.
Current canonical home: RFC-013/014 (`IMPLEMENTED / RFC FORMALLY UNACCEPTED`, per the prior mission's own finding, unchanged here) for the flag itself; this mission's own negative-evidence check for Reputation/Agent-behavior specifically.
Status: NOT_APPLICABLE (checked, confirmed clean, for these two domains specifically — this does not re-verify the finding across every other domain, which the prior mission already covered).
Decision required?: No.

**BR-CAP-02 — Vouch eligibility is an always-on Business Rule, never policy-gated.**
Rule statement: `MIN_VOUCHER_TRADES = 3` and `reputationScore > 0` gate who may vouch for whom, unconditionally — no feature flag involved, no config dependency.
Current canonical home: CODE-ONLY (`vouch.service.ts:42,63-68`).
Test evidence: `tests/vouchService.test.ts`, `tests/routes.test.ts:1933-1966` (EXISTS/PROVES both the success and ineligible-rejection cases).
Status: PRESENT_BUT_DISPERSED.
Decision required?: No.

### Agent-Assisted Behavior

**BR-AGENT-01 — Every agent-generated action requires a fresh, explicit user approval; no standing-authority mechanism exists.**
Rule statement, falsifiable: there is no code path anywhere in `open-agents/*.ts` or `AgentIntentionPanel.tsx` that allows an agent to act repeatedly under one earlier authorization — a repo-wide search for "standing"/"authoriz"/"one-time"/"approval" vocabulary in `open-agents/*.ts` returns zero matches, because the boundary is enforced *structurally*, not by a permission flag that could be left on: `buyer-agent.ts`/`seller-agent.ts` only ever return a generated payload, never call anything that persists or moves funds; the only three agent HTTP routes (`generate-trade-intent`, `generate-offer-intent`, `assess-intent-risk`) create nothing; and the UI's `handleApprove` (the only call site that invokes `sailsClient.openp2p.trade()`) is gated behind its own distinct button click, separate from generation and separate from "delegate," every single time — adjusting the mandate discards the prior proposal rather than reusing authorization.
Current canonical home: RFC-016 (`IMPLEMENTED / RFC FORMALLY UNACCEPTED`, per the prior mission's own status framing — not re-verified here) + extensive inline INV-12 rationale (`CANONICAL` for the underlying principle).
Test evidence: structural (EXISTS by absence of a bypass route) rather than proven by a dedicated negative-path test — no automated test explicitly asserts "agent output alone can never create a Trade," because there is no code path for such a test to exercise.
Status: CANONICAL in substance (one of the best-enforced rules in the repository), though its formal RFC-016 backing shares RFC-021's same "implemented ahead of acceptance" pattern.
Decision required?: No.
Recommended destination: no action.

---

## 4. Classification Matrix

| Rule | Business Rule | State/Lifecycle | Authority | Policy/Risk/Eligibility | Temporal/Concurrency | Evidence/Auditability | UI consequence | Impl. detail | Unknown/decision |
|---|---|---|---|---|---|---|---|---|---|
| BR-OFFER-01 | ✔ | | ✔ (session-derived owner) | | | | | | |
| BR-OFFER-02 | ✔ | | | | | | | | ✔ (Product) |
| BR-OFFER-03 | ✔ | ✔ (transition guard absence) | ✔ (ownership-only) | | | | ✔ (UI already gates correctly; SDK/HTTP do not) | | ✔ (Product) |
| BR-OFFER-04 | ✔ | | | | | | | ✔ | |
| BR-TRADE-01 | ✔ | | | | | | ✔ (reject with clear reason) | | |
| BR-TRADE-02 | ✔ | | | | | | | ✔ | |
| BR-TRADE-03 | ✔ | ✔ | ✔ (symmetric) | | ✔ (post-commitment race, per Trade's own hardening incident) | | ✔ (control must disappear post-commitment) | | |
| BR-TRADE-04 | ✔ | ✔ | | | | ✔ (never client-claimed) | | | |
| BR-TRADE-05 | | ✔ | | | | | | ✔ (comment drift) | |
| BR-ESCROW-01..05 | ✔ | ✔ (transition maps) | ✔ (role gating each) | | ✔ (atomic claims) | | ✔ (typed denial reasons implied) | | |
| BR-ESCROW-06/07 | ✔ | | ✔ (Destination Authority) | | ✔ (binding timing) | ✔ (correspondence checks) | ✔ (must show bound destination, not editable post-commit) | | |
| BR-ESCROW-08 | ✔ | ✔ | ✔ (seller-only recovery) | | ✔ | ✔ (event emission) | ✔ (stale/expired visibility) | | |
| BR-ESCROW-09 | | | | ✔ (risk-shaped) | ✔ | ✔ | ✔ (typed denial reason: uncertain funding) | | |
| BR-ESCROW-10 | | ✔ | | | | | | ✔ | |
| BR-DISPUTE-01..04 | ✔ | ✔ | ✔ | | ✔ (races, windows) | | ✔ (deadline/eligibility visibility) | | |
| BR-DISPUTE-05 | | | ✔ | | | ✔ (signature verification) | | | |
| BR-DISPUTE-06/07 | ✔ | ✔ | ✔ | | ✔ (no deadline/cap — itself a finding) | ✔ (history preserved) | ✔ (appeal cost/consequence disclosure) | | ✔ (round-cap risk gap) |
| BR-DISPUTE-08 | ✔ | ✔ | ✔ (advisory only) | | ✔ (24h window) | ✔ | ✔ (contest-window visibility) | | |
| BR-AUTH-01 | | | ✔ | | | | | ✔ | |
| BR-AUTH-02 | | | ✔ (absence confirmed) | | | | | | |
| BR-AUTH-03/04 | | | | | | | ✔ (draft-loss disclosure) | ✔ | |
| BR-REP-01 | ✔ | | | | | ✔ (sole dispatcher) | ✔ (score-change disclosure) | | |
| BR-REP-02 | ✔ | | ✔ | | | | | | |
| BR-REP-03 | ✔ | ✔ | | | | | | ✔ | |
| BR-REP-04 | ✔ | | | ✔ (risk-shaped rationale) | | | | | |
| BR-REP-05 | ✔ | | | | | | | | ✔ (Product) |
| BR-CAP-01/02 | | | ✔ | ✔ | | | | | |
| BR-AGENT-01 | ✔ | | ✔ | | | | ✔ (approval UI) | | |

No rule above was force-classified into a column it did not evidence.

---

## 5. Canonical Home Map

| Rule(s) | Current canonical home | Desired canonical home | Movement actually needed? |
|---|---|---|---|
| BR-OFFER-01/02/04, BR-TRADE-02/03/04/05 | Code-only | Code-only, plus a cross-reference index (not a new doc) | No — index only |
| BR-OFFER-03 | Absent | Pending Product Decision, then either extend ADR-002 or a Backlog note | No new document until the decision is made |
| BR-ESCROW-01..05, 08, 09 | Code-only, `PROTOCOL_INVARIANTS.md` (principles) | Same, with pointers added | No |
| BR-ESCROW-06/07 | `DESTINATION_AUTHORITY_ARCHITECTURE.md`, `PROTOCOL_INVARIANTS.md` INV-01 | Same — already the correct, adversarially-reviewed home | No |
| BR-ESCROW-10 | Absent (stated), code (actual) | No action; not urgent | No |
| BR-DISPUTE-01..08 | RFC-021 (D-items), `PROTOCOL_INVARIANTS.md` INV-12 | Same, pending RFC-021's own Governance Decision (F-01, carried forward) | No new document — a governance action, not a doc move |
| BR-AUTH-01..04 | Code-only, `PARTNER_WALLET_INTEGRATION_IDENTITY_CONTINUITY.md` | Same | No |
| BR-REP-01..05 | Code-only, `SYBIL_MITIGATION.md`, `THREAT_MODEL.md`, RFC-021 D7 | Same | No |
| BR-CAP-01/02 | RFC-013/014, code-only | Same | No |
| BR-AGENT-01 | RFC-016, `PROTOCOL_INVARIANTS.md` (INV-12 rationale) | Same | No |

**Every material rule in this inventory already has an identifiable canonical or near-canonical home, or an explicitly-tracked absence of one (BR-OFFER-02/03).** No rule requires creating a new document to be findable — the gap, where one exists, is cross-referencing and (for BR-OFFER-03 and RFC-021's family) a decision, not a missing home.

---

## 6. Implicit Rule Map

Rules enforced by behavior/code today but not institutionally visible, ranked by how surprising their absence-of-documentation would be to a stranger:

1. **BR-TRADE-05** (PENDING→ACTIVE dual path) — the code's own comment claims a stronger property than the code delivers; a stranger reading only the comment would be actively misled.
2. **BR-REP-03** (pre-escrow vs. post-refund cancellation reputation distinction) — only derivable by reading two files side by side; the one comment that gestures at it is accurate for only one of the two cases.
3. **BR-OFFER-04** (economic terms frozen at creation) — true by total absence of a mutator, never asserted.
4. **BR-ESCROW-07** (payout-address binding timing) — precise and correct, but the architecture doc that describes the general timing table does not point to the specific code that implements it.
5. **BR-ESCROW-10** (post-commitment field immutability) — true, narrower DB-enforcement than a plausible prior assumption, never stated either way.
6. **BR-AUTH-02** (no re-auth/step-up anywhere) — a clean absence, valuable precisely because it closes a question rather than opening one; worth stating explicitly somewhere so it is not re-investigated from scratch.

None of these six rise to the severity of a Product or Architecture Decision — they are candidates for cheap, cumulative documentation hygiene the next time each adjacent file is touched, not a reason to open a new mission.

---

## 7. Contradiction Map

Real contradictions only.

1. **BR-OFFER-03**: the reference UI's own cancel-confirmation copy states an offer "cannot be reactivated," while the backend enforces no such rule and the SDK method one layer down accepts any transition. This is a genuine contradiction between **stated product intent** (in UI copy) and **enforced backend behavior** — not merely an undocumented gap, because the UI actively asserts a property the system does not guarantee.
2. **BR-TRADE-05**: the code's own comment ("every other transition is already driven automatically") is contradicted by the code's own transition table, which still permits a manual PENDING→ACTIVE call. Narrow, low-severity, self-contained within one file.

**Not a contradiction (explicitly re-examined and cleared this mission):** the prior mission's F-05 framing of the `prisma/schema.prisma:1447-1449` comment as "misleading relative to `appeal()`'s behavior" — see BR-DISPUTE-06's refinement above. Both statements are true at once; the comment is about row cardinality, not state transitions.

**Not evaluated as a contradiction because it is staleness, not a live disagreement between two current sources:** BRD-01 below (the destination-authority comment). **Corrected after CTO Gate R1**: the comment was not accurate when written and later overtaken by a fix — independent git-ancestry verification shows the fix (`e4cd207`) predates even the comment's own last relevant read during the Foundational Inventory. The comment was already wrong at every point this mission or the prior one encountered it; it is not "two sources disagreeing about the same present fact" only because there is, and was, only one true fact (the gap is closed) and one stale, never-updated description of an earlier state.

---

## 8. Decision Required Map

**Product Decision:**
- BR-OFFER-02/03 — is immediate, unmoderated publication and unguarded status-cycling intentional (Offer as pure non-binding discovery pointer), or a real gap given the confirmed discoverability consequence and the UI-copy contradiction found in §7?
- BR-REP-05 — reputation portability across identity/wallet switches (already disclosed as open in its source document; not newly discovered, only cross-referenced here).

**Governance Decision:**
- The entire RFC-021 family (BR-DISPUTE-01 through 08, BR-ESCROW-05) — carried forward unchanged from the prior, frozen mission's F-01. Not reopened, not re-litigated, not resolved here.
- RFC-016's own formal status (BR-AGENT-01's provenance) — flagged for the same class of decision, not independently investigated to the same depth as RFC-021 this mission.
- BR-DISPUTE-06/07's appeal-round-cap risk-enumeration gap — a candidate note for whoever eventually reviews RFC-021 formally, not a standalone decision.

**Architecture Decision:** none identified this mission that rises above "add a cross-reference."

**Security Decision:** none newly identified — BR-AUTH-02's clean-absence finding clarifies (a stolen valid session grants ordinary access, nothing more, since no step-up mechanism exists to have been bypassed) rather than changes the severity of the previously-frozen F-08A; it is useful context for whoever eventually scopes that hardening work, not a new decision itself, and does not imply step-up/MFA as the answer.

**No decision required:** the substantial majority of this inventory (BR-OFFER-01/04, BR-TRADE-01/02/03/04, BR-ESCROW-01/02/03/04/06/07/08/09/10, BR-DISPUTE-05, BR-AUTH-01/03/04, BR-REP-01/02/03/04, BR-CAP-01/02, BR-AGENT-01) — these rules are either already correctly canonicalized, correctly disclosed as deferred, or narrow enough that indexing/cross-referencing is the entire recommended action.

---

## 9. Traceability Chains (Selected Important Rules)

**BR-ESCROW-06 (Destination resolution):**
`Business Rule` (beneficiary's own registered address, never caller-supplied)
→ `Lifecycle consequence` (only invoked from RELEASE/REFUND/SPLIT transitions, never from CREATED/FUNDS_LOCKED/PAYMENT_PENDING)
→ `Authority requirement` (INV-01, Participant-Bound Authority — the beneficiary's own verified authorization, never inferred from the arbiter or executor)
→ `Policy constraint` (none — this is unconditional, not policy-gated)
→ `Temporal/concurrency requirement` (binding is snapshotted atomically at initiate-time for signature-collection rails; a later rotation cannot rewrite an already-initiated transaction — BR-ESCROW-07)
→ `Evidence requirement` (M6-style correspondence checking treats every execution report as an assertion to verify, never a trusted claim — per `DESTINATION_AUTHORITY_ARCHITECTURE.md` §12)
→ `Human Interface consequence` (a user must be able to see which destination is bound to a pending release, and that it cannot be redirected by anyone else, before/while confirming — not designed here, only the requirement is recorded)

**BR-DISPUTE-06 (Appeal):**
`Business Rule` (a RESOLVED dispute may be appealed by either trade party, with no deadline and no round cap, at escalating cost)
→ `Lifecycle consequence` (RESOLVED is not terminal; APPEALED reopens the same row, never a new one — BR-DISPUTE-07)
→ `Authority requirement` (only the two trade parties; not the arbiter, not a stranger; a new arbiter is drawn, excluding the original)
→ `Policy constraint` (escrow-type and arbitration-mode restrictions — MULTISIG's committed arbiter cannot be appealed away; requires market-arbitration mode)
→ `Temporal/concurrency requirement` (none found beyond escalating cost — this absence is itself flagged as a gap in RFC-021's own risk enumeration)
→ `Evidence requirement` (previous ruling and arbiter preserved as history, compared against the new ruling to decide slashing/fee outcome — never silently overwritten)
→ `Human Interface consequence` (a user appealing must understand the escalating cost and irreversible-if-overturned slashing consequence before committing — not designed here, only recorded)

**BR-OFFER-03 (Offer lifecycle guard absence):**
`Business Rule` (currently: none — any transition is permitted by the owner)
→ `Lifecycle consequence` (no `VALID_TRANSITIONS` map exists for `OfferStatus`, unlike Trade/Escrow/Intent)
→ `Authority requirement` (ownership only, no additional gate)
→ `Policy constraint` (none)
→ `Temporal/concurrency requirement` (none — Trade is fully decoupled from Offer.status after creation, so no race is even possible here, which is itself a mitigating fact)
→ `Evidence requirement` (none)
→ `Human Interface consequence` (the shipped reference UI already independently enforces the safe behavior via `canManage`; the SDK/raw-HTTP layer does not — a future UI or partner integration reusing the SDK method directly inherits the gap with no warning)

---

## 10. Open Obligations

Carried forward, unchanged, from the frozen prior mission (not duplicated in full, only referenced): F-01 (RFC-021 governance gate), F-02 (Sails Engineering Harness canonicalization — Issue #155/#158 in progress), F-08A (session revocation — Security/Institutional/Operational-Auth Debt), F-10 (Issue #99 stale sequencing), BACKLOG item 40 (versioning).

**Newly discovered this mission:**

**BRD-01 — Destination-authority code comment is stale; the gap it describes was already closed — CORRECTED after CTO Gate R1, temporal claim was wrong in the version first submitted.**

`escrow.service.ts:601-609`'s comment still describes an arbiter-override gap for LIGHTNING_HODL/SAFE_GUARD_EVM/WDK_USDT_EVM/MOCK disputes as a live, disclosed residual gap "not fixed by M8-R2." Direct code reading of `dispute.service.ts`'s actual `applyRuling()` shows `releaseToAddress`/`refundToAddress` were removed from its parameters entirely; every call site now passes `undefined`, forcing resolution through the beneficiary's own registered address for every rail. A dedicated regression test (`tests/disputeDestinationAuthorityConformance.test.ts`, 293 lines) covers all four previously-affected rails and passes; the same commit corrected 6 pre-existing assertions in `tests/disputeFlow.test.ts` that had asserted the old, vulnerable behavior.

**Corrected ancestry finding (CTO Gate R1, independently re-verified by this mission):** the fix commit `e4cd2079ee1a463335dce7fb4f85078d3f999c96` ("fix(f1-r): extend F' Destination Authority to remaining disputed rails", authored 2026-09-11 19:28:08 -0300) is an ancestor of `eb2700868ec6f7c4d6bf75379a9ea74b2c8060b6` — **the Foundational Inventory's own baseline** (merged 2026-09-14 19:06:11 -0300 as PR #157). Confirmed directly: `git merge-base --is-ancestor e4cd207... eb270086...` returns true. The version of this finding first submitted to CTO Gate R1 stated the fix happened "since" the Foundational Inventory's baseline — **that was incorrect.** The fix predates that baseline entirely; the gap was already closed before the Foundational Inventory was ever conducted.

**Three distinct claims, kept separate per CTO Gate R1's instruction:**
- **Historically frozen conclusion** (`FOUNDATIONAL_RULES_STANDARDS_INVENTORY.md`, F-06, frozen via PR #159): "a disclosed residual Destination Authority gap remains live for LIGHTNING_HODL/SAFE_GUARD_EVM/WDK_USDT_EVM/MOCK disputes, not fixed by M8-R2."
- **Baseline reality** (verifiable at the moment that conclusion was written, via the same repository it was written from): the gap had already been closed by commit `e4cd207`, which was already an ancestor of that mission's own baseline commit at the time.
- **Current authoritative interpretation**: there is no live Destination Authority residual gap for those four rail types, and there was none at the Foundational Inventory's own baseline either. The only artifact requiring correction is the stale code comment at `escrow.service.ts:601-609`, which was already inaccurate when the Foundational Inventory read it and remains inaccurate today.

**Institutional principle this establishes (recorded here, not written into `ENGINEERING_GOVERNANCE.md` in this mission):**
> Frozen institutional evidence may later be disproven by stronger evidence that already existed at the time of freeze. Freeze preserves the decision/evidence history; it does not convert a factual claim into immutable truth.

**Why the Foundational Inventory failed to detect this — the actual root cause, not merely restated as a fact:** that mission's Pillar D research agent cited `escrow.service.ts:602-609`'s own comment text as its evidence for the gap's continued existence — the comment's self-description ("a disclosed residual gap, not fixed by M8-R2") was treated as sufient proof of current behavior, without independently reading `dispute.service.ts`'s actual `applyRuling()` implementation to check whether the comment's claim still held. This mission's own Escrow research agent did the opposite: it read `dispute.service.ts`'s real code directly, found the parameters had been removed, and only then went to git history to explain *when* and *why*. **The lesson is not "verify absence claims more," which this session already knows — it is narrower and sharper: a comment that describes another file's behavior is itself a claim requiring independent verification against that other file, with the same skepticism applied to any other secondhand assertion, no matter how detailed, dated, or confident-sounding the comment is.** A comment citing a specific mission name and a specific exclusion ("not fixed by M8-R2, out of that mission's bounded scope") reads exactly like verified evidence — its specificity is not proof.

**Does not reopen or edit `FOUNDATIONAL_RULES_STANDARDS_INVENTORY.md`.** That document remains frozen exactly as merged; this entry, and the new §"Prior Frozen Findings Superseded By New Evidence" below, record the supersession without rewriting the original.

Classification: implementation/documentation defect (the stale comment) plus an institutional Truth-Lifecycle finding (the frozen inventory's F-06 was already stale at its own baseline). Disposition: `RESOLVE_NOW` candidate for the comment (a one-line edit) — not performed by this evidence-only mission. The Truth-Lifecycle finding itself requires no fix, only the supersession record above.

**BRD-02 — `tests/sweepers.test.ts` header is stale and misleading.** The file's own header comment describes test coverage for the QVAC auto-resolution sweeper and other escrow-expiry behavior; the file body is `export {}` — zero actual test bodies. The real, current coverage for that specific sweeper lives in `tests/disputeFlow.test.ts`'s own describe block. A developer trusting the header without opening the body would believe coverage exists where it does not (for whatever the header claims beyond what `disputeFlow.test.ts` actually covers — this mission did not exhaustively re-derive everything the stale header once promised, only confirmed the file is now empty).
Classification: Evidence Debt (a misleading evidence artifact, not a missing test per se — the escrow-expiry sweeper tests the header seems to also reference do appear to exist, just not in this file). Disposition: evidence/test obligation — worth a maintainer pass to either restore the file's real content or delete the stale header, not urgent, not performed here.

**BRD-03 — RFC-021's own "Known Risks" section does not enumerate unbounded appeal rounds as a risk.** BR-DISPUTE-06/07's evidence shows appeal is genuinely uncapped except by escalating cost; RFC-021 lines 691-754 (Known Risks) do not name this. Classification: a candidate RFC-021 amendment note for whoever eventually runs its formal acceptance review — not a standalone decision, not urgent, not resolved here.

No previously-tracked OPEN obligation from the prior mission was found to have silently disappeared; each was checked against this mission's own fresh evidence where relevant (RFC-021's status re-confirmed unchanged; F-08A's threat model clarified, not its severity reduced, by BR-AUTH-02 — see table below).

---

## Prior Frozen Findings Superseded By New Evidence

Per the Truth Lifecycle this mission chain applies (`Reality → Observation → Evidence → Classification → Institutionalization → Revalidation`): a finding frozen in a prior, merged report is not immutable truth — it is a claim, evidenced as best that mission could at the time, remaining open to revalidation against stronger evidence. None of the rows below edits or reopens `FOUNDATIONAL_RULES_STANDARDS_INVENTORY.md` itself; each records a supersession discovered during this mission's own, independent investigation.

| Prior finding | New evidence | Current interpretation |
|---|---|---|
| F-05 (Dispute `RESOLVED`/misleading comment) | Full original context of `prisma/schema.prisma:1447-1449`'s comment, read alongside `dispute.service.ts`'s actual `appeal()` code (this mission's BR-DISPUTE-06) | **Prior frozen interpretation superseded by stronger reading of the same evidence, not new facts.** No real contradiction exists: the comment concerns whether a *second Dispute row* is ever created for a trade (`@@unique([tradeId])`'s own rationale) — it does not, ever. `appeal()` reopens the *same row* (`RESOLVED → APPEALED`), a state transition, not a new row. Row cardinality and state-transition semantics were conflated in the original framing. |
| F-06 (Destination Authority residual gap) | `git merge-base --is-ancestor` confirms commit `e4cd207` (2026-09-11) is an ancestor of `eb270086` — the Foundational Inventory's own baseline (merged 2026-09-14) | **Prior frozen conclusion was already stale at its own baseline, not merely overtaken later.** Historically frozen conclusion: gap live, not fixed by M8-R2. Baseline reality: gap already closed by `e4cd207` before that mission's own baseline commit existed. Current interpretation: no live gap for those four rail types; only a stale code comment remains, itself already inaccurate when the Foundational Inventory read it. See BRD-01 for the full root-cause analysis (a comment's self-description was trusted without independently checking the code it described). |
| F-08A (session revocation absence) | This mission's BR-AUTH-02 (confirmed absence of any step-up/re-authentication mechanism anywhere in the codebase) | **Not a supersession of F-08A's substance — a clarification of its threat model, with severity left exactly as previously frozen.** New evidence shows an ordinary valid session authorizes every economically-material write, with no additional fresh-authentication barrier for high-value actions; therefore a stolen, still-valid session token inherits the normal authority of that session — nothing more, nothing less than what was already true. This clarifies what "the absence of revocation" actually exposes; it does not by itself reduce F-08A's frozen severity, and it must not be read as implying MFA/step-up is the required fix — that remains a future Security/Authority design question, not decided or implied here. |

---

## 11. Stranger Developer Test

Applied to the domains this mission actually investigated:

- **Dispute/Arbitration**: a stranger reading `dispute.service.ts` alongside RFC-021 could reconstruct almost every rule found here, including exact economic parameters and their own RFC's stated tentativeness about them. The one thing they could **not** determine without this mission's own fresh evidence: that the appeal-round cap is genuinely absent from the RFC's own risk enumeration (they could observe the code has no cap, but would not know whether that was a deliberate risk-accepted choice or an oversight, without RFC-021's silence on the matter being pointed out).
- **Escrow/Destination Authority**: a stranger reading `DESTINATION_AUTHORITY_ARCHITECTURE.md` alone would come away believing a residual gap for four rail types still exists (per §16's own "what M8-R still needs" framing) — they would need to independently discover commit `e4cd207` to learn it was later closed. This is a real Stranger Developer Test failure, caused entirely by the stale code comment at `escrow.service.ts:601-609` that never got updated to match. **A stranger could not, today, learn from any single document that this gap is closed** — only from reading the current code directly and independently checking git history, exactly as this mission's research agent did.
- **Offer lifecycle**: a stranger would find the gap immediately (a five-minute grep shows no `VALID_TRANSITIONS` map exists), but could not determine whether it's a bug or a deliberate design choice from any document — both this mission and the prior one confirm the same clean "not found on either side" result. Two independent developers would very likely reach different guesses here, which is itself the signal that a Product Decision, not more investigation, is what's missing.
- **Reputation portability**: a stranger reading `PARTNER_WALLET_INTEGRATION_IDENTITY_CONTINUITY.md` would correctly learn this is an open, undecided question — this is the one domain in this report where the Stranger Developer Test passes cleanly specifically *because* the openness itself is well-disclosed.

---

## 12. Proposed Institutional Disposition

| Category | Disposition |
|---|---|
| BR-OFFER-01/04, BR-TRADE-01/02/03/04, most of BR-ESCROW-*, BR-DISPUTE-05, BR-AUTH-*, BR-REP-01/02/04, BR-CAP-*, BR-AGENT-01 | Cross-reference only — no document movement needed |
| BR-OFFER-02/03 | Product Decision required, then Backlog obligation or ADR-002 extension — no new document until decided |
| BR-DISPUTE-01..04/06/07/08, BR-ESCROW-05 (RFC-021 family) | Governance Decision (RFC-021 acceptance) — already tracked as F-01, not duplicated |
| BR-AGENT-01's RFC-016 provenance | Flagged for the same class of Governance Decision, lower priority (not independently re-investigated to RFC-021's depth this mission) |
| BR-REP-05 | Already correctly disclosed as an open Product Decision in its own source document — no action |
| BR-REP-02's test gap | Evidence/test obligation |
| BRD-01 (stale destination-authority comment) | Implementation defect, trivial |
| BRD-02 (stale test-file header) | Evidence/test obligation |
| BRD-03 (RFC-021 risk-enumeration gap) | Candidate RFC-021 amendment note, deferred to that governance review |

**No category in this inventory requires a new canonical artifact.** This is itself a material finding, consistent with the prior mission's own conclusion about the repository generally: the gaps are in decision-sequencing, cross-referencing, and self-description accuracy, not in the absence of places for truth to live.

---

## 13. Proposed Next Sequence

Not started, per instruction. For CTO awareness only:

1. The two Product Decisions this mission surfaced (BR-OFFER-02/03, and the already-tracked BR-REP-05) are small, bounded, and could be resolved independently of any larger mission — each is a single yes/no question with evidence already assembled.
2. BRD-01 and BRD-02 are each a single trivial edit; grouping them into any future "documentation hygiene" pass (if one is ever opened) costs nothing to defer.
3. The RFC-021/RFC-016 governance question remains the single largest lever in this domain, unchanged from the prior mission's own sequencing proposal — this mission adds detail (the appeal-round-cap risk-enumeration gap) but does not change the priority ordering.
4. A dedicated Authority-domain or Escrow-domain consolidation document was considered and is **not** recommended by this mission's own evidence — see §14 for the specific justification.

---

## 14. Is a Dedicated Final "Sails Business Rules Standard" Justified by This Evidence?

**Corrected after CTO Gate R1** — the version first submitted overstated this conclusion's reach.

**What the evidence supports**: a new, standalone Business Rules *corpus* that duplicates existing RFCs, ADRs, invariants, security docs, and implementation contracts is **not justified**. Every material rule inventoried in §3 already resolves to an identifiable canonical or near-canonical home (§5), and no contradiction found (§7) requires a new arbitrating document to resolve it. The dominant failure mode identified in §1 — provenance ambiguity and staleness of self-description — is not fixed by writing a new rulebook; it is fixed by (a) the RFC-021/RFC-016 governance actions already tracked, (b) two small Product Decisions, and (c) a handful of one-line comment/cross-reference corrections. Writing a duplicative rulebook now would create a second source of truth to keep in sync with RFC-021/RFC-018/`DESTINATION_AUTHORITY_ARCHITECTURE.md`/`SYBIL_MITIGATION.md` — the "dangerous duplication" this mission's own governing principles warn against.

**What the evidence does NOT support**, and what the first-submitted version of this section wrongly implied: that Business Rules should not exist as a normative domain, or that no future Standard/index of any kind is warranted. Current governance direction already treats Business Rules as one of eight normative domains (per this mission's own §2 Architectural Context) — this mission's evidence speaks only to whether a *duplicative* corpus is needed now, not to whether the domain itself, or a lightweight discoverability layer over it, has future value.

**Corrected conclusion**:
> A duplicative standalone Business Rules rulebook is not justified. A thin normative index / discoverability layer may still be justified later if it improves cross-domain traceability without becoming a second source of truth.

That index is not created by this mission — its own future justification would need to be evaluated on its own evidence, separately, not assumed from this report.

---

## Executor Self-Audit

1. *Did I mistake code behavior for a Business Rule?* Checked throughout — BR-OFFER-02/04, BR-TRADE-02, BR-ESCROW-10 are explicitly labeled IMPLICIT/CODE-ONLY rather than promoted to CANONICAL, precisely because they are unstated design absences, not decided rules.
2. *Did I mistake UI behavior for a Business Rule?* No — BR-AUTH-04 explicitly separates the UI/UX continuity mechanism from any claim about server-side state, and BR-OFFER-03 treats the UI's `canManage` gate as evidence of *reachability*, not as the rule itself (the rule's absence is at the backend/SDK layer).
3. *Did I mistake absence of documentation for absence of a rule?* Checked via the negative-evidence standard applied to BR-OFFER-03 and BR-AUTH-02 specifically — both list every surface searched, not a single grep.
4. *Did I promote an unaccepted RFC into frozen truth?* No — every RFC-021/RFC-016-sourced rule carries the `IMPLEMENTED / RFC FORMALLY UNACCEPTED` label throughout, including in the Canonical Home Map and Decision Required Map; none is listed as CANONICAL except where a separate, genuinely frozen invariant (INV-01, INV-12) independently backs it.
5. *Did I collapse State/Lifecycle into Business Rules?* No — §4's Classification Matrix and the explicit BR-DISPUTE-06/BR-DISPUTE-07 split (appeal-as-business-rule vs. RESOLVED-non-terminality-as-lifecycle-fact) demonstrate the distinction was actively preserved, per the mission brief's own worked example.
6. *Did I collapse Authority into Business Rules?* No — every rule's "Authority dependency"/"Actors" field is recorded separately from its "Rule statement," and cross-referenced to existing Authority-domain evidence (INV-01, `DESTINATION_AUTHORITY_ARCHITECTURE.md`) rather than re-litigated as if this mission owned that domain.
7. *Did I collapse Policy/Eligibility into Business Rules?* No — BR-CAP-01 explicitly distinguishes the always-on vouch-eligibility Business Rule from the policy-gated capability-enforcement default, per the mission's own "Default ≠ Protocol Truth" instruction.
8. *Did I import a rule because it is conventional elsewhere?* No external convention was imported; every rule traces to this repository's own code, tests, or documents.
9. *Did I invent a rule merely to make the model symmetric?* No — Offer, Trade, and Escrow have visibly different levels of guarding (§2's Domain Map states this asymmetry plainly), and this report does not propose closing that asymmetry by inventing a matching Offer guard; it defers to a Product Decision instead.
10. *Did I preserve uncertainty where evidence is incomplete?* Yes — BR-OFFER-03's economic-consequence question, `docs/ROADMAP.md` being unread, and the full-body of what `tests/sweepers.test.ts`'s stale header once covered are all explicitly flagged as unresolved/unchecked rather than assumed.
11. *Did I create unnecessary canonical homes?* No — §14 explicitly argues against creating a new Standard, and §5 recommends "no movement needed" for the overwhelming majority of rules found.
12. *Could a stranger reproduce every material conclusion?* Yes for nearly all findings — each cites exact file:line evidence, specific test names, and (for BRD-01) an independently-verified git commit/ancestry check. The two lower-confidence exceptions (whether BR-OFFER-02/03's absence is deliberate, and RFC-021/RFC-016's exact acceptance status beyond what this mission spot-checked) are explicitly marked as requiring a decision or a separate governance check, not asserted as reproducible facts.
13. *Did any previously OPEN obligation disappear?* No — §10 explicitly re-affirms F-01, F-02, F-08A, F-10, and BACKLOG item 40 remain open and unchanged; the "Prior Frozen Findings Superseded" table separately clarifies that BR-AUTH-02 sharpens F-08A's threat model without reducing its frozen severity, and that F-06 (not F-08A) is the finding actually superseded by new evidence this mission.
14. *Did any Product/UI consequence become a Product Decision without authorization?* No — §12's UI-consequence fields throughout are framed as "must be recorded for later Human Interface Engineering work," never as an implemented or authorized design.
15. *Did any summary substitute for independently inspectable evidence?* No — this document itself is being prepared for the same durable, branch-and-PR delivery discipline (HARNESS-01) the prior mission's CTO Gate established; it is not being delivered as a chat-only summary.

---

STOP. Awaiting CTO Gate.
