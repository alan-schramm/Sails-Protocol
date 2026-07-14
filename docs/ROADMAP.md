# ROADMAP.md
### Sails Protocol — Engineering Handoff · Document 10 of 20

> Dates are expressed **relative to grant approval** (Months 1-12), not as
> fixed calendar quarters. This is a deliberate choice — a roadmap with
> fixed calendar dates goes stale the moment approval or execution slips,
> and that staleness reads as a red flag to any technical evaluator. If you
> need calendar dates for a specific deck, calculate them from the actual
> approval date at the time you're presenting — never hardcode them back
> into this source document.

---

## Status Legend (used throughout this document and every other doc in this handoff)

- **✅ Proven** — implemented and functional in a reference implementation
- **🏗️ Specified** — interface/contract defined, implementation partial or stubbed
- **📋 Aspirational** — on the roadmap, spec not yet written

---

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

- `@sails/sdk` v1.0 public — a real implementation of the `SailsClient`
  interface in `SDK_GUIDE.md`
- All 8 modules documented (spec + integration guide)
- Public sandbox testnet, no signup required
- First 10 wallet integrations using the SDK
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

---

## Grant Request

| | |
|---|---|
| **Amount** | $400,000 USD |
| **Duration** | 12 months from approval |
| **Target** | tether.dev/apply |
| **Use of funds** | Open-source protocol infrastructure — no marketing spend, no token issuance, no proprietary lock-in |

### Budget Breakdown

| Category | % | Amount |
|---|---|---|
| Protocol Engineering | 55% | $220,000 |
| Security & Audits | 20% | $80,000 |
| SDK & Documentation | 15% | $60,000 |
| Operations | 10% | $40,000 |

### Why This Increases WDK / Pears / QVAC Adoption

> Every wallet integrating Sails becomes a WDK integrator. Every module
> deployed grows the Pears network. Every OpenAgents module drives direct
> QVAC SDK usage.

This grant funds infrastructure that structurally increases usage of all
three Tether technologies simultaneously — see `PROJECT_CONTEXT.md` for the
full argument.

**Note on long-term sustainability:** this $400k grant funds Months 1-12 of
protocol *engineering*. It is not meant to be a recurring funding source.
See `PROTOCOL_ECONOMY.md` for exactly how the protocol sustains itself
after the grant period — including why it does this without any
speculative token, and how six distinct stakeholder groups (Liquidity
Providers, Node Operators, Developers, Arbitrators, Wallets, Integrators)
are incentivized using only the settlement assets already flowing through
the protocol.

---

## Success Metrics (12 months post-grant)

| Category | Metrics |
|---|---|
| **Developer Adoption** | ≥1,000 `@sails/sdk` npm downloads/month · ≥10 wallet integrations |
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
