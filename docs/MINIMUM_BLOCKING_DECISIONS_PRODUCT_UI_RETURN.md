# Minimum Blocking Decisions Before Return to Product/UI

**Status:** Narrow decision mission (2026-09-14). **Baseline:**
`main@279dd5d40ff194a968f6b66724953ace4418d89c`. PR #154 is MERGED/
FROZEN — not reopened. Mission 3, Mission 4, and PR #153's frozen
content are not reopened or reinterpreted. This document itself applies
the newly institutionalized Sails Engineering Harness discipline: every
proposed decision below carries CLAIM / EXISTING INSTITUTIONAL TRUTH /
EVIDENCE / PRODUCT-UI CONSEQUENCE / DECISION / CONSISTENCY SWEEP.

**Governing question, restated, answered directly at the end of each
section:** what must be decided now so the next Product/UI phase does
not encode the wrong protocol truth? Everything else stays OPEN.

## 0. Sources Inspected

`docs/BACKLOG.md` (items 34/35/40/41, the Day-0 Multi-Node section);
`docs/ROADMAP.md`; Issue #105; Issue #99; Mission 3 (`docs/PARTNER_WALLET_INTEGRATION_IDENTITY_CONTINUITY.md`,
`packages/sails-ui/src/context/AuthContext.tsx`, `packages/sails-ui/src/lib/sessionEpochGate.ts`);
Mission 4 (`docs/ADAPTIVE_EXECUTION_CAPABILITY_ROUTING.md`); `docs/PARTNER_BETA_INTEGRATION_REALITY.md`
§§4, 8, 9, 17, 18; `docs/adr/ADR-001-day0-multi-operator-network.md` §§6, 9;
`src/common/errors/index.ts` (`CapabilityDenialReason`); `src/common/idempotency.ts`
(`IdempotencyKeyStatus`); `docs/SAILS_DESIGN_LANGUAGE.md` (searched, not
found: any existing connection-status/network-state UI vocabulary);
`prisma/schema.prisma` (searched: no unified Pending/Unknown/Failed/
Rejected economic-operation type exists — `REJECTED` exists only as an
unrelated `VerificationVerdict` enum value in Sails OpenProof).

Searched by subject matter first, per the permanent rule this session's
own prior two corrective rounds established — not by mission/PR name.

## 1. Candidate Blocker Matrix

| Decision Area | Candidate blocker | Verdict |
|---|---|---|
| A — Restart/Offline/Resume | No named "Product State Model for Re-entry" | **Real, narrow gap — DECISION NOW (documentation only)** |
| B — Network/Bootstrap Presentation | No frozen UI vocabulary for connected/degraded/reconnecting/etc. | **Not a current blocker — REMAIN OPEN (Watchlist)** |
| C — Cross-Layer Error/Recovery Semantics | Two real denial/outcome vocabularies exist but their orthogonality is never stated | **Real, narrow gap — DECISION NOW (documentation only)** |
| D — Economic Identity/Recovery | Mission 3 §9 / `[NEW-G]` still OPEN | **Not a current blocker — REMAIN OPEN, reconfirmed** |
| E — Authority Representation in UI | All required distinctions already frozen and, as far as audited, not collapsed anywhere in real code | **Not a blocker — CANONICAL AND CURRENT** |

Two decisions, both pure documentation freezes over already-existing,
already-correct real code — no new type, no new state machine, no UI
build.

## 2. Decision Area A — Restart / Offline / Resume

**CLAIM:** Product/UI needs a named, minimal set of semantic states for
"re-entry" (returning to the app after any interruption) that it must be
able to distinguish, reusing existing real vocabulary rather than
inventing one.

**EXISTING INSTITUTIONAL TRUTH:**
- ADR-001 §9: *"a party must be able to reconstruct a trade's current
  state from artifacts it already holds plus the settlement provider's
  own authoritative record — never by guessing."*
- `docs/PARTNER_BETA_INTEGRATION_REALITY.md` §9's own 13-row scenario
  matrix (app close, escrow lock, connection drop, session expiry,
  device change, provider slow, duplicate callback, process restart,
  etc.) — **Verdict: B** in that document's own grading: the fund-moving/
  settlement boundary is demonstrably safe (Postgres-durable, idempotent,
  `WdkTransferAttempt`'s own PREPARED/SUBMITTED/SUBMISSION_UNKNOWN
  mechanism); the one real, disclosed, bounded gap is **client-side
  session/device resumption UX**, not backend safety.
- Mission 3 (frozen): *No session ≠ Expired session* (`dispatchedWithSessionToken`
  gate, R1) and *Request failure multiplicity ≠ session-expiry
  multiplicity* (`sessionEpochGate.ts`, R2) — real, shipped, tested.
- CROSS-LAYER-SEMANTIC-CORRECTIVE-1 (frozen): `IdempotencyKeyStatus` —
  `IN_PROGRESS` / `COMPLETED` / `UNKNOWN` / `FAILED` — real, shipped,
  the actual mechanism behind *"Unknown outcome ≠ failed economic
  action."*

**EVIDENCE:** all of the above verified directly against real, merged
code and documentation this session (not re-derived) — see §0.

**Precision correction, same-word-different-object check applied:** the
mission brief's own phrase *"Pending ≠ Unknown ≠ Failed ≠ Rejected"* does
not map to a single real four-state type. The real, shipped type is
`IdempotencyKeyStatus` (`IN_PROGRESS`/`COMPLETED`/`UNKNOWN`/`FAILED` —
three of the four words, one renamed: `IN_PROGRESS` is the real word for
*Pending*). No real backend concept named `Rejected` exists for an
in-flight economic operation's outcome — `REJECTED` in this codebase is
`VerificationVerdict` (Sails OpenProof, an unrelated claim/proof
verification concept). **A fifth state is not invented here** — naming
one without a real backend fact behind it would be exactly the
"inventing a new term for an object that already has a name" trap the
mission's own self-critique warns against.

**PRODUCT/UI CONSEQUENCE if left undecided:** without a named minimum
state set, a future screen could plausibly render `UNKNOWN` as if it
were `FAILED` (exactly the defect class CROSS-LAYER-SEMANTIC-CORRECTIVE-1
closed server-side) — the backend property is safe; nothing stops a UI
built without this freeze from re-introducing the same confusion one
layer up.

**DECISION NOW.** Freeze the minimum Product State Model for Re-entry —
two independent axes, not one combined state machine, reusing existing
real vocabulary only:

- **Session axis** (already real, Mission 3): `NO_SESSION` |
  `SESSION_EXPIRED` | `SESSION_VALID`.
- **In-flight economic operation axis** (already real,
  `IdempotencyKeyStatus`, renamed only for UI-facing clarity — no new
  backend concept): `PENDING` (`IN_PROGRESS`) | `COMPLETE` (`COMPLETED`)
  | `UNKNOWN` | `FAILED`.

These two axes are independent — a screen may need to represent, e.g.,
`SESSION_VALID` + `UNKNOWN` (the session is fine, but a specific
operation's outcome is not yet known) simultaneously. **Not designed
here:** which screens show which axis, copy, or visual treatment — that
is genuinely a Product/UI design task, correctly left to the next phase.

**CONSISTENCY SWEEP:** checked against Mission 3's `sessionExpiry`
state shape (`{episode, path} | null`) — compatible, not contradicted;
checked against `IdempotencyKeyStatus`'s own real enum — reused
verbatim in meaning, renamed only for UI legibility; checked against
`docs/PARTNER_BETA_INTEGRATION_REALITY.md` §9 — this freeze names
exactly the gap that document's own "Verdict: B" already identified,
closing it at the semantic-naming level without re-auditing the
underlying safety claim.

## 3. Decision Area B — Network / Bootstrap Presentation

**CLAIM:** the next Product/UI phase might need explicit UI concepts for
connected/degraded/reconnecting/local-view-incomplete/bootstrap-
unavailable/market-temporarily-incomplete/node-selection/advanced-
diagnostics.

**EXISTING INSTITUTIONAL TRUTH:** `docs/BACKLOG.md`'s own `### Node
selection UX` section (2026-09-09, real, pre-existing, confirmed by
direct read — not re-derived): *"infrastructure choice may be visible to
advanced users/operators without becoming mandatory cognitive load for
ordinary users. Target UX for an ordinary user: `Open wallet → Buy/Sell
→ works` — node selection never enters that path."* This already
answers the governing question of this Decision Area directly:
ordinary users see nothing about nodes; an integrator/advanced context
may reason about `primary/fallback/own/partner node` internally, without
that implying any UI/failover mechanism is built.

**EVIDENCE:** `docs/BACKLOG.md`'s Day-0 Multi-Node section, ADR-001 §6.

**PRODUCT/UI CONSEQUENCE if left undecided:** none currently — there is
exactly one real, deployed node today (confirmed throughout this
session's own audits, and by `docs/PARTNER_BETA_INTEGRATION_REALITY.md`
§4's own finding that no cross-node protocol exists yet). A
`connected`/`degraded`/`reconnecting`-across-nodes vocabulary describes a
*multi-node* reality that does not exist to render today. What the
*current* single-node UI needs — ordinary "is my request to the one real
backend succeeding or not" connectivity handling — is a categorically
smaller, already-conventional problem, not blocked on any of this
Decision Area's multi-node vocabulary.

**REMAIN OPEN (Watchlist).** Freezing a multi-node presentation
vocabulary now, against zero real multi-node deployments, would be
exactly the "promoting a future production concern into present product
scope" and "forcing infrastructure concepts into user UX unnecessarily"
traps the mission's own self-critique warns against — the existing
`Open wallet → Buy/Sell → works` principle is sufficient guidance for
today's actual (single-node) product surface. **What is frozen, not
newly decided:** the already-existing progressive-disclosure principle
itself governs any future multi-node UI work the moment it becomes real
— ordinary users stay at `Open wallet → Buy/Sell → works`; any of the
candidate concepts above may appear only in an advanced/integrator
surface, never promoted to ordinary UX by default.

**CONSISTENCY SWEEP:** checked against `docs/BACKLOG.md`'s own
"Shared Market Universe ≠ Instantaneous Identical View" and "Sails
Protocol ≠ Sails Node" — both already frozen, both already correctly
distinguish infrastructure from protocol membership; nothing here
contradicts or duplicates them.

## 4. Decision Area C — Cross-Layer Error / Recovery Semantics

**CLAIM:** determine whether Product/UI can consume the current error
semantics as-is, or whether one bounded semantic correction is needed
first.

**EXISTING INSTITUTIONAL TRUTH:** two real, shipped, cross-layer
vocabularies already exist, verified directly against source:

- `CapabilityDenialReason` (`src/common/errors/index.ts`, mirrored in
  `packages/sails-sdk/src/errors.ts`, CROSS-LAYER-SEMANTIC-CORRECTIVE-1
  item 39) — `UNSUPPORTED` / `UNAVAILABLE` / `FORBIDDEN` / `INELIGIBLE` /
  `DISABLED` / `NOT_IMPLEMENTED`. Answers: *why was this operation never
  attempted or allowed to begin.*
- `IdempotencyKeyStatus` (`src/common/idempotency.ts`,
  CROSS-LAYER-SEMANTIC-CORRECTIVE-1) — `IN_PROGRESS` / `COMPLETED` /
  `UNKNOWN` / `FAILED`. Answers: *what happened to an attempt that WAS
  made.*
- `docs/BACKLOG.md` item 35, "Unified Error & Recovery Semantics —
  registered, not implemented," already names the generalization need
  this Decision Area is asking about — not duplicated here.
- Already disclosed, not new: item 40's own text confirms *"no existing
  UI code reads `.reason` today"* — `CapabilityDenialReason` exists and
  is threaded through the wire contract, but no Product/UI consumption
  exists yet.

**EVIDENCE:** direct source read, `src/common/errors/index.ts:50-56`;
`docs/BACKLOG.md` items 35/39/40.

**PRODUCT/UI CONSEQUENCE if left undecided:** the two vocabularies above
are **orthogonal axes** — a request can fail `CapabilityDenialReason`
before any attempt is made (nothing to retry, no operation exists to
have an unknown outcome), or it can be attempted and land in
`IdempotencyKeyStatus`'s own `UNKNOWN`/`FAILED` (the capability was
never in question — the attempt itself has an ambiguous or negative
result). Nothing in either type's own code states this relationship
explicitly. A future UI error-handling layer built without this stated
could plausibly try to render both through one flat "error code" concept
— re-collapsing a distinction CROSS-LAYER-SEMANTIC-CORRECTIVE-1 (item
39) specifically fixed at the server layer.

**DECISION NOW (documentation only, no code change — both types are
already correct exactly as shipped).** Freeze the relationship, not a
new mechanism: `CapabilityDenialReason` and `IdempotencyKeyStatus` are
two independent axes and must never be collapsed into one Product/UI
error state. A caller may need to represent both at once for a single
economically material action (e.g., a capability was allowed, the
attempt was made, and its outcome is now `UNKNOWN`) — no code exists
today that conflates them, and this freeze exists to keep it that way
once a real consuming UI is built. `docs/BACKLOG.md` item 35 remains the
correct, already-registered home for the eventual UI *presentation*
layer over both — not re-registered or duplicated here.

**CONSISTENCY SWEEP:** checked against item 39's own six-reason
rationale (real, distinct causes, never inferred from message-string
parsing) — this freeze extends the same discipline to the
*relationship between* the two typed vocabularies, not a new one;
checked against Mission 4 §8's Failure Semantics table (Adaptive
Execution's own `discoverExecutionCandidates()` outcomes) — that
mission's four/five-outcome union is a third, narrower vocabulary
specific to settlement-candidate discovery, already explicitly scoped
there and not conflated with either vocabulary here.

## 5. Decision Area D — Economic Identity / Recovery Open Items

**CLAIM:** re-evaluate whether Mission 3's §9 recovery hypotheses and
`[NEW-G]` (canonical Economic Identity abstraction) must be decided now
to avoid Product/UI encoding a false model.

**EXISTING INSTITUTIONAL TRUTH:** Mission 3 already froze the correct
*current*-truth distinctions any UI built today must use:
`User.publicKey` = Economic Identity, `User.peerId` = Transport
Identity, Funds Authority = separate and transaction-specific — real,
shipped, and already correctly kept apart everywhere this session
audited (`AuthContext.tsx`, `WalletAdapter`). ADR-001 §9 additionally
names the *permanently-offline-coordinating-node* recovery case as
looping into this exact same, still-open gap — confirming the
dependency is real, not newly discovered, and was already correctly
named as a dependency rather than solved.

**EVIDENCE:** Mission 3's own frozen taxonomy; ADR-001 §9's explicit
cross-link; confirmed no recovery-flow UI exists anywhere in
`packages/sails-ui` today (nothing to retrofit).

**PRODUCT/UI CONSEQUENCE if left undecided:** none identified. No
recovery UI is being built in the immediately next phase (none exists,
none is implied by any audited doc), and every real field the *current*
UI already uses (`publicKey`, `peerId`) is already correctly scoped per
Mission 3's own frozen distinctions — a UI that simply keeps using those
two fields correctly, as it already does, cannot encode a false model
merely because the *eventual* recovery mechanism is undecided. The risk
this Decision Area worries about (Product/UI baking in a wrong
assumption) would require the next phase to actually build
recovery-facing UI — not evidenced as planned.

**REMAIN OPEN / NOT A CURRENT PRODUCT-UI BLOCKER.** Reconfirmed, not
resolved — consistent with Mission 3's own explicit freeze of this as
OPEN and with this session's own repeated finding that no forcing case
exists yet.

**CONSISTENCY SWEEP:** checked against `[NEW-G]`'s own text (whether
`User.id` should become canonical Economic Identity) — unrelated to any
current UI rendering path, which uses `publicKey` directly, not `id`, for
identity display; no drift found.

## 6. Decision Area E — Authority Representation in UI

**CLAIM:** confirm the UI can represent authority without collapsing
Browsing / Authentication / Economic Identity / Wallet Connection /
Funds Authority, or Technical Capability / Protocol Permission /
Economic Authority / Settlement Eligibility.

**EXISTING INSTITUTIONAL TRUTH:** both distinction chains are already
frozen — the first by Mission 3 (the WalletAdapter boundary work,
`AuthContext.tsx` keeping `user`/`keypair`/session state as genuinely
separate concerns), the second by ADR-002 §6/Mission 4 §3.3 (Technical
Capability ≠ Protocol Permission ≠ Economic Authority ≠ Settlement
Eligibility — restated, not re-derived, by Mission 4).

**EVIDENCE:** direct code read this session and prior sessions'
verified work on `AuthContext.tsx`/`sessionEpochGate.ts` (Mission 3);
ADR-002 §6, Mission 4 §3.3/§19.3 invariant 5 (External Extensibility).

**PRODUCT/UI CONSEQUENCE if left undecided:** none identified — no
collapse of either chain was found anywhere in the real UI code audited
across this session's Mission 3/4 work.

**NOT A BLOCKER — CANONICAL AND CURRENT.** No decision required; both
distinction chains are already correctly represented in shipped code.

**CONSISTENCY SWEEP:** checked against Mission 4 §19.3's own
restatement of the same ADR-002 §6 chain (External Extensibility
invariant 2) — identical wording, no drift; checked against this
document's own Decision Area A (session axis) — the session axis
defined there is a rendering-level simplification of Authentication
specifically, does not collapse it with Economic Identity or Funds
Authority, and is consistent with this chain.

## 7. Self-Critique Applied

- *Is this actually blocking UI, or merely interesting architecture?*
  Applied to reject Decision Area B as a current blocker (interesting,
  not yet forcing) and to keep Decision Areas A/C narrowly scoped to
  naming, not new mechanism.
- *Are we promoting a future production concern into present product
  scope?* Applied directly against Decision Area B's own candidate
  vocabulary — declined.
- *Are we solving a mechanism where only a semantic property is needed?*
  Both DECISION NOW items (A, C) are pure naming freezes over already-
  correct code — no mechanism proposed.
- *Are we inventing a new term for an object that already has a name?*
  Caught directly in Decision Area A — declined to invent a "Rejected"
  fifth state with no real backend referent.
- *Are we forcing infrastructure concepts into user UX unnecessarily?*
  Applied against Decision Area B — declined; the existing "ordinary
  user sees nothing about nodes" principle is reaffirmed instead.
- *Are we confusing current implementation with protocol truth?* No —
  every DECISION NOW item cites the real, current implementation
  explicitly as the source, not an aspiration.
- *Are we preserving a previous CTO statement simply because we made
  it?* This document is produced by the same session that wrote Mission
  3/4/PR#153/PR#154 — each claim above was re-verified against source
  in this pass, not assumed from memory (see §0's source list).
- *Would leaving this OPEN actually cause expensive redesign later?*
  The two DECISION NOW items pass this test directly (§2/§4's own
  Product/UI Consequence sections); B, D, E fail it (no redesign risk
  identified) and are correctly left open or closed as canonical.

## 8. Required Output

1. **Current baseline and sources inspected:** §0.
2. **Candidate blocker matrix:** §1.
3. **Items confirmed as real Product/UI blockers:** none are hard
   blockers in the sense of preventing work from starting — both
   Decision Area A and C are narrow, already-resolvable-by-freezing-a-
   name gaps, not open questions requiring further research.
4. **Items explicitly rejected as current blockers:** Decision Area B
   (multi-node presentation vocabulary — Watchlist, no real deployment
   to render); Decision Area D (recovery/identity — reconfirmed OPEN,
   no forcing UI work); Decision Area E (already canonical, no gap
   found).
5. **Minimum decisions recommended for freeze:**
   - A: the two-axis Product State Model for Re-entry (Session:
     `NO_SESSION`/`SESSION_EXPIRED`/`SESSION_VALID`; Operation:
     `PENDING`/`COMPLETE`/`UNKNOWN`/`FAILED`), both axes reusing 100%
     existing real vocabulary.
   - C: `CapabilityDenialReason` and `IdempotencyKeyStatus` are
     orthogonal axes, never to be collapsed into one Product/UI error
     state.
6. **Exact OPEN items preserved:** Mission 3 §9 recovery hypotheses;
   `[NEW-G]`; `docs/BACKLOG.md` item 40 (protocol/API versioning);
   Decision Area B's multi-node presentation vocabulary (Watchlist);
   Issue #105's own 25-item ordered path (unchanged); Issue #123;
   Issue #150 (already consumed by Mission 4 §7).
7. **Cross-layer consistency findings:** see each Decision Area's own
   Consistency Sweep (§§2-6) — no contradiction found between this
   document and any frozen prior truth; two real gaps found and closed
   by naming only.
8. **Backlog delta:** none required — both frozen decisions are
   narrower than a `docs/BACKLOG.md` top-level item and belong instead
   as a linked companion document (this one), referenced from item 35
   (error semantics) and the Day-0 Multi-Node section (re-entry/session)
   the next time either is touched; no new numbered item opened
   speculatively.
9. **Whether code/docs changes are required:** documentation only — this
   new file. No existing file requires correction (no drift found in
   `BACKLOG.md`/`ROADMAP.md`/ADR-001/Mission 3/4 docs during this pass).
10. **Recommendation:** all identified gaps are resolved by this
    document's own two frozen decisions, both already reflecting
    existing real code with no implementation debt behind them.

**READY TO RETURN TO PRODUCT/UI**

MINIMUM BLOCKING DECISIONS BEFORE RETURN TO PRODUCT/UI — READY FOR CTO GATE
