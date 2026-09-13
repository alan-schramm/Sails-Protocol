# PROJECT_CONTEXT.md
### Sails Protocol — Engineering Handoff · Document 1 of 20

> **Read this file first.** Every other document in this handoff assumes you
> understand what's written here. This document assumes zero prior context —
> you were not in any conversation where this was discussed. Everything you
> need is written down.

---

## 1. What Sails Protocol Is

**v1 Positioning Freeze (post-DeepSeek external review — CTO directive,
supersedes the framing below where the two conflict):** the protocol's
long-term scope is unchanged, but every v1 decision — architecture,
documentation, SDK, examples, diagrams — starts from one concrete
scenario, not the full generic ambition:

> **"Sails Protocol is open infrastructure for building interoperable
> P2P Financial Marketplaces."**

This is the **One Sentence Test** answer — the same sentence, every time,
in the README, in a pitch, in onboarding docs. If a document describes
Sails Protocol differently, that document is wrong, not this sentence.

**Why this supersedes, not replaces, the broader definition below:** the
protocol was never *only* capable of P2P marketplaces — OTC, Lending,
Payroll, Commerce, Treasury, and OpenFinance all sit on the same
architecture (`ROADMAP.md`). But a protocol that can do everything reads,
to a developer or a partner meeting it for the first time, as a protocol
that does nothing specific. **The MVP has exactly one job: prove the
architecture by building a P2P Financial Marketplace any wallet can
embed.** Every other capability stays real, stays designed for, and stays
explicitly on the roadmap — not the current focus.

**The priority filter this creates, effective immediately:** every new
piece of work should be checked against one question — *"does this
directly improve building a P2P Financial Marketplace?"* If yes, it's in
scope. If no, it gets documented as future roadmap, not built now. This
also changes what "progress" means from here forward: the priority is no
longer adding modules or features — it is making the existing
architecture more consistent, simpler to implement, better tested, and
easier to explain. A contribution that doesn't do one of those things
(or serve the P2P Marketplace directly) is not yet due.

**The problem this solves (the manifesto, quotable on its own):**

> "Today, every wallet has to rebuild marketplace, reputation, identity,
> escrow, settlement, mediation, and antifraud from scratch. Sails
> Protocol standardizes that infrastructure through a single SDK and
> interoperable modules."

**Ideal Customer Profile (v1), stated explicitly rather than left as
"wallets" in general:** Bitcoin, USDT, Lightning, Liquid, and multi-chain
non-custodial wallets that want to add a P2P Financial Marketplace
without building the underlying infrastructure themselves.

---

**Official Definition (long-term scope — use where the discussion is
genuinely about the protocol's full ambition, not the v1 MVP; the One
Sentence Test answer above is what to lead with everywhere else):**

> "Sails Protocol is an intent-driven, open coordination protocol that
> enables sovereign financial interactions across wallets, agents,
> applications and institutions."

**The Mental Model (v7.4 — CTO review finding: too many components existed
before a simple starting picture did). Everything else in this handoff is
a refinement of this one line:**

```
User  →  Intent  →  Coordination  →  Settlement  →  Completion
```

Read `PROTOCOL_SPECIFICATION.md` for the 9-primitive, 9-state version of
this same picture. Start here first.

**Sails Protocol** is an **Open Coordination Protocol for Sovereign Finance**.

It is a specification — a set of interfaces, event contracts, and behavioral
rules — that allows sovereign wallets, fintechs, OTC desks, and AI agents to
discover counterparties, negotiate terms, and settle transactions in any
digital asset or local currency, **without any custodian, broker, or central
intermediary**.

**Corrected (v1 Positioning Freeze) — this section previously said "We are
not building a P2P exchange," which directly contradicts section 1's new
positioning above and is retired, not silently dropped: the earlier
sentence was written when the project deliberately avoided any single
concrete use case, to stay maximally generic. The DeepSeek review's
finding, adopted by the CTO, is that this genericness was the adoption
blocker, not a strength — a protocol needs one clear "what can I build
with this" answer before it needs breadth.** The corrected canonical
one-line description, used verbatim across every document in this
project:

> **"Sails Protocol doesn't operate a P2P exchange — it's the
> infrastructure that lets any wallet become an interoperable P2P
> Financial Marketplace."**

This preserves what the retired sentence was actually protecting
(Principle 1, Protocol First: Sails itself never becomes a business
running a marketplace, never custodies funds, never owns an order book)
while aligning with the positioning above instead of contradicting it.

**Revised again (GPT/CTO persona's re-analysis of the DeepSeek review,
same week):** the version above previously ended "...it's the
infrastructure any wallet uses to build one" — correct, but it silently
dropped "interoperable," the one word doing the most work in the One
Sentence Test's own tagline (section 1). "Build one" also implied each
wallet constructs a separate, siloed marketplace; "become an
interoperable P2P Financial Marketplace" says what's actually true
architecturally — a wallet that integrates Sails becomes a participant
in one shared, interoperable network, not the operator of its own
isolated instance. Small wording change, but it closes a real gap
between this sentence and the tagline it's supposed to restate.

**The value contrast, added the same pass:** Bisq is an application — a
product a user installs and trades directly on. Sails Protocol is
infrastructure a wallet integrates so that *it* becomes the application.
Bisq ships a marketplace; Sails ships what any wallet needs to become
one. `PROTOCOL_ECONOMY.md` section 5 has the detailed tokenomics
comparison against Bisq (and Morpho, HodlHodl, Lightning) — that table
stays as-is, technical comparison is the right register there; this
paragraph is the plain-language version of the same distinction for
positioning material.

### What the protocol is NOT

- ✗ A centralized exchange
- ✗ A custodial wallet
- ✗ A broker or financial intermediary
- ✗ A payment processor
- ✗ A banking service
- ✗ An on-ramp / off-ramp provider

### What the protocol IS

- ✓ An open coordination protocol (interfaces + events + behavior, not code)
- ✓ A non-custodial matching layer
- ✓ A trade lifecycle state machine
- ✓ A P2P communication coordinator
- ✓ A fiat-settlement-aware protocol (coordinates fiat payment proof without
  touching fiat funds)

**Canonical fiat model statement (v8.0 — use verbatim wherever the fiat
model is described):**

> "Fiat is always settled directly between participants. The protocol
> never intermediates fiat."

The protocol never receives PIX, never processes ACH or SEPA, and never
executes any fiat payment. It only coordinates — negotiation and digital
asset settlement. See `PROTOCOL_SPECIFICATION.md` section 4 for the full
technical flow this statement summarizes.
- ✓ A reputation and trust layer
- ✓ A pluggable escrow interface
- ✓ An open SDK target for any wallet or app

---

## 2. The Three-Level Hierarchy (never mix these up)

This is the single most important structural fact about the project. Every
document, every piece of code, every diagram must respect this separation.

```
LEVEL 1 — SAILS PROTOCOL (the specification)
  Defines: interfaces, events, primitives, behaviors.
  Does NOT define: programming language, database, framework, cloud provider.
  Anyone can implement it — in TypeScript, Rust, Go, Java, C#.

LEVEL 2 — OFFICIAL MODULES (8 total, see PROTOCOL_SPECIFICATION.md)
  Sails OpenIdentity, OpenReputation, OpenSettlement, OpenLiquidity
    → "cross-module services" — used by any application module
  Sails OpenP2P (✅ first one built), OpenFinance (future)
    → "application modules" — build on top of the cross-module services
  Sails SDK (family name — see the Named-SDK Rule, section 3 below)
    → developer-facing wrapper around all modules
    → first named release: Sails P2P Trading SDK

LEVEL 3 — REFERENCE IMPLEMENTATIONS (concrete code, concrete tech choices)
  Satsails Wallet   → first reference implementation (implements OpenP2P)
  Sails Finance     → future reference implementation (will implement OpenFinance)
  SailsPay          → future reference implementation (payment flows on OpenP2P)
```

Full detail on each — including their existing/planned infrastructure
(WDK, PIX rails via Plebank/Eulen, Morpho, Hyperliquid, Polymarket,
Lightspark Grid, etc.), why this three-implementation ecosystem accelerates
protocol validation, and a suggested Whitepaper appendix — is in
`REFERENCE_IMPLEMENTATIONS.md`.

**The rule that must never be broken:** the protocol (Level 1) has no opinion
about PostgreSQL, Redis, TypeScript, or Fastify. Those are choices made by
the Satsails reference implementation (Level 3). A different company could
implement the exact same Sails Protocol Level 1 spec using Rust and
CockroachDB and it would be an equally valid Sails Protocol implementation.

If you ever find code or documentation that blurs this line — that talks
about "the protocol using PostgreSQL," for example — that is a bug in the
documentation, not a fact about the protocol. Fix the wording, don't accept
the premise.

**"Satsails Wallet" is also the "Reference Wallet"** — the same relationship
Bitcoin Core has to the Bitcoin protocol, or the Ethereum Reference Client
has to the Ethereum protocol: one concrete implementation, built by the
team that also writes the spec, that proves the spec actually works before
anyone else has to trust it blind. Use "Reference Wallet" specifically
when the point being made is "the first proof this works," and "Satsails
Wallet" when the point is about that specific product/company — they name
the same thing, but the emphasis differs.

## 2B. What's Core / What's Not Core (v1 Positioning Freeze)

Every "is X part of the protocol" question has one test: **would this
still make sense if the Reference Wallet were rewritten in Rust against
CockroachDB tomorrow?** If yes, it's Core. If the answer changes because
of that rewrite, it was never Core to begin with.

**Core** (defined once, in `PROTOCOL_SPECIFICATION.md`, technology-agnostic):

- Intent
- Timeline
- Events
- Capability
- Policy
- Proof
- Identity
- Settlement
- Reputation

**Not Core** (implementation choices, belong to a Reference Implementation,
never to the spec):

- PIX, Lightning, Bitcoin (settlement assets/rails — `SettlementAdapter`
  implementations, §4B)
- HyperDHT, WebSocket (`TransportProvider` implementations, RFC-002)
- Redis, PostgreSQL, Prisma (the Reference Wallet's own storage choices)

This list exists so "is Postgres part of the protocol" never needs
re-litigating — it isn't, by definition, the same way it isn't for
Bitcoin or Ethereum.

---

## 2C. Product Decision — Asset + SettlementRail as the Day-0 Destination Dimensions (2026-09-12)

**Frozen, architecture-only — no implementation authorized by this
section.** Full evidence and design record:
`docs/ASSET_SETTLEMENT_RAIL_ARCHITECTURE_DISCOVERY_2026-09-12.md`.
Architecture decision: `docs/adr/ADR-002-asset-settlement-rail-adapter-provider-architecture.md`.
Addresses `docs/BACKLOG.md` item 20.6's own "mechanism NOT frozen"
clause.

**Decision:** Day-0 settlement destination is expressed by exactly two
product dimensions:

> **Asset + SettlementRail.**

- **`Asset`** means the economic unit being transferred (`BTC`, `USDT`,
  `USDC`, `DEPIX`, `XAUT`), independent of how it moves.
- **`SettlementRail`** means the settlement domain/network/protocol
  through which that asset is represented or settled (`BITCOIN_L1`,
  `LIGHTNING`, `ARKADE`, `LIQUID`, `SPARK`, `ETHEREUM`, `BASE`, `TRON`,
  `SOLANA`, `TON`, and so on).

**Separate `Protocol` and `Network` dimensions are explicitly NOT
introduced at Day-0.** No row in the canonical Day-0 target (restated
in `docs/BACKLOG.md` item 20.6 and ADR-002 §5) requires that split,
while introducing it would add conceptual complexity no current case
earns.

**Naming rule:** the fully-qualified term `SettlementRail` is used
everywhere this dimension is discussed — never bare `Rail`. `RFC-013`'s
own `WalletCapabilitiesDeclaration.fiatRails` already uses "rail" for
fiat payment methods (PIX, ACH, SEPA); `SettlementRail` stays textually
distinct from that unrelated, already-established meaning.

This decision does not by itself change `AssetType`, `EscrowType`,
`prisma/schema.prisma`, any SDK contract, any QVAC schema, or the
Reference Wallet — see ADR-002 for the architecture this decision
enables and the explicit non-authorization of any such change here.

---

## 2D. Product Decision — Reference Components / White-label / Sails Market Product Layering (2026-09-12)

**Status: institutionalized, product-layering only. No UI, SDK, or
protocol change is authorized or made by this section.** Origin: CTO
mission chain (Product/UX discovery → `UX-PRODUCT-ARCH-1` →
`PRODUCT-DIRECTION-FREEZE-1`). Full evidence trail (page-by-page reality
audit, keep/refactor/redesign map, real-vs-mock dependency map):
this mission's own delivered reports — not separately filed as a
document, per the "avoid creating unnecessary docs" instruction this
freeze was given; this section is the institutional home.

**Documents consulted, none found in conflict:** `docs/BACKLOG.md`
(item 20 family, this section's own new item 22), `docs/adr/ADR-001`/
`ADR-002`, `docs/PRINCIPLES.md` (Principle 9, Interface Agnostic — see
§7 below), `docs/PROJECT_CONTEXT.md` (this document, §1-§2C, §3's
Satsails Wallet section), `docs/SEMANTIC_KERNEL.md` (K1-K3 — confirmed
zero impact, see closing note). No `MULTI_INTERFACE_POSITIONING`
document exists in this repository under that or any similar name
(checked directly, not assumed) — the closest existing institutional
content is Principle 9 itself; §7 below extends it to the product/UI
layer rather than treating a non-existent document as prior art.

### 1. Three product layers — FROZEN

- **Layer A — Reusable Reference Components.** Reusable UX primitives
  and canonical interaction patterns — asset/rail selection, offer
  cards, trade state, funding request, signing request, settlement
  state, dispute state, counterparty identity/reputation, status
  timeline, evidence/risk display. **Corrected (2026-09-12,
  `PRODUCT-DIRECTION-FREEZE-1-CORRECTION`):** the prior wording ("consuming
  public SDK/API contracts only") over-coupled this layer to a specific
  integration mechanism. Frozen instead: **Reference Components
  represent public product semantics through typed product-facing
  state/interfaces and must not depend on Sails commercial
  assumptions. Application adapters/hooks may connect those components
  to public SDK/API contracts without introducing semantic
  privilege** — semantic compatibility is required, direct SDK coupling
  is not ("stable semantics, replaceable edges" — the same discipline
  item 7 below extends from `PRINCIPLES.md`'s Interface Agnostic
  principle, applied here at the component level). A component must
  remain reusable across Sails Market, white-label
  deployments, potentially other web/mobile interfaces, and tests/
  Storybook/reference demonstrations without every component owning its
  own transport/network integration. **Must not embed Sails commercial
  product assumptions.**
- **Layer B — White-label P2P Base.** A usable, brandable/configurable
  P2P market application (marketplace, offer creation, trade, chat,
  settlement, dispute, identity/reputation, configurable capabilities)
  that preserves Sails economic semantics. **Must not redefine**
  canonical Product Scope, Asset/SettlementRail meaning, custody
  semantics, finality, protocol authority rules, or evidence truth.
- **Layer C — Sails Market.** **Renamed (2026-09-12,
  `PRODUCT-DIRECTION-FREEZE-1-NAMING`) — previously "Sails Web" in this
  section; superseded, not a second concept.** The official first-party
  commercial composition layer: Sails Protocol's official first-party
  web product, initially centered on OpenP2P and capable of
  progressively composing OpenLiquidity/OpenAgents/OTC/Private
  Markets/identity-reputation/richer coordination surfaces. Public
  positioning (product name + tagline, not protocol semantics): "Sails
  Market — Economic Coordination." **May differentiate aggressively at
  product level. Must not gain privileged protocol semantics or private
  integration paths unavailable in principle to third parties.** Sails
  Protocol itself is not renamed by this decision.

No conflict found against frozen architecture, `PRINCIPLES.md`, or
`BACKLOG.md` — formalized as stated.

**Satsails Wallet / Sails Market relationship — RESOLVED (correction,
2026-09-12, `PRODUCT-DIRECTION-FREEZE-1-CORRECTION`; naming finalized
the same day, `PRODUCT-DIRECTION-FREEZE-1-NAMING`).** The prior version
of this note left this relationship as an open Product Decision —
corrected here, not silently: **Satsails Wallet and Sails Market are
distinct first-party products.**

- **Satsails Wallet** = first-party mobile/wallet product, reference
  implementation/distribution surface, multi-rail wallet experience —
  `docs/PROJECT_CONTEXT.md` §3's existing "first reference
  implementation, first production distribution surface, first
  multi-rail showcase" framing, unchanged.
- **Sails Market** = first-party web product and broader economic-
  coordination/market surface (Layer C) — may compose multiple Sails
  modules, may differentiate commercially, does not define protocol
  truth, receives no semantic privilege.
- Both consume Sails Protocol/modules through the same semantic/public
  integration boundaries available in principle to third parties.
  Neither defines protocol truth. Neither gains semantic privilege.
  They may share SDKs, Reference Components, design system,
  capabilities/modules, identity/reputation surfaces, and settlement
  primitives without becoming one product.

**Sails Reference Web — introduced (2026-09-12,
`PRODUCT-DIRECTION-FREEZE-1-NAMING`).** An architectural/internal role,
**not a commercial product name**, for the reusable/reference web
implementation surface. Its role: reference integration, demonstrative
flows, reusable examples, conformance/integration support, proving
SDK/component interoperability. It must not be presented publicly as
the main commercial brand unless a future Product Decision changes
that. It is **not** a second commercial layer alongside Sails Market —
it is a reference composition built from the same reusable layer (§8
below extends "Reference UI role" to name this concretely) and is not
a mandatory parent of Sails Market, Satsails Wallet, or any other
product.

**Institutional topology — corrected (2026-09-12,
`PRODUCT-DIRECTION-FREEZE-1-NAMING`).** The prior linear diagram visually
implied White-label P2P Base is a forced parent of every first-party
and third-party product, even though the accompanying text already said
otherwise — corrected so the diagram matches the text:

```
Sails Protocol
        |
        v
Modules / SDK / Product-facing Contracts
        |
        v
Reusable Reference Components
        |
        v
────────────────────────────────────────────
|              |              |             |
White-label   Satsails      Sails        Third-party
P2P Base      Wallet        Market       Apps
```

**Frozen: White-label reuse is optional composition, not architectural
parenthood.** White-label P2P Base, Satsails Wallet, and Sails Market
are each their own composition over the same reusable
Modules/SDK/Reference Components layer — none is architecturally
downstream of another. A third-party app may either build on the
White-label P2P Base or integrate the SDK/Reference Components
directly; neither path is privileged over the other. Sails Reference
Web may exist as a reference composition around this same reusable
layer, alongside the four compositions shown above — it is not drawn
as a fifth sibling here only because it is not itself a commercial
product, per its own definition above, not because it is subordinate to
them.

`docs/BACKLOG.md` item 22's prior "naming reconciliation required"
sub-item was removed by the 2026-09-12 correction — resolved, not
deferred. Its commercial-name references are updated by this same-day
naming finalization (see that item's own note).

### 2. Core product principle — FROZEN

**Reference Components ≠ White-label Base ≠ Sails Market Product** —
but all three share the same economic semantics and public integration
boundaries. **Sails Market demonstrates and composes the protocol; it
does not define protocol truth.**

### 3. Dogfooding / non-privilege principle — FROZEN (semantic form only)

Satsails Wallet and Sails Market should operate as real participants
using the same public protocol/SDK surfaces available to third-party
applications wherever technically possible. Where an operational
exception is genuinely necessary (e.g. internal tooling, migrations,
operational monitoring), it must be an **explicit, disclosed
operational exception, not a hidden semantic privilege** — the
protocol grants no first-party actor authority a third party could not
in principle also hold. **Not frozen:** "zero internal API ever" as an
absolute implementation slogan — that would be a false, unenforceable
claim against real operational needs; the semantic non-privilege rule
is what is frozen, not a literal API-surface ban. **Sails Reference
Web**, where it exists, is treated the same way as any other
integration surface for this principle — a conformance/reference
surface, never a privileged first-party product.

### 4. White-label configuration boundary — FROZEN

Configurable by a white-label tenant: branding, enabled assets, enabled
rails, supported payment methods, market visibility, enabled product
capabilities/modules, fee presentation (where the protocol already
permits fee configuration), dispute/arbitration policy (where the
protocol already permits it — e.g. `ARBITRATION_MODE`,
`TRUSTED_ARBITRATORS`), enabled settlement integrations, external
signer choices, operational provider availability. **Frozen rule:
configuration selects from valid, already-registered capabilities; it
never creates new economic truth.** A tenant configuration **cannot**
register a new `SettlementScope`, redefine an `Asset`/`SettlementRail`,
or alter custody/finality semantics — those remain protocol-level,
governed exclusively by the canonical registries (ADR-002) and any
future Provider Identity/routing decision, never by tenant config.

**Visual-layer instantiation (`DESIGN-LANGUAGE-1`, 2026-09-12):** this
item governs functional/capability configuration; `docs/SAILS_DESIGN_LANGUAGE.md`
§9 formalizes the same non-negotiable boundary specifically for visual
theming (brand color/logo/typography/radius customizable; semantic
state meaning, risk hierarchy, authority cues, and funding/signing
semantic states are not) — a specialization of this frozen rule, not a
new one.

### 5. Agents / Liquidity correction — FROZEN

**Rejected as institutional truth:** "OpenAgents = Sails Market only"
and "OpenLiquidity = Sails Market only." **Correct principle, frozen
instead:** capabilities/modules (OpenAgents, OpenLiquidity, and any
other) may be exposed by Sails Market, a white-label deployment, a
third-party application, an agent, a CLI, an MCP surface, or any other
authorized interface. Sails Market may be the richest first-party
composition; it is not the exclusive owner of any protocol capability.

### 6. Funding / signing product principle — FROZEN (principle, not a mechanical rule)

**Frozen:** economically material actions and states must be observable
and understandable to the user. **Not frozen:** "every signature
requires an explicit click" — the authorization model (not UX
preference) determines whether signing may be automatic, delegated,
batched, or explicit. Required test, applied per action: (a) authority
for the action must already exist (never granted implicitly by the UI
itself); (b) a material state transition must never be silently
ambiguous; (c) the user/operator must receive appropriate feedback;
(d) UX must never hide an irreversible decision in the name of
simplicity. Preserves **simple, not simplified** (§7 below). This
directly corrects the specific defect this mission chain found (real
participant-key submission and signature collection happening with zero
user-facing feedback in `packages/sails-ui/src/pages/Trade.tsx` today) —
naming the defect, not yet fixing it; the fix is implementation, out of
this institutionalization mission's scope.

### 7. Interface depth principle — FROZEN, extends existing Principle 9

`docs/PRINCIPLES.md` Principle 9 ("Interface Agnostic") already freezes,
at the Core/primitive level: *"The Core models intentions, states, and
events — never user interfaces."* This section extends the same
discipline explicitly to the product/UI layer, without editing
`PRINCIPLES.md` itself (the principle already says what is needed;
this is its stated application, not a new principle): **interface
sophistication may vary (UI, mobile, web, SDK, API, CLI, MCP/WebMCP,
agents) without changing protocol meaning. Interfaces may multiply;
semantics must not. Access does not imply authority** — a richer
interface (e.g. Sails Market) reaching a capability does not grant it
more protocol authority than a thinner one (e.g. a CLI) reaching the
same capability through the same public contract.

### 8. Reference UI role / Sails Reference Web — FROZEN

"Reference UI" institutionally means: demonstrative, reusable,
conformance-oriented, integration-supporting. It does **not**
automatically mean: official commercial product, a complete white-label
product, canonical visual design, or protocol authority. (Mirrors
`docs/PROJECT_CONTEXT.md` §3's existing "Satsails Wallet is a reference
implementation, not protocol truth" — restated here at the UI-layer
specifically, not a new claim.) **Sails Reference Web** (introduced
above) is the concrete name for this role's web instantiation —
`packages/sails-ui` today is that reference surface. Whether Sails
Reference Web and Sails Market ever share one codebase, one deployment,
or remain separate is not decided here — an implementation detail left
open, since this section institutionalizes the *role* distinction, not
a repository/deployment structure.

### 9. Sails Market role — FROZEN

Sails Market **is**: the official product, a dogfooding surface, an
integration-proof surface, a product-innovation surface, a commercial-
differentiation surface. Sails Market **is not**: the canonical
protocol UI, a privileged settlement operator by definition, a
mandatory frontend, a required market operator, or a source of
protocol semantics.

### 10. Visual / navigation status — EXPLICITLY OPEN, not frozen

The following remain **open**, pending a dedicated Product/UX reference
review — nothing below is frozen by this section, and no current state
is to be read as final direction: final visual language, final
navigation, final dashboard structure, marketplace-first vs.
dashboard-first entry, sidebar vs. top-nav, page density, chart/table
patterns, application shell, module navigation.

### 11. Current UI library status — classified, not frozen as direction

The existing `packages/sails-ui` component work (the shadcn-based
primitive set — `button`/`card`/`badge`/`input`/`dialog`/`sheet`/
`select`/`popover`/`switch`/`textarea`/`tooltip` — plus the trade/
marketplace/chat component folders) is classified as an
**implementation asset and reusable candidate**, not Product Direction.
Neither "keep all current components" nor "replace all current
components" is institutionalized — that determination belongs to the
still-open visual/navigation review (§10).

### 12. Private Markets — classified

**Composition candidate**, not a confirmed real gap and not
implemented here. A private market decomposes into: restricted
discovery (who may see an offer — an `Offer`-visibility/filtering
concern OpenLiquidity's discovery surface already models structurally),
restricted membership (who may create/accept — `RFC-005`'s
`CapabilityGrant` already models scoped permission), and policy (fee/
dispute rules — `FeePolicyVersion`/`ARBITRATION_MODE` already exist as
per-deployment configuration surfaces). No evidence was found this
session that a new protocol module is required to represent a private
market; the composition above should be the first thing evaluated by
any future Private Markets mission before proposing a new primitive. If
that composition is found insufficient, a Product Decision (defining
what a private market must guarantee) would be needed before any
Architecture Decision — neither is made here.

### 13. Economic Authority lens — classified

**B — useful architectural lens, not a new primitive.** Tested against
existing concepts: Economic Disposition Authority, Destination
Authority, and Execution Authority (`docs/DESTINATION_AUTHORITY_ARCHITECTURE.md`,
already a three-way split, F1-closed) already cover *who may direct
disposition of funds*, *who receives them*, and *whose key executes
settlement*, respectively; `CapabilityGrant` (RFC-005) covers *what an
identity/agent is permitted to do*; Intent authority (RFC-012) covers
*who may express a coordination-triggering Intent*; settlement
authorization and evidence/finality are covered by the escrow lifecycle
and M8/M9 conformance work already frozen elsewhere. The "economic
authority" framing usefully **names the family these already-frozen
concepts belong to** for teaching/organizing purposes — it does not
surface anything unrepresented, and **no new primitive is
authorized or found necessary** by this classification.

### 14. Operator-disappearance test — adopted as a standing review question

**Adopted, not claimed to be already satisfied everywhere:** *"If
Sails, a frontend, or one operator disappears, which economic
properties remain true?"* — a standing adversarial review question for
future architecture/product work, distinguishing protocol truth (e.g.
a broadcast Bitcoin settlement's finality — survives), application
availability (a specific frontend disappearing — does not itself
destroy on-chain state), discovery availability (depends on which
discovery surface — the real, current default is a centralized HTTP
API, not yet Pears/HyperDHT-backed for offer discovery itself), signer/
provider availability (a real, already-disclosed limitation exists
today: `multisig.provider.ts`'s single-arbiter-per-escrow design means
the operator holding `MULTISIG_SEED` is a genuine single point of
failure for that rail's disputed path — named here, not newly
discovered, and not resolved by this section), and recoverability
(covered by the existing M9 reconciliation mechanisms). **No claim is
made that every workflow survives every operator's disappearance** —
the question is adopted as a lens, its answers vary per property, and
applying it fully to every subsystem is future work, not completed
here.

### Closing confirmations

No Semantic Kernel change (`docs/SEMANTIC_KERNEL.md` K1-K3 untouched —
this section is product/UX/commercial-layering, not a Core primitive).
No Core impact. No `AssetType`/`EscrowType`/`prisma/schema.prisma`/SDK
contract/QVAC schema change. No `SettlementScope`/Provider-registry
architecture change — ADR-002 remains exactly as frozen. `BACKLOG.md`
20.2/20.5/20.6 are **not** closed by this section (see `docs/BACKLOG.md`
item 22 for the recorded backlog delta).

---

## 2E. Product Decision — SDK Family Boundaries, Sails Market Capability Truth, and UI Implementation Guardrails (2026-09-12)

**Status: institutionalized product/security truth. No UI, SDK,
protocol, or runtime change is authorized or made by this section.**
Origin: `PRODUCT-IMPLEMENTATION-READINESS-1`, following §2D's frozen
three-layer model and `docs/SAILS_MARKET_DESIGN_DIRECTION.md`
(PR #132, still open/unmerged when this section was first written —
read as design-direction context only, not edited or merged by this
section itself; merged separately, `MERGE-SEQUENCE-1`, 2026-09-12).
Exists to prevent scope creep, product
overclaim, UI outrunning runtime truth, custody/signing ambiguity,
first-party semantic privilege, SDK-monolith expansion, and design
completion being mistaken for product completion.

### 1. Sails OpenP2P Trading SDK — final domain, FROZEN

`@satsails/p2p-trading-sdk` is **the first SDK in the future Sails SDK
family**. Its domain: public P2P markets; Private Markets within the
P2P domain (item 2 below); offer discovery/publication; negotiation;
trade coordination; settlement coordination; identity/reputation
interactions required by P2P; access/membership/policy controls
required by Private Markets; P2P-related node/server/network operation
surfaces required for that domain. **Frozen: product expansion must
not become SDK scope expansion** — Sails Market growing to compose
OpenLiquidity/OpenAgents/OTC does not by itself enlarge this SDK's own
domain. OpenLiquidity, OpenAgents, and future protocol modules **may**
gain their own SDKs or integration packages once justified by maturity
and product need — **none is created by this section.**

### 2. Private Markets — classification sharpened (extends §2D item 12)

**Frozen:** Private Markets belong first to the OpenP2P domain, as a
composition of market visibility, membership/access policy, discovery,
and existing economic semantics — not a new protocol module, unless a
real composition attempt proves a genuine semantic gap (§2D item 12's
own composition-candidate classification stands; not reopened here).
Private Markets may appear in Sails Market as a richer *product*
surface without becoming a separate *protocol* primitive — the product/
protocol distinction is the operative one, not a claim that Private
Markets are unimportant or deferred indefinitely. **Corrected wording
(2026-09-12, `PRODUCT-IMPLEMENTATION-READINESS-1-CORRECTION`):** no
dedicated Private Markets product/runtime composition exists yet.
Existing OpenP2P primitives may be sufficient, but the composition
proof is still missing — this is not the same claim as "no
representation," which overstated the gap.

### 3. Sails Market boundary — restated (extends §2D items 1/9)

Sails Market is the broader first-party product that may progressively
compose OpenP2P, OpenLiquidity, OpenAgents, OTC, Private Markets,
portfolio/activity, analytics, and future coordination surfaces (§2D
item 1, unchanged). **Frozen, new:** Sails Market's own growth does not
redefine `@satsails/p2p-trading-sdk`'s scope (item 1 above) — a Sails
Market feature needing OpenLiquidity/OpenAgents capability consumes
those modules' own (possibly future, possibly separate) SDKs/packages,
never an expanded OpenP2P Trading SDK.

### 4. Sails Market capability maturity model — CORRECTED, lifecycle separated from planning status

**Corrected (2026-09-12, `PRODUCT-IMPLEMENTATION-READINESS-1-CORRECTION`):**
the prior version incorrectly placed `Future / Planned` after
`Production Eligible`, implying a linear lifecycle a capability could
"fall into" after reaching production — corrected below.

**Lifecycle / maturity, frozen, seven states, never collapsed:**
`Product Direction` (a documented intent — e.g. this document's own
§2C/§3 rail lists) → `Representable` (the canonical architecture, e.g.
ADR-002's `SettlementScope`, can express it) → `Implemented` (real code
exists) → `Real` (that code is exercised through a real, non-MOCK path)
→ `Evidenced` (a specific, named test/experiment/audit demonstrates a
specific property) → `Beta Eligible` → `Production Eligible`.

**Planning status — a separate axis, not a maturity level:** `Current`
/ `Planned` / `Future` / `Deferred`. A capability does not become
"Future" after passing Production Eligibility — `Future`/`Planned`
describe a capability whose maturity lifecycle above has not yet
started, or that has been explicitly deferred, never an end state of
the lifecycle itself.

**Four additional, orthogonal reality/evidence axes — introduced
because "Real" alone conflated backend truth with user-facing truth
(the specific defect this correction fixes):**

- **Implementation Reality** — non-MOCK code executes through a real
  runtime path, regardless of whether any UI exists for it.
- **Journey Reality** — the user can complete the declared product
  journey end-to-end through a real path (UI included).
- **UX Evidence** — concrete evidence demonstrates the user-visible
  flow behaves as claimed.
- **Production Eligibility** — a governed approval decision based on
  required evidence/security/operations review, never inferred from
  implementation alone (ADR-002 §6's own "Production Eligibility is a
  governed decision, never `evidencePassed`" discipline, restated here
  at the product/UX layer).

**Frozen: Implementation Reality ≠ Journey Reality ≠ UX Evidence ≠
Production Eligibility.** This preserves "implementation ≠ truth"
while correcting the opposite error the prior version made: a
capability whose backend is genuinely real through SDK/API/runtime
must **not** be marked non-real merely because a UI is missing — that
is a Journey Reality gap, reported separately from Implementation
Reality, never conflated with it (item 5's corrected Funding row is the
concrete case this fixes).

Forbidden inferences (unchanged): `SettlementScope exists` → "available";
provider registration → "production-ready"; test success → "security
property proven" (item 12 restates this for rail maturity
specifically). **The UI must never display a capability as operational
merely because it exists in Product Direction.**

### 5. Sails Market capability map (corrected, current truth 2026-09-12)

Classified against the corrected model in item 4, using only evidence
already established in this mission chain (ARCH-IMPL-1/2,
`VERTICAL-SLICE-1`, `REFERENCE-UI-REALITY-1`) — not re-derived here.
Columns kept to the smallest truthful structure (per this correction's
own instruction): **Implementation Reality / Journey Reality / UX
Evidence / Production Eligibility / Planning status** — "Product
Direction" is not a separate column since every listed surface already
has at least that status by virtue of appearing here.

| Surface | Implementation Reality | Journey Reality | UX Evidence | Production Eligibility | Planning status |
|---|---|---|---|---|---|
| OpenP2P marketplace (discovery) | Yes — real `liquidity.discover()` | Yes | Yes (`packages/sails-ui/README.md`, live-verified) | Not established | Current |
| Offers (publish/detail) | Yes — real `liquidity.publish()`/`getOffer()` | Yes | Yes (live-verified) | Not established | Current |
| Negotiation/chat | Yes — real `openp2p.chat()` WebSocket | Yes | Yes | Not established | Current |
| Trade creation | Yes — real `openp2p.trade()`/`getTrade()` | Yes | Yes | Not established | Current |
| Settlement creation (BTC leg) | Yes — canonical-registry-backed `resolveEscrowType()` for `{BTC,BITCOIN_L1}` (PR #130) | Partial — creation itself succeeds; the wider settlement journey is blocked downstream at Funding (this same table) | Yes (automated tests + traced real code path) | Not established (testnet only, MULTISIG unaudited) | Current |
| Settlement creation (LN_BTC/USDT_ERC20) | Yes, not canonical-registry-backed | Partial, same downstream block | Partial | Not established | Current |
| Settlement creation (every other legacy asset) | No — throws by design | No | N/A | N/A | Deferred |
| **Funding (BTC MULTISIG)** | **Yes — `escrow.multisigAddr` is a real, backend-derived address** | **No — no UI renders it; a user cannot complete this step through the product** | **Missing** | **Not established** | **Current (the proven gap, `docs/BACKLOG.md` item 22)** |
| **Signing** | **Yes — `useEscrowKey.ts` performs real client-side crypto and submission** | **Yes — the real signing act completes end-to-end, automatically** | **Missing — no evidence the (barely-existent) user-visible flow behaves as claimed; zero user-facing feedback** | **Not established** | **Current** |
| Release/refund | Yes — real `settlement.release()`/`initiateRelease()` | Yes | Yes | Not established | Current |
| Disputes | Yes — real `listDisputes/getDispute` + 4 actions | Yes | Yes | Not established | Current |
| Identity/reputation | Yes — real `identity.create/authenticate/me` | Yes | Yes | **Not established — keypair custody is demo-grade `localStorage`, a named production-eligibility blocker (§2E item 9)** | Current |
| Private Markets | No | No | N/A | N/A | Planned/Future — composition candidate, not started (item 2) |
| OpenLiquidity (beyond discovery) | Partial — module exists, no Sails-Market-specific surface | No | N/A | N/A | Planned |
| **OpenAgents (structured-intent generation)** | **Yes — real `agent.routes.ts` + `AgentIntentionPanel`/`AgentRiskCard`** | **Yes, for structured-intent generation specifically** | **Yes** | **Not established** | **Current** |
| **OpenAgents (full delegation/negotiation)** | **No — `aiNegotiator.ts` is a client-side simulation only, no backend accepts a delegation mandate** | **No** | **N/A** | **N/A** | **Planned** |
| OTC | No | No | N/A | N/A | Future |
| Portfolio/Positions | No | No | N/A | N/A | Future |
| **Activity (per-module: `TradeHistory`/`ActiveTrades`)** | **Yes** | **Yes** | **Yes** | **Not established** | **Current** |
| **Activity (cross-module aggregated feed)** | **No — does not exist** | **No** | **N/A** | **N/A** | **Future** |
| Notifications | No — no notification system exists anywhere | No | N/A | N/A | Future |
| Rail-aware asset selection | Partial — ADR-002 registries are real and Representable/Implemented, but nothing in the UI consumes them | No | N/A | N/A | Current (`docs/BACKLOG.md` 20.2, open, active) |

### 6. Product State ≠ Technical State — FROZEN

User-facing state communicates economic meaning; technical
implementation state is secondary/advanced (§2D item 7's progressive-
disclosure principle, restated as its own rule because implementation
work needs it named explicitly, not only implied). User-facing
examples: Awaiting funding, Funding detected, Action required,
Signature required, Waiting for counterparty, Settlement pending,
Completed, Disputed. Technical/advanced examples, never shown in normal
UX merely because backend code exposes them: `EscrowType`, adapter
identity, provider identity, internal routing, registry keys,
implementation class, raw state IDs.

### 7. FundingInstruction / FundingState — product-level contract, NOT IMPLEMENTED

`FundingInstruction` — a rail-agnostic product concept (never assumes
an address): may represent an address, an invoice, a payment request,
a QR payload, an external-wallet action, a provider-specific non-
address instruction, or another rail-native instruction. Required
product semantics: asset, rail, amount, destination/instruction,
expiry (if applicable), confirmation expectation, detected state,
completion state, failure/retry guidance, what happens next.
`FundingState` — the observable lifecycle a `FundingInstruction`
passes through (none detected → detected/awaiting confirmation →
confirmed/complete → failed/expired), always representable as
*uncertain* per item 14 below, never forced into a binary. Mirrors and
supersedes-in-detail `docs/SAILS_MARKET_DESIGN_DIRECTION.md` §14's
"generic FundingInstruction model" (that document, pending its own PR
#132 merge, remains the concrete UX elaboration of this product
contract — reconciled, not duplicated, once it lands).

### 8. SigningRequest / SigningState — product-level contract, NOT IMPLEMENTED

`SigningRequest` must support explicit, delegated, automatic-under-
prior-authority, and batched signing (identical to §2D item 6's
authorization-model principle, restated as a named contract shape for
implementation). Must preserve: authority already exists (never
UI-granted); the material transition is observable; no hidden
irreversible action; appropriate feedback; **no UI-created authority**
— a `SigningRequest`'s existence never itself constitutes permission to
sign, it only requests/coordinates an action whose authority comes from
elsewhere (item 8's own custody boundary, below).

### 9. Web signer / custody boundary — Security Constraint, FROZEN boundary / OPEN technology

**Mandatory gate:** the current Reference UI's `localStorage`-held
plain-hex keypair (`packages/sails-ui/src/context/AuthContext.tsx`,
already disclosed as demo-only) **must not become production
architecture by inertia.** **Frozen:** Sails Market UI must not own or
silently improvise long-term custody/signing authority merely because
the browser is capable of holding keys — **UI may request/coordinate
signing; signer/custody authority is an explicit, replaceable
boundary.** **Explicitly OPEN, not frozen:** which signer technology
(external wallet signer, hardware signer, WebAuthn/passkey where
authority-compatible, WDK/provider-backed signer boundaries, MPC only
if justified, session-scoped signing authority, delegated-authority
models) — none is chosen here; evidence, not convenience, must justify
whichever is chosen in a future, separately-authorized mission.

### 10. First real vertical journey — required before broad UI redesign

Before redesigning every page, one real vertical journey is required
first: discover/select offer → negotiate → create trade → settlement
creation → funding instruction → funding detection → signing/
authorization → release or refund → completion visible to the user.
**Must use the most real currently supported settlement path — not a
visually convenient mock path.** Per the capability map (item 5) and
`VERTICAL-SLICE-1`'s own evidence, that is currently the BTC/`BITCOIN_L1`/
`MULTISIG` path — the same one already canonically wired server-side
(PR #130). This journey becomes the first implementation proof of any
new Sails Market UI; **not implemented by this section.**

### 11. Reality-based Definition of Done — FROZEN

A screen is not complete because its layout is complete. For
economically meaningful screens, completion requires alignment among:
Product Direction, protocol representation, implementation/runtime,
user-visible state, evidence, and eligibility/maturity claim (item 4's
eight classes, collapsed to the six that matter for a "is this screen
done" check). If any are missing, the surface must be classified
honestly (using item 4's model) rather than presented as complete.

### 12. Rail maturity / eligibility boundary — restated as its own rule

**Product Scope ≠ Provider Availability ≠ Evidence ≠ Production
Eligibility** (ADR-002 §4/§6/§7, restated here at the UI/product level
because implementation work needs the UI-facing consequence spelled
out, not only the architecture-level one). The UI must eventually
receive **governed** capability availability rather than infer
availability from enums or static asset lists. **Forbidden inferences,
named explicitly:** `SettlementScope exists` → "available"; provider
registration → "production-ready"; test success → "security property
proven." None of these inferences may drive UI display logic, now or
in any future implementation.

### 13. Dogfooding evidence obligation — sharpened (extends §2D item 3)

**Evidence obligation, not yet satisfied, not implemented here:**
Satsails Wallet and Sails Market must eventually complete a real
economic interaction through the same public semantic/integration
boundaries available in principle to third parties. Operational
exceptions may exist (§2D item 3); none may constitute hidden semantic
privilege. This obligation is recorded, not discharged, by this
section (`docs/BACKLOG.md` item 22 already carries the general form of
this obligation — cross-linked, not duplicated).

### 14. Operational observability obligation

For any stuck economic flow, enough information must exist to answer:
where did the trade stop; which participant/action is awaited; has
funding been detected; has authorization occurred; is settlement
pending; did a provider interaction fail; is the outcome unknown vs.
failed (item 15); is operator intervention required. **Normal users
must not become debuggers** — this obligation is satisfied by an
advanced/operator view (§2D's progressive-disclosure Advanced depth),
never by exposing this detail to a normal user by default.

### 15. Outcome uncertainty — FROZEN

**Failed call ≠ proven failed economic action. Unknown outcome ≠ failed
economic action.** UI states must be able to represent uncertainty
safely — an ambiguous provider/runtime response must never be collapsed
into a generic "Failed" state when the actual economic outcome is
unknown. (Direct product-level consequence of this codebase's own
already-real M9 reconciliation discipline — `docs/BACKLOG.md`'s prior
WDK retry-safety findings are the concrete backend precedent for why
this distinction is not theoretical.)

### 16. Backlog cross-links — none closed by this section

`docs/BACKLOG.md` 20.2 (Day-0 capability integration coverage), 20.5
(QVAC Asset contract drift), 20.6 (architecture frozen / implementation
in progress), item 22 (FundingRequest/SigningRequest/rail-aware UX/
dogfooding/Private Markets composition proof), and item 23 (Sails
Market design direction, merged) are all preserved and cross-linked —
**none is closed by this section.** This section's own recorded delta
lives at `docs/BACKLOG.md` item 24. **Numbering resolved
(`MERGE-SEQUENCE-1`, 2026-09-12):** this item and PR #132's design-
direction item were both independently numbered 23 on their own
branches, from the same `main`-item-22 baseline — a foreseeable git-
merge-order consequence, not a content conflict. Per the approved merge
sequence, PR #132 merged first and retains item 23; this item is
renumbered to **24** as part of rebasing onto the resulting `main` —
not resolved by keeping a duplicate "23."

### 17. Classification of this section's deltas

- **Product Decision:** items 1 (SDK domain), 2 (Private Markets), 3
  (Sails Market boundary), 6 (Product State ≠ Technical State), 12
  (rail maturity/eligibility boundary UI consequence).
- **Security Constraint:** item 9 (web signer/custody boundary).
- **Design Rule:** items 7/8 (`FundingInstruction`/`SigningRequest`
  product contracts — the concrete UX form belongs in
  `docs/SAILS_MARKET_DESIGN_DIRECTION.md` once merged).
- **Evidence Obligation:** items 10 (first real vertical journey), 13
  (dogfooding), 14 (operational observability).
- **OPEN:** item 9's specific signer technology; item 5's capability
  map itself (a living document, not a one-time freeze — expected to
  change as real implementation work lands).
- **Architecture Decision:** none — no genuine new architectural
  constraint is introduced; items 4/12 restate ADR-002's own frozen
  distinctions at the product/UI level, they do not add to them.

### 18. Agent economic authority — access ≠ authority, corrected from an overclaimed prohibition (`UI-POLISH-2`, 2026-09-12)

**Frozen:** agent *access* (discovery, negotiation, analysis, proposal
generation — what "Sails Agent" does today) never by itself confers
economic *authority* (moving funds, signing, completing a trade).
Authority is a separate grant, never an implicit side effect of access
— restates item 7's "Access does not imply authority" specifically for
an AI/agent identity rather than interface richness in general.

**Corrected, not newly frozen:** `docs/SAILS_DESIGN_LANGUAGE.md` §8
previously phrased the current human-approval requirement
(`AgentIntentionPanel.tsx`'s `handleApprove` — today the only route
from a QVAC-generated proposal to a real `Trade`/escrow call) as
something an agent "can never" do without — an overclaim, since it
described current implementation as a standing ban on all future
delegated-authority designs. **Corrected statement:** *current Sails
Market behavior requires human approval before a QVAC-generated
proposal becomes real economic action — this is current
implementation/product behavior, not a permanent prohibition on
delegated agent authority.* A future, separately authorized economic
authority for an agent remains possible, conditioned on being
explicit, scoped, limited, observable, revocable, auditable, and
governed (full text: `docs/SAILS_DESIGN_LANGUAGE.md` §8's own corrected
passage).

**Not implemented, not designed, not scheduled by this correction** —
this item removes an institutional overclaim; it does not authorize,
design, or schedule a delegated-authority mechanism. No `CapabilityGrant`
extension, no new protocol primitive, no Semantic Kernel or Core
change.

### Closing confirmations

No React, CSS, SDK, protocol, `SettlementScope`, or provider-routing
change. No new SDK created. No Sails Market module implemented. No
signer implemented. PR #132 (`docs/SAILS_MARKET_DESIGN_DIRECTION.md`)
is read as context only — not edited, not merged, by this section. No
Semantic Kernel or Core impact. `docs/BACKLOG.md` 20.2/20.5/20.6/22/23
remain exactly as previously frozen.

---

## 2F. Product Direction — Market Context Navigation, Public/Private Markets, Public/Private Servers (2026-09-12)

`NAVIGATION-FILTER-1` registers a product/architecture **direction**
for an evolving concept — public markets, private markets, communities,
public/private servers, and their discovery/access topology. **Not
runtime-implemented. Not naming-frozen.** Extends §2D item 12's Private
Markets classification and §2E item 2's sharpening of it; does not
replace either.

### 1. Three distinct concerns — must not be conflated

- **Primary Product Navigation** — "where am I in the product?"
  (`docs/SAILS_DESIGN_LANGUAGE.md` §16.1 — Market, Trades Ativos, Meus
  Trades, Disputas, Perfil today).
- **Market Context Navigation** — "which market/discovery context am I
  exploring?" A new, higher layer than Primary Navigation, not yet
  implemented. This is what a future public/private market or
  community switcher belongs to.
- **Screen Filters** — "how do I filter the current context's content?"
  (`FilterPanel.tsx`, the Market toolbar). A payment-method or country
  filter is not, and must never become, a market-context selector.

This mirrors `docs/SAILS_DESIGN_LANGUAGE.md` §16.1 exactly — registered
here too because it is product truth, not only visual-language guidance.

### 2. Public/Private Markets and Public/Private Servers — direction, not implementation

Registered as backlog-facing product direction (`docs/BACKLOG.md`), no
runtime built:

- **Public Markets** — today's Marketplace is, in effect, the one
  public market. Not renamed or restructured by this registration.
- **Private Markets** — per §2D item 12, a composition candidate over
  existing primitives (restricted discovery, `CapabilityGrant`-scoped
  membership, per-deployment fee/dispute policy) — still not proven
  concretely, still not implemented.
- **Public Servers / Private Servers** — an infrastructure/topology
  concept (nodes participating in discovery, potentially access-scoped)
  distinct from the *product* concept of a market or community a user
  browses. No node registry, no server-discovery backend, and no new
  protocol primitive is created by this registration.
- **Communities / access groups** — a product-facing grouping concept
  that may or may not map 1:1 onto a "private market" or "private
  server" — left open rather than prematurely equated with either.

### 3. Architecture language vs. product/user-facing language — explicitly separated, naming OPEN

**Architecture language** may use `server`/`node` — this is accurate,
already-used infrastructure vocabulary (e.g. the P2P transport layer's
own HyperDHT node concept) and is not being renamed.

**Product/user-facing language** may prefer different words entirely —
`Market`, `Community`, `Network`, `Workspace`, or something else — a
non-technical user browsing Sails Market should never be required to
understand "node" as a prerequisite to understanding "which market am I
in." **This choice is explicitly OPEN, pending a real Product
Decision** — no default is assumed or implied by this registration,
including by the illustrative words listed above.

### 4. Future contextual-navigation pattern — evaluated, not decided

`docs/SAILS_DESIGN_LANGUAGE.md` §16.6 evaluates visual pattern options
(tabs/segmented control, Topbar selector, Sidebar secondary section, a
distinct top-level market selector) for a future Market Context
Navigation switcher, recommending the last option as the best fit for
the separation this section requires — a recommendation for the next
Product/Architecture Decision, not a decision itself, and not
implemented.

### 5. Explicitly not done by this registration

No `FundingInstruction`/`SigningRequest` implementation, no
OpenLiquidity/OpenAgents protocol-scope expansion, no Private Markets
runtime, no server-discovery backend, no node registry, no fake
public/private tabs, no placeholder routes, no capability-maturity
classification closed. Server/node identity is explicitly **not**
Economic Identity — an infrastructure/topology concept is not an
authority or settlement concept, and this registration does not blur
that line.

### Closing confirmations

No protocol, SDK, Core, or architecture change. No new economic
primitive. No naming frozen — §3 above is explicitly OPEN. No
capability-maturity item closed. `docs/BACKLOG.md` gets one new
explicit item for this direction (see that file) — no existing item
closed or altered in meaning.

## 2G. Actor Experience Model — pointer (`MISSÃO 1`, 2026-09-12, corrected `ACTOR-EXPERIENCE-MODEL-R1`)

`docs/PRODUCT_INTERACTION_MODEL.md` institutionalizes who interacts with
Sails (USR/AGT/OPS/INT — User, Agent split into Assistive/Delegated-
Authority, Operator split into Node/Arbiter/Reference-Deployment, and
Integrator), an Actor Matrix, a Privacy Matrix, an Authority Matrix, an
Information Density Model, and the Wallet vs. Service/Backend Integrator
split — synthesizing already-frozen sources (this document's §2D/§2E/§2F,
`docs/SAILS_DESIGN_LANGUAGE.md`, `docs/SEMANTIC_KERNEL.md` §26,
`docs/adr/ADR-001-day0-multi-operator-network.md`,
`docs/DAY0_COMPLETENESS_COLD_SWEEP.md` §3.5) rather than introducing new
product/protocol truth. **`ACTOR-EXPERIENCE-MODEL-R1`** renamed the
actor notation from `A/B/C/D` to `USR/AGT/OPS/INT` — `A/B/C/D` remains
reserved exclusively for the identity taxonomy (Participant Economic
Identity / Participant Transport Identity / Operational Sails Node
Identity / Operator Economic Recipient, §2D/`ADR-001` §26.3), never the
actor taxonomy; the two were conceptually distinct from the start, but
sharing letters invited exactly the collapse both freezes independently
warn against. **No new backend role, authority, or runtime is
introduced.** Full text lives there, not duplicated here.

## 2H. P2P Product Journey — pointer (`MISSÃO 2`, 2026-09-12)

`docs/P2P_PRODUCT_JOURNEY.md` institutionalizes the end-to-end P2P
economic journey (Discovery → Offer Evaluation → Economic Commitment →
Trade Lifecycle → Payment/Funding → Authorization → Settlement →
Outcome/Cancel/Dispute), built on §2G's USR/AGT/OPS/INT notation: a
Canonical Journey mapped onto `docs/PROTOCOL_SPECIFICATION.md`'s own
9-state Trade Lifecycle, an Economic Commitment Boundary, an Economic
Journey Grammar, Runtime/Product/User-facing State Inventories, a
`SPLIT`-outcome gap analysis, a derived-state ambiguity analysis,
conceptual (not implemented) `FundingInstruction`/`FundingState`/
`SigningRequest` models, a Counterparty Experience model, a Dispute
Journey model, Happy-Path/Interrupted-Path maps, a Retry-Safety model,
and an Unknown-Outcome model — synthesizing already-frozen sources
(`docs/PROTOCOL_SPECIFICATION.md`, `docs/DATABASE.md`,
`docs/DESTINATION_AUTHORITY_ARCHITECTURE.md`,
`docs/WDK_UNKNOWN_OUTCOME_RETRY_SAFETY.md`) plus direct, real-code
verification (2026-09-12) rather than documentation or UI assumptions.
**No new protocol, Settlement, authority, or runtime is introduced.**
The mission's own most material finding — `EscrowStatus.SPLIT` missing
from the UI's type/badge mirror and mishandled by the derived
`TradeState` vocabulary — is named and classified, not fixed here. Full
text lives there, not duplicated here.

## 2I. Market Entry / Authentication Boundary — pointer (`MISSÃO 2A`, 2026-09-13)

`docs/MARKET_ENTRY_AUTHENTICATION_BOUNDARY.md` verifies, against real
current `sails-ui` routing/pages/`AuthContext.tsx` and the real backend
route files, where the public-discovery/authentication/wallet-connection/
funds-authority boundary already sits — not where it was assumed to
sit. **Headline finding:** Market Discovery and Offer Evaluation
(`Marketplace.tsx`, `OfferDetail.tsx`) already require no authentication
at either the frontend-routing or backend-route layer — the
`Open Market → Discovery → Offer Evaluation → Intent to Act →
Authentication if required → Economic Commitment` target journey is
already the real, shipped shape of this codebase for those stages, not
a gap to open. The one real conflation found: Economic Identity and
Wallet Connection are collapsed into a single `login()` step in this
reference UI (a disclosed demo shortcut, not a protocol requirement —
RFC-013's `WalletAdapter` already supports decoupling them). A passkey/
Breez-Auth login candidate is registered (cross-referencing
`docs/IDENTITY_ARCHITECTURE_DISCOVERY.md` §5.1's existing, differently-
angled evidence) — not decided, not selected. **No authentication
mechanism was implemented, changed, or removed; no UI was corrected.**
Full text lives there, not duplicated here.

## 2J. Sails Market Distribution & Network Flywheel — pointer (`P2P-JOURNEY-GATE-R1`, 2026-09-13)

`docs/SAILS_MARKET_DISTRIBUTION_FLYWHEEL.md` institutionalizes how Sails
Market (`sails-ui`) relates to Native SDK Participation and to
External/Hardware Wallet Participation — as a distribution surface over
one shared protocol contract, not a parent either other path depends
on — with Mermaid diagrams for access topology, SDK-vs-universal-access
convergence, the network flywheel, and capability-gated wallet
participation. Preserves `WalletAdapter ≠ SettlementProvider`, `Access
through Sails Market ≠ native adoption`, `Better integration ≠
privileged semantics` (restating, not redefining,
`docs/PROJECT_CONTEXT.md` §2D item 7 and
`docs/PRODUCT_INTERACTION_MODEL.md` §6's own frozen rows), and *"One
market. Many interfaces. Many wallet stacks. Shared economic meaning."*
**`MetaMask`/`Xverse`/`OKX`/`Ledger`/`Trezor` are cited only as
illustrative future-compatible example classes — no external wallet
connector, passkey, or Breez Auth mechanism exists or is authorized by
this document.** The network flywheel itself is explicitly labeled a
product hypothesis, not a claim of achieved adoption. No protocol, SDK,
Core, or UI change. Full text lives there, not duplicated here.

## 2K. System Coherence & Integration Audit — pointer (`SYSTEM-COHERENCE-1`, 2026-09-13)

`docs/SYSTEM_COHERENCE_INTEGRATION_AUDIT.md` is an adversarial,
cross-layer audit of everything institutionalized through §2A-§2J plus
`docs/adr/ADR-002-asset-settlement-rail-adapter-provider-architecture.md`
(2026-09-12) against real, current runtime — not a re-confirmation that
the system is correct. Headline findings: **`EscrowStatus.SPLIT`'s
UI/schema gap has a precisely root-caused defect** (`deriveTradeState()`'s
dispute-branch returns before ever consulting the already-correct
`trade.status`, verified against `handlers.ts`'s real `settlement.escrow.split`
handler); the payout-address privacy gap (§2I) remains registered, not
resolved; ADR-002's new `Asset`/`SettlementRail`/`SettlementScope`
architecture (frozen the same day as `MISSÃO 2`) is not yet
cross-referenced in `docs/P2P_PRODUCT_JOURNEY.md` or
`docs/SAILS_MARKET_DISTRIBUTION_FLYWHEEL.md`; and the canonical journey's
own "Wallet/Signer Boundary" step has no real, separate instance in the
reference UI (Identity and Wallet Connection remain one artifact, §2I's
own finding, restated with a precise journey-step diagnosis). **Mission
3 Gate verdict: not blocked** — two findings (SPLIT, payout-address)
should run as a corrective mission in parallel with Mission 3, not
sequentially before it. **No fix implemented, no runtime changed.** Full
text lives there, not duplicated here.

---

## 3. Relationship to the Tether Ecosystem

This is critical context for why this project exists and who it's for.

Sails Protocol is built **on top of** three pieces of Tether infrastructure:

| Technology | Provides | Sails' relationship to it |
|---|---|---|
**Exact role labels (v8.0 — Architecture Freeze, use these 4 always, no
variation, across any document describing the ecosystem):**

| Technology | Exact Role Label |
|---|---|
| WDK | Wallet Infrastructure |
| Pears | P2P Communication |
| QVAC | Agent Infrastructure |
| Sails Protocol | Coordination Layer |

| **WDK** (Wallet Development Kit) | Self-custodial wallet infrastructure, keypair generation, multi-chain signing | Sails uses WDK for identity and settlement — never re-implements wallet logic |
| **Pears** (Holepunch) | P2P communication — HyperDHT peer discovery, Hyperswarm, Secretstream E2E channels | Sails uses Pears as its transport layer — never builds its own networking stack |
| **QVAC** (Tether) | Local AI agent intelligence — Agent Infrastructure | Sails' future OpenAgents module is a thin integration layer on top of QVAC |

**Crypto-Native Agent corollary (RFC-016, `docs/rfcs/RFC-016-qvac-crypto-native-agent-boundary.md`):**
extends this section's own fiat model statement below to QVAC/OpenAgents
specifically — QVAC and any agent built on it (`BuyerAgent`/`SellerAgent`)
only ever act on digital assets already in the user's non-custodial
wallet, via WDK. They never call a banking API and never touch PIX or
any other fiat rail. Converting fiat into a digital asset is a regulated
on/off-ramp provider's job (Reference Wallet-level, Level 3, out of
Sails Protocol's scope), entirely before an asset reaches a wallet QVAC
ever operates on. Use "Crypto-Native Agent" for QVAC/OpenAgents in any
document — never "PIX Agent" or "Banking Agent."

The canonical phrase that must appear in any strategic or architecture
document:

> **"Sails Protocol does not replace WDK, Pears or QVAC. It amplifies their
> combined value by providing the missing economic coordination layer
> between them."**

### Why this grows the Sails network and the underlying ecosystem

**Current-truth correction (2026-09-07):** an earlier sentence in this
section said every wallet integrating Sails would necessarily become a WDK
integrator. That is too strong and conflicts with the already-shipped,
chain-agnostic `WalletAdapter` boundary in RFC-013. WDK is a strategic
first-party integration target and important reference stack, not a mandatory
wallet dependency of the protocol.

- Every wallet that integrates Sails expands the reachable Sails P2P network
  without being required to replace its existing wallet-development stack.
- WDK-based wallets should receive a first-party integration path, while BDK,
  Breez SDK, Spark SDK, LDK, major EVM wallet-development stacks, and other
  relevant kits should be able to integrate through equally explicit
  first-party adapter paths as those adapters are implemented and evidenced.
- Every module deployed on the network can grow the number of active peers on
  the Pears/HyperDHT network when that transport is used by the implementation.
- Every Sails OpenAgents module using QVAC drives direct QVAC SDK usage, while
  QVAC remains advisory and does not become protocol authority.

This is part of why external funding conversations are worth having —
specifics are intentionally not disclosed in this public document (see
`ROADMAP.md`'s "External Funding" section).

### The ecosystem diagram (canonical — use this exact shape everywhere)

```
Tether Ecosystem
    │
    ▼
WDK + Pears + QVAC                ← foundational infrastructure (Tether)
    │
    ▼
Sails Protocol                    ← open economic coordination layer
    │
    ▼
OpenP2P · OpenSettlement · OpenLiquidity · OpenIdentity
OpenReputation · OpenAgents · OpenFinance
    │
    ▼
Sails SDK (@satsails/p2p-trading-sdk)            ← single interface for integrators
    │
    ▼
Wallets · Fintechs · ERPs · AI Agents · Enterprise Apps
    │
    ▼
Reference Implementations (concrete examples within Applications above,
NOT a separate architectural layer):
  Satsails Wallet (example of a Wallet)
  Sails Finance   (example of a Fintech)
  SailsPay        (example of a Fintech/Enterprise app)
```

**Common mistake to avoid:** do not draw "Reference Implementations" as a
layer below "Applications." Satsails Wallet *is* a Wallet. SailsPay *is* a
Fintech. They are instances within the Applications layer, included in the
diagram purely as proof-of-concept, never as a distinct architectural tier.

**This diagram answers "where does Sails sit in the Tether ecosystem" —
a different question from "what does a developer actually build on."**
Both are canonical, both stay drawn exactly one way each (that's the rule
this section already established — no drift between documents), but they
are not the same diagram serving two purposes; they're two diagrams for
two audiences. The developer-facing one is below.

### The developer diagram (canonical — v1 Positioning Freeze, CTO-approved
shape. Use this exact one in `SDK_GUIDE.md`, `README.md`, and any
developer-facing onboarding material — the ecosystem diagram above is for
strategic/grant/partnership context, not developer onboarding)

```
                    Wallet
                       │
                       ▼
            Sails P2P Trading SDK
                       │
   ════════════════════════════════════
              Sails Protocol
   ════════════════════════════════════
   OpenP2P          OpenSettlement
   OpenIdentity     OpenProof
   OpenReputation   OpenAgents
   OpenLiquidity    OpenFinance (roadmap)
   ════════════════════════════════════
      WDK      ·      Pears      ·      QVAC
   ════════════════════════════════════
   Bitcoin · Liquid · Lightning · USDT
```

*(Architectural breadth, not equal build status — Bitcoin/USDT are
implemented and real-path validated, Lightning is real-path validated on
testnet only, Liquid is designed only with zero implementation. See
README.md's "Rail readiness" section for the full per-rail disclosure.)*

Read bottom-to-top for "what does this run on" (settlement assets → Tether
infrastructure → protocol → modules → SDK → your wallet), or top-to-bottom
for "what do I integrate" (your wallet → one SDK call → the protocol
coordinates everything below it). Both readings are intentional — that's
the point of the shape.

### First-party wallet-kit adapters and multi-rail distribution strategy

> **Sails P2P Trading SDK should ship with first-party integration paths for the major wallet development kits and the major settlement-capable networks relevant to P2P markets.**

Canonical adoption principle:

> **Keep your wallet stack. Plug into Sails.**

The protocol/Core remains wallet-kit agnostic. The SDK's existing
`WalletAdapter` boundary is the generic contract; first-party adapters reduce
integration cost for the stacks wallets already use. Initial visible adapter
targets are:

- `@sails/adapter-bdk` — BDK / Bitcoin wallet stacks
- `@sails/adapter-wdk` — Tether WDK wallet stacks
- `@sails/adapter-breez` — Breez SDK wallet stacks
- `@sails/adapter-spark` — Spark SDK wallet stacks
- `@sails/adapter-ldk` — LDK / Lightning wallet stacks
- `@sails/adapter-ethers` — major EVM wallet stacks using ethers-compatible flows, including Ethereum and BNB Smart Chain
- `@sails/adapter-tron` — TRON wallet stacks
- `@sails/adapter-solana` — Solana wallet stacks
- `@sails/adapter-ton` — TON wallet stacks

**Status discipline:** these names are first-party **planned adapter targets**,
not published packages and not evidence of current support. Package namespace
availability and exact implementation shape must be verified before release.
The list is intentionally extensible as other wallet-development kits earn
support through ecosystem relevance and real integration demand.

**Do not collapse wallet adapters and settlement rails.** A wallet-kit adapter
answers "how does this wallet sign, derive addresses, inspect balances and
expose capabilities?" A settlement provider answers "can this rail actually
satisfy Sails' escrow/conditional-settlement, authority, evidence,
refund/dispute, recovery and reconciliation properties?" A wallet may use one
kit while settling over several eligible rails.

The network-effect goal is therefore two-dimensional:

1. **wallet-stack reach** — reduce the cost for major wallet SDK ecosystems to
   join Sails, including the main Bitcoin/Lightning stacks and the major
   stablecoin environments; and
2. **settlement-rail reach** — support economically relevant networks when
   their primitives can demonstrate the required Sails properties.

For stablecoin distribution, the initial explicit wallet-stack coverage target
is **EVM (including BNB Smart Chain), TRON, Solana and TON**. This is an
integration/distribution target, not a claim that every one of those networks
already has a Sails escrow implementation.

No vendor SDK, including WDK, becomes protocol truth or a mandatory dependency
for all integrators.

### External Design Reference — WDK Building Blocks

WDK demonstrates a useful model of composable wallet and protocol
capabilities. **Sails adopts the composability principle, not the
dependency.** Three principles govern how this reference is used:

1. **Adopt the composability principle, not the dependency.** WDK is a
   design inspiration and a first-party integration target (see above) —
   it is never architecture Sails copies wholesale or a package Sails Core
   requires.
2. **Normalize by capability family, not through one universal generic
   interface.** The same reasoning that keeps `WalletAdapter` and
   `SettlementProvider` as two distinct axes (above) applies here: a
   single all-purpose interface trying to cover every wallet/protocol
   capability tends to either under-specify or over-generalize. Capability
   families (signing, address derivation, balance/query, settlement) are
   normalized independently.
3. **Third-party extensions may eventually exist, but conformance and
   evidence determine support status** — never package existence alone
   (the same discipline the coverage matrix and the First-Party Supported
   Criteria above already apply to Sails' own first-party adapters).

The distinction that matters most: **WDK makes wallet capabilities
composable. Sails aims to make economic coordination composable across
wallets and rails.** These are related but not identical goals — WDK's
own internal architecture is not treated as Sails' architecture.

### Satsails Wallet — first reference implementation and showcase

**Satsails Wallet is intended to serve as the first reference
implementation, first production distribution surface, and first
multi-rail showcase of Sails Protocol composability.** This repository
already documents this relationship (`README.md`'s own "This repository is
the Reference Wallet implementation" framing) — this section makes the
showcase role explicit for the multi-rail strategy specifically.

**Satsails Wallet is a reference implementation, not protocol truth.**
Nothing about Satsails' own product decisions, UI, or roadmap becomes a
Sails Core requirement merely because Satsails is the first integrator.

Satsails is the environment where Sails Protocol proves integration with,
as each rail's own real status allows (see "Rail readiness," `README.md`):

- Bitcoin on-chain (✅ Proven, `MULTISIG`)
- Spark (📋 Future — not yet implemented; distinct BTC product capability, not the same as Lightning/Arkade — see 2026-09-10 note below)
- Liquid (📋 Designed — zero implementation)
- Lightning (📋 Day-0 required — NOT IMPLEMENTED / NOT EVIDENCED as a distinct capability; corrected 2026-09-10, see note below)
- Arkade (🏗️ Implemented, testnet-only, via `LIGHTNING_HODL` — see 2026-09-10 note below)
- WDK-backed stablecoin stacks (🏗️ Implemented, testnet, server-custodial reference — `WDK_USDT_EVM`)
- Tether Gold / XAUT (📋 Future — not yet implemented; network is Ethereum, per 2026-09-10 Product Direction)
- DePix (📋 Future — not yet implemented; targets both Liquid and Spark, per 2026-09-10 Product Direction — added to this list, was previously absent)
- USDC (📋 Future — not yet implemented; targets Ethereum, Base, Optimism, Arbitrum, Avalanche, Polygon — added to this list, was previously absent)
- future RGB (📋 Future — not yet implemented)

No rail listed here as future/planned is claimed as already implemented —
each carries the same status legend used throughout this document (§4).

**2026-09-10 Product Direction Freeze (Gate B) — note added, historical
text above otherwise unchanged.** Two corrections: (1) DePix and USDC
were missing from this "in view" list entirely before this date — added
above as existing product/reference-wallet truth this document had not
yet recorded, not new scope. (2) Lightning, Arkade, and Spark are three
**distinct product capabilities** by Product Direction — the fact that
today's single `LIGHTNING_HODL` provider happens to be implemented via
the Ark protocol (its own header comment: real Lightning HTLCs have no
genuine multi-party escrow primitive) does not make "Lightning" and
"Arkade" the same capability, and does not imply Spark is served by
that mechanism. Whether these become separately-provided capabilities,
one capability with corrected naming, or something else is an open
architecture question, not decided here.

**Same-day maturity correction (semantic precision).** The line above
this note first read "Lightning (🏗️ Implemented testnet-only... via
`LIGHTNING_HODL`)" — that overclaimed the evidence. Shared current
implementation cannot prove two distinct capabilities when the
implementation only realizes one of them: `LIGHTNING_HODL`'s own header
comment and a repository-wide search (no BOLT11/HTLC/LND code anywhere
in `src/`, confirmed) show it is Ark-protocol VTXO/Taproot settlement,
not plain-Lightning HTLC settlement. Corrected: **Arkade** is
IMPLEMENTED/TESTNET-EVIDENCED; **Lightning**, as its own capability, is
**NOT IMPLEMENTED/NOT EVIDENCED**. Lightning's Day-0 requirement is
unchanged — only its current maturity claim moved to match actual
evidence. Protocol family, implementation/client, settlement provider,
and interoperability path are four distinct concepts, never collapsed
into each other — interoperating with Lightning would not make Ark,
Spark, or RGB "a Lightning implementation." Full canonical matrix and
worked examples:
`docs/BACKLOG.md` Cold Sweep Loop 5, item 20.

**A successful Satsails production integration proves the reference
implementation and real integration viability. It does not by itself
prove independent cross-wallet interoperability** — a second, genuinely
independent wallet integrating Sails (not built or operated by Satsails)
is what would demonstrate that, and none has yet.

### The Named-SDK Rule (hardened after "this still sounds generic" feedback)

**"Sails SDK" is a family name — never, itself, something a developer is
told to install.** Every concrete use case ships as its own specifically
named SDK. This is deliberately the same pattern Breez uses (Breez SDK —
Nodeless, Breez SDK — Liquid, etc.: one brand, several sharply-scoped
products built on overlapping technology, so nobody looking at any single
one of them has to guess what it does). **"Sails P2P Trading SDK" is the
first of these, not a placeholder.** Same npm package (`@satsails/p2p-trading-sdk`),
same `SailsClient` interface (`SDK_GUIDE.md`) — but the name itself says
exactly what it does: P2P trading, via OpenP2P, OpenSettlement,
OpenReputation, and OpenIdentity, the modules with real code today
(`✅ Proven`, section 4 below).

**This name does not revert to plain "Sails SDK" once other modules
ship.** When OpenFinance's `LoanIntent`/`SwapIntent`/`EarnIntent` gets its
own SDK-facing surface, it ships under its own equally concrete name (a
future "Sails P2P Lending SDK," for instance) — not as a version bump of
the Trading SDK, and not as a merge back into an unqualified "Sails SDK."
The generic name is reserved for exactly one purpose from here on:
naming the underlying package/interface family in architecture and spec
documents (`@satsails/p2p-trading-sdk`, `SailsClient`, `ARCHITECTURE.md`'s module table,
`PROTOCOL_SPECIFICATION.md`'s primitive table, the ecosystem diagram
above) — it is never the name of something to build against directly.

**Why this is non-negotiable, not a style preference:** the DeepSeek
review's central finding (section 1 above) was that genericness was the
adoption blocker — a protocol, and everything built on it, needs one
clear "what can I build with this" answer before it needs breadth. An
unqualified "Sails SDK" is exactly the kind of name that recreates that
problem the moment a second use case ships, even after the rest of this
document fixed it everywhere else. Use "Sails P2P Trading SDK" (and
whatever equally concrete name a future module's SDK earns) in every
developer-facing surface (this diagram, `README.md`,
`DEVELOPER_JOURNEY.md`, `SDK_GUIDE.md`); use generic "Sails SDK" only for
the underlying package/interface family, never as a product name on its
own.

---

## 4. Current State of Implementation (be honest about this — don't inflate it)

**Updated 2026-07-17 (QVAC/WDK MVP pass) — the "exactly one module" framing
below predates the route-restoration and QVAC/WDK work and is stale; kept
struck-through rather than silently rewritten, so the drift is visible:**
~~As of this handoff, exactly one module has real code: Sails OpenP2P, via
the Satsails Wallet reference implementation. Everything else is specified
(interfaces, events, data model) but not built.~~ Five modules have real
routes and a real service layer today (OpenP2P, OpenIdentity,
OpenSettlement, OpenLiquidity, OpenReputation — see `BACKLOG.md`'s P0-P2
tables for exactly what's real in each), and OpenAgents has its first
real capability (below). **Corrected 2026-08-24** — this sentence
previously said "the SDK remain[s] genuinely unbuilt" alongside
OpenFinance; that stopped being true well before this date (see the
table's own SDK row below for the current, corrected status). Only
OpenFinance remains genuinely unbuilt.

Use this status legend everywhere — it is mandatory, not optional:

- **✅ Proven** — implemented and functional in a reference implementation
- **🏗️ Specified** — interface/contract defined, implementation partial or stubbed
- **📋 Aspirational** — on the roadmap, spec not yet written

| Module | Status |
|---|---|
| Sails OpenP2P | ✅ Proven (Satsails Wallet) |
| Sails OpenIdentity | 🏗️ Specified — embedded inside OpenP2P today |
| Sails OpenReputation | 🏗️ Specified — embedded inside OpenP2P today |
| Sails OpenSettlement | 🏗️ Specified — `SettlementProvider` interface + Mock provider + a real `WDK_USDT_EVM` provider (`@tetherto/wdk-wallet-evm`, testnet, single-seed custody — see that file's own caveat) implemented |
| Sails OpenLiquidity | 🏗️ Specified — `LiquidityProvider` interface + Internal order book implemented |
| Sails OpenAgents | 🏗️ Specified — real capabilities: `QvacAgentProvider` (real `@qvac/sdk` local LLM inference, live-verified) plus `BuyerAgent`/`SellerAgent` (two local agents simulating Satsails Wallet instances, autonomously generating a real `TradeIntentPayload`/offer via QVAC). **Corrected 2026-08-09** — RFC-007 D7's Social Engineering Agent is real as of RFC-017 (`social-engineering-agent.ts`, 2 of 3 patterns detected, off by default); this row was stale. `POST /v1/agents/*` (2026-08-09) exposes `generateTradeIntent`/`generateOfferIntent`/`assessIntentRisk` over HTTP for the first time. Genuinely remaining: the `unexpected_flow_deviation` social-engineering pattern (needs real trade-state-machine awareness) and the `learn()` step |
| Sails OpenFinance | 📋 Aspirational |
| Sails SDK (MVP release: Sails P2P Trading SDK) | ✅ Proven — **Corrected 2026-08-24** (previously read "Aspirational — interface fully specified, zero implementation"; stale). `packages/sails-sdk/src/index.ts` is a real, ~220-line barrel export — `SailsClient` plus 10+ real modules (identity, reputation, liquidity, openp2p, settlement, proof, agents, peers, capabilities, arbitration, payout addresses), real PSBT-verification cryptography (`wallet-verification.ts`), and real EVM/Bitcoin custody primitives — verified directly against the file, not assumed from an older status |

### What actually exists in the codebase right now

A **partial fragment** of the Satsails reference implementation exists:
5-6 source files covering the Event Bus, the Escrow (OpenSettlement) service,
the Liquidity Router (OpenLiquidity) service, and the P2P transport layer
(Pears/HyperDHT). Routes, config, database connection, Redis connection,
error classes, and the Identity/Chat/Reputation module implementations are
**referenced but not present** in this environment — they need to be
recovered or rewritten. See `TODO.md` for the exact list.

Do not assume more code exists than what's described in `ARCHITECTURE.md`
section "Actual Code Inventory." Verify against the filesystem before
building on any assumption.

---

## 5. Glossary — read this before you get confused by naming

| Term | Meaning |
|---|---|
| **Sails Protocol** | The open specification. The umbrella name for everything. |
| **Sails OpenP2P** | The first official module of the protocol — P2P marketplace. NOT the name of the whole protocol. |
| **Satsails** / **Satsails Wallet** | The company/product building the first reference implementation. NOT the protocol. |
| **Sails Finance**, **SailsPay** | Future reference implementations by the same team, targeting future modules. |
| **Intent** | The universal primitive — every interaction in the protocol starts as an Intent (TradeIntent, PaymentIntent, LoanIntent, etc.) |
| **Reference Implementation** | A concrete piece of software that implements the protocol spec using specific technology choices. |
| **Sails SDK** (`@satsails/p2p-trading-sdk`) | The developer-facing wrapper module, long-term/full scope — see `SDK_GUIDE.md`. |
| **Sails P2P Trading SDK** | The first named SDK under the Named-SDK Rule (section 3 above) — same package as "Sails SDK" (`@satsails/p2p-trading-sdk`), scoped to P2P trading (OpenP2P/OpenSettlement/OpenReputation/OpenIdentity), the one part with real code. Permanent, not a placeholder — future use cases (e.g. Lending) get their own equally concrete name, not a merge back into unqualified "Sails SDK." Use this name in developer-facing material. |
| **Cross-module service** | A protocol module used by multiple application modules (OpenIdentity, OpenReputation, OpenSettlement, OpenLiquidity). |
| **Application module** | A protocol module that builds on cross-module services to deliver a use case (OpenP2P, OpenFinance). |
| **moduleId** | A database field present on every entity, identifying which module owns that row (e.g. `"openp2p"`, `"opensettlement"`). |
| **protocolVersion** | A database field tracking which version of the Sails Protocol spec an entity was created under. |

If you see "Satsails P2P Protocol," "OpenP2P Protocol" as the name of the
whole project, or any variant that conflates Satsails with Sails Protocol,
that is legacy branding from an earlier phase of the project — correct it,
don't propagate it.

### Frozen terminology (v1 Positioning Freeze — use these words, not synonyms)

| Use this | Never this (same concept, different word — creates drift) |
|---|---|
| **Intent** | Order, Trade, Deal, Operation |
| **Negotiation** | — |
| **Settlement** | Transaction, Payment (as the generic term) |
| **Proof** | Evidence (informal use is fine, but the entity/type name is Proof) |
| **Timeline** | Log, History, Audit Trail |
| **Dispute** | Conflict, Claim |
| **Identity** | — |
| **Reputation** | Trust Score, Rating |

If a synonym from the right-hand column shows up in new copy, that's drift,
not stylistic variation — replace it. This table exists so the question
"is Trade the same thing as Intent" never needs re-litigating: it's the
same underlying primitive, and only "Intent" is the name to use.

### The One Sentence Test

Every doc that answers "what is Sails Protocol?" answers it with exactly
this sentence — not a paraphrase, not a "similar" version:

> **"Sails Protocol is open infrastructure for building interoperable
> P2P Financial Marketplaces."**

If you're tempted to reword it for a specific document's tone, that's a
sign the positioning needs a second sentence added after it, not a
replacement of the first one.

### The Five Minute Test

If a developer needs more than five minutes with a document to understand
what Sails Protocol is and whether it's relevant to them, that document has
failed — regardless of how technically complete it is. This is a
documentation acceptance criterion, not a nice-to-have: when writing or
reviewing docs, check the first five minutes of reading before checking
anything else.

---

## 6. Where to go next

- The 10-minute onboarding narrative (SDK → Wallet → OpenP2P → Settlement
  → Reputation → working Marketplace) → `DEVELOPER_JOURNEY.md`
- Full architecture, layers, and diagrams → `ARCHITECTURE.md`
- Database schema → `DATABASE.md`
- All API endpoints → `API_REFERENCE.md`
- SDK design (not yet built) → `SDK_GUIDE.md`
- P2P node topology → `NODE_ARCHITECTURE.md`
- The 9 Core Primitives and Intent Engine in full detail → `PROTOCOL_SPECIFICATION.md`
- Threats and mitigations → `THREAT_MODEL.md`
- Trust and security mechanisms → `SECURITY_MODEL.md`
- Timeline and grant budget → `ROADMAP.md`
- **How the protocol sustains itself financially, without a speculative
  token → `PROTOCOL_ECONOMY.md`**
- **The Satsails ecosystem as the protocol's first validation
  environment (Wallet, Finance, Pay) → `REFERENCE_IMPLEMENTATIONS.md`**
- Known gaps and next actions → `TODO.md`
- How to run this locally / in production → `DEPLOYMENT.md`
- Coding conventions and how to add a module → `CONTRIBUTING.md`
