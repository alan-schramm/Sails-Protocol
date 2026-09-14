# Adaptive Execution / Capability Routing — Mission 4

**Status:** Design + bounded implementation slice (2026-09-14). **Baseline:**
`main@3a0695deef925d6904718103caf8cb3aaef33ea5`. **Type:** Architecture +
implementation record, in the same institutional register as
`docs/adr/ADR-002-asset-settlement-rail-adapter-provider-architecture.md`
(ADR-002), which this mission builds on directly and does not reopen.

**Not authorized by this document:** Selection among multiple eligible
execution candidates (no real case exists yet — see §3/§13); execution;
risk policy implementation; any SDK/UI wiring beyond what §13 lists;
agent-facing routing; a plugin framework, marketplace, or Conformance
suite for §19's External Extensibility contract (architecture only —
nothing in §19 is implemented); any change to `AssetType`, `EscrowType`,
`prisma/schema.prisma`, `docs/SEMANTIC_KERNEL.md`, or Mission 3's frozen
scope (Partner Wallet Integration architecture, WalletAdapter ≠
SettlementProvider, partner parity direction, Economic Identity
terminology, P3-F08.1/F08.2, session-expiry semantics, concurrent-expiry
convergence, return-path continuity — all untouched).

**Scope note (2026-09-14, same session):** §19 (External Extensibility /
Open Integration Model) was added mid-mission, per explicit CTO
instruction, as a required companion to the routing model §1-§18 define
— how independent teams plug new capabilities into Sails without
changing Core economic semantics. It is architecture only, grounded in
the same current-state-audit-first discipline as the rest of this
document; no code was added or changed for §19.

---

## 1. Mission Objective (restated)

> One intent. Many possible paths. One economic truth.
> The system may adapt the path. It may not adapt the truth.

This document defines the boundary between what an economic actor means,
what execution paths exist, what the system may adapt, what narrows the
eligible set, what gets selected, and what evidence proves the selected
path stayed faithful to the original intent — for **adaptive execution
across multiple settlement capabilities**, not merely "pick a provider."

## 2. Current-State Audit

Verified directly against the real, running code on the authorized
baseline — no prior doc trusted without re-verification.

### 2.1 The architecture already frozen and partially built (ADR-002)

ADR-002 (2026-09-12, `docs/adr/ADR-002-...md`) already freezes exactly the
vocabulary this mission needs one layer down from "execution": **Asset ≠
SettlementRail ≠ SettlementScope ≠ SettlementAdapter ≠ SettlementProvider**.
Three real, tested runtime layers already exist on top of it:

1. **`src/common/types/settlement-scope.ts`** — `Asset` (5 values),
   `SettlementRail` (15 values), `SettlementScope` (`{asset, rail}`
   identity pair, no other field — ADR-002 §2/§4).
2. **`src/common/settlement-scope-registry.ts`** — the canonical, sparse,
   explicitly-registered 25-row Day-0 `SettlementScope` table
   (`isSettlementScopeRegistered()`, `listProvidersForScope()`'s own
   upstream dependency). A scope's *absence* means "not Day-0 Product
   Scope"; its *presence with zero providers* is a valid, non-error state
   (ADR-002 §4) — e.g. `{DEPIX, SPARK}` is real Day-0 scope with nothing
   implementing it yet.
3. **`src/common/settlement-provider-registry.ts`** — `SettlementProviderRegistration`
   (`{implementation, scope, capabilities}`), validated at module-load
   time against the scope registry so a provider registration can never
   create Product Scope. Exactly **3 registrations today**, each verified
   directly against its provider file: `MULTISIG → {BTC,BITCOIN_L1}`
   (release/refund/split/signatureCollection), `LIGHTNING_HODL →
   {BTC,ARKADE}` (release/refund/signatureCollection — no split),
   `WDK_USDT_EVM → {USDT,ETHEREUM}` (release/refund/split — no
   signatureCollection). `MOCK`, `SAFE_GUARD_EVM`, `LIQUID_COVENANT` are
   deliberately excluded (test infra / no canonical asset match / zero
   implementation, respectively — see that file's own header for the
   full evidence).

**Every real registered scope today has either 0 or 1 provider.** No
multi-candidate case exists in the live registry — a material fact for
what this mission's slice can safely prove (§13).

### 2.2 The one real wiring: VERTICAL-SLICE-1, and its bounded gate

`src/modules/open-settlement/escrow.service.ts`'s `resolveEscrowType()`
(added 2026-09-12, "VERTICAL-SLICE-1") is the **only** place any of the
above registries were actually consulted at runtime before this mission —
everywhere else, real code paths existed alongside the registries,
unwired to them (exactly what ADR-002 §12 predicted: "types/registry
first, wiring is a separate, later mission").

VERTICAL-SLICE-1's own gate was `if (asset === 'BTC')` — a single legacy
asset, explicitly bounded, with this exact self-documented invariant
already in the code before this mission touched it:

> "Bounded, single-candidate resolution only... deliberately not a
> routing engine. If a future mission ever registers a second
> implementation for this scope, this must fail loudly and be resolved
> by that mission, never silently pick 'first registered wins.'"

This is the precise seam this mission is authorized to widen — not
redesign. §13 generalizes the gate condition (every ADR-002 §11 legacy
mapping, not just BTC) while preserving the exact same N>1 refusal rule,
now general instead of BTC-only.

### 2.3 Real finding: three parallel, duplicated "selection" mechanisms

Before this mission's slice (§13), the actual live selection of "which
settlement implementation handles this asset" happened in **three
independent places**, two of them flat hardcoded maps with zero
candidate/eligibility/selection concept:

1. **Client-side** — `packages/sails-sdk/src/modules/settlement.ts`'s own
   `RECOMMENDED_ESCROW_TYPE` (a private, separately-maintained copy:
   `BTC → MULTISIG, LN_BTC → LIGHTNING_HODL, USDT_ERC20 → WDK_USDT_EVM`),
   consulted by `SailsSettlementModule.create()` **before the network
   call**, so the Reference UI's real traffic always arrives at the
   server with an already-decided `type`.
2. **Server-side legacy** — `src/modules/open-settlement/escrow-providers.ts`'s
   `RECOMMENDED_ESCROW_TYPE` — the *same three mappings*, independently
   hand-maintained, with its own comment acknowledging the duplication
   ("Mirrors escrow.service.ts's RECOMMENDED_ESCROW_TYPE exactly").
3. **Server-side canonical** (ADR-002, VERTICAL-SLICE-1) — real,
   evidenced, but wired to exactly one legacy asset before this mission.

Both hardcoded maps happen to agree today. Nothing in the code enforces
that they keep agreeing — a future edit to one, alone, would silently
drift execution-path selection between client and server with no test
catching it. This is a textbook instance of **implementation convenience
promoted to Product Decision**: which settlement mechanism actually
executes a trade was decided by two unaudited flat lookup tables, not by
any explicit candidate/eligibility/selection model, for every asset
except BTC.

### 2.4 Failure semantics: currently one flat error code

Every failure path in `escrow-providers.ts`/`escrow.service.ts` before
this mission's slice collapsed to `EscrowError` with the single code
`'UNAVAILABLE'` (already corrected, in an earlier mission, from a bare
generic error — CROSS-LAYER-SEMANTIC-CORRECTIVE-1 item 39). But
`'UNAVAILABLE'` itself still conflates: "no candidate supports this asset
at all" (no map entry), "this exact registered type has no provider
class" (`getSettlementProvider()`), and — for the one non-error case
ADR-002 already distinguishes conceptually (`{DEPIX, SPARK}`-style
"registered scope, zero providers") — **no runtime code path expressed
that distinction until this mission's slice (§13)**. §8 registers the
full required vocabulary; §13's slice closes the biggest concrete gap
(scope-vs-provider) without inventing the rest speculatively.

### 2.5 Wallet capability: one real, narrow precedent exists

`packages/sails-p2p-schemas/src/capability-profile.ts` — a self-declared
`capabilityProfile` string (`MULTISIG_CAPABILITY_PROFILE_V1` today, the
only value), checked fail-closed by the server
(`isKnownCapabilityProfile()` — "unknown capability = unsupported," never
guessed compatible). This is real, narrow (MULTISIG only), and is the
only concrete "wallet capability" concept in the codebase. It is
**capability self-declaration**, not availability, permission, or
maturity — precedent this mission's Eligibility model (§4) reuses by
category, not by literal reuse (a future mission would need to decide
whether the same profile-string mechanism generalizes to other rails;
not decided here).

### 2.6 Risk policy: no runtime concept exists yet

No bounded-exposure, velocity-limit, circuit-breaker (in the risk-policy
sense — `escrow-circuit-breaker.ts` exists but is a concurrency-conflict
breaker, not a risk-exposure one), or manual-review gate exists anywhere
in the settlement/execution path today. §7 registers where such a layer
would belong architecturally; none is implemented (matches Issue #150's
own "consumed later... rather than prematurely embedded in Core"
posture, and this mission's explicit non-goal).

### 2.7 Economic Intent: no dedicated type exists — and "Intent" already means something else

`prisma/schema.prisma`'s `Intent` model (RFC-018, `type`/`payload: Json`)
is the canonical **trade-lifecycle** intent (create an Offer, create a
Trade) — already a frozen, load-bearing name in this codebase. **This
mission's "Economic Intent" concept is deliberately never named `Intent`
in code** to avoid colliding with that existing, different meaning — see
§4's naming note. `Trade`/`Offer` already carry the real fields this
mission's Economic Intent would otherwise invent: `asset` (legacy
`AssetType`), `amount`/`lockedAmount`, buyer/seller identity, and
destination authority resolved separately via `PayoutAddress` (M8-R2,
`docs/DESTINATION_AUTHORITY_ARCHITECTURE.md`). No new dimension is
invented here beyond what already exists in running code (§4).

### 2.8 Partner parity: unaffected today, not yet extended

Mission 3 already confirmed `packages/sails-ui` consumes the backend only
through the public `@satsails/p2p-trading-sdk` barrel — this mission's
slice (§13) is server-side-only and changes no public SDK/HTTP contract,
so partner parity is preserved by construction (nothing new is exposed
unevenly) but also **not yet extended** — no partner can see candidate
sets or rejection reasons today; that is registered as future work
(§11/§17), not built.

### 2.9 Classification (A–J framework)

- **Engineering convenience promoted to Product Decision:** the two
  duplicated `RECOMMENDED_ESCROW_TYPE` hardcoded maps (§2.3) — the actual
  choice of settlement mechanism per asset was never an explicit product
  decision with recorded eligibility reasoning; it was two people
  independently typing the same three lines in two files.
- **Implementation truth mislabeled protocol truth:** none found this
  pass beyond what ADR-002 already corrected (the `LN_BTC`/`LIGHTNING_HODL`↔
  `ARKADE` naming, already fixed).
- **Maturity overclaim / hidden capability:** none newly found — ADR-002
  §7 already froze "maturity is separable facts, never one enum," and no
  runtime code claims a maturity level anywhere in this path today (it
  simply has none, which is itself the gap §8/§17 register, not an
  overclaim).

## 3. Execution Model

### 3.1 Economic Intent

**Deliberately not a new type in this slice.** What an actor means, for
every real call site in this codebase today, is already fully expressed
by existing, frozen fields: `Trade.asset`/`Offer.asset` (legacy
`AssetType`, translatable to canonical `{Asset, SettlementRail}` via
`translateLegacyAssetType()` for 5 mappings), `Trade.amount`, and the
beneficiary resolved via `PayoutAddress` (destination authority, already
governed by M8-R2 — release always resolves the buyer's own registered
address, never a caller-supplied one). **This mission does not invent
`settlementConditions`, `timeSensitivity`, `privacyRequirement`, or any
other field** the brief's own template lists as examples — none is
backed by a real call site today, and inventing them "because they sound
useful" is exactly what this mission's own instructions forbid. A future
mission that finds a real product need for one of these dimensions
registers it then, with evidence, not here.

**Naming note:** if a future mission does introduce a dedicated
Economic-Intent-for-routing type, it must **not** be named `Intent` —
that name is already the RFC-018 trade-lifecycle entity
(`prisma/schema.prisma`'s `Intent` model). A collision here would be a
real terminology error this document exists to prevent, not a stylistic
nit — Architecture Decision Required, registered in §17.

### 3.2 Execution Candidate

Already real: a `SettlementProviderRegistration` (`{implementation,
scope, capabilities}`, `settlement-provider-registry.ts`). This mission's
slice (§13) types this explicitly as `ExecutionCandidate` — a **type
alias**, not a new shape, per this repository's own discipline against
inventing structure ahead of a second real dimension (`execution-candidates.ts`'s
own header explains why: ADR-002 draws no distinction yet between "a
provider registration" and "a candidate path").

### 3.3 Eligibility

Preserved exactly as ADR-002 §6/§8 already froze:

> Technical Capability ≠ Protocol Permission ≠ Economic Authority ≠
> Settlement Eligibility.
> Permission Policy ≠ Provider Selection Policy.

Concretely, in this mission's slice: **Product Scope membership**
(`isSettlementScopeRegistered`) and **structural capability**
(`SettlementProviderRegistration.capabilities`) are the only two
eligibility dimensions this slice evaluates — both already real, both
pre-existing. Permission (`RFC-005` `CapabilityGrant`), wallet capability
profile (§2.5), availability (a live provider health/config check — none
exists today), and maturity/evidence (ADR-002 §7) are **registered as
future eligibility dimensions, not evaluated by this slice** (§13's own
scope boundary; §17 backlog delta).

### 3.4 Selection

**Not implemented by this mission.** The only "selection" this slice
performs is the **degenerate, already-approved case**: exactly one
eligible candidate ⇒ auto-resolved (same rule VERTICAL-SLICE-1 already
proved for BTC, now general). More than one eligible candidate is a
**terminal, explicit-refusal outcome** — `MULTIPLE_ELIGIBLE_CANDIDATES`,
§13 — never silently resolved. A real Selection mechanism (scoring, cost/
latency/liquidity weighting, user preference) is Architecture Decision
Required (§17) once a real multi-candidate scope exists to design against
— building one now, against zero real cases, would be exactly the
"complexity must earn its place" violation this repository's engineering
loop forbids.

### 3.5 Execution Result

Unchanged by this mission — `escrow.service.ts`'s existing
`SettlementProvider.lockFunds()`/`releaseFunds()`/`refundFunds()`/
`splitFunds()` remain the only execution surface, and the existing
idempotency/unknown-outcome machinery (`src/common/idempotency.ts`,
CROSS-LAYER-SEMANTIC-CORRECTIVE-1, already merged and frozen) remains the
governing mechanism for "did this execution actually happen" — **not
reimplemented here** (§9).

## 4. Required Invariants

All ten restated verbatim from the brief, cross-checked against what this
slice actually does:

1. **Path selection cannot create authority.** Preserved — `execution-candidates.ts`
   is read-only; it grants no capability, permission, or funds authority.
2. **Path selection cannot redefine the asset.** Preserved — `discoverExecutionCandidates(asset, rail, ...)`
   takes `asset` as an input it never mutates or substitutes.
3. **Path selection cannot redefine the beneficiary.** N/A to this
   slice — it never touches `PayoutAddress`/destination resolution.
4. **Path selection cannot weaken required conditions.** N/A — no
   conditions dimension exists yet (§3.1); nothing to weaken.
5. **Path selection cannot silently downgrade maturity or evidence
   requirements.** Preserved by omission — this slice carries no
   maturity/evidence field at all (§3.3), so it cannot downgrade what it
   never represents.
6. **Path selection cannot convert unavailable into unsupported,
   forbidden, ineligible, disabled, or not implemented.** This is the
   property §13's four-outcome union directly proves — see §8.
7. **A provider may satisfy an intent; it may not redefine the intent.**
   Preserved — `ExecutionCandidate` carries no field that could overwrite
   `asset`/`rail`.
8. **A rail may change execution mechanics; it may not change economic
   meaning.** Restates ADR-002 §9 (interoperability is relationship
   metadata, never identity) — unchanged, not touched by this mission.
9. **Implementation convenience must never silently become Product
   Direction.** This is the exact defect §2.3 documents (loudly, not
   silently) and §13 partially closes for the server side.
10. **The system may recommend a path. Recommendation ≠ authority.**
    `resolveSingleEligibleImplementation()`'s single-candidate return is
    an auto-resolution of a *degenerate* case (only one option exists at
    all), never a recommendation among real alternatives — no code in
    this slice recommends between two real options, because none exist
    (§2.1).

Plus, preserved unchanged (ADR-002, restated for this mission's own
scope): **Asset ≠ SettlementRail ≠ SettlementScope ≠ SettlementAdapter ≠
SettlementProvider**; **Permission Policy ≠ Provider Selection Policy**.

## 5. Routing Pipeline

The brief's suggested shape, checked against what's real:

```
Intent → Candidate Discovery → Capability Filter → Permission Filter →
Availability Filter → Maturity/Evidence Filter → Contextual Constraints →
Eligible Candidate Set → Recommendation/Selection → Execution →
Outcome/Evidence Reconciliation
```

**What this mission's slice actually builds:** `Intent` (as existing
`asset`/`rail`, §3.1) → **Candidate Discovery** (`isSettlementScopeRegistered`)
→ **Capability Filter** (`listProvidersForScope`'s own `requiredCapability`
param) → **Eligible Candidate Set** (the four-outcome
`CandidateDiscoveryResult`) → degenerate **Selection** (auto-resolve iff
exactly one candidate) → existing, unchanged **Execution**.

**Permission Filter, Availability Filter, Maturity/Evidence Filter, and
Contextual Constraints do not exist as runtime stages** — no code
evaluates them today (§2.5/§2.6/§3.3), so ordering them precisely relative
to Capability Filter is premature; a future mission that implements any
one of them must place it explicitly and justify the placement against
real evidence, not against this diagram. **Ordering change disclosed:**
Permission Filter is drawn before Capability Filter in the brief's
template; this mission does not decide that ordering (no Permission
Filter exists to order) — registered as Architecture Decision Required
(§17), not silently assumed.

## 6. Adaptive Context

Classified per the brief's own categories, evidence-based, not
aspirational:

| Context input | Classification | Evidence |
|---|---|---|
| Structural capability (`release`/`refund`/`split`/`signatureCollection`) | **Protocol constraint** | `settlement-provider-registry.ts`, real, evaluated by this slice |
| Wallet capability profile | **Runtime observation** (self-declared, server-verified) | `capability-profile.ts`, real but MULTISIG-only, not evaluated by this slice |
| Cost, latency, liquidity | **Product Decision Required** | No real data source exists for any of these in this codebase today |
| Network/provider availability (live health) | **Architecture Decision Required** | No health-check/circuit-breaker-for-availability concept exists (the real `escrow-circuit-breaker.ts` guards concurrency conflicts, not provider health) |
| Privacy preference | **Product Decision Required** | No field or UI surface exists |
| Operational risk policy | **Operator policy** (future) | See §7 — explicitly not Economic Authority |
| Transaction value | **Runtime observation** (future risk-policy input) | `Trade.amount`/`Escrow.lockedAmount` already real; no policy reads them for risk purposes today |
| Geographic/legal availability | **Product Decision Required** | No field or check exists |
| Maturity/evidence | **Product Decision Required**, framework **Architecture Frozen** | ADR-002 §7 freezes the categories; no runtime representation exists |
| Partner integration capability | **Partner policy** (future) | No differential surface exists today (§2.8) — equal access by construction, not yet a distinct policy layer |
| User-selected preference | **User preference** | No UI/SDK surface exists to express one today |

**Operator policy is never treated as protocol truth** — none of the
above rows collapses an operator-configurable value into
`SettlementScope`/`SettlementProviderRegistration`, both of which remain
pure Product Scope / structural-capability truth.

## 7. Risk Policy Boundary

Consumed directly, per Issue #150 (institutional memory, OPEN,
no-implementation-authorized):

> Valid execution ≠ safe execution at arbitrary scale.
> Risk Policy ≠ Economic Authority.

**No risk-policy code is implemented by this mission.** Architecturally,
a future Risk Policy Gate belongs **after** Eligible Candidate Set /
Selection and **before** Execution — structurally separate from
`SettlementScope` (Product Scope truth), `SettlementProviderRegistration`
(structural capability truth), and any future Eligibility layer
(permission/availability/maturity truth), the same way
`assertRailCanActivateFeeCollection()` and
`assertArbitrationModeCompatibleWithAvailableRails()`
(`escrow-providers.ts`) already exist as separate, later policy checks
distinct from the provider registry itself — real precedent for keeping
policy checks out of registry/capability truth. A Risk Policy Gate must
never be able to rewrite `asset`, `rail`, beneficiary, or which
`SettlementProviderRegistration` was found eligible — it may only ever
add a *further* gate (delay, require review, refuse) on top of an
already-determined eligible/selected candidate, never redefine the
candidate itself. Architecture Decision Required before any
implementation (§17).

## 8. Failure Semantics

The brief's required distinctions, mapped to real code state:

| Distinction | Runtime representation today | After this slice |
|---|---|---|
| No candidate supports the intent | Collapsed into `EscrowError('UNAVAILABLE')` | `SCOPE_NOT_REGISTERED` (distinct) |
| Candidate supported but unavailable | Not distinguished from the above | `SCOPE_REGISTERED_NO_PROVIDER` (distinct — matches ADR-002 §4's own "valid, non-error" framing) |
| Candidate available but forbidden | No permission layer exists (§3.3) | Not represented — future work |
| Candidate implemented but immature | No maturity layer exists (§2.6) | Not represented — future work |
| Candidate eligible but provider failed | Real, evidenced at the provider-call level (e.g. `"[handlers] autoSettleOnMatch failed... err: WDK provider unavailable"` — live log output, `src/common/events/handlers.ts`) | Unchanged by this slice — out of Candidate Discovery's scope; already exists one layer down |
| Candidate execution outcome unknown | Real, evidenced, frozen — `src/common/idempotency.ts`'s `IdempotencyKeyStatus.UNKNOWN` (CROSS-LAYER-SEMANTIC-CORRECTIVE-1, merged) | Unchanged — **already institutionalized, not reinvented here** |
| Selected provider disappeared mid-flow | Same idempotency/UNKNOWN mechanism governs this | Unchanged |
| Fallback possible before execution | This slice's `MULTIPLE_ELIGIBLE_CANDIDATES` outcome is exactly this — no execution has occurred, refusal is free | Real, proven (§13) |
| Fallback attempted after economic side effect | Governed entirely by the existing idempotency mechanism, never by this slice | Unchanged, correctly out of scope |

**Governing invariant, restated and cross-linked, not reinvented:**
"Unknown outcome ≠ failed economic action" is **already** the exact
property `CROSS-LAYER-SEMANTIC-CORRECTIVE-1` froze generically across
`trade.service.ts`/`liquidity.service.ts`/`dispute.service.ts`. This
mission does not duplicate that mechanism — a future Selection/fallback
layer (§3.4, not built) must reuse it, never reimplement it.

## 9. Fallback Model

- **Pre-commit fallback** — no economic side effect. This slice's own
  `MULTIPLE_ELIGIBLE_CANDIDATES` refusal is a real (if currently
  unreachable — §2.1) instance: discovering candidates has zero side
  effects, so refusing before selecting one is always safe. A future
  Selection layer choosing among real N>1 candidates, before calling
  `provider.lockFunds()`, would also qualify — not built here.
- **Post-commit fallback** — requires evidence/reconciliation. **Not
  touched by this mission.** The existing `withIdempotency()` mechanism
  already governs this; no new fallback-after-side-effect code is added.
- **Unknown-outcome state** — preserved as a real state, never collapsed
  to failed, exactly as the existing `IdempotencyKeyStatus.UNKNOWN`
  mechanism already guarantees. This mission adds no new unknown-outcome
  surface.

## 10. User / Product Control

No UI/SDK surface exists today for a user to see or choose among
execution candidates (§2.8) — every real trade flow (`Trade.tsx` → SDK
`create()`) sends one asset, gets one implicit type, with zero visibility
into why. **This is a real, disclosed product gap**, not a decided
"system always chooses" posture — registered in §17, not resolved here.
The one invariant already true by construction: since every real scope
has ≤1 candidate today, the system has never actually exercised discretion
over a real choice — "the system decided" and "there was only one option"
have been indistinguishable in practice until a real second candidate
exists. Preserve for future work: **User chooses interface depth, not
protocol meaning** — restated, not newly decided.

## 11. Partner Parity

Confirmed unaffected: this slice is a pure, additive, server-internal
function with no new HTTP route, SDK method, or UI surface — every
partner (Sails reference UI, Sails Market, Satsails Wallet, white-label,
independent third-party, future agent interface) sees identical behavior
before and after this slice (same final `EscrowType` outcomes for every
currently-tested asset, §13's test evidence). **Not yet extended**: no
partner can query "what candidates exist for this scope" or "why was this
one selected" via any public surface today — that requires a future SDK/
HTTP surface over `discoverExecutionCandidates()`, explicitly deferred
(§17), matching ADR-002 §12's own precedent of sequencing registry-first,
wiring-later, each separately authorized.

## 12. Agent Safety

No agent-facing routing surface exists in this codebase (QVAC's agent
integration is dispute-resolution-scoped, a different module entirely —
unaffected by this mission). **Agent access ≠ Agent authority** is
preserved by simply not building any agent-facing candidate-inspection or
execution surface yet — there is nothing here for an agent to consume, so
no authority-expansion risk exists from this slice. Registered as future
scope only once a real agent-routing consumer exists (§17).

## 13. Implementation Slice

**What was built** — the smallest slice whose architecture was already
proven (VERTICAL-SLICE-1), generalized without redesign:

- **New:** [`src/common/execution-candidates.ts`](../src/common/execution-candidates.ts)
  — pure, side-effect-free, never-throwing. `discoverExecutionCandidates(asset,
  rail, requiredCapability?)` returns one of four exhaustive outcomes:
  `SCOPE_NOT_REGISTERED`, `SCOPE_REGISTERED_NO_PROVIDER`,
  `SINGLE_ELIGIBLE_CANDIDATE`, `MULTIPLE_ELIGIBLE_CANDIDATES`. Composes
  only the two existing registries — no new type, field, or registry of
  its own. `resolveSingleEligibleImplementation()` is the convenience
  wrapper `escrow.service.ts` consumes: returns `{implementation}` for
  the degenerate single-candidate case, or a distinct, honest `{error}`
  string for every other outcome — never the same string for two
  different reasons.
- **Changed:** [`src/modules/open-settlement/escrow.service.ts`](../src/modules/open-settlement/escrow.service.ts)'s
  `resolveEscrowType()` — generalized from `if (asset === 'BTC')` to
  every ADR-002 §11 legacy mapping (`BTC`, `USDT_ERC20`, `USDT_TRC20`,
  `USDT_LIQUID`, `LIQUID_BTC`), routed through the new module instead of
  duplicating the candidate-counting logic inline. **Outcome-preserving**
  for both previously-covered assets (BTC → MULTISIG, USDT_ERC20 →
  WDK_USDT_EVM, byte-for-byte identical final result); newly precise (not
  behavior-breaking — these three assets had no provider before either)
  for `USDT_TRC20`/`USDT_LIQUID`/`LIQUID_BTC`, which now fail with the
  honest "registered Product Scope, zero providers" message instead of
  the generic "no real SettlementProvider is wired" message.
  `LN_BTC` (deliberately ambiguous, ADR-002 §11) and every other legacy
  asset are untouched — still resolved by the pre-existing
  `recommendedEscrowType()` fallback, exactly as before.

  **One genuine, deliberate behavior change, disclosed not silent:**
  generalizing the gate also means an explicit `type` for a mapped asset
  is now validated against the canonical registry where it previously
  wasn't (this was already true for BTC since VERTICAL-SLICE-1; now also
  true for USDT_ERC20/USDT_TRC20/USDT_LIQUID/LIQUID_BTC). This caught a
  real, pre-existing defect: `POST /v1/settlement/escrow` previously
  accepted `type: 'SAFE_GUARD_EVM'` for `asset: 'USDT_ERC20'` with zero
  validation — a semantically wrong pairing per `settlement-provider-registry.ts`'s
  own documented finding (SAFE_GUARD_EVM settles native EVM currency,
  never an ERC-20 USDT transfer). Now correctly rejected. See §17's
  backlog delta for the disclosed test correction.

**What was deliberately NOT built** (non-goals, §18, honored): no
economic optimization, no scoring, no fee-routing intelligence, no AI
routing, no dynamic liquidity optimization, no production policy engine,
no Selection among multiple candidates (none exist to select among), no
risk policy, no SDK/UI wiring, no new custody, no agent surface.

## 14. Evidence Plan

Per the brief's 10 required properties, mapped to what this mission
actually proves (narrowest trustworthy seam — unit tests over the real,
unmocked registry code, following `tests/settlementProviderRegistry.test.ts`'s
own established convention):

1. **Same intent + different eligible providers preserves same economic
   meaning** — N/A today (no scope has >1 real provider, §2.1);
   structurally guaranteed by `ExecutionCandidate` never carrying an
   asset/rail-mutating field (§4 invariant 2/3).
2. **Unavailable candidate is not mislabeled unsupported** —
   `tests/executionCandidates.test.ts`: `SCOPE_NOT_REGISTERED` vs
   `SCOPE_REGISTERED_NO_PROVIDER` produce distinct, asserted-different
   error strings.
3. **Forbidden candidate is not selected** — N/A, no permission layer
   exists to forbid anything yet (§3.3, honestly disclosed, not faked).
4. **Immature candidate cannot silently become production-eligible** —
   N/A, no maturity field exists to silently escalate (§2.6).
5. **Explicit user path preference is preserved when valid** —
   `tests/escrowProviderWiring.test.ts`: a client-supplied `type` that
   matches the canonical implementation is accepted unchanged (existing
   BTC test, now also asserted for USDT_ERC20).
6. **Invalid user-selected path fails explicitly rather than silently
   substituting** — same test file: a mismatched client-supplied `type`
   throws naming both the supplied and canonical values, for both BTC
   and USDT_ERC20.
7. **Automatic recommendation never creates authority** — structural, §4
   invariant 1; the function is read-only, returns data, calls nothing.
8. **Safe pre-commit fallback preserves intent** — `MULTIPLE_ELIGIBLE_CANDIDATES`'s
   own refusal-before-any-side-effect design (§9); real code path,
   currently unreachable against real data (disclosed in
   `tests/executionCandidates.test.ts`'s own comment, not silently
   skipped).
9. **Ambiguous post-side-effect failure does not blindly fallback** —
   governed entirely by the existing, separately-tested
   `IdempotencyKeyStatus.UNKNOWN` mechanism; not this mission's surface.
10. **Partner and first-party UI receive equivalent public routing
    semantics** — vacuously true today (§11 — no public routing surface
    exists yet for either to differ on); becomes a real, testable claim
    only once §17's future SDK/HTTP wiring lands.

**Test evidence produced this mission:**
`tests/executionCandidates.test.ts` (new, 10 tests) and
`tests/escrowProviderWiring.test.ts` (5 new tests, 56 pre-existing tests
unchanged and still passing — proving outcome-preservation directly, not
asserted).

## 15. Reality Scenarios

Evaluated against real code, not hypothetically:

- **A (BTC, multiple rails available)** — real: BTC has 5 registered Day-0
  rails (`BITCOIN_L1`, `LIGHTNING`, `SPARK`, `ARKADE`, `LIQUID`), but only
  `BITCOIN_L1` (MULTISIG) and `ARKADE` (LIGHTNING_HODL) have any provider
  — each independently a `SINGLE_ELIGIBLE_CANDIDATE` scope for its own
  rail; there is no cross-rail "choose the best BTC rail" scenario in
  today's model (rail is caller-supplied context already, via
  `translateLegacyAssetType`'s legacy-asset-to-rail mapping — not decided
  by this slice).
- **B (preferred rail unavailable)** — real, exercised:
  `discoverExecutionCandidates('BTC', 'LIGHTNING')` → `SCOPE_REGISTERED_NO_PROVIDER`
  (registered Day-0 scope, genuinely zero providers — plain `LIGHTNING`
  is distinct from `ARKADE`, per ADR-002 §11's own naming correction).
- **C (provider available, wallet lacks required capability)** — real
  precedent exists (`capability-profile.ts`, §2.5) but is not evaluated
  by this slice's Candidate Discovery layer — a real, disclosed gap
  (§3.3), not silently assumed solved.
- **D (capability supported, policy forbids)** — N/A, no policy layer
  exists (§7/§3.3).
- **E (candidate exists, maturity insufficient)** — N/A, no maturity
  layer exists (§2.6).
- **F (selected provider fails before economic commitment)** — governed
  by existing provider-call error handling, unchanged, real (§8 table).
- **G (selected provider times out after possible side effect)** —
  governed by the existing idempotency/UNKNOWN mechanism, unchanged.
- **H (partner app and reference UI ask for the same candidate set)** —
  vacuously equivalent today (§11); no differential surface exists.
- **I (agent recommends a path but lacks execution authority)** — N/A,
  no agent-facing routing surface exists (§12).
- **J (high-value execution, protocol-valid, operator risk policy
  requires extra handling)** — N/A, no risk policy layer exists (§7); Issue
  #150's lesson is consumed as a placement constraint for a *future*
  layer, not implemented now.

Every N/A above is a disclosed gap, cross-referenced in §17 — never
silently treated as "handled."

## 16. Documentation / DX

- **Mental model:** §3 (Economic Intent = existing `asset`/`rail` fields
  today; Execution Candidate = `SettlementProviderRegistration`;
  Eligibility = Product Scope + structural capability today, more
  dimensions registered as future work; Selection = degenerate
  single-candidate auto-resolution only).
- **Capability vs availability vs permission vs maturity:** §3.3, §6 —
  explicitly, only two of the four are real runtime concepts today; the
  document does not pretend the other two exist.
- **"Why was this candidate rejected?"** — `resolveSingleEligibleImplementation()`'s
  `{error}` string, one of exactly three distinct messages
  (`SCOPE_NOT_REGISTERED` / `SCOPE_REGISTERED_NO_PROVIDER` /
  `MULTIPLE_ELIGIBLE_CANDIDATES`), never the old single generic
  `'UNAVAILABLE'`.
- **"Why was this candidate selected?"** — only ever "it was the sole
  eligible candidate for this registered scope" today; no real
  recommendation reasoning exists yet to document further.
- **"What can I safely retry?"** — unchanged from the existing
  idempotency documentation (`docs/CROSS_LAYER_SEMANTIC_CONTRACT_AUDIT.md`
  and `src/common/idempotency.ts`'s own header) — this mission adds no
  new retry surface.
- **"What does unknown mean?"** — unchanged, same existing
  `IdempotencyKeyStatus.UNKNOWN` documentation — not reinvented.
- **Partner integration view:** §11 — honestly states no public surface
  exists yet, rather than describing one that isn't real.

## 17. Backlog Delta

| Item | Classification | Cross-reference |
|---|---|---|
| Generalize `resolveEscrowType()` from BTC-only to all 5 ADR-002 §11 legacy mappings | **Genuinely new, closed by this mission** | §13; `tests/escrowProviderWiring.test.ts` |
| **Real defect found and closed while generalizing the gate:** the HTTP route previously accepted `type: 'SAFE_GUARD_EVM'` for `asset: 'USDT_ERC20'` with zero validation — a semantically wrong pairing (`settlement-provider-registry.ts`'s own header: SAFE_GUARD_EVM settles native EVM currency, never an ERC-20 USDT transfer, deliberately excluded from `{USDT,ETHEREUM}`'s registration for exactly that reason). Now correctly rejected (409). | **Implementation defect, closed by this mission** | `tests/routes.test.ts` — one test corrected (dated note, not silently rewritten), one new test added proving the rejection |
| `execution-candidates.ts` Candidate Discovery layer (4-outcome union) | **Genuinely new, closed by this mission** | §13; `tests/executionCandidates.test.ts` |
| Client SDK (`packages/sails-sdk/src/modules/settlement.ts`) still has its own separate, unmigrated `RECOMMENDED_ESCROW_TYPE` hardcoded map | **Genuinely new obligation** (found this mission, §2.3) | Not closed — future mission: wire the SDK's `create()` to a public candidate-discovery surface instead of a private hardcoded map |
| Selection among multiple eligible candidates | **Architecture Decision Required** | §3.4 — no real multi-candidate scope exists to design against yet |
| Permission Filter / Availability Filter / Maturity-Evidence Filter as real runtime stages | **Architecture Decision Required** | §5/§6 |
| Risk Policy Gate placement and mechanism | **Architecture Decision Required** | §7, consumes Issue #150 |
| Naming for a future dedicated Economic-Intent-for-routing type (must not collide with RFC-018's `Intent`) | **Architecture Decision Required** | §3.1, §3.5 naming note |
| Partner/UI/SDK surface over `discoverExecutionCandidates()` ("why rejected/selected") | **Product Decision Required** | §11/§16 |
| Cost/latency/liquidity/privacy/geographic context dimensions | **Product Decision Required** | §6 |
| Wallet capability profile generalized beyond MULTISIG, and consumed by Eligibility | **Architecture Decision Required** | §2.5/§3.3 |
| `{USDT,TRON}`/`{USDT,LIQUID}`/`{BTC,LIQUID}` remain registered Product Scope, zero providers | **Already institutionalized** | ADR-002 §5/§12; `docs/BACKLOG.md` item 20.2/20.6 — this mission's slice makes the *message* honest, does not close the underlying implementation gap |
| `docs/BACKLOG.md` item 20 doesn't yet name VERTICAL-SLICE-1/ARCH-IMPL-1/2 by their own numbered sub-item (they're cross-linked from `PROJECT_CONTEXT.md` §5/§10 instead) | **Legitimate deferral** | Doc-hygiene only, no behavior implication; not addressed by this mission (out of bounded scope) |
| Agent-facing candidate inspection/selection surface | **Legitimate deferral** | §12 — no consumer exists yet |

No item above duplicates an existing obligation without a cross-reference
(20.2/20.5/20.6 explicitly cited, not restated as new).

## 18. Non-Goals — confirmed honored

Did not: redesign Economic Identity (untouched, Mission 3 frozen); freeze
recovery (§9 of Mission 3's doc, untouched, still OPEN); create a
universal optimizer (§3.4, explicitly not built); introduce ML/AI
routing; hard-code Satsails Wallet assumptions (this slice touches no
wallet-specific code at all); make one provider or rail canonical (the
four-outcome union treats every scope identically); collapse provider and
rail (ADR-002's distinction untouched); make fee optimization
authoritative; create automatic post-commit retries without evidence
(§9); introduce new custody; redefine economic authority; turn risk
policy into protocol authority (§7).

## 19. External Extensibility / Open Integration Model

Added 2026-09-14, same session, CTO-directed extension to this mission.
Defines how independent teams — wallets, settlement providers, rails,
liquidity sources, custody/signing implementations, identity systems,
reputation systems, arbitration/dispute systems, agents, market
interfaces, risk-policy engines, evidence/data providers — plug new
capabilities into Sails **without changing Core economic semantics**.

> Open extension. Stable semantics. Governed compatibility.
> Integration freedom ends where protocol meaning begins.

### 19.1 Current-state audit — three real, inconsistent extensibility postures

No general extension contract exists today. Three capability families
each arrived at a **different**, organically-grown posture, verified
directly against real code:

- **SettlementProvider — monorepo-privileged, compile-time only.** A new
  settlement implementation must satisfy the `SettlementProvider`
  interface (`escrow-providers.ts`), be hand-added to the hardcoded
  `PROVIDERS` record in that same file, and be hand-added to
  `settlement-provider-registry.ts`'s `PROVIDER_REGISTRATIONS` array —
  three edits inside this repository, by someone with commit access,
  compiled into the same binary. **An independent developer cannot add a
  settlement provider today without a PR into this monorepo.** This is a
  real, disclosed gap against the "stranger developer" bar below, not a
  design this mission is authorized to change (§13's slice touches
  neither map).
- **MarketArbitrationProvider — real runtime self-registration, one
  capability family.** `register(participantId, monetaryCollateral,
  collateralAsset?)` (RFC-021 D2/D3, `market-arbitration.provider.ts`)
  lets **any participant** post collateral and become an eligible
  arbiter candidate at runtime — no monorepo edit, no privileged support.
  This is the one real precedent in this codebase for genuine external
  participation in a capability family, and the closest existing model
  to what this section formalizes.
- **WalletAdapter — client-side interface, no server registration at
  all.** `packages/sails-sdk/src/wallet-adapter.ts`'s `WalletAdapter`
  interface (`getPeerId`/`getAddress`/`getBalance`/`signTransaction`/
  `broadcastTransaction`/`getCapabilities(): Promise<WalletCapabilitiesDeclaration>`)
  is implemented entirely in the *integrator's own client code* — Sails
  Core never registers or even knows which concrete `WalletAdapter`
  implementation a given user's client is running. `WalletCapabilitiesDeclaration`
  (`{assets, fiatRails, supportsP2PTrading, supportsOnchainSettlement}`)
  is the one existing **Capability Declaration** precedent in this
  codebase — self-declared by the integrator, consumed by the SDK, never
  server-verified (unlike `capability-profile.ts`'s server-side
  fail-closed check, §2.5 of this document — a real, disclosed
  inconsistency between two capability-declaration mechanisms that
  already coexist).

**Finding:** extensibility itself was never designed as a general
contract — each family solved its own version of "how does an outside
implementation participate" independently, with no shared vocabulary for
Declaration, Constraints, Conformance, Evidence, or Eligibility. This
section defines that shared vocabulary; it does not retrofit the three
existing mechanisms above (out of this mission's bounded scope — a
future migration mission would decide whether/how each one adopts it).

### 19.2 The minimal extension contract

Per the CTO's own required shape — deliberately not a universal plugin
framework (§19.6):

```
External Capability → Public Contract → Capability Declaration →
Constraints → Conformance → Evidence → Eligibility → Runtime Participation
```

- **External Capability** — the category of thing being extended
  (settlement rail, wallet, identity system, reputation system,
  arbitration mechanism, agent, market interface, risk-policy engine,
  evidence/data provider). Not a new taxonomy invented here — these are
  exactly the capability families ADR-002 (`SettlementAdapter`/
  `SettlementProvider`), RFC-013 (`WalletAdapter`), and RFC-021
  (`MarketArbitrationProvider`) already separately name.
- **Public Contract** — a versioned, publicly documented interface a
  third party implements against, published independently of this
  monorepo's internals (e.g. an npm-published TypeScript interface, or a
  versioned HTTP/JSON-RPC contract) — **never** "read the source of
  `escrow-providers.ts` to infer the shape," which is the real, current
  state for `SettlementProvider` (§19.1). Existing precedent for what a
  real Public Contract already looks like: `@satsails/p2p-trading-sdk`'s
  own `WalletAdapter` export and `docs/API_STABLE.md`'s frozen HTTP
  surface.
- **Capability Declaration** — the integrator's own, self-asserted
  statement of what their implementation does (`WalletCapabilitiesDeclaration`,
  `capability-profile.ts`'s profile string — both real precedent). A
  declaration is a **claim**, never a **proof** (§19.3 invariant 2) —
  distinguishing it from Conformance/Evidence below is the single most
  important boundary this contract draws.
- **Constraints** — structural limits the Public Contract itself imposes
  (e.g. `PayoutAddress`'s `@@unique([participantId, asset])` already
  constrains `WalletAdapter.getAddress()` to one address per asset,
  §19.1) — protocol-level facts an integrator must satisfy, not
  negotiable per-integration.
- **Conformance** — an independently-checkable demonstration that a
  declared capability actually behaves per the Public Contract (a
  conformance test suite/vector set the integrator runs against their
  own implementation and can show the result of) — **does not exist yet
  for any capability family in this codebase** (a real, disclosed gap;
  `tests/arbitrationAuthoritySdkParity.test.ts`-style parity tests are
  the closest existing precedent, but they test this repo's *own* two
  sides, not a third party's implementation).
- **Evidence** — what has actually been demonstrated about a specific
  deployed instance (an audit, a real operational track record, a
  monitored incident-free period) — restates ADR-002 §6's own Security/
  Evidence Property discipline, applied here to third-party
  implementations specifically: **a third party may never self-declare a
  Security/Evidence Property**, exactly as ADR-002 §6 already forbids a
  first-party provider from doing so.
- **Eligibility** — whether a specific, evidenced, conformant
  implementation is allowed to actually participate for a given scope —
  restates ADR-002 §6/§8's frozen distinction (Technical Capability ≠
  Protocol Permission ≠ Economic Authority ≠ Settlement Eligibility;
  Permission Policy ≠ Provider Selection Policy), now explicitly
  extended to cover third-party-originated candidates, not only
  first-party ones.
- **Runtime Participation** — the mechanism by which an eligible external
  implementation actually becomes reachable at runtime. Two real,
  different existing shapes to choose from per capability family (not
  decided uniformly here — Architecture Decision Required, §19.7):
  self-registration (`MarketArbitrationProvider.register()` — permissionless,
  runtime, real precedent) vs. client-side-only (`WalletAdapter` — no
  server registration, the integrator's own client simply implements the
  contract).

### 19.3 Required Invariants

1. **Third-party implementation ≠ protocol truth.** An external
   `SettlementProvider`/`WalletAdapter`/arbiter/agent implementation
   never becomes `SettlementScope`, `SettlementProviderRegistration`, or
   any other canonical registry truth merely by existing or by declaring
   itself — restates ADR-002 §4's "registration is explicit," now
   applied to third-party origin specifically.
2. **Interface compatibility ≠ security compatibility.** Implementing
   the Public Contract's method signatures correctly says nothing about
   whether the implementation is safe to trust with real value —
   Conformance (behavioral correctness) and Evidence (demonstrated
   security property) are separate, later gates, never implied by
   type-checking against the interface.
3. **Compatibility ≠ maturity.** A conformant implementation is not
   thereby mature — restates ADR-002 §7's "maturity is separable facts,"
   now explicit that Conformance is only one of those facts, never a
   stand-in for the rest.
4. **Maturity ≠ production eligibility.** Restates ADR-002 §6's own
   "Production Eligibility... a governed decision informed by evidence
   plus operational/security/product constraints, never a computed
   function of evidence alone" — unchanged, now explicit that this
   applies identically to a third-party-originated candidate as to a
   first-party one; no lower (or higher) bar for an outside integrator.
5. **A new integration may extend capability, but may not redefine
   economic semantics.** Restates this mission's own §4 invariants (path
   selection cannot redefine the asset, beneficiary, or required
   conditions), now stated as a boundary on *what a third party's Public
   Contract implementation is even structurally capable of doing* — the
   contract itself must never expose a method that could substitute
   asset/beneficiary/economic-outcome fields the caller didn't supply.

### 19.4 What Sails may assume / must verify / stays implementation-private

- **Sails may assume:** the Public Contract's method signatures are
  implemented (type-level, checked at integration time); a Capability
  Declaration exists and is well-formed (structurally, not truthfully).
- **Sails must verify:** every claim beyond bare interface conformance —
  Conformance (does it actually behave correctly, via an independently
  runnable test/vector suite), Evidence (was a claimed security property
  actually demonstrated, never self-declared per ADR-002 §6), and
  Eligibility (is this specific evidenced instance actually authorized
  for this scope) — restating, never re-deciding, the "unknown capability
  = unsupported" fail-closed default `capability-profile.ts` already
  established for the one real precedent that exists.
- **Stays implementation-private:** everything behind the Public
  Contract's interface boundary — an integrator's internal stack (key
  management, infrastructure, language, hosting) is never Sails' concern
  and never needs to be disclosed to Core, exactly as `WalletAdapter`
  already proves today (Sails Core never asks what signs a transaction
  internally, only that `signTransaction()` returns a result matching
  the contract). **The Core must not require knowledge of an
  implementation's internal stack to coordinate it** — this is already
  true for `WalletAdapter` and `SettlementProvider`'s public methods; this
  section generalizes it as a standing requirement for every future
  capability family, not merely an accident of today's two interfaces.

### 19.5 The "stranger developer" perspective

Evaluated honestly against real code, per capability family:

- **Arbitration** — **passes today.** An independent developer reading
  only RFC-021 and calling `POST /v1/settlement/arbitration/register`
  with collateral becomes a real, eligible arbiter candidate — no
  monorepo access, no privileged support, verified against real, shipped
  code (§19.1).
- **Wallet** — **passes today, with a caveat.** An independent developer
  implementing `WalletAdapter` from its published SDK interface (no
  monorepo knowledge needed — it's a public, documented TypeScript
  interface) can participate fully client-side. The caveat: `capability-profile.ts`'s
  server-side fail-closed check (§2.5) currently recognizes exactly one
  profile string (`MULTISIG_CAPABILITY_PROFILE_V1`) — a stranger's
  genuinely new, correct `WalletAdapter` implementation for a *different*
  capability shape would be rejected as "unknown = unsupported" until a
  first-party mission adds their profile string, which is not something
  a stranger can do unassisted today. Disclosed, not solved here.
- **Settlement Provider** — **fails today.** §19.1 already establishes
  this: three hand-edited, monorepo-internal maps, zero public Conformance
  suite, zero self-registration path. A stranger literally cannot
  participate without a PR and a maintainer's cooperation. This is the
  sharpest concrete gap this section's contract (§19.2) is meant to
  eventually close — **not closed by this mission** (§19.6).
- **Every other family** (identity, reputation, agents, market
  interfaces, risk-policy engines, evidence/data providers) — **no
  extension surface exists at all** to evaluate a stranger against; these
  are either fully first-party today (reputation, identity) or entirely
  unbuilt (risk-policy engines, per §7 of this document).

### 19.6 Non-goals confirmed for this section

Not built: a universal plugin framework; a marketplace or plugin
registry; a Conformance test-vector suite for any capability family; any
change to `SettlementProvider`'s current monorepo-only registration
(§19.1's own finding is disclosed, not fixed — fixing it is a real,
separately-scoped future implementation mission); any new HTTP/SDK
surface. This section is architecture — the shared vocabulary and
invariant set a future implementation mission would build against — not
product packaging, per the CTO's own explicit instruction.

### 19.7 Backlog Delta (extensibility-specific additions)

| Item | Classification |
|---|---|
| `SettlementProvider` registration is monorepo-privileged, not externally pluggable — fails the "stranger developer" bar | **Genuinely new obligation** (found this session) — Architecture Decision Required: design a real Public Contract + Runtime Participation mechanism for settlement providers, modeled on `MarketArbitrationProvider.register()`'s real precedent |
| No Conformance suite exists for any capability family | **Genuinely new obligation** — Architecture Decision Required |
| `WalletCapabilitiesDeclaration` (self-declared, unverified) vs. `capability-profile.ts` (self-declared, server-verified fail-closed) are two inconsistent Capability Declaration mechanisms | **Genuinely new obligation** (found this session) — Architecture Decision Required: decide whether these should converge |
| Whether Runtime Participation should be self-registration (arbitration's model) or client-side-only (wallet's model) for each future capability family | **Architecture Decision Required per family**, not decided uniformly here |
| Extension contract's interaction with Mission 4 §3's Execution Candidate model (does a third-party settlement provider become an `ExecutionCandidate`?) | **Architecture Decision Required** — this document deliberately does not merge the two models prematurely |

---

## Required Return

- **Baseline HEAD:** `main@3a0695deef925d6904718103caf8cb3aaef33ea5`
- **Current-state audit:** §2
- **Execution model:** §3
- **Explicit invariants:** §4
- **Routing pipeline:** §5
- **Context classification:** §6
- **Failure/fallback model:** §8/§9
- **Partner-parity result:** §11
- **Agent-safety result:** §12
- **Smallest implementation slice selected:** §13
- **Exact files changed:** `src/common/execution-candidates.ts` (new),
  `src/modules/open-settlement/escrow.service.ts` (generalized
  `resolveEscrowType()`), `tests/executionCandidates.test.ts` (new),
  `tests/escrowProviderWiring.test.ts` (5 new tests, describe-block title
  corrected), this document (new)
  Also corrected this same session, per the CTO's mid-mission extension:
  `tests/routes.test.ts` (one test corrected with a dated note — a real
  pre-existing defect found while generalizing the gate, §13/§17; one new
  test added proving the correct rejection).
- **Tests/evidence:** §14; 56 pre-existing + 5 new tests in
  `escrowProviderWiring.test.ts` (all passing), 10 new tests in
  `executionCandidates.test.ts` (all passing), 136 tests in
  `routes.test.ts` (all passing, including the corrected/new
  SAFE_GUARD_EVM tests)
- **Live/reality scenarios:** §15
- **External Extensibility / Open Integration Model:** §19 — three
  inconsistent existing extensibility postures audited
  (SettlementProvider monorepo-privileged, MarketArbitrationProvider
  real self-registration, WalletAdapter client-side-only); the minimal
  8-stage extension contract defined (External Capability → Public
  Contract → Capability Declaration → Constraints → Conformance →
  Evidence → Eligibility → Runtime Participation); all 5 required
  invariants restated and cross-checked; stranger-developer bar evaluated
  per family (arbitration passes, wallet passes with a caveat, settlement
  provider fails, every other family has no extension surface at all).
  **Architecture only — no plugin framework, marketplace, or Conformance
  suite implemented**, per explicit instruction.
- **Backlog delta with duplicate analysis:** §17 (routing) + §19.7
  (extensibility)
- **Product Decisions required:** §17 (three rows)
- **Architecture Decisions required:** §17 (five rows) + §19.7 (five rows)
- **What remains NOT FROZEN:** everything in §17/§19.7's "Architecture/
  Product Decision Required" rows; Selection among multiple candidates;
  Risk Policy; Permission/Availability/Maturity filters; SDK/UI/partner/
  agent wiring; the entire External Extensibility contract (§19 is
  architecture only, nothing in it is implemented or frozen);
  `SettlementProvider`'s monorepo-privileged registration (disclosed, not
  fixed). Plus, restated unchanged from Mission 3's own freeze: §9
  recovery hypotheses and `[NEW-G]` canonical Economic Identity
  abstraction remain OPEN — not touched, not dependent on, by this
  mission.
