# Product Interaction Model — Actor Experience Model (`MISSÃO 1`, 2026-09-12)

**Status:** Product/UX/Interaction Model. Institutionalizes who interacts
with Sails, what each actor needs to see, what each may do, under what
authority, and with what privacy boundaries. **Creates no new protocol
truth, no new authority role, no new backend runtime, no ADR.** Every
distinction preserved here already exists in frozen institutional
sources — this document is a synthesis and UX-layer application of that
truth, not a new invention. Where a real gap was found, it is named and
classified (§13), not silently filled.

**Why a dedicated document, not folded into an existing one:** the
required matrices (Actor, Privacy, Authority, Density) are a genuinely
new cross-cutting axis — orthogonal to `docs/PROJECT_CONTEXT.md`'s
product-truth register and to `docs/SAILS_DESIGN_LANGUAGE.md`'s
visual-language scope. Forcing this into either would either bloat an
already-large document with an unrelated axis or scatter one coherent
model across two files. Both existing documents get a short cross-link
here instead (see Documentation Changes).

**`docs/SAILS_DESIGN_LANGUAGE.md` dependency, resolved (`ACTOR-EXPERIENCE-MODEL-R1`,
2026-09-12):** PR #134 (which created and corrected this file across
`UI-FOUNDATION-1` through `UI-GATE-CLOSE-1-R1`) is merged to `main`
(`955520841befb41d4ae9d3d7734363ae330434fa`). Every citation to it below
(§8, §10, §16, §21, §23) has been re-validated against that merged text
— section numbers and content match; no citation required correction.

## Sources consulted (mandatory, per mission brief)

`docs/PROJECT_CONTEXT.md`, `docs/BACKLOG.md`, `docs/SAILS_DESIGN_LANGUAGE.md`,
`docs/SAILS_MARKET_DESIGN_DIRECTION.md`, `docs/SEMANTIC_KERNEL.md`,
`docs/PRINCIPLES.md`, `docs/DAY0_COMPLETENESS_COLD_SWEEP.md`,
`docs/adr/ADR-001-day0-multi-operator-network.md`,
`docs/adr/ADR-002-asset-settlement-rail-adapter-provider-architecture.md`,
`docs/IDENTITY_ARCHITECTURE_DISCOVERY.md`, `docs/rfcs/RFC-005-capability-model.md`,
`docs/rfcs/RFC-013-capability-registry-and-wallet-adapter.md`,
`docs/rfcs/RFC-014-capability-registry-enforcement.md`, GitHub Issues
#99, #105, #125, #86, and the real implementation
(`src/core/capability-registry.ts`, `src/modules/open-agents/*`,
`packages/sails-sdk/src/wallet-adapter.ts`, `.env`'s
`ENFORCE_CAPABILITIES`/`TRUSTED_ARBITRATORS`).

## North star

> **One economic reality, multiple actor-specific experiences.**
> Different actors may see different levels of detail without
> redefining the underlying economic state. **Visibility ≠ Authority ≠
> Economic Entitlement.** Local optimization must never become global
> product truth.

This is the product-layer restatement of `docs/SEMANTIC_KERNEL.md` §26
("Same Semantics, Different Consumers") — already-frozen Kernel
direction, not a new claim: *"A future Core's semantic surface... is
architecturally intended to serve multiple consumer categories
identically — protocol code, AI/agents, human-facing UX, SDK
integrators, and other protocol modules — rather than each consumer
inventing its own partial view."* §26 itself states this is "a
direction for future work, not a claim that such a surface exists
today" — this document inherits that same honesty: it defines the
target actor model, not a claim that every actor already has a real
surface today.

---

## 1. Actor Taxonomy

Four actor groups, evaluated against the real repository (not assumed
sufficient by default, per the mission's own instruction) — confirmed
sufficient, with two subdivided based on real, already-implemented
distinctions found during this audit (§2).

**Notation (`ACTOR-EXPERIENCE-MODEL-R1`, 2026-09-12):** actors below use
`USR`/`AGT`/`OPS`/`INT` — deliberately **not** `A`/`B`/`C`/`D`, which is
reserved exclusively for the identity taxonomy (§3: Participant Economic
Identity / Participant Transport Identity / Operational Sails Node
Identity / Operator Economic Recipient). The two taxonomies are
orthogonal; sharing letters invited exactly the collapse this rename
corrects. This section originally used `A`/`B`/`C`/`D` for the actor
groups themselves — corrected here, not merely relabeled elsewhere.

- **USR. User Surface** — the participant performing real economic
  activity (creating/accepting offers, negotiating, trading, disputing
  as a party).
- **AGT. Agent Surface** — software that interprets context,
  recommends, negotiates, or (in a future, not-yet-authorized state)
  executes within explicitly granted authority.
- **OPS. Operator Surface** — infrastructure/node operation, health,
  topology, diagnostics, evidence, observability, and (a real, distinct
  sub-role) dispute arbitration.
- **INT. Integrator/Partner Surface** — a wallet, fintech, or service
  team integrating Sails, with or without owning wallet UI.

## 2. Actor subdivisions discovered

- **Agent Surface splits in two**, per `docs/SEMANTIC_KERNEL.md` §26's
  own language ("any future delegated agent authority requires its own
  explicit authorization semantics; none is authorized by this
  document") and this session's own `docs/SAILS_DESIGN_LANGUAGE.md` §8/§21
  correction:
  - **AGT-1. Assistive Agent** — today's real, shipped state: QVAC-backed
    intent generation and offer search/proposal (`AgentIntentionPanel.tsx`,
    "Sails Agent — Market Negotiation"), advisory-only, human approval
    required before any economic action.
  - **AGT-2. Delegated-Authority Agent** — **not implemented, not
    designed, not authorized by this document.** A future state where
    an agent could hold explicit, scoped, limited, observable,
    revocable, auditable, governed economic authority (`docs/SAILS_DESIGN_LANGUAGE.md`
    §8's own corrected language). Modeled here only so the UX boundary
    is ready *if* it is ever authorized — no runtime implication.
- **Operator Surface splits in three**, based on real, distinct
  authority scopes already present or explicitly absent in this
  codebase (not invented for this document):
  - **OPS-1. Node/Infrastructure Operator** — runs a Sails Node
    (transport, gossip, health) — `ADR-001`'s "Sails Protocol ≠ Sails
    Node" distinction; Operational Sails Node Identity (C in the A/B/C/D
    identity taxonomy, §3) is this actor's own identity concern, and
    **does not exist in this codebase today** (confirmed, `ADR-001`
    §26.3).
  - **OPS-2. Arbiter** — a **real, already-implemented, narrowly-scoped**
    role: `.env`'s `TRUSTED_ARBITRATORS` (comma-separated
    `participantId`s a deployment trusts to arbitrate disputes it is a
    party to routing for). Dispute-scoped, not global.
  - **OPS-3. Reference-Deployment Operator** — whoever operates a given
    Sails Market/reference deployment's own support/ops function. **No
    global cross-participant data-visibility role exists for this actor
    in the current codebase** — every real read path stays
    participant-scoped or arbiter-scoped (confirmed by direct
    code/schema audit, consistent with this project's own standing
    "no platform-operator visibility" rule, 2026-08-03). A "see
    everyone's trades" capability is explicitly **not** a real,
    implemented capability today (§9's own authority-boundary rule
    applies directly).
- **User and Integrator Surfaces confirmed sufficient as single
  groups** — User's needs vary by *situation* (which trade state, which
  side) not by a distinct identity role; Integrator's real split
  (Wallet vs. Service/Backend) is handled as two **paths within** the
  same actor (§7), per the mission's own §11 framing, not two separate
  actors.

## 3. A/B/C/D identity mapping — preserved verbatim, not redefined

Canonical source: `docs/DAY0_COMPLETENESS_COLD_SWEEP.md` §3.5, frozen
2026-09-09 (CTO Gate), reproduced in `docs/adr/ADR-001-day0-multi-operator-network.md`
§26.3. This document does not restate the full freeze text — it maps
**where each distinction matters, per actor**, per the mission's own
instruction ("o objetivo é definir onde essas distinções importam para
cada ator," not redesign the taxonomy):

| Identity | User Surface | Agent Surface | Operator Surface | Integrator Surface |
|---|---|---|---|---|
| **A. Participant Economic Identity** (`User.publicKey`) | The identity the user's own economic state is bound to — always shown when material. | An agent acts *on behalf of* a Participant Economic Identity; it does not have its own. | Not operator-visible beyond a dispute's own parties (OPS-2) or a participant's own record. | An integrator's own end-user maps to this — the integrator does not need to learn its internal representation. |
| **B. Participant Transport Identity** (`peerId`) | Never a User Surface-facing concept — reconnection/session detail. | Irrelevant to Agent Surface. | OPS-1 may need transport-layer diagnostics referencing this. | Irrelevant unless the integrator itself runs P2P transport directly (rare; most integrate over HTTP/WS per RFC-013). |
| **C. Operational Sails Node Identity** | Never User Surface-facing. Does not exist yet (ADR-001 §26.3). | Irrelevant. | **OPS-1's own identity concern** — not yet designed; OPS-1's UX must not imply it exists today. | Irrelevant to integration; an integrator connects to a node's *service*, not its identity. |
| **D. Operator Economic Recipient** | Never User Surface-facing. | Irrelevant. | **Distinct from OPS-1's own identity** — a node operator's fee/compensation recipient may differ from its node-key holder; not yet designed. Operator Surface UX must never conflate "who runs this node" with "who gets paid for it." | Irrelevant to integration itself; relevant only if an integrator is *also* a node operator (a real but separate role combination). |

**Frozen rule preserved, restated for this table:** `A ≠ B ≠ C ≠ D`; `C`
does not determine `D`; `B`'s persistence does not produce `C`; no
canonical single term covers both `C` and `D`. This document introduces
no UI, mechanism, or key format for any of A-D — it only says which
actor's screen a given distinction would matter on, if/when the
undesigned pieces (C, D) are ever built.

**Adjacent, equally-preserved distinctions** (not part of A-D, but load-bearing
for this model): `Funds Authority ≠ Economic Identity ≠ Transport
Identity` (`docs/IDENTITY_ARCHITECTURE_DISCOVERY.md` §1); `Recovery
relationship ≠ Public identity relationship` and `Same recovery root ≠
same private key across protocols` (same document, §7, and Issue #99's
own CTO-memory principle list) — **all recovery/derivation-scheme
questions remain fully OPEN** (`docs/IDENTITY_ARCHITECTURE_DISCOVERY.md`
is evidence-gathering only, no ADR frozen) and are **not decided,
touched, or narrowed by this document.**

---

## 4. Actor Matrix

Format: `Actor → Goals → Information Needed → Information Hidden →
Actions → Authority → Risks → UX Depth → Evidence Needed`.

### USR. User Surface

- **Goals:** complete a trade safely; understand where the money/asset
  currently is; know what to do next; know when a decision is
  irreversible.
- **Information needed:** current economic state in plain terms; the
  next required action (if any); material risk (e.g. "outside the
  dispute window," "irreversible once signed"); counterparty reputation
  signal; whether *they* must authorize something now.
- **Information hidden (by default, not by secrecy):** provider class/
  `EscrowType` (already-frozen: `EscrowType` is an implementation
  identifier, never surfaced as user-facing identity — `docs/PROJECT_CONTEXT.md`
  §2E item 6's Product State ≠ Technical State rule); registry keys;
  node topology; raw protocol state IDs; other participants' private
  trade data (§5).
- **Actions:** create/accept offers, negotiate, fund (once
  `FundingInstruction` exists, §2E item 7, not implemented), sign
  (`SigningRequest`, item 8, not implemented), approve/reject an Agent
  proposal, open/respond to a dispute as a party.
- **Authority:** Participant Authority over their own trade only
  (`SEMANTIC_KERNEL.md` §15's first dimension) — never over another
  participant's trade, never over settlement mechanics, never implied
  by merely viewing a control (§8).
- **Risks:** an ambiguous state read as resolved when it is not
  (`docs/PROJECT_CONTEXT.md` §2E item 15, "Outcome uncertainty —
  FROZEN"); a required action missed because it wasn't surfaced;
  material information truncated on a small screen (`docs/SAILS_DESIGN_LANGUAGE.md`
  §23).
- **UX Depth:** lowest density (§6) — decision, next action, state,
  risk, required authority only.
- **Evidence needed:** proof the state shown matches the real
  Kernel-level state (no UI-invented state), and that every required
  human-approval gate (K2) was actually presented, not assumed.

### AGT-1. Assistive Agent (real, shipped)

- **Goals:** reduce the user's own search/negotiation effort within a
  policy the user set.
- **Information needed:** current state; allowed next actions; its own
  capability scope (`CapabilityGrant.scope`); expiry (`constraints.expiresAt`);
  revocation status (`revokedAt`); whether human approval is required
  before its output becomes economic action; the evidence/context
  behind its own recommendation (an Assertion, `SEMANTIC_KERNEL.md` §8).
- **Information hidden:** other participants' private data beyond what
  the user's own mandate legitimately searches (e.g. counterparty
  reputation score, not identity data); raw provider/rail internals
  not relevant to its task.
- **Actions:** generate a structured intent from natural language;
  search/propose a matching real offer within declared limits (price,
  reputation floor); **never** create a trade or touch escrow itself
  (real, current: `AgentIntentionPanel.tsx`'s `handleApprove` is the
  only route from a proposal to a real `Trade`, and it is a human
  click).
- **Authority:** **access only, never authority** — `SEMANTIC_KERNEL.md`
  §26's own concrete example: *"QVAC's current advisory-only status for
  disputed MULTISIG settlement... discretion without independent
  attribution correctly does not authorize a transition"* (K2, §16).
  This is Kernel-level truth, not a product-doc-only rule.
- **Risks:** a recommendation mistaken for a decision; an expired or
  revoked grant silently still influencing UI; capability scope not
  actually enforced in a given deployment (§13 finding).
- **UX Depth:** structured, not minimal — context, permitted actions,
  limits, authority, duration, revocation, evidence, all visible when
  the surface is open; collapsed to a single-line status otherwise
  (`docs/SAILS_DESIGN_LANGUAGE.md` §8's own header treatment).
- **Evidence needed:** the grant it is operating under, its scope, its
  expiry, and proof the human-approval step actually gates the specific
  action about to occur.

### AGT-2. Delegated-Authority Agent (not implemented — modeled for future-proofing only)

- **Goals (hypothetical):** execute a bounded economic action without a
  synchronous human click, within a pre-authorized mandate.
- **Information needed (if ever built):** the exact same fields as AGT-1,
  plus a visible, durable record of the authority grant itself
  (issuer, scope, limit, expiry) and a real-time revocation channel.
- **Authority:** **none today.** Any future authority must be explicit,
  scoped, limited, observable, revocable, auditable, and governed
  (`docs/SAILS_DESIGN_LANGUAGE.md` §8's corrected language) — this is a
  **precondition list for a future Product/Architecture Decision**, not
  a spec for one. **This document does not authorize, design, or
  schedule this actor's runtime.**
- **Risks (if ever built, named so the eventual design must answer
  them):** silent authority expansion; unattributed discretionary
  action (violates K2 directly); a revoked grant still executing due to
  caching/race conditions.
- **UX Depth / Evidence:** not designed — placeholder only, so a future
  mission doesn't have to invent the *category* from scratch, only the
  mechanism.

### OPS-1. Node/Infrastructure Operator

- **Goals:** keep a Sails Node healthy, diagnose failures, understand
  network topology it participates in.
- **Information needed:** rail, provider, timestamps, health,
  topology, gossip/transport diagnostics, reconciliation info,
  degraded-state signals, evidence artifacts for its own node's
  operation.
- **Information hidden:** any participant's private trade content,
  payment destination, chat content, or dispute evidence **not**
  procedurally relevant to a node-level fault it is diagnosing (§5).
- **Actions:** operate/restart/monitor its own node; read its own
  node's diagnostics; **not**: move funds, alter a settlement
  destination, arbitrate a dispute it isn't assigned to (that's OPS-2),
  or read another participant's private data.
- **Authority:** operational authority over its **own infrastructure
  only**. `docs/DAY0_COMPLETENESS_COLD_SWEEP.md` §3.5's own frozen rule
  applies directly: *"A node key may be compromised. Economic
  entitlement must not accidentally turn an operational transport key
  into permanent financial identity."* Operating infrastructure grants
  **zero** funds authority (§8).
- **Risks:** diagnostic visibility mistaken for economic authority; a
  degraded/ambiguous node state displayed as if it were a proven
  economic failure (violates §2E item 15's Outcome Uncertainty rule).
- **UX Depth:** highest density — diagnostics, topology, provider,
  rail, evidence, observability, health, all first-class.
- **Evidence needed:** the same M9-style reconciliation evidence this
  codebase's backend already produces internally (`escrow-settlement-reconciliation`
  module) — this document does not propose new evidence types, only
  that OPS-1 is the actor a future operator-facing surface for existing
  evidence would target.

### OPS-2. Arbiter (real, narrowly scoped)

- **Goals:** resolve a dispute it has real, configured authority over.
- **Information needed:** the specific dispute's evidence, the trade's
  material state, both parties' submitted assertions (`SEMANTIC_KERNEL.md`
  §8) — scoped to disputes it is a `TRUSTED_ARBITRATORS`-listed party
  to, never a global dispute feed.
- **Information hidden:** every other participant's trade data not
  part of a dispute this arbiter is resolving.
- **Actions:** rule on an assigned dispute, per whatever real
  arbitration mechanism exists for that rail (real code:
  `arbitration-authority.ts`, MULTISIG rail, `SEMANTIC_KERNEL.md` §16's
  own K2-conformant example — "a signed authority decision,
  independently verifiable against the deciding actor's own registered
  identity").
- **Authority:** **dispute-scoped, not global.** `TRUSTED_ARBITRATORS`
  is a real, per-deployment allowlist — being on it grants authority
  over disputes routed to that arbiter, never over undisputed trades,
  never over other arbiters' cases, never economic authority beyond the
  dispute mechanism's own defined disposition.
- **Risks:** an arbiter UI that (even unintentionally) exposes
  non-assigned disputes; a ruling not independently attributable (would
  violate K2 directly, per §16's own attribution requirement).
- **UX Depth:** structured/technical — comparable to Agent Surface's
  density, since a ruling is itself a discretionary, attributable
  decision.
- **Evidence needed:** the signed authority decision itself, verifiable
  against the arbiter's own registered identity (already how the real
  mechanism works — this document proposes no new evidence shape).

### OPS-3. Reference-Deployment Operator

- **Goals:** operate a healthy Sails Market/reference deployment as a
  business, support its own users.
- **Information needed:** aggregate, non-participant-identifying
  operational health (uptime, error rates) — **no code path today
  provides participant-identifying aggregate views**, and this document
  does not propose building one.
- **Information hidden:** **everything participant-specific that isn't
  their own account** — no "see all trades," "see all offers," or
  "see all users" capability exists or is proposed here. This is a
  hard boundary, not a UX choice (§9).
- **Actions:** whatever real, participant-scoped support actions
  already exist (e.g. responding to a support request using
  information *that participant* has shared) — **not** a global data
  browser.
- **Authority:** **none beyond what any single participant already
  has over their own account**, unless a real future authorization
  model is designed and frozen. Today: **no global economic or data
  authority exists for this actor.**
- **Risks:** the single largest risk this section exists to prevent —
  building a "useful-looking" global admin view that has no real
  authorization backing it, silently promoting an engineering
  convenience into a product decision (classification **B**, §13).
- **UX Depth:** N/A today — no real surface exists; if one is ever
  authorized, it inherits OPS-1/OPS-2's density model scoped to whatever real
  authority is actually granted.
- **Evidence needed:** N/A — not implemented, not authorized here.

### INT. Integrator / Partner Surface

See §7 for the required Wallet vs. Service/Backend split — the matrix
below applies to both paths except where noted.

- **Goals:** integrate Sails capability into an existing product without
  learning Sails' internal implementation.
- **Information needed:** SDK/product state; capability matrix (which
  `Capability`/`CapabilityGrant` scopes exist, RFC-005); supported
  Asset/SettlementScope (ADR-002's canonical registries); capability
  maturity (`docs/PROJECT_CONTEXT.md` §2E item 4's 7-state lifecycle +
  planning-status axis); the user journey it is embedding; white-label
  configuration boundaries (§2D item 4, `SAILS_DESIGN_LANGUAGE.md` §10);
  observability of its own integration's health; error/recovery
  semantics.
- **Information hidden:** Sails' own internal module implementation
  detail not exposed by the public SDK/API contract (Principle 9,
  Interface Agnostic) — an integrator needs the *contract*, not the
  *mechanism*.
- **Actions:** call the public SDK/API surface; configure a white-label
  deployment within its frozen boundary; optionally supply a
  `WalletAdapter` (RFC-013) — **optional**, not mandatory (§7).
- **Authority:** whatever `CapabilityGrant`s its own integration holds
  — no more. Integrating a wallet does not make that wallet a
  `SettlementProvider` (§8); selecting a `SettlementProvider` does not
  grant destination authority over funds (§8, `Economic Disposition
  Authority ≠ Destination Authority ≠ Execution Authority`, Issue #105's
  F1 closure).
- **Risks:** learning Sails' internals as a prerequisite (a real DX
  defect per Issue #99's "no-assistance integration" test); assuming
  wallet support implies network/asset/settlement support (§7's own
  frozen rule); building against a capability whose maturity state was
  not accurately disclosed (§2E item 4).
- **UX Depth:** intermediate/technical — integration contract,
  configuration, capability truth, product states, recovery/error
  semantics; not Operator-level diagnostics, not User-level simplicity.
- **Evidence needed:** the same "independent developer, no-assistance
  integration" proof Issue #99 already requires; capability/maturity
  truth that matches what the SDK actually does, not aspirational
  copy.

---

## 5. Privacy Matrix

`Information → User → Counterparty → Agent → Operator (OPS-1/OPS-2/OPS-3) →
Integrator → Public`. `●` = full access, `◐` = scoped/partial, `○` = no
access. Every `◐`/`●` for Agent or Operator requires the corresponding
Authority Matrix entry (§8) to actually exist — visibility is never
assumed to imply it.

| Information | User (own) | Counterparty | Agent (AGT-1) | Operator OPS-1 | Operator OPS-2 | Operator OPS-3 | Integrator | Public |
|---|---|---|---|---|---|---|---|---|
| Payment details (method, PIX key, etc.) | ● | ◐ (only what the trade requires) | ○ | ○ | ◐ (if disputed, that dispute only) | ○ | ○ | ○ |
| Payout/destination address | ● | ○ (unless protocol requires disclosure to complete settlement) | ○ | ○ | ◐ (disputed case only) | ○ | ○ | ○ |
| Reputation score | ● (own) | ● (public signal by design) | ◐ (as needed for its own mandate's matching) | ○ | ○ | ○ | ○ (aggregate/public signal only) | ◐ (public score, not underlying trade history) |
| Identity data (economic identity, A) | ● (own) | ○ (protocol does not require real-world identity disclosure — Principle 8, Privacy Preserving) | ○ | ○ | ◐ (disputed case only) | ○ | ○ | ○ |
| Transport identity (B) | ○ (not user-facing) | ○ | ○ | ◐ (OPS-1 diagnostic) | ○ | ○ | ○ | ○ |
| Node identity (C) | ○ | ○ | ○ | ● (own node, once it exists) | ○ | ○ | ○ | ◐ (Node Descriptor, once designed — advertised, not private) |
| Dispute evidence | ● (own dispute) | ● (own dispute, other side) | ○ | ○ | ◐ (assigned dispute only) | ○ | ○ | ○ |
| Provider/rail in use | ◐ (plain-language state, not raw identifier — §2E item 4) | ○ | ◐ (as needed for matching) | ● | ◐ (assigned dispute) | ○ | ● (integration-relevant) | ○ |
| Economic state (trade/escrow status) | ● (own trade) | ● (own trade, shared) | ◐ (current state + allowed actions only) | ● (own node's handled trades, operationally) | ◐ (assigned dispute) | ○ (no global view) | ◐ (its own integration's own users only) | ○ |
| Internal diagnostics (M9 reconciliation, etc.) | ○ | ○ | ○ | ● | ○ | ○ | ○ | ○ |
| Fees/policy | ◐ (what applies to their own trade) | ◐ (same) | ○ | ● (node-level policy) | ○ | ● (deployment-level policy) | ● (integration-relevant) | ◐ (published policy, not per-trade breakdown) |
| Chat content | ● (own trade, E2E) | ● (own trade, other side) | ○ | ○ | ◐ (submitted-as-evidence only) | ○ | ○ | ○ |
| Proof/evidence metadata | ● (own) | ◐ (what protocol requires to share) | ○ | ◐ (operational, not content) | ◐ (assigned dispute) | ○ | ○ | ○ |

**Frozen rule preserved:** *simpler UX must not mean broader data
exposure.* Every `◐`/`●` cell above that does **not** already correspond
to a real, implemented access path (Prisma query scope, route
authorization) is a **gap**, not a design instruction to build one —
flagged in §11/§13, not silently authorized by appearing in this table.
This document does not invent a new authorization mechanism to make any
cell true that isn't already true in the real backend.

---

## 6. Authority Matrix

| Claim | True? | Why |
|---|---|---|
| Seeing a control grants authority to use it | **False** | UI visibility is a presentation concern; authority is `CapabilityGrant`/participant-authority-checked server-side (K1/K2, RFC-005/013/014). |
| Operating infrastructure grants funds authority | **False** | `docs/DAY0_COMPLETENESS_COLD_SWEEP.md` §3.5: a node key compromise must not become financial identity. |
| Diagnostic visibility grants economic discretion | **False** | Same source — OPS-1's visibility is operational, not economic. |
| Agent capability implies unrestricted execution | **False** | `CapabilityGrant.scope` + `constraints` (RFC-013's real Prisma model) bound every grant; K2 requires attributable discretion, never inferred from mere execution. |
| Wallet integration makes the wallet a `SettlementProvider` | **False** | Issue #86: `Wallet-kit Adapter != SettlementProvider`. `WalletAdapter` (RFC-013) is a signing/balance/address boundary, not a settlement-rail implementation. |
| `SettlementProvider` selection grants destination authority | **False** | Issue #105 F1 closure: `Economic Disposition Authority ≠ Destination Authority ≠ Execution Authority` — a real, closed backend property (`docs/DESTINATION_AUTHORITY_ARCHITECTURE.md`). |
| Sails Market has privileged protocol semantics | **False** | `docs/PROJECT_CONTEXT.md` §2D item 5 (Agents/Liquidity correction) + §2D item 7 (Access does not imply authority): a richer interface reaching a capability gets no more protocol authority than a thinner one reaching the same capability through the same public contract. |
| `WalletAdapter` selection policy = permission policy | **False** | `WalletAdapter` (RFC-013) governs *how* a wallet plugs in technically; `CapabilityGrant` (RFC-005/014) governs *what* a grantee is allowed to do. Two different registries, on purpose (RFC-005's own "Relationship to Module Registry" section, same discipline applied here). |
| Interface depth implies authority depth | **False** | `docs/PROJECT_CONTEXT.md` §2D item 7, restated at Kernel level (`SEMANTIC_KERNEL.md` §26): more detail shown ≠ more authority granted. |

**Existing, real authority scopes today** (not proposed by this
document — confirmed by code/config): participant authority over one's
own trade (K1/K2); `TRUSTED_ARBITRATORS`-scoped dispute authority (OPS-2);
`CapabilityGrant`-scoped agent/integration access, **gated by
`ENFORCE_CAPABILITIES`** (`.env`, defaults `false` in this reference
deployment — §13 finding). **No global economic authority role exists
in this codebase today for any actor**, including Operator (OPS-3).

---

## 7. Integrator split — Wallet vs. Service/Backend

- **Wallet Integrator** (e.g. "Wallet X" embedding OpenP2P via SDK +
  `WalletAdapter`): owns wallet UI, signing, balance, and address
  logic; plugs those into `@satsails/p2p-trading-sdk` via the real,
  **optional** `WalletAdapter` interface (RFC-013:
  `getPeerId/getAddress/getBalance/signTransaction/broadcastTransaction/getCapabilities`).
  Canonical framing, preserved verbatim: *"Keep your wallet stack. Plug
  into Sails"* (Issue #86).
- **Service/Backend Integrator** (a fintech or professional service
  integrating without a wallet UI, e.g. a backend liquidity/OTC
  desk-style participant, Issue #99's "web service that sells
  BTC/USDT/DePix" case): **does not need a `WalletAdapter` at all** —
  confirmed directly, RFC-013: *"every module built in
  `@satsails/p2p-trading-sdk` v0.1 already works without one (they only
  need HTTP/WS, never a private key)."* This path is not a lesser or
  degraded integration — it is a first-class, already-supported shape.
- **Frozen rule, preserved:** *Wallet support ≠ network support ≠ asset
  support ≠ settlement support* (Issue #99). An integrator's own
  README/onboarding must never imply that adding a `WalletAdapter`
  alone grants access to every asset/rail — capability/maturity truth
  (§2E item 4) governs that independently.
- **Both paths share the same Actor Matrix entry (§4.D)** — the split
  is a *technical integration path*, not two different actors with
  different privacy/authority rules.

---

## 8. Agent UX authority boundary

Restates §4's AGT-1/AGT-2 split as an explicit boundary statement, per the
mission's own required deliverable:

- **Today (AGT-1):** Sails Agent has *access* — it may read state relevant
  to its mandate, generate an intent, and search/propose within
  declared limits. It has **no authority** to move funds, sign, or
  complete a trade. The human-approval step is **current product
  behavior**, correctly classified as such
  (`docs/SAILS_DESIGN_LANGUAGE.md` §8/§21's own correction — also
  mirrored in a `docs/PROJECT_CONTEXT.md` §2E addition, both now merged
  to `main` via PR #134) — **not a permanent prohibition** on a
  future, properly-governed alternative.
- **A future AGT-2 (not authorized here)** would require its own explicit
  authorization semantics (`SEMANTIC_KERNEL.md` §26), satisfying every
  one of: explicit, scoped, limited, observable, revocable, auditable,
  governed. This document defines only the *shape* the UX boundary
  would need (visible grant, visible scope, visible expiry, visible
  revocation, visible evidence) — **no mechanism, runtime, or timeline
  is proposed.**
- **Cross-platform for AGT-1 today:** the current Sails Agent header
  identity/subtitle pattern (`docs/SAILS_DESIGN_LANGUAGE.md` §23) is the
  concrete, already-shipped instance of "critical identity must survive
  every breakpoint" applied to this actor.

---

## 9. Operator UX authority boundary

- **Real, distinct scopes today:** OPS-1 (own node's operational
  diagnostics), OPS-2 (assigned dispute's evidence, via
  `TRUSTED_ARBITRATORS`). **No global economic authority scope exists**
  for OPS-3 or any other Operator sub-role.
- **Explicit rule, applied:** *"Se não existe autoridade para listar
  todos os trades/offers/users, não desenhar isso como capacidade
  legítima."* Verified directly: no route/query in this codebase grants
  a cross-participant "list everything" capability. Any future desire
  for one is a **Product/Architecture Decision Required** (§13/§15),
  never assumed or default-designed here.
- **Distinguished explicitly, per mission requirement:**
  - *Observability* (OPS-1's own node health) — real, legitimate, no
    special authority beyond operating one's own infrastructure.
  - *Diagnostics* (same scope as observability).
  - *Participant-scoped access* (a participant's own data — User
    Surface, not Operator).
  - *Arbiter-scoped access* (OPS-2, real, `TRUSTED_ARBITRATORS`).
  - *Node-level operational visibility* (OPS-1, real, one's own node
    only).
  - *Global economic authority* — **does not exist**, is not modeled
    as available to any actor in this document.

---

## 10. Cross-platform information integrity rules

Applies `docs/SAILS_DESIGN_LANGUAGE.md` §23's own rule to every actor,
not only Sails Market's own User-facing screens:

- **Rule:** *"Information may reflow across breakpoints, but it must
  not fracture semantically."* *"Critical product state must not depend
  on desktop-only affordances."*
- **User Surface:** desktop/mobile/web — already governed by
  `docs/SAILS_DESIGN_LANGUAGE.md` §16 (Responsive Navigation Grammar)
  and §23; no new rule needed, only confirmation this applies to every
  future User-facing economic-state surface, not only Market/filters.
- **Agent Surface:** desktop/mobile/web, and (future, unbuilt)
  CLI/API/MCP/agent-to-agent surfaces — a machine consumer needs the
  *same* semantic fields (state, allowed actions, scope, expiry,
  revocation, evidence) as the human-facing AGT-1 panel, structured rather
  than visually laid out (`SEMANTIC_KERNEL.md` §26's own "same
  semantics, different consumers").
- **Operator Surface:** desktop-first is acceptable *today* (no real
  Operator UI exists) but any future one must not assume permanent
  desktop-only access — a node operator legitimately needs mobile
  alerting/diagnostics too; not designed here, named as a requirement
  for whoever builds it.
- **Integrator Surface:** documentation/API-reference consumption is
  itself cross-platform (a developer reading docs on any device, an
  SDK call from any runtime) — the relevant rule is that capability/
  maturity truth (§2E item 4) must be identical regardless of which
  client consumes the API, never a "desktop SDK gets more truth than
  mobile SDK" split.

---

## 11. Current Reality vs. Product Direction gaps

| Gap | Current reality | Product Direction | Classification (§13) |
|---|---|---|---|
| Operator Surface has no named actor model | Only a seed exists (`docs/PROJECT_CONTEXT.md` §2E item 14, "advanced/operator view") | This document names OPS-1/OPS-2/OPS-3 explicitly | **A** — Product truth omitted, now filled by this document |
| Integrator Surface has no named actor model | Real technical support exists (SDK, `WalletAdapter`, capability maturity model) but no actor-level UX model existed | This document names it (§4.D, §7) | **A** — same |
| `ENFORCE_CAPABILITIES` defaults `false` | `CapabilityGrant` mechanism is real and implemented, but not actively enforced by default in this reference deployment | Any Agent/Integrator UI claiming "capability-scoped" must reflect actual per-deployment enforcement state, not assume it | **F** — maturity nuance requiring disclosure, not an overclaim already made, but a real risk if a future UI assumes enforcement is universal |
| Operational Sails Node Identity (C) / Operator Economic Recipient (D) | Undesigned, confirmed by direct code/schema search (`ADR-001` §26.3) | Remain undesigned; this document assumes nothing about their eventual shape | **G** — legitimate deferral, already correctly tracked |
| Recovery root / multi-protocol identity derivation | Evidence-gathering only (`docs/IDENTITY_ARCHITECTURE_DISCOVERY.md`), no ADR | Remains open | **I/J** — Product Decision + Architecture Decision required, not resolved here |
| `docs/PROJECT_CONTEXT.md` §2E item 14's cross-reference to "§2D's progressive-disclosure Advanced depth" | §2D itself does not use the term "progressive disclosure" — the actual origin is `docs/SAILS_MARKET_DESIGN_DIRECTION.md` §6, which itself cites `PRODUCT-DIRECTION-FREEZE-1` (i.e. §2D item 7's interface-depth principle) | No correction proposed by this document — flagged as a minor cross-reference imprecision only | **H** — legitimate implementation/documentation detail, not a substantive contradiction |

---

## 12. Backlog Delta candidates

Registered in `docs/BACKLOG.md` (§ below) — not duplicated here beyond
a pointer, per the mission's own "não duplicar" rule:

1. Operator Surface (OPS-1/OPS-2/OPS-3) has no real implemented UI today —
   future work, not started, not scheduled by this document.
2. Integrator-facing capability/maturity documentation could
   consolidate the scattered real facts this document had to gather
   from RFC-005/013/014 + `docs/PROJECT_CONTEXT.md` §2E — a
   documentation-consolidation candidate, not a runtime gap.
3. `ENFORCE_CAPABILITIES` deployment-state visibility — any future
   Agent/Integrator-facing "capability scope" UI must read the real
   flag, not assume enforcement.

## 13. Product Decision candidates

- Whether/how a future Operator Surface (OPS-3) ever gains any
  participant-data visibility beyond today's zero — **not proposed,
  only named as the kind of question that would need one.**
- Whether a future Delegated-Authority Agent (AGT-2) is ever built, and
  under what governance model.
- Recovery-root/multi-protocol identity derivation scheme
  (`docs/IDENTITY_ARCHITECTURE_DISCOVERY.md`'s own open question,
  restated, not decided here).

## 14. Architecture Decision candidates

- Operational Sails Node Identity (C) mechanism/key format — `ADR-001`
  §26.3 already defers this; restated, not decided here.
- Operator Economic Recipient (D) model / C↔D mapping — same.
- A future machine-readable Agent/Integrator semantic surface
  (`SEMANTIC_KERNEL.md` §26's own "future work" framing) — restated as
  a candidate, not designed here.

## 15. Conflicts with current institutional truth

**None substantive found.** One minor, non-blocking cross-reference
imprecision noted (§11's last row) — does not require correction under
this mission's scope and is disclosed, not silently fixed.

---

## Documentation changes

- **New:** this document, `docs/PRODUCT_INTERACTION_MODEL.md`.
- **`docs/PROJECT_CONTEXT.md`:** one short cross-link added (§2G) — no
  existing frozen content altered.
- **`docs/BACKLOG.md`:** one new item (28) registering this document's
  real gaps (§12) — no existing item closed or altered in meaning.
- **Not touched:** `docs/SAILS_DESIGN_LANGUAGE.md`,
  `docs/SAILS_MARKET_DESIGN_DIRECTION.md`, `docs/SEMANTIC_KERNEL.md`,
  `docs/PRINCIPLES.md`, `docs/DAY0_COMPLETENESS_COLD_SWEEP.md`, any
  ADR, any RFC, any source code — all already correctly state what this
  document depends on; nothing needed correction beyond the one noted,
  non-blocking cross-reference.

## Notation correction (`ACTOR-EXPERIENCE-MODEL-R1`, 2026-09-12)

This document's original text (`MISSÃO 1`) labeled the actor taxonomy
and its subdivisions `A`/`B`/`C`/`D` and `B1`/`B2`/`C1`/`C2`/`C3` —
colliding with the already-frozen A/B/C/D identity taxonomy (§3,
`docs/DAY0_COMPLETENESS_COLD_SWEEP.md` §3.5/`ADR-001` §26.3), even
though the two taxonomies were never the same thing. Corrected
throughout to `USR`/`AGT`/`OPS`/`INT`, with `AGT-1`/`AGT-2` and
`OPS-1`/`OPS-2`/`OPS-3` for the sub-roles. `A`/`B`/`C`/`D` now appears
only in §3, exclusively for the identity taxonomy. No actor, authority,
or privacy meaning changed — this is a rename, not a redesign.

## Closing confirmations

No protocol, SDK, Core, or Semantic Kernel change. No new backend role,
auth system, or runtime. No Operator dashboard, no delegated agent
authority, no Private Markets/server-discovery mechanism implemented.
No recovery/derivation scheme decided. This document is Product/UX/
Interaction Model institutionalization only, built entirely from
already-frozen sources plus one new synthesis (the Actor Matrix itself,
explicitly framed as this document's own contribution, not attributed
to a source that didn't make it).
