# ROADMAP.md
### Sails Protocol — Engineering Handoff · Document 10 of 20

> Dates are expressed **relative to launch** (Months 1-12), not as fixed
> calendar quarters. This is a deliberate choice — a roadmap with fixed
> calendar dates goes stale the moment execution slips, and that staleness
> reads as a red flag to any technical evaluator. If you need calendar
> dates for a specific deck, calculate them from the actual launch date at
> the time you're presenting — never hardcode them back into this source
> document.

---

## Status Legend (used throughout this document and every other doc in this handoff)

- **✅ Proven** — implemented and functional in a reference implementation
- **🏗️ Specified** — interface/contract defined, implementation partial or stubbed
- **📋 Aspirational** — on the roadmap, spec not yet written

---

## Standing Network-Effect Commitment — Wallet Kits + Settlement Rails

The Sails P2P Trading SDK should ship with first-party integration paths for
the major wallet development kits and the major settlement-capable networks
relevant to P2P markets. The objective is not to make every integrator adopt
the Reference Wallet's stack; it is to let existing wallets join the Sails
network with minimal replacement cost.

Initial **planned** first-party adapter targets:

- `@sails/adapter-bdk`
- `@sails/adapter-wdk`
- `@sails/adapter-breez`
- `@sails/adapter-spark`
- `@sails/adapter-ldk`
- `@sails/adapter-ethers` — EVM family, including BNB Smart Chain
- `@sails/adapter-tron`
- `@sails/adapter-solana`
- `@sails/adapter-ton`

These package names are roadmap targets, not published/support claims yet.
Additional adapters are added by ecosystem relevance and integrator demand.
Settlement-network expansion remains property-gated: a network is eligible
because its primitives can satisfy the required Sails settlement semantics,
not merely because an SDK or smart-contract platform exists.

## Months 1-3 — Foundation (Commitment)

- `@sails/protocol-spec` v0.1 published to npm (interfaces + event contracts only)
- API namespacing `/v1/{module}/` implemented across all restored/rebuilt routes
- Event namespacing `{module}.{entity}.{action}` fully applied (done in the
  reference implementation's event bus already — see `ARCHITECTURE.md`)
- `moduleId` + `protocolVersion` fields in the database schema (done — see
  `DATABASE.md`)
- WDK real integration replacing the mock keypair flow
- Ed25519 auth middleware
- Lightning HODL escrow + Liquid covenant escrow (real implementations,
  replacing the `MockSettlementProvider`)

## Months 4-6 — Developer Adoption (Commitment)

- `@satsails/p2p-trading-sdk` v1.0 public — a real implementation of the `SailsClient`
  interface in `SDK_GUIDE.md`
- All 8 modules documented (spec + integration guide)
- Public sandbox testnet, no signup required
- First 10 wallet integrations using the SDK
- First-party adapter program underway for BDK, WDK, Breez SDK, Spark SDK,
  LDK, major EVM wallet-development stacks (including BNB Smart Chain), TRON,
  Solana, and TON; each adapter must be backed by real integration evidence
  before it is labeled supported
- Third-party security audit, scoped to Sails OpenP2P + Sails OpenSettlement
  (the two modules with real code as of this handoff)
- Sails OpenP2P module spec reaches v1.0 stability

## Months 7-9 — Intelligence Layer (Target)

- Sails OpenAgents: spec finalized + real QVAC SDK integration
- `AgentIntent` support — any module can receive delegated agent actions
- Sails OpenReputation made fully cross-module portable (usable outside
  OpenP2P)
- Sails OpenLiquidity network extended across multiple reference
  implementations (not just Satsails)
- Stacks + RSK escrow support added to Sails OpenSettlement

## Months 10-12 — Open Ecosystem (Aspirational)

- Sails OpenFinance: first module spec published (`LoanIntent`,
  `EarnIntent`, `SwapIntent`)
- Pears Runtime deployment — zero central server, fully P2P app
  distribution
- Hyperbee-based distributed order book (replacing today's centralized
  `InternalOrderBook`)
- 50+ wallet integrations
- Protocol governance layer v1
- Monorepo (`packages/protocol-spec`, `packages/sdk`,
  `apps/satsails-reference`) fully published
- `SDK_usecases.md` — the "family of named SDKs" (Trading, Settlement,
  Liquidity, Reputation, Policy, Agent — Breez-style, `PROJECT_CONTEXT.md`
  §3's Named-SDK Rule) this phase would actually justify shipping.
  Written down now as a vision document, not built now — see that file
  for exactly what's real today vs. what this phase would need to build
  first (the Policy Engine's governed-rule system, most notably).
- **Third-Party Sails Modules & Developer Extension Ecosystem** —
  inspired by WDK Building Blocks and `create-wdk-module`
  (`PROJECT_CONTEXT.md`'s own "External Design Reference — WDK Building
  Blocks" section), Sails should eventually provide tooling for third
  parties to build Sails-compatible wallet adapters, settlement providers,
  and economic modules without requiring those technologies to become
  Core dependencies. Conceptually, not yet planned in implementation
  detail: `create-sails-adapter`, `create-sails-module`, scaffolding, a
  conformance harness, module templates, capability manifests,
  documentation templates, third-party wallet adapters, third-party
  settlement providers, and future third-party economic modules.
  **Package existence does not imply Sails support; conformance and
  evidence determine maturity** — the same discipline this document's own
  coverage matrix and First-Party Supported Criteria already apply to
  Sails' own first-party adapters (`README.md`). Named here as a future
  direction only — no scaffolding, registry, manifest schema, or tooling
  code exists yet, and none is authorized by this entry.
- **Third-Party Liquidity & Economic Modules** — a future track built on
  top of the extension ecosystem above, not a separate mechanism. External
  providers may contribute liquidity, RFQ, OTC, lending, swap, bridge,
  routing, and pricing capabilities through Sails-compatible modules.
  **Sails remains the coordination layer, does not own underlying capital
  or inventory, and may collect protocol fees from confirmed economic
  outcomes** subject to published policy and conformance — never from a
  module's mere existence or registration. `Sails OpenLiquidity` is a
  natural candidate for the first multi-provider third-party economic
  module ecosystem, since it already separates the coordination layer
  (`LiquidityProvider` interface, `InternalOrderBook`) from any specific
  liquidity source. **Integration should remain open. Economic
  coordination may be monetized. Module existence alone does not imply
  Sails support or production readiness** — the same
  package/module-existence ≠ supported ≠ production-ready rule the
  extension-ecosystem entry above and this document's own coverage matrix
  (`README.md`) already apply everywhere else. Named here as a future
  direction only — no module, provider registry, fee-collection mechanism,
  or conformance rule for third-party economic modules exists yet, and
  none is authorized by this entry.

---

## External Funding

Specific funding discussions, amounts, and counterparties are intentionally
not disclosed in this public document — internal only, and not finalized.
The Months 1-3/4-6/7-9/10-12 phases above stand on their own regardless of
external funding outcomes: `PROTOCOL_ECONOMY.md` §3 (**revised 2026-08-11**)
has the Protocol Fee active from launch, independent of whether any
external funding is secured, so the roadmap does not depend on a specific
grant landing to fund engineering, security, SDK work, or operations.

---

## Success Metrics (12 months post-launch)

| Category | Metrics |
|---|---|
| **Developer Adoption** | ≥1,000 `@satsails/p2p-trading-sdk` npm downloads/month · ≥10 wallet integrations |
| **Protocol Activity** | ≥5,000 TradeIntents created · ≥$1M USD equivalent coordinated |
| **Security** | Third-party audit complete · zero critical vulnerabilities in production |
| **Ecosystem Health** | ≥100 active reputation profiles · <2% dispute rate |

---

## What Is Already Done vs. What Remains

Do not present the roadmap above as starting from zero. As of this handoff:

- Sails OpenP2P core logic (Trade lifecycle, escrow state machine, liquidity
  routing) already exists as real code — see `ARCHITECTURE.md` section 4
- Event bus namespacing is already fixed (`{module}.{entity}.{action}`)
- Database schema already has `moduleId`/`protocolVersion`
- The P2P transport layer already correctly supports multiple concurrent
  users (`PearNode`/`PearNodeRegistry` — see `NODE_ARCHITECTURE.md`)

What genuinely remains is listed in full in `TODO.md` — read that document
before assuming any Months 1-3 item requires starting from scratch.
