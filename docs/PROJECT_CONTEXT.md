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
