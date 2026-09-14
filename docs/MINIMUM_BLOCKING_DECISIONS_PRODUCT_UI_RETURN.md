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
| A — Restart/Offline/Resume | No named re-entry invariant; **R1: no universal Product State Model exists to name — the real gap is narrower than originally claimed** | **Real, narrow gap — DECISION NOW: freeze two invariants, no enum, honest gap statement (documentation only)** |
| B — Network/Bootstrap Presentation | No frozen UI vocabulary for connected/degraded/reconnecting/etc. | **Not a current blocker — REMAIN OPEN (Watchlist)** |
| C — Cross-Layer Error/Recovery Semantics | Two real, independently-scoped denial/outcome vocabularies exist but their orthogonality is never stated | **Real, narrow gap — DECISION NOW (documentation only)** |
| D — Economic Identity/Recovery | Mission 3 §9 / `[NEW-G]` still OPEN | **Not a current blocker — REMAIN OPEN, reconfirmed** |
| E — Authority Representation in UI | All required distinctions already frozen and, as far as audited, not collapsed anywhere in real code | **Not a blocker — CANONICAL AND CURRENT** |

Two decisions, both pure documentation freezes over already-existing,
already-correctly-scoped real code — no new type, no new enum, no state
machine, no UI build, and no implementation mechanism promoted to a
broader semantic model than the real code actually supports.

## 2. Decision Area A — Restart / Offline / Resume

**R1 correction (CTO Gate Corrective, 2026-09-14) — two overclaims
found and fixed, not redesigned.** The version of this section CTO
review corrected presented `IdempotencyKeyStatus` as if it were the
"in-flight economic operation axis" of a general Product State Model,
and presented a `NO_SESSION | SESSION_EXPIRED | SESSION_VALID` enum as
"already real, Mission 3." Neither survives direct verification against
the real code. **Root cause, recorded per the harness's own self-
critique requirement:** a vocabulary useful for one bounded
implementation concern was promoted into a broader Product semantic
model because its names looked convenient — classification **C,
implementation truth mislabeled protocol/product truth**. `Implementation
≠ truth`; same-looking states do not imply the same object.

**CLAIM (corrected):** Product/UI needs the minimum *invariant* —
not necessarily a new enum — that keeps re-entry from misrepresenting
economic or session state, using only what real code actually proves.

**EXISTING INSTITUTIONAL TRUTH, re-verified against source, not
assumed:**
- ADR-001 §9: *"a party must be able to reconstruct a trade's current
  state from artifacts it already holds plus the settlement provider's
  own authoritative record — never by guessing."*
- `docs/PARTNER_BETA_INTEGRATION_REALITY.md` §9's own 13-row scenario
  matrix — **Verdict: B**: the fund-moving/settlement boundary is
  demonstrably safe; the one real, disclosed, bounded gap is
  client-side session/device resumption UX, not backend safety.
- `src/common/idempotency.ts`'s own header, quoted verbatim:
  *"Deliberately opt-in (a caller who never supplies a key gets today's
  exact, unchanged behavior)... **Honestly bounded, not universal**: the
  idempotency guarantee below applies ONLY when a caller actually
  supplies a key — a caller that omits one gets no protection at all."*
  `IdempotencyKeyStatus` (`IN_PROGRESS`/`COMPLETED`/`UNKNOWN`/`FAILED`)
  is real and shipped, but it describes **the state of one idempotency
  claim for one protected, opt-in attempt** — not the universal
  lifecycle of a trade, escrow, or economic episode.
  **`IdempotencyKeyStatus` ≠ Economic Operation State.** No canonical,
  universal "in-flight economic operation state" enum exists anywhere
  in this codebase today — said explicitly, not implied.
- `packages/sails-ui/src/context/AuthContext.tsx`, re-read directly:
  the real state is `user: User | null` (a locally held authenticated
  context — presence does not prove the remote session is still valid),
  `sessionExpiry: { episode: number; path: string } | null` (an
  *observed expiry episode*, emitted only after a qualifying request
  401s — `sessionEpochGate.ts`'s own convergence mechanism, Mission 3
  R2), and no third state for "proven currently-valid." **No
  `NO_SESSION | SESSION_EXPIRED | SESSION_VALID` enum exists in real
  code.** A locally active session (`user !== null`) is not proof of a
  currently-valid remote session — it can appear active right up until
  the next authenticated request observes an expiry.

**EVIDENCE:** direct source reads this pass — `src/common/idempotency.ts`'s
own header comment; `AuthContext.tsx`'s real `useState` declarations and
`AuthContextType` interface (`user`, `sessionExpiry: { episode, path } |
null` — no other session field exists).

**PRODUCT/UI CONSEQUENCE if left undecided:** the one real risk is a
future screen rendering `UNKNOWN` (from whichever bounded mechanism
actually produced it — idempotency-protected calls today) as if it were
`FAILED` — exactly the defect class CROSS-LAYER-SEMANTIC-CORRECTIVE-1
closed server-side. Inventing a universal enum to "complete the matrix"
would create a second, worse risk: Product/UI code trusting a state
model that does not correspond to any real backend guarantee for most
operations (only idempotency-key-protected ones are actually covered).

**DECISION NOW — invariants only, no enum, no new mechanism, no
implied universal coverage:**

1. **`UNKNOWN` must never be rendered as `FAILED` merely because a call
   returned unsuccessfully or ambiguously** — frozen as a cross-layer
   semantic invariant (restates `IdempotencyKeyStatus`'s own real
   guarantee), not as a universal operation-state enum. This invariant
   applies precisely where `IdempotencyKeyStatus` actually applies
   today — an idempotency-key-protected attempt — and Product/UI must
   not assume it covers every economic operation merely because it
   sounds general.
2. **Three session-related facts must not be collapsed into one
   condition:** (a) no local session at all; (b) an observed
   session-expiry episode (`sessionEpochGate.ts`'s real convergence
   output); (c) a locally active authenticated context. (c) is
   deliberately **not** named "valid" — a locally active context is not
   proof the remote session still is. This is Option B from the
   mission's own two offered shapes: the property is frozen, no new
   enum is introduced, and nothing here is described as an existing
   canonical vocabulary it is not.
3. **Explicit, honest gap statement, not filled speculatively:** a
   generic, canonical Product/UI re-entry operation-state model — one
   that could describe *any* trade/escrow/economic episode's re-entry
   state, not only idempotency-key-protected attempts — **does not
   exist in canonical domain truth today.** Building one is real,
   future Product/UI design work, not something this document can
   freeze by relabeling a narrower mechanism.

**Not designed here:** which screens show which fact, copy, or visual
treatment, or how a future universal operation-state model (if Product
decides one is needed) would be shaped — genuinely a future Product/UI
design task.

**CONSISTENCY SWEEP:** checked against `docs/PARTNER_BETA_INTEGRATION_REALITY.md`
§9's own "Verdict: B" — unaffected, that document never claimed a
universal state enum either, only that the fund-moving boundary
specifically is safe; checked against Mission 3's own R1/R2 text — both
already correctly scoped their own claims to "session" and "expiry
episode" specifically, never claimed a three-state enum exists, so this
correction fixes this document's own overclaim, not a pre-existing one
in Mission 3's frozen content; checked against
`docs/BACKLOG.md` item 35 ("Unified Error & Recovery Semantics —
registered, not implemented") — that item's own title already
acknowledges no unification exists yet, consistent with this section's
corrected finding, not contradicted by it.

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

**R1 precision correction (CTO Gate Corrective, 2026-09-14):**
`IdempotencyKeyStatus`'s own description below is corrected to match
§2's own R1 fix — it is the state of the bounded idempotency mechanism
for one protected logical attempt, never described as the general
outcome model of "an attempt that was made" across Sails. The
orthogonality claim itself (kept below) does not depend on either
vocabulary being universal — two bounded, correctly-scoped vocabularies
can still be orthogonal to each other without either claiming to cover
every case.

**CLAIM:** determine whether Product/UI can consume the current error
semantics as-is, or whether one bounded semantic correction is needed
first.

**EXISTING INSTITUTIONAL TRUTH:** two real, shipped, cross-layer
vocabularies already exist, verified directly against source:

- `CapabilityDenialReason` (`src/common/errors/index.ts`, mirrored in
  `packages/sails-sdk/src/errors.ts`, CROSS-LAYER-SEMANTIC-CORRECTIVE-1
  item 39) — the **typed reason a capability/action is denied,
  unavailable, or ineligible**: `UNSUPPORTED` / `UNAVAILABLE` /
  `FORBIDDEN` / `INELIGIBLE` / `DISABLED` / `NOT_IMPLEMENTED`.
- `IdempotencyKeyStatus` (`src/common/idempotency.ts`,
  CROSS-LAYER-SEMANTIC-CORRECTIVE-1) — the **state of the bounded
  idempotency mechanism for one protected logical attempt**:
  `IN_PROGRESS` / `COMPLETED` / `UNKNOWN` / `FAILED`. Real only where a
  caller actually supplied an idempotency key for an operation that
  actually checks one (`src/common/idempotency.ts`'s own header:
  "opt-in... honestly bounded, not universal") — **not** a general
  outcome model for every attempted operation in Sails.
- `docs/BACKLOG.md` item 35, "Unified Error & Recovery Semantics —
  registered, not implemented," already names the generalization need
  this Decision Area is asking about — not duplicated here.
- Already disclosed, not new: item 40's own text confirms *"no existing
  UI code reads `.reason` today"* — `CapabilityDenialReason` exists and
  is threaded through the wire contract, but no Product/UI consumption
  exists yet.

**EVIDENCE:** direct source read, `src/common/errors/index.ts:50-56`;
`src/common/idempotency.ts`'s own header comment; `docs/BACKLOG.md`
items 35/39/40.

**PRODUCT/UI CONSEQUENCE if left undecided:** the two vocabularies above
are **orthogonal axes, each already correctly scoped to what it
actually covers** — a request can fail `CapabilityDenialReason` before
any attempt is made (nothing to retry, no idempotency claim was ever
opened), or, for the narrower set of operations that supply an
idempotency key, that protected attempt can land in
`IdempotencyKeyStatus`'s own `UNKNOWN`/`FAILED`. Nothing in either
type's own code states this relationship explicitly. A future UI
error-handling layer built without this stated could plausibly try to
render both through one flat "error code" concept — re-collapsing a
distinction CROSS-LAYER-SEMANTIC-CORRECTIVE-1 (item 39) specifically
fixed at the server layer, and separately risk assuming
`IdempotencyKeyStatus` covers operations it structurally does not.

**DECISION NOW (documentation only, no code change — both types are
already correct exactly as shipped).** Freeze the relationship, not a
new mechanism, and not a broader scope than either type actually has:
`CapabilityDenialReason` and `IdempotencyKeyStatus` are two distinct,
independently-scoped vocabularies and must never be flattened into one
generic Product/UI error code. `docs/BACKLOG.md` item 35 remains the
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

**R1 root cause, recorded explicitly per the harness's own
requirement:** the version of §2/§4 CTO review corrected took a
vocabulary useful for one bounded implementation concern
(`IdempotencyKeyStatus`, real only for idempotency-key-protected
attempts; a session-expiry episode mechanism, real only as an
observed-event signal) and promoted it into a broader Product semantic
model — a universal operation-state enum and a canonical session-state
enum — because the names looked convenient for completing a matrix.
**Classification: C — implementation truth mislabeled protocol/product
truth.** Fixed in §2/§4 by re-scoping both claims to exactly what the
real code proves, and by stating explicitly that no universal
re-entry-state model exists rather than inventing one to look complete.

- *Is this actually blocking UI, or merely interesting architecture?*
  Applied to reject Decision Area B as a current blocker and to keep
  Decision Areas A/C narrowly scoped to invariants over already-correct
  code, not new mechanism.
- *Are we promoting a future production concern into present product
  scope?* Applied against Decision Area B — declined. **R1: also
  applied retroactively against Decision Area A's own original
  overclaim** — presenting a bounded mechanism as a universal model was
  exactly this trap, now fixed.
- *Are we solving a mechanism where only a semantic property is needed?*
  Both DECISION NOW items (A, C) freeze invariants only — no enum, no
  new mechanism, no code change.
- *Are we inventing a new term for an object that already has a name?*
  Caught in Decision Area A (declined a "Rejected" fifth state). **R1:
  caught a second, more serious instance of the same failure mode** —
  reusing `IdempotencyKeyStatus`'s and the session-expiry mechanism's
  own real names, but silently widening what they refer to, is the same
  error in the opposite direction (not inventing a new name for an
  existing object, but reusing an existing name for a broader object
  than it actually names).
- *Are we forcing infrastructure concepts into user UX unnecessarily?*
  Applied against Decision Area B — declined.
- *Are we confusing current implementation with protocol truth?*
  **R1: yes, in the original A/C — corrected.** This is precisely
  Classification C above; both sections now cite real code only for
  exactly the scope that code actually covers.
- *Are we preserving a previous CTO statement simply because we made
  it?* No — this correction discards this document's own prior claims
  where direct re-verification (`src/common/idempotency.ts`'s header,
  `AuthContext.tsx`'s real state shape) contradicted them.
- *Would leaving this OPEN actually cause expensive redesign later?*
  The two corrected DECISION NOW items still pass this test (§2/§4's
  own Product/UI Consequence sections) — but now via honest, narrower
  invariants rather than an overclaimed enum, which itself would have
  caused expensive redesign the moment Product/UI trusted it for an
  operation outside idempotency's real, bounded coverage.

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
5. **Minimum decisions recommended for freeze (R1-corrected — invariants,
   not enums):**
   - A: (i) `UNKNOWN` must never be rendered as `FAILED` — frozen as a
     cross-layer semantic invariant scoped to where it actually applies
     (idempotency-key-protected attempts today), not a universal
     operation-state enum; (ii) no local session, an observed
     session-expiry episode, and a locally active authenticated context
     must not be collapsed into one condition — no new enum introduced;
     (iii) explicit, honest statement that **no canonical, universal
     Product/UI re-entry operation-state model exists in domain truth
     today** — not invented here to complete a matrix.
   - C: `CapabilityDenialReason` (typed denial reason) and
     `IdempotencyKeyStatus` (bounded idempotency-claim state, not a
     general attempt-outcome model) are distinct, independently-scoped
     vocabularies, never to be flattened into one generic Product/UI
     error code.
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
10. **Recommendation:** Product/UI may proceed using existing
    domain-specific economic states (`Trade`/`Escrow`/`Offer` status
    fields, already real) plus the two invariants frozen in §2/§4 —
    most centrally, `UNKNOWN` must never be rendered as `FAILED`. **A
    universal re-entry operation-state enum is deliberately not frozen,
    because no canonical one exists yet in domain truth** — that is the
    honest outcome of this pass, preferable to inventing a false
    unification. Nothing above blocks starting Product/UI work.

**READY TO RETURN TO PRODUCT/UI**

MINIMUM BLOCKING DECISIONS BEFORE RETURN TO PRODUCT/UI — READY FOR CTO GATE
