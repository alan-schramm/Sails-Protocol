# PROJECT_CONTEXT.md
### Sails Protocol — Engineering Handoff · Document 1 of 20

> **Read this file first.** Every other document in this handoff assumes you
> understand what's written here. This document assumes zero prior context —
> you were not in any conversation where this was discussed. Everything you
> need is written down.

---

## 1. What Sails Protocol Is

**Official Definition (use this exact sentence everywhere — Whitepaper,
README, technical docs, grant submissions — never reworded):**

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

The canonical one-line description, used verbatim across every document in
this project:

> **"We are not building a P2P exchange. We are building the missing layer
> between WDK, Pears and QVAC."**

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
  Sails SDK
    → developer-facing wrapper around all modules

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

The canonical phrase that must appear in any strategic or architecture
document:

> **"Sails Protocol does not replace WDK, Pears or QVAC. It amplifies their
> combined value by providing the missing economic coordination layer
> between them."**

### Why this increases adoption of WDK/Pears/QVAC (the causal argument)

- Every wallet that integrates Sails becomes, by necessity, a WDK integrator.
- Every module deployed on the network grows the number of active peers on
  the Pears/HyperDHT network.
- Every Sails OpenAgents module built drives direct QVAC SDK usage — the
  module literally cannot function without QVAC underneath it.

This is why the project targets a **grant from tether.dev** — the ask is
$400,000 USD over 12 months. Full breakdown is in `ROADMAP.md`.

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
Sails SDK (@sails/sdk)            ← single interface for integrators
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

---

## 4. Current State of Implementation (be honest about this — don't inflate it)

As of this handoff, exactly **one module has real code**: Sails OpenP2P, via
the Satsails Wallet reference implementation. Everything else is specified
(interfaces, events, data model) but not built.

Use this status legend everywhere — it is mandatory, not optional:

- **✅ Proven** — implemented and functional in a reference implementation
- **🏗️ Specified** — interface/contract defined, implementation partial or stubbed
- **📋 Aspirational** — on the roadmap, spec not yet written

| Module | Status |
|---|---|
| Sails OpenP2P | ✅ Proven (Satsails Wallet) |
| Sails OpenIdentity | 🏗️ Specified — embedded inside OpenP2P today |
| Sails OpenReputation | 🏗️ Specified — embedded inside OpenP2P today |
| Sails OpenSettlement | 🏗️ Specified — `SettlementProvider` interface + Mock provider implemented |
| Sails OpenLiquidity | 🏗️ Specified — `LiquidityProvider` interface + Internal order book implemented |
| Sails OpenAgents | 📋 Aspirational |
| Sails OpenFinance | 📋 Aspirational |
| Sails SDK | 📋 Aspirational — interface fully specified, zero implementation |

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
| **Cross-module service** | A protocol module used by multiple application modules (OpenIdentity, OpenReputation, OpenSettlement, OpenLiquidity). |
| **Application module** | A protocol module that builds on cross-module services to deliver a use case (OpenP2P, OpenFinance). |
| **moduleId** | A database field present on every entity, identifying which module owns that row (e.g. `"openp2p"`, `"opensettlement"`). |
| **protocolVersion** | A database field tracking which version of the Sails Protocol spec an entity was created under. |

If you see "Satsails P2P Protocol," "OpenP2P Protocol" as the name of the
whole project, or any variant that conflates Satsails with Sails Protocol,
that is legacy branding from an earlier phase of the project — correct it,
don't propagate it.

---

## 6. Where to go next

- Full architecture, layers, and diagrams → `ARCHITECTURE.md`
- Database schema → `DATABASE.md`
- All API endpoints → `API_REFERENCE.md`
- SDK design (not yet built) → `SDK_GUIDE.md`
- P2P node topology → `NODE_ARCHITECTURE.md`
- The 7 Core Primitives and Intent Engine in full detail → `PROTOCOL_SPECIFICATION.md`
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
