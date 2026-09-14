# Post-Mission-4 — External Extensibility Blind-Spot & Precedent Consolidation

**Status:** Architecture review + external precedent study + institutional
consolidation (2026-09-14). **Not an implementation mission.** **Baseline:**
`main@b2d40a2877017462377710dd4fa1478b5ae4f48f`. Mission 4 is CLOSED AND
FROZEN — its runtime slice (`src/common/execution-candidates.ts`,
`escrow.service.ts`'s generalized `resolveEscrowType()`) is not reopened,
modified, or reinterpreted by this document. Mission 4's own design doc
(`docs/ADAPTIVE_EXECUTION_CAPABILITY_ROUTING.md`) is not edited by this
mission either — this is a companion document, not a correction to it.

No code changed. No implementation authorized. This document itself is
the "tiny institutional correction" the brief allows for — a
documentation-only artifact that prevents a specific truth-drift risk
named in §19 (that Mission 4's `ExecutionCandidate` type alias could be
silently read as more final than it is) by stating that risk explicitly,
rather than by editing Mission 4's own frozen file.

---

## 0. Baseline Verified

```
git log -1 --format="%H %s" origin/main
b2d40a2877017462377710dd4fa1478b5ae4f48f Mission 4: Adaptive Execution / Capability Routing — audit + bounded slice (#151)
```

Confirmed directly, matches the CTO's authorized baseline exactly.

## 1. Central Question (restated)

What must Sails preserve so independent teams can extend it safely over
time without changing Core economic meaning, acquiring authority merely
by integrating, creating hidden first-party privilege, forcing Core
rewrites per technology, coupling to one stack, or letting extension
lifecycle changes corrupt in-flight economic truth?

> Open extension. Stable semantics. Governed compatibility.
> Integration freedom ends where protocol meaning begins.
> An open extension system is not defined by how easily something plugs
> in. It is defined by how safely something can enter, evolve, fail and
> leave without changing Core truth.

Every finding below is tested against this question, not against how
closely it resembles an external system.

## 2. Current Sails Extensibility Reality

Verified directly against `main@b2d40a2877017462377710dd4fa1478b5ae4f48f`
— extends, does not duplicate, Mission 4's own §19 audit (three postures:
SettlementProvider, MarketArbitrationProvider, WalletAdapter). New
dimensions this mission requires, not covered there, verified fresh.

| Dimension | State | Evidence |
|---|---|---|
| SettlementProvider registration | **MONOREPO-PRIVILEGED** | `escrow-providers.ts`'s `PROVIDERS` record + `settlement-provider-registry.ts`'s `PROVIDER_REGISTRATIONS` array — both hand-edited, compile-time, inside this repo (Mission 4 §19.1) |
| WalletAdapter | **EXISTS, client-side-only** | `packages/sails-sdk/src/wallet-adapter.ts` — public interface, no server registration at all (Mission 4 §19.1) |
| Arbitration registration | **EXISTS, real runtime self-registration** | `MarketArbitrationProvider.register()` (RFC-021 D2/D3) — the one real "stranger developer" precedent (Mission 4 §19.1/§19.5) |
| Capability declaration | **PARTIAL, two inconsistent mechanisms** | `WalletCapabilitiesDeclaration` (self-declared, never verified) vs. `capability-profile.ts` (self-declared, server fail-closed verified) — Mission 4 §19.1 |
| Candidate Discovery | **EXISTS, frozen, bounded** | `src/common/execution-candidates.ts` (Mission 4, R1-corrected) — structural compatibility only, explicitly not full Eligibility |
| SettlementScope | **EXISTS, frozen (ADR-002)** | `src/common/settlement-scope-registry.ts` — 25-row canonical, sparse, explicit registry |
| SDK exposure | **EXISTS, single surface** | `@satsails/p2p-trading-sdk`'s own barrel (`packages/sails-sdk/src/index.ts`) — the only public contract surface that exists today; no plugin-loading mechanism of any kind |
| Versioning | **HARDCODED / OVERLOADED** | Four uncoordinated version concepts already live: `Offer.protocolVersion`/`Trade.protocolVersion` (DB field, literal `"0.1"` default, no real semantics — `prisma/schema.prisma`); SDK npm version (`0.1.3`); server npm version (`0.1.1`); the `/v1/` URL prefix (the only thing actually enforced). `docs/BACKLOG.md` item 40 (CSC-H01/H02/H03, OPEN, a Decision Mission not yet run) already names this conflation directly: *"no API/protocol versioning exists beyond the literal `/v1/` URL prefix, with no mechanism for a future `/v2/` to coexist without a hard cutover"* |
| Module registration | **HARDCODED / folder convention only** | `src/modules/{open-p2p,open-settlement,open-liquidity,open-proof,open-identity,open-reputation,open-agents}` — no `ModuleRegistry`, no dynamic mounting; routes wired directly in `app.ts`. `moduleId` exists as a DB field (`Offer.moduleId` default `"openliquidity"`, `Trade.moduleId` default `"openp2p"`) but is bookkeeping metadata, not a registration mechanism |
| Provider identity | **DOCUMENTED ONLY, deliberately unmodeled** | `settlement-provider-registry.ts`'s own header: canonical Provider Identity (distinguishing two operators both running `MULTISIG`) is "a future, separate concept this type deliberately does not model" (ARCH-IMPL-2-R1) |
| Provider lifecycle | **ABSENT** | No register/deregister/disable/revoke concept exists for `SettlementProvider` — the `PROVIDERS` map is a static object literal, present for the life of the Node process, changeable only by redeploying |
| Health/availability | **ABSENT** | No health-check, liveness probe, or availability-state concept exists for any settlement provider. `escrow-circuit-breaker.ts` (the one real "circuit breaker" in this codebase) guards **concurrency conflicts** (double-processing of the same escrow), not provider health — confirmed by direct read, not inferred from the name (Mission 4 §6 already made this same finding for a different purpose) |
| Conformance | **ABSENT** | No test-vector suite or independently-runnable conformance check exists for any capability family — confirmed in Mission 4 §19.1; `tests/arbitrationAuthoritySdkParity.test.ts`-style tests check this repo's *own* two sides, not a third party's implementation |
| Provenance | **ABSENT** | No publisher identity, artifact integrity, or "what code is actually executing" concept exists for any settlement/wallet/arbitration integration — everything today is first-party code reviewed via this repo's own PR process |
| Failure isolation | **ABSENT** | `escrow.service.ts`'s provider calls (`await provider.lockFunds(...)`/`releaseFunds(...)`/`refundFunds(...)`/`splitFunds(...)`) are plain, unwrapped `await` calls — no timeout, no circuit breaker for hangs, no process/sandbox boundary. A provider implementation runs in the same Node process, same event loop, as Core. A hang blocks the handling request indefinitely; a thrown exception is caught by Fastify's own error handling (not a crash), but a genuine hang has no timeout anywhere in this path |
| Extension removal | **ABSENT** | No runtime removal mechanism — only a code deletion + redeploy |
| Extension upgrade | **ABSENT** | No runtime upgrade mechanism — only a code change + redeploy. No versioned coexistence of two provider implementations for the same scope (Mission 4's own registry explicitly refuses N>1 candidates for a scope rather than choosing between an old and new version) |
| Runtime restart | **N/A as a distinct concept** | Because there is no dynamic registration, "restart" for `SettlementProvider` is indistinguishable from "redeploy" — there is no state to lose or reconcile on restart beyond what Node's own process boundary already implies |
| Partner integration | **EXISTS, equal access, narrow surface** | Confirmed in Mission 3: `packages/sails-ui` consumes the backend exclusively through the public SDK barrel, with equal access available to any third-party integrator — but the *surface* itself (what can be integrated) is narrow: no partner can register a new settlement provider, wallet capability profile, or arbitration mechanism variant without a PR into this monorepo (settlement) or first-party support (capability profiles) |

**No aspirational architecture is described as existing implementation
anywhere above** — every ABSENT/HARDCODED/MONOREPO-PRIVILEGED/DOCUMENTED
ONLY row is a disclosed gap, not a future plan described as present.

## 3. External Precedent Study

Each system's own real-world behavior, verified via its own current
documentation/source (not recalled from training alone) before being
used to inform any Sails obligation. Sources listed at the end of this
document.

### 3.1 WDK (Tether's Wallet Development Kit)

**Verified architecture:** WDK is "a modular plug-in framework" whose
orchestrator package holds zero blockchain-specific logic. A consuming
application composes its own wallet instance at runtime:

```js
const wdk = new WDK(seedPhrase)
  .registerWallet('solana', WalletManagerSolana, { /* config */ })
  .registerWallet('ton', WalletManagerTon, { /* config */ })
```

Confirmed, directly quoted from WDK's own documentation: *"Wallet
Registration: WDK constructs the wallet manager during registration, so
wallet-constructor validation errors surface immediately"* — a real,
fail-fast Validate step, not deferred to first use. *"Registering a
second wallet under the same blockchain throws"* — a real, enforced
namespace-collision guard, keyed on the blockchain name string itself.

**What allows WDK to gain capabilities without blockchain-specific logic
in Core:** the orchestrator defines a minimal, uniform `WalletManager`
interface contract and holds only a `name → instance` map; every chain-
specific behavior lives entirely inside the registered class, called
through the interface. Capability is added by instantiating and
registering a conforming class — never by extending WDK's own core code.

**A genuine, disclosed limit found, not assumed:** WDK's own public
documentation shows **no version negotiation, compatibility check, or
health-monitoring mechanism** between the orchestrator and a registered
module. Even this mature, widely-used, real-world wallet SDK has not
solved "Extension API Version ≠ Implementation Version ≠ Capability
Version" with a formal protocol — it solves module *composition*, not
module *governance*. This is directly useful evidence, not a gap in this
research: it means Sails should not treat version-negotiation tooling as
table-stakes just because a mature precedent exists elsewhere; the
precedent itself hasn't built it.

### 3.2 Kubernetes Device Plugins

**Verified architecture:** a device plugin registers with kubelet over a
local Unix domain socket (`/var/lib/kubelet/device-plugins/kubelet.sock`)
— a real process/IPC boundary, not a network registry. After
registration, the plugin does not go quiet: `ListAndWatch` is a
**long-lived stream**, distinct from the one-time registration call,
through which the plugin continuously reports device availability and
health-state changes.

**What breaks after successful registration (the mission's own
question):** registration is not durable across a kubelet restart — the
plugin "should re-register itself to kubelet in case of node reboot or
kubelet restarts," and frameworks built on this API "re-register
automatically if kubelet restarts." A real, documented Kubernetes bug
(`kubernetes/kubernetes#109595`, "device manager can incorrectly recover
devices on node restart") is direct evidence that the restart/recovery
path is exactly the class of defect this precedent warns about: silently
wrong recovered state, not just a missing feature.

**Lesson:** "registered" is a runtime fact scoped to the current
supervising process's lifetime, not a durable, persisted fact — and the
supervisor's own restart is itself a first-class lifecycle event that
must be handled explicitly, not assumed away.

### 3.3 HashiCorp go-plugin

**Verified architecture:** plugins are separate OS processes communicating
over RPC/gRPC — real process-boundary failure isolation by construction
(a plugin crash cannot crash the host process). A `HandshakeConfig`
carries a `MagicCookieKey`/value and a `ProtocolVersion`.

**Verified, important nuance:** the magic cookie is explicitly **not a
security measure** — HashiCorp's own documentation states it exists "as a
very basic verification that a plugin is intended to be launched... not
a security measure, just a UX feature," producing a human-friendly error
on mismatch rather than a security guarantee. The protocol version is a
coarse compatibility gate that can invalidate old plugins wholesale; in
at least one real deployment, version negotiation is described as
**informational, not gating** — the host does not always refuse a
mismatched plugin outright.

**Direct evidence for Issue #152's own property:** this is a real-world,
independent confirmation of *"Compatible code ≠ trusted code"* — even
the system built specifically to solve safe multi-process plugin loading
draws this exact line explicitly, in its own words, about its own
flagship safety mechanism.

### 3.4 Envoy

**Verified architecture:** Envoy's dynamic configuration (routes,
listeners, clusters, secrets, and — relevantly — extensions) arrives via
xDS. A new configuration is validated before being applied; an xDS
config validator "can reject them, so Envoy sends a normal xDS NACK and
keeps the last accepted configuration." Envoy Gateway's own Extension
Manager exposes an explicit, configurable choice: when **not** configured
to fail open, "Envoy Gateway will no longer replace affected resources...
xDS snapshot update would be skipped" — i.e., fail-closed-to-last-known-
good is a real, chosen, non-default-everywhere policy, not an accident.

**What happens when extension truth changes while the system keeps
running (the mission's own question):** the safe default is
validate-before-apply, reject-and-keep-serving-last-known-good on
failure — never blind hot-swap, never a bare crash. Fail-open vs.
fail-closed is itself a first-class, explicit, per-deployment policy
choice, not a universal constant.

## 4. Precedent Matrix

| Problem solved | Property obtained | Mechanism used | Trade-off paid | Relevant to Sails? | Sails-native obligation | Decision |
|---|---|---|---|---|---|---|
| How does a new chain/tech gain capability without touching Core? (WDK) | Core stays technology-agnostic | Minimal interface contract + runtime `name → instance` registration, caller-composed | Core has zero compile-time knowledge of what's registered — errors only surface at registration/call time | **Yes** — directly analogous to `SettlementProvider`'s own current gap | Settlement (and future capability-family) registration should eventually be exposed as a real, callable registration surface, not a monorepo-internal map | **LATER** — genuine architecture obligation, no concrete second implementer waiting today (§19.1's own finding: extensibility gap is real but unforced) |
| Is a module still alive/healthy after registering? (Kubernetes) | Continuous liveness/health truth, distinct from one-time registration | A separate long-lived stream (`ListAndWatch`), not a poll-once check | Requires the plugin to actively maintain a connection/stream, not just answer when asked | **Yes** — Sails has zero health concept for any provider today | Health must be modeled as its own fact, separate from registration and from structural capability, whenever a real availability layer is built | **WATCHLIST** — no real multi-instance-per-scope case exists yet to build health against (mirrors Mission 4's own "don't build ahead of a real case" discipline) |
| Does registration survive a supervisor restart? (Kubernetes) | Explicit re-registration as a lifecycle event | Re-registration on kubelet restart, not assumed durable | Real, documented bugs exist in the recovery path even in a mature system | **Yes** — directly informs §5/§8 below | "Registered" must never be treated as an eternal fact; any future dynamic registration needs an explicit re-registration/reconciliation story | **NOW** (as a *documented invariant*, not a mechanism) — already stated in Issue #152 item 1; this document reconfirms it with independent precedent, no new mechanism built |
| Can two independently-built components safely talk? (HashiCorp) | Fail-fast, human-diagnosable incompatibility detection | Handshake + magic cookie (UX) + protocol version (coarse gate) | Real process/RPC overhead; version negotiation itself is informational, not fully solved even by this system | **Partially** — Sails has zero handshake concept today, and no evidence yet of two real independently-built implementations needing to negotiate | A future third-party settlement/wallet contract should fail fast and legibly on a structural mismatch, not silently misbehave | **LATER** — Architecture Decision Required once a real external implementer exists; premature to design a full handshake protocol against zero real cases |
| Does "compatible" imply "safe to trust"? (HashiCorp) | The exact distinction Issue #152 already names | Explicit documentation disclaiming the cookie as a security measure | None — this is a documentation/expectation-setting cost only | **Yes, directly** | Sails' own future extension contract must never let interface conformance or version match imply trust | **NOW** (documentation/principle only) — already an Issue #152 property; this study independently corroborates it |
| What happens when live config/extension truth changes mid-flight? (Envoy) | Stability under a bad or changing update | Validate-before-apply; NACK + keep-last-known-good on failure; explicit fail-open/fail-closed policy | Requires a real validation step and a "last known good" state to fall back to — nontrivial to build | **Yes** — directly informs §7/§8 below | A future revalidation/hot-update mechanism for execution candidates should prefer "reject the update, keep serving the last good state" over blind replacement | **WATCHLIST** — no dynamic/live provider-config update mechanism exists in Sails today; this is the target property for when one is eventually built, not a mechanism to build now |
| Process isolation for a misbehaving extension (HashiCorp, and implicitly Kubernetes' socket boundary) | Blast-radius containment | Separate OS process + RPC | Real latency/complexity/ops cost; only justified at a real trust/blast-radius boundary | **Not yet** — every current Sails provider is first-party, in-process, reviewed via this repo's own PR process; there is no untrusted third-party code executing today | Do not import process isolation/sandboxing/WASM/containerization speculatively | **REJECT (for now)** — no concrete Sails property currently requires it; revisit only once a real third-party-authored, in-process-executed implementation is on the table |

## 5. Lessons Accepted / Rejected / Deferred

**Accepted (as properties, not mechanisms):**
- Extension registration is not an eternal fact (Kubernetes, reconfirms Issue #152 item 1).
- Compatible ≠ trusted (HashiCorp, reconfirms Issue #152 item 8).
- A changing live extension/config state should fail toward the last known-good state, not blindly apply or crash (Envoy).
- A minimal interface contract + explicit registration, with Core remaining technology-agnostic, is the right *shape* for a future settlement/wallet extension surface (WDK) — narrower than Sails' current monorepo-privileged reality.
- **Registration ≠ Runtime Health** — and, restated in full: **Supported ≠ Available ≠ Healthy ≠ Eligible** (Kubernetes' own `ListAndWatch` — a continuous stream, structurally distinct from the one-time registration call — is the evidence this distinction is real, not merely tidy vocabulary). Frozen strictly as a **property**: that registration and runtime health are two different facts that must never be read from the same signal. **No mechanism for observing, computing, or owning health is frozen alongside it** — polling vs. streaming vs. probes, the state model (if any), which layer owns the fact, and any threshold/debounce logic all remain fully OPEN (§7/§17/§26).

**Rejected (mechanisms, not properties):**
- Process-per-extension isolation (HashiCorp-style) — no current Sails property requires it; every real integration today is first-party and in-process.
- A formal, generalized version-negotiation protocol — not even WDK, a mature real-world precedent, has built one; premature for Sails against zero real multi-implementer cases.
- A central plugin/extension registry service — explicitly out of this mission's authorization and not evidenced as necessary yet.
- Container/sandbox/WASM runtime adoption — no concrete blast-radius case exists today (§12).

**Deferred (real, but not now):**
- A real registration API for settlement providers (WDK-shaped) — Architecture Decision Required, §19.1's own disclosed gap, no forcing case yet.
- Handshake/version-negotiation for third-party settlement/wallet contracts — Architecture Decision Required once a real external implementer exists.
- Runtime health/availability modeling for providers — Watchlist until a real multi-candidate-per-scope case exists (mirrors Mission 4's own discipline against building ahead of evidence).

## 6. Extension Lifecycle

Evaluated against the full candidate list (Declare, Register, Validate,
Conform, Activate, Healthy, Degraded, Unavailable, Disable, Revoke,
Upgrade, Downgrade, Restart, Re-register, Remove) — **not adopted
mechanically as a state machine**. Minimum distinctions actually
justified by evidence gathered above:

- **Declare vs. Register** — genuinely distinct (WDK: construction-time
  validation happens *at* registration, meaning declaring intent and
  registering are effectively fused in WDK's own design; Sails today has
  no Declare step at all for `SettlementProvider` — it's hardcoded, so
  the distinction is real but currently vacuous).
- **Validate** — genuinely distinct and justified: WDK's own fail-fast
  constructor validation is real evidence this must happen *before* a
  registration is trusted, not deferred to first real use.
- **Conform** — genuinely distinct from Validate: structural validity
  (does it implement the interface) is not behavioral correctness (does
  it behave per contract) — already the exact distinction Mission 4 §19.2
  draws between Public Contract and Conformance.
- **Healthy / Degraded / Unavailable** — genuinely distinct as a
  continuous runtime fact (Kubernetes' `ListAndWatch`), but **not yet
  justified as a Sails obligation today** — no real multi-provider-per-
  scope case exists to make "degraded" meaningfully different from
  "unavailable" in practice yet (Watchlist, §5).
- **Disable / Revoke** — genuinely distinct from each other (Disable:
  reversible, operator-initiated; Revoke: a trust/security action,
  plausibly irreversible) but neither has a real forcing case in Sails
  today.
- **Upgrade / Downgrade** — real, but collapse into "a new registration
  with a new Implementation Version" until a concrete need for
  side-by-side old/new coexistence appears (none exists today — Mission
  4's registry explicitly refuses N>1 candidates rather than choosing
  between versions).
- **Restart / Re-register** — genuinely distinct as a property
  (Kubernetes' own real bug class, §3.2) but currently vacuous for Sails:
  since there is no dynamic registration, there is nothing to lose or
  reconcile on restart beyond what redeploying already implies.
- **Remove** — real, but today identical to "delete the code and
  redeploy."

**Preserved, not implemented:** *Extension registration is not an
eternal fact.* No state machine is built. The lifecycle distinctions
above are recorded as **future obligations**, to be built only once a
real dynamic-registration mechanism exists to apply them to (§17).

## 7. Capability Truth

Reconciled, cross-checked against real code, not just restated:

> Declared Capability ≠ Verified Capability ≠ Currently Available Capability
> Supported ≠ Available ≠ Healthy ≠ Eligible

| Layer | Owner today | Evidence |
|---|---|---|
| Declared Capability | The integrator itself (self-asserted) | `WalletCapabilitiesDeclaration`, `capability-profile.ts`'s profile string, `SettlementProviderRegistration.capabilities` (first-party-declared, since Sails itself writes these today) |
| Verified Capability | `capability-profile.ts` only, for exactly one family (MULTISIG) | Server-side fail-closed check — the only real "declared → verified" step anywhere in this codebase |
| Currently Available Capability (health) | **No owner exists** | Confirmed ABSENT in §2 — no runtime health concept for any provider |
| Supported | `SettlementScope`/`SettlementProviderRegistration` (structural, static) | ADR-002, Mission 4 |
| Available | **No owner exists** | Same gap as "Currently Available Capability" above |
| Healthy | **No owner exists** | Same gap |
| Eligible | **No owner exists** (deliberately, per Mission 4 §3.3) | Mission 4's own slice explicitly stops at "structurally compatible," never claims Eligibility |

**Nothing today collapses these layers incorrectly** — the honest finding
is that four of the eight layers above (Available/Healthy/Eligible in the
full sense, plus most of Verified) have **no owner at all** yet, not that
an existing owner conflates them. This matches Mission 4's own disclosed-
gap discipline exactly: absence is not the same defect as collapse.

**Property vs. mechanism, stated once here and held consistent throughout
this document (§5/§17/§25/§26):** both lines above — `Declared ≠ Verified
≠ Currently Available` and `Supported ≠ Available ≠ Healthy ≠ Eligible`
— are frozen strictly as **properties**: true distinctions this document
asserts must never be collapsed by a future implementation. **Which
layer eventually gets a real owner, and how that owner computes its
answer (polling, a long-lived stream, a probe, a state model, thresholds)
is not decided here and remains fully OPEN.** Freezing the distinction is
not the same act as freezing, or even leaning toward, any mechanism for
observing it.

## 8. Discovery → Execution Revalidation

Mission 4 froze Candidate Discovery (a point-in-time structural fact).
This section investigates the gap between that moment and execution —
**no mechanism is implemented here**, per explicit instruction.

> Eligibility at discovery time ≠ eligibility at execution time.

**Material facts that may change between discovery and execution,**
evaluated against what's real in this codebase today:

- **Provider availability** — could change (no health concept exists to
  even observe this today, §7) — real risk, currently unmonitored.
- **Liquidity** — N/A to today's model; no liquidity-source concept
  exists in the settlement path.
- **Wallet capability** — the client's own declared profile
  (`capability-profile.ts`) is checked once, at `submitParticipantKey()`
  time, not re-checked at release/refund time — a real, disclosed gap
  this document surfaces, not one Mission 4 claimed to close.
- **Permission** — N/A; no permission layer evaluates settlement
  candidates at all yet (Mission 4 §3.3).
- **Policy** — N/A; no risk-policy layer exists (Mission 4 §7).
- **Health/network state** — N/A; no health concept exists (§7 above).
- **Maturity/configuration** — could change (e.g., `config.features.mockEscrow`
  is read at multiple points in `escrow.service.ts`'s own lifecycle, not
  snapshotted once) — a real, already-existing "configuration read more
  than once across an operation" pattern, worth naming even though it
  predates this mission.

**When revalidation becomes necessary:** only once a real gap can
actually open — i.e., once either (a) more than one structurally
compatible candidate can exist for a scope (today: never, §2.1 of
Mission 4), or (b) any of the currently-absent layers (health,
availability, live permission) starts being evaluated at discovery time
at all. Building revalidation against a discovery step that is currently
always instantaneous, single-candidate, and side-effect-free (as Mission
4's own slice is) would be solving a problem that does not yet exist in
this codebase — "complexity must earn its place."

**What must be revalidated before the first economic side effect (once
real):** whatever fact actually changed between discovery and the
`provider.lockFunds()`/`releaseFunds()`/etc. call — determined by which
of the currently-absent layers (§7) is eventually built, not decided in
the abstract here.

**What must be snapshotted / remain immutable afterward:** the selected
`{asset, rail, implementation}` triple itself, once a real
Selection step exists — mirroring the same discipline `PayoutAddress`
resolution already uses today (M8-R2: the buyer's destination is resolved
and persisted onto the pending transaction *before* any signature is
collected, never re-resolved afterward). This existing pattern is real,
working precedent for "snapshot the economically-material fact once, at
the right moment, and never silently re-resolve it" — directly reusable
when a real Selection/revalidation step is eventually built, not a new
invention.

## 9. In-Flight Economic Episodes

> Runtime upgrade must not rewrite the meaning of an in-flight economic episode.

No runtime upgrade mechanism exists today (§2 — "Extension upgrade:
ABSENT"), so there is currently no live case of this defect class. The
obligation is forward-looking. Evaluated against what future provenance
*might* be required, per the brief's own list, without inventing
persistence fields:

- **Extension identity, implementation version, contract/API version,
  capability version, selected path, relevant policy version, execution
  context** — none of these has a real, dedicated field anywhere in
  `prisma/schema.prisma` today. `EscrowPendingTransaction` and `Escrow`
  itself already carry the closest real analogues: `Escrow.type`
  (`EscrowType` — today's closest thing to "which implementation
  executed this"), and the fee-policy snapshot fields
  (`feePolicyVersionId`, `snapshotProtocolFeeRate`,
  `snapshotFeeCollectionAddress` — real, shipped precedent for "freeze a
  policy version onto the record at the moment it becomes economically
  material, never re-derive it later").

**Finding, not a proposal:** Sails already has a working, evidenced
pattern for exactly this class of problem (the fee-policy snapshot
fields) — a future "which extension/version/capability context produced
this execution" provenance model should extend that existing pattern,
not invent a new one. **No new field is added here** — current
architecture does not yet prove a new field is necessary, since no
dynamic extension/upgrade mechanism exists to generate the fact that
field would record.

## 10. Versioning Model

> Extension API Version ≠ Implementation Version ≠ Capability Version

Cross-checked against existing Sails version concepts (§2's own finding):
`protocolVersion` (DB field, inert `"0.1"` literal), SDK npm version
(`0.1.3`), server npm version (`0.1.1`), and the `/v1/` URL prefix are
**four already-existing, uncoordinated version concepts** — `docs/BACKLOG.md`
item 40 (OPEN, a Decision Mission, not yet run) already names this
conflation directly and is the correct, already-registered place for it
to be resolved. This document does not duplicate item 40; it confirms,
via the WDK/HashiCorp precedent study, that item 40's own three findings
(version conflation, undocumented Decimal wire contract, `expiresAt`
boundary ambiguity) are exactly the class of problem a future extension
ecosystem would inherit and compound if left unresolved before external
implementers exist.

**No existing version concept currently claims to be "Extension API
Version," "Implementation Version," or "Capability Version"** in the
sense this mission means — none of the four found conflates two of
those three specifically; they simply don't exist as distinct concepts
yet at all. **No negotiation protocol is frozen here** — WDK's own real
precedent (§3.1) shows a mature system can ship without one; Sails should
resolve item 40's conflation first (a real, already-registered,
higher-priority obligation) before designing extension-specific version
negotiation against zero real external implementers.

## 11. Extension Identity / Namespace

> Human-friendly name ≠ globally unique extension identity.

No third-party extension identity concept exists in Sails today — every
current "identity" in the relevant sense is a first-party string constant
(`EscrowType` values like `'MULTISIG'`, `'WDK_USDT_EVM'`). WDK's own real
precedent (§3.1) is informative here too: WDK's own namespace key is the
*blockchain name string itself* (`'solana'`, `'ton'`), with a real,
enforced collision guard ("registering a second wallet under the same
blockchain throws") — a working example of the simplest possible
namespace mechanism (a flat string key + a duplicate guard), not a
publisher/signing infrastructure. For Sails, this suggests the eventual
minimum bar is comparably simple: a flat, collision-checked
implementation identifier, publisher identity and namespace hierarchy
deferred until a real multi-publisher case exists. **No registry service
or signing infrastructure is proposed** — matches the mission's own
explicit prohibition.

## 12. Provenance / Supply Chain

> Compatible code ≠ trusted code.

Reconciled directly with Issue #123 (OPEN, "Fault-domain independence,
dependency security, and Lightning footgun defense") — **not duplicated**:
Issue #123 already covers dependency-security monitoring, silent-fix
detection, and fault-domain independence for *existing, first-party*
dependencies (WDK, Pears, QVAC, Arkade, Lightning/Bitcoin libraries).
This mission's provenance concern is one layer further out: **future
third-party-authored extensions**, which don't exist yet. The HashiCorp
precedent (§3.3) independently corroborates Issue #152 item 8's own
property in the plugin system's own words, adding real-world weight, not
new obligations. No overlap requiring reconciliation beyond this
cross-reference — Issue #123 governs dependencies Sails chooses and
imports; this document's provenance concern governs code a future
third party would author and Sails would trust to run.

## 13. Failure Isolation

Evaluated against real code (§2's own "Failure isolation: ABSENT"
finding) and the four precedent systems, **property first, mechanism
never chosen**:

**Required architectural properties** (not mechanisms):
1. A hang in one execution path must not indefinitely block unrelated
   requests — currently **not guaranteed**: `provider.lockFunds()` etc.
   are plain, unwrapped `await` calls with no timeout anywhere in the
   chain.
2. A crash/thrown exception in a provider call must not crash the
   process — currently **true today**, but incidentally: Fastify's own
   route-level error handling catches it, not a deliberate isolation
   design for this specific concern.
3. Malformed or contradictory provider output must be detectable, not
   silently trusted — **partially true**: `EscrowRecord`/`SettlementProvider`
   return-shape typing catches structural malformation at compile time
   for first-party providers; nothing validates a runtime value's
   *economic* plausibility (e.g., a nonsensical `fundedAmount`).
4. Resource exhaustion by one extension must not starve others —
   **not evaluated**: everything runs in-process, sharing the same
   resource pool by construction; no isolation exists to starve.

**Explicitly not chosen** (mechanism, not property, and no current
Sails case forces one): process isolation, sandboxing, a worker runtime,
WASM, or containerization. Every current provider is first-party,
reviewed through this repo's own PR process — the actual, present risk is
narrower (an in-process hang with no timeout) and does not yet justify
the operational cost any of those mechanisms would add. The **first**
real, evidenced, low-cost step (not built here, but named honestly as
the next-smallest one) would be a timeout around the existing provider-
call sites, not a new isolation architecture.

## 14. Decision Provenance

> A routing decision should be explainable after the fact, not only computable in the moment.

No N>1 routing decision exists today (Mission 4 §2.1 — every real scope
has 0 or 1 provider), so there is no live decision to explain yet. For
when one does: Mission 4's own `CandidateDiscoveryResult` union (§13 of
that mission, R1-corrected) already carries real, structured reasoning —
`SCOPE_NOT_REGISTERED`/`SCOPE_REGISTERED_NO_PROVIDER`/
`NO_PROVIDER_WITH_REQUIRED_CAPABILITY` each explain *why* a scope failed,
and `NO_PROVIDER_WITH_REQUIRED_CAPABILITY` explicitly retains
`registeredProviders` (what *was* available) alongside the rejection.
This is real, working precedent for "explain the rejection," not merely
compute it — a future Selection layer's own decision provenance (which
candidates were considered, why each rejected candidate lost, what was
recommendation vs. explicit choice) should extend this same discipline,
not invent a separate logging mechanism. No routing engine is built here.

## 15. Product Neutrality

> Recommendation ≠ Authority. Default ≠ Protocol Truth.

Confirmed as a real, live risk, not hypothetical: Mission 4 §10 already
found that "the system has never actually exercised discretion over a
real choice" because every real scope has exactly one candidate — meaning
**the distinction between "the system decided" and "there was only one
option" has been invisible in practice so far.** The moment a second real
candidate exists for any scope, Sails Market/Satsails UX choosing which
one to display first, pre-select, or label "recommended" would be a real
product decision with real economic-behavior consequences, entirely
separate from any protocol-level neutrality claim. **This is a Product
Governance concern, confirmed, not just an architecture one** — no
current UI code exercises this risk (no multi-candidate scope exists to
render), but the risk is structural and will activate automatically the
first time ADR-002's registry gains a second registration for one scope,
with no code change required to trigger it. Registered as a Product
Decision Required (§20), not resolved here.

## 16. Proposed Extension Taxonomy

Evaluated, not mechanically adopted, per the brief's own instruction.

- **`Module`** — already has established, frozen Sails meaning (OpenP2P,
  OpenSettlement, OpenLiquidity, etc. — first-party, protocol-defining
  bounded contexts). **Must never be reused** for third-party
  extensibility — this would be a real semantic collision, not a minor
  naming nit.
- **`Provider`** — already has established, real meaning
  (`SettlementProvider`) — a runtime implementation of a settlement
  capability. Reusable as the *narrow*, technology-facing term, consistent
  with current usage.
- **`Adapter`** — already has established, real meaning in ADR-002
  (`SettlementAdapter` — translates Sails semantics into an external
  client/SDK, composed *by* a Provider). Reusable, narrow, already
  precise.
- **`Extension`** — no current Sails meaning. Evaluated as the
  **umbrella** term for "any third-party-authored capability that
  participates in Sails" — matches how this entire mission (and Issue
  #152) already uses the word throughout its own text, with zero
  collision against `Module`/`Provider`/`Adapter`.
- **`Driver`** — no current Sails meaning. Evaluated as a
  **technology-facing concrete implementation** under the `Extension`
  umbrella — plausible, but **not distinct enough from `Provider`/`Adapter`
  to justify a fourth near-synonym** without a real second dimension
  forcing the split (the same "don't invent structure ahead of a second
  real case" discipline this entire mission chain has applied
  repeatedly). `Connector`, `Component`, `Port` were considered and
  rejected for the same reason — no current Sails distinction needs them.

**Recommendation (provisional, not proposed for CTO freeze yet):**

| Term | Exact architectural meaning | Examples | What it is NOT |
|---|---|---|---|
| `Module` | A first-party, protocol-defining bounded context (existing, unchanged meaning) | OpenP2P, OpenSettlement, OpenLiquidity | Not third-party-extensible; not a plugin |
| `Extension` | The future umbrella term for any third-party-authored capability participating in Sails via a Public Contract | A future third-party settlement provider, wallet implementation, arbitration mechanism | Not a Module; not automatically trusted; not automatically eligible |
| `Provider` | A concrete settlement-capability implementation (existing, unchanged meaning) — may be first- or (eventually) third-party | MULTISIG, LIGHTNING_HODL, WDK_USDT_EVM | Not the same as a SettlementScope or a SettlementAdapter |
| `Adapter` | The translation layer a Provider composes to reach an external client/SDK (existing, unchanged meaning, ADR-002 §2) | Ark/VTXO translation, WDK EVM translation | Not a Provider itself; a Provider *uses* one |

**Evidence is insufficient to recommend `Driver` as a frozen term** —
provisional only, not proposed for CTO freeze. `Extension` as the
umbrella term is the one recommendation this document considers
evidence-sufficient enough to propose, precisely because it introduces
zero collision and matches usage already adopted by Issue #152 and this
mission's own brief.

## 17. Sails-Native Extension Model (smallest coherent future shape)

**R1 correction (CTO Gate Corrective, 2026-09-14):** the version of this
section CTO review corrected claimed Mission 4 had "already independently
arrived at" a seven-stage shape. That was factually wrong and is removed
below, not repeated. Mission 4 §19.2
(`docs/ADAPTIVE_EXECUTION_CAPABILITY_ROUTING.md`) froze an **eight**-stage
contract, restated here verbatim, unmodified, not reopened or
reinterpreted:

```
External Capability → Public Contract → Capability Declaration →
Constraints → Conformance → Evidence → Eligibility → Runtime Participation
```

This mission's own brief (§17 of the CTO-issued corrective mission that
produced this document) separately proposed a **nine**-stage starting
hypothesis — a different list, not a restatement of Mission 4's own
frozen one, and itself missing `Constraints`:

```
External Capability → Public Contract → Capability Declaration →
Identity/Version → Conformance → Evidence → Runtime Health → Eligibility →
Runtime Participation
```

Checked against everything found above, evaluating only this mission's
own nine-stage hypothesis against Mission 4's already-frozen eight-stage
one — **the correct reconciliation restores `Constraints` and declines
to add `Identity/Version`/`Runtime Health` as separate stages,
converging exactly onto Mission 4's own already-frozen shape — this
document does not produce a new or shortened model:**

```
External Capability → Public Contract → Capability Declaration →
Constraints → Conformance → Evidence → Eligibility → Runtime Participation
```

**`Constraints` restored, and kept distinct from `Public Contract`** —
Mission 4 §19.2 itself already draws this line precisely: *"Constraints
— structural limits the Public Contract itself imposes... protocol-level
facts an integrator must satisfy, not negotiable per-integration"* (its
own example: `PayoutAddress`'s `@@unique([participantId, asset])`
constrains `WalletAdapter.getAddress()` to one address per asset, a fact
about the protocol's data model, not a method signature). Public Contract
answers *"what shape must your implementation expose"* (the interface);
Constraints answers *"what structural, protocol-level facts must your
implementation additionally respect, even though no interface method
encodes them."* These are genuinely different questions — an
implementation can satisfy every method signature in the Public Contract
while still violating a Constraint (e.g., assuming multiple addresses per
asset are representable when the protocol's own data model forbids it).
Collapsing them would silently drop a real category of integrator
obligation this document has no evidence justifies dropping.

**`Runtime Health` not added as a separate stage** — §7/§13 above found
Health has no owner today and no forcing case yet (every real scope is
0:1). This is a **property vs. mechanism** decision (§5/§7), not a
reason to remove the underlying distinction: `Registration ≠ Runtime
Health` remains frozen as a property (§5); only its architectural
placement as a *named stage in this diagram* is declined, for lack of
evidence a dedicated stage (rather than an eventual property of Runtime
Participation) is the right shape. Promoting it to a permanent diagram
stage now would describe a runtime observation layer that doesn't exist
as evidenced necessity — the "symmetry for its own sake" the brief warns
against.

**`Identity/Version` not added as a separate stage** — §10/§11 above
found neither has a real forcing case yet (no external implementer, no
negotiation need); a Public Contract implicitly carries a version the
moment it's published (WDK's own precedent: the orchestrator's own
package version *is* its contract version, no separate mechanism
needed) — inventing a distinct stage for this before a second real
contract version exists would be exactly the premature complexity §5
already rejected in the Precedent Matrix.

This is a **reconciliation of this mission's own hypothesis against
Mission 4's already-frozen contract, still not authorized for
implementation, and not a reopening of Mission 4's frozen semantics** —
Mission 4's own eight stages stand exactly as that mission froze them;
this section only evaluates whether this (different, later) mission's
own broader nine-stage hypothesis should expand them, and finds the
evidence does not yet support doing so.

## 18. Stranger Developer Prerequisites (preparation only)

Not run. Defined for a future test, per Mission 4 §19.5's own honest
per-family evaluation (arbitration passes today; wallet passes with a
disclosed caveat; settlement provider fails entirely). Public artifacts a
future independent developer would need, that do not fully exist today:

- A published, versioned Public Contract for the target capability family
  (real today only for `WalletAdapter` — an npm-published TypeScript
  interface; **absent** for `SettlementProvider`, which currently lives
  only as an internal interface in `escrow-providers.ts`, not published
  or documented as an external contract).
- A Conformance suite or test-vector set the developer can run against
  their own implementation without repo access (**absent for every
  family**, §2).
- Documentation answering, without private support: "why was my
  registration rejected," "what capability strings are recognized,"
  "what happens if my declared capability is wrong" (**partially real**
  for `capability-profile.ts`'s fail-closed behavior, since it's
  documented in that file's own header — but that header is internal
  source, not published developer-facing documentation).
- A working example/starter matching the target contract
  (`examples/sails-integration-starter/` exists in this repo already for
  general SDK usage — not yet extended to cover a hypothetical new
  settlement-provider or wallet-capability-profile registration).

**Standing rule preserved, not newly invented:** if a competent
integrator must ask something the documentation should have answered,
that is a product gap. This section names the gaps; it does not close
them.

## 19. Required Blind-Spot Review

Run against this document's own proposed model, honestly:

- **Are we accidentally creating a plugin framework?** No — nothing
  executable is built; §17's model is a documentation hypothesis, and
  §5 explicitly declines to build a state machine.
- **Are we making runtime concerns Core semantics?** No — Health/
  Availability are explicitly kept out of both `SettlementScope`
  (Product Scope truth) and `SettlementProviderRegistration` (structural
  capability truth) in every finding above; §7 confirms no existing
  layer collapses them.
- **Are we making first-party implementation privileged?** Named
  honestly as a real, current fact (§2, §19.1 of Mission 4: settlement
  provider registration IS monorepo-privileged today) — not defended,
  not silently accepted as permanent, registered as a real future
  Architecture Decision (§20).
- **Are we confusing health with eligibility?** No — §7's table keeps
  them as separate, currently-unowned layers; neither is asserted to
  exist where it doesn't.
- **Are we confusing conformance with trust?** No — §3.3/§12 draw this
  line explicitly, independently corroborated by HashiCorp's own
  documentation of its own mechanism.
- **Are we freezing provider-centric architecture?** No — Issue #152
  item 6's own warning (`ExecutionCandidate` must stay an implementation
  detail, not protocol truth) is restated here (§0's own framing) rather
  than silently left unaddressed; this document does not touch Mission
  4's frozen alias, but names the risk explicitly as required future
  vigilance.
- **Are we assuming every execution path has exactly one provider?** No
  — §2.1's own "every real scope is 0:1" is stated as **current fact**,
  not architecture; §14/§15 explicitly evaluate what changes the moment
  that stops being true.
- **Are we creating central registries unnecessarily?** No — explicitly
  rejected in §4/§5 (no registry service authorized), consistent with
  the mission's own prohibition.
- **Are we importing Kubernetes complexity without Kubernetes-scale
  problems?** No — Health/re-registration are Watchlist, not adopted;
  §4's matrix explicitly weighs this trade-off and defers it.
- **Are we importing HashiCorp process isolation where an interface
  boundary is enough?** No — §4/§13 explicitly reject process isolation
  for the current, all-first-party reality.
- **Are we solving hypothetical problems without a concrete Sails
  property?** Checked against every section: §8 (revalidation), §9
  (in-flight provenance), §11 (identity) all explicitly decline to build
  anything, citing the same "no real forcing case yet" reasoning
  throughout, rather than building ahead of evidence.

**Goodhart check:** no metric is proposed anywhere in this document that
could be gamed instead of the real property it measures (no metrics are
proposed at all — this is a property/architecture document, not a KPI
document).

**Cobra-effect check:** the one mechanism this document comes closest to
recommending (§13's "the first real step would be a timeout around
provider calls") could, if built carelessly, cause a *worse* outcome
(a timeout that fires during a genuinely slow-but-successful external
call, converting a real success into a false failure) — flagged
explicitly here as a real risk for whichever future mission implements
it, not glossed over.

**Rube-Goldberg check:** §17's reconciled model is *shorter* than this
mission's own nine-stage starting hypothesis (eight stages vs. nine —
`Identity/Version` and `Runtime Health` declined for lack of evidence,
`Constraints` restored because Mission 4 already froze it and no
evidence supports dropping it) — the opposite of over-engineering, and
exactly matches Mission 4's own already-frozen shape rather than
inventing a new one.

**Vendor-lock-in check:** no external system's specific mechanism
(WDK's registration API shape, Kubernetes' socket protocol, HashiCorp's
RPC framework, Envoy's xDS) is adopted verbatim anywhere in this
document — only properties, per the standing rule, consistent with §4's
own "Reject" row for process isolation specifically.

**Semantic leakage check:** `Module` is explicitly protected from
collision (§16); `Eligible`/`Eligibility` is used carefully throughout
this document to mean the full, still-unbuilt concept, consistent with
Mission 4 R1's own naming correction — never used loosely to describe
what `execution-candidates.ts` actually computes (structural
compatibility only).

## 20. Issue #152 Reconciliation

| #152 item | Disposition |
|---|---|
| 1. Extension lifecycle, not registration-only | **Confirmed, refined** — §6 adds the evidence (WDK/Kubernetes) and narrows which distinctions are genuinely justified today (most are, in principle; none forced into a state machine) |
| 2. Discovery-time vs execution-time truth | **Confirmed, refined** — §8 adds the concrete "when it becomes necessary" test (real N>1, or any currently-absent layer becoming real) and identifies `PayoutAddress`'s own snapshot pattern as reusable precedent |
| 3. Declared vs verified vs available capability | **Confirmed, refined** — §7 adds the ownership table, finding absence (not collapse) is today's real defect |
| 4. Contract/implementation/capability versioning | **Confirmed, cross-referenced, not duplicated** — §10 ties this directly to the already-registered `docs/BACKLOG.md` item 40, and adds WDK's own evidence that a mature precedent hasn't solved this either |
| 5. In-flight economic episodes survive edge upgrades | **Confirmed, refined** — §9 finds the fee-policy-snapshot pattern as existing, reusable precedent; explicitly declines to invent new persistence fields, since no current mechanism generates the fact they'd record |
| 6. `ExecutionCandidate` must remain an implementation detail | **Confirmed, restated as live risk** — §15/§19's own blind-spot review keeps this active rather than letting it go quiet now that Mission 4 is frozen |
| 7. Extension identity/namespace | **Confirmed, refined** — §11 adds WDK's own simple flat-string-plus-collision-guard precedent as the evidenced minimum bar |
| 8. Provenance and supply-chain trust | **Confirmed, refined, cross-referenced to Issue #123** — §12 draws the boundary between #123's dependency-security scope and this document's future-third-party-extension scope |
| 9. Failure isolation / blast radius | **Confirmed, refined** — §13 finds the concrete current gap (unwrapped `await`, no timeout) and explicitly declines every heavyweight mechanism |
| 10. Decision provenance / explainability | **Confirmed, refined** — §14 finds Mission 4's own `CandidateDiscoveryResult` already a real, working precedent for this exact property |
| 11. Product defaults must not defeat protocol neutrality | **Confirmed, elevated to a live, structural risk** — §15 finds the risk is dormant only because no multi-candidate scope exists yet, not because it's hypothetical |
| 12. Risk policy boundary | **Confirmed, unchanged** — already fully covered by Mission 4 §7 and Issue #150; no refinement needed, no duplication introduced |

**No item is duplicated into `docs/BACKLOG.md`/`docs/ROADMAP.md` by this
document** — that consumption step remains Issue #152's own stated future
work, explicitly not done here.

## 21. New Backlog Delta

| Item | Classification |
|---|---|
| Settlement provider registration is monorepo-privileged (no WDK-style callable registration surface) | **Architecture Decision Required** — already named in Mission 4 §19.7, reconfirmed here with WDK precedent; not duplicated, cross-referenced |
| No health/availability concept exists for any provider | **Architecture Decision Required (Watchlist)** — §7/§13; no forcing case yet |
| No timeout exists around provider calls (`escrow.service.ts`) | **Security/Reliability obligation, genuinely new** — §13's own concrete finding; smallest, lowest-risk real next step named, not built |
| `docs/BACKLOG.md` item 40 (protocol/version conflation) blocks a coherent future extension-versioning story | **Already registered, cross-referenced, not duplicated** — this document adds urgency context (extension ecosystems compound the conflation) but does not reopen or reclassify item 40 |
| Product Governance risk: first-party UX could create de facto privileged rails the moment a second real candidate exists | **Product Decision Required, genuinely new** — §15; currently dormant, will activate automatically without any code change |
| Public, versioned Contract + Conformance suite absent for `SettlementProvider`/capability profiles | **Architecture Decision Required** — §18; prerequisite for any future real Stranger Developer test |

## 22. Architecture Decisions Required

1. Whether and how to expose a WDK-shaped, callable registration surface
   for `SettlementProvider` (replacing today's monorepo-privileged map) — §16/§21.
2. Where and how Runtime Health/Availability should eventually be owned,
   once a real multi-candidate-per-scope case exists — §7/§17.
3. Whether/when a formal Extension API/Implementation/Capability version
   negotiation mechanism is needed — deferred behind resolving `docs/BACKLOG.md`
   item 40 first — §10.
4. What minimum Extension Identity/Namespace mechanism to adopt once a
   real second publisher exists (flat string + collision guard is the
   evidenced floor, per WDK) — §11.
5. Whether `Extension`/`Provider`/`Adapter` terminology (§16) should be
   formally frozen, and whether `Driver` is ever adopted — provisional
   only for now.
6. Public Contract + Conformance suite design for `SettlementProvider`
   once a real external implementer is authorized to be pursued — §18.

## 23. Product Decisions Required

1. How Sails Market/Satsails UX will present multiple real candidates
   the first time ADR-002's registry gains a second registration for one
   scope, so recommendation/default never silently reads as protocol
   truth — §15.
2. Whether/when to publish a Stranger Developer onboarding path for a
   settlement-provider or wallet-capability extension — §18.

## 24. Security Decisions Required

1. Provenance/supply-chain stance for future third-party-authored
   extensions (publisher identity, artifact integrity, security review
   state) — distinct from, and building on, Issue #123's existing
   dependency-security scope — §12.
2. Whether/when to add a timeout around existing provider-call sites in
   `escrow.service.ts`, and how to avoid the cobra-effect risk named in
   §19 (a timeout converting a slow success into a false failure).

## 25. What Should Be FROZEN

- The current-state audit findings in §2 (a factual snapshot, verified
  directly against `main@b2d40a2877017462377710dd4fa1478b5ae4f48f`).
- The five precedent lessons accepted in §5 (as properties, not
  mechanisms): registration is not eternal; compatible ≠ trusted; prefer
  fail-to-last-known-good over blind hot-swap or crash; minimal-interface-
  plus-explicit-registration is the right future shape; **`Registration ≠
  Runtime Health`, restated in full as `Supported ≠ Available ≠ Healthy ≠
  Eligible` (§5/§7)** — frozen strictly as a distinction, with every
  mechanism for observing health left open (§26).
- §16's `Extension` as the umbrella term (evidence-sufficient) and the
  continued protection of `Module` from collision.
- **Mission 4's own eight-stage extension contract (§19.2 of
  `ADAPTIVE_EXECUTION_CAPABILITY_ROUTING.md`), restated and reconfirmed
  unmodified by §17** — `External Capability → Public Contract →
  Capability Declaration → Constraints → Conformance → Evidence →
  Eligibility → Runtime Participation`. This document does not produce,
  and does not claim Mission 4 already produced, any shorter or
  different shape — still not authorized for implementation, but the
  shape itself is ready to be built from once a real implementation
  mission is authorized.

## 26. What Must Remain OPEN

- Every item in §22/§23/§24 (Architecture/Product/Security Decisions
  Required).
- `Driver` as a term — provisional only.
- The exact revalidation mechanism (§8), in-flight provenance fields
  (§9), version-negotiation protocol (§10), and identity/namespace
  mechanism (§11) — properties are recorded, mechanisms are not chosen.
- **Every mechanism for Runtime Health/Availability** — polling vs.
  streaming vs. probes, any state model, which layer owns the fact, and
  any threshold/debounce logic (§5/§7/§17) — Watchlist. Freezing
  `Registration ≠ Runtime Health` as a property (§25) does not freeze,
  or lean toward, any of these; whether Health ever becomes a named
  stage in a future extension-model diagram is equally open (§17).
- Restated, unchanged from Mission 4/Mission 3: §9 recovery hypotheses
  and `[NEW-G]` canonical Economic Identity abstraction remain OPEN —
  untouched, not dependent on, this document.

---

## Sources

- [About WDK | Wallet Development Kit by Tether](https://docs.wdk.tether.io/overview/about)
- [GitHub - tetherto/wdk](https://github.com/tetherto/wdk)
- [WDK Core Module Configuration](https://docs.wdk.tether.io/sdk/core-module/configuration)
- [How to Write a Device Plugin for Custom Hardware in Kubernetes](https://oneuptime.com/blog/post/2026-02-09-device-plugin-custom-hardware-kubernetes/view)
- [device manager can incorrectly recover devices on node restart · Issue #109595 · kubernetes/kubernetes](https://github.com/kubernetes/kubernetes/issues/109595)
- [plugin package - github.com/hashicorp/go-plugin - Go Packages](https://pkg.go.dev/github.com/hashicorp/go-plugin)
- [v1.4.0 | Envoy Gateway release notes](https://gateway.envoyproxy.io/news/releases/notes/v1.4.0/)
- [dynamic_modules: add xDS config validator extension · PR #47397 · envoyproxy/envoy](https://github.com/envoyproxy/envoy/pull/47397)

## Final Verdict

**EXTENSIBILITY CONSOLIDATION COMPLETE — READY FOR CTO GATE**
