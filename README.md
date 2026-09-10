# Sails Protocol

[![npm version](https://img.shields.io/npm/v/@satsails/p2p-trading-sdk.svg)](https://www.npmjs.com/package/@satsails/p2p-trading-sdk)
[![CI](https://github.com/alan-schramm/Sails-Protocol/actions/workflows/ci.yml/badge.svg)](https://github.com/alan-schramm/Sails-Protocol/actions/workflows/ci.yml)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Architecture Diagrams](https://img.shields.io/badge/architecture-diagrams-informational.svg)](https://alan-schramm.github.io/Sails-Protocol/)

**Open infrastructure for interoperable P2P Financial Marketplaces.**

Today, every wallet has to rebuild marketplace, reputation, identity,
escrow, settlement, mediation, and antifraud from scratch. Sails Protocol
standardizes that infrastructure through a single SDK and interoperable
modules — non-custodial, intent-driven, built for Bitcoin and USDT today,
with Lightning (testnet) and Liquid (designed, not yet implemented) on
the same architecture — see "Rail readiness" below for exactly which
claim applies to which rail.

This repository is the **Reference Wallet implementation** — Satsails'
own integration. Its Bitcoin (MULTISIG) settlement path has a real,
disclosed mainnet rehearsal behind it (`docs/MAINNET_MULTISIG_PROOF.md`
— a single small-value transaction, explicitly not a production-scale
proof); the protocol as a whole is IMPLEMENTED and REAL-PATH VALIDATED
against real infrastructure in this repo's own test suite, not yet
PRODUCTION-ACTIVATED at scale. It is one implementation of the spec, not
the spec itself (the same relationship Bitcoin Core has to the Bitcoin
protocol).

**Rail readiness** (see `docs/rfcs/` and each provider's own file header
for the full disclosure behind each claim):
- **Bitcoin (MULTISIG)** — IMPLEMENTED, REAL-PATH VALIDATED, and
  MAINNET-PROVEN for one small, explicitly non-production-scale rehearsal.
- **USDT (WDK_USDT_EVM)** — IMPLEMENTED, REAL-PATH VALIDATED on testnet;
  a disclosed server-custodial reference implementation, not the
  protocol's normative custody model.
- **Lightning (LIGHTNING_HODL / Arkade)** — IMPLEMENTED, REAL-PATH
  VALIDATED, but testnet (Mutinynet) only — not mainnet-proven.
- **Liquid** — DESIGNED only; `LiquidCovenantProvider` has zero
  implementation.

## Wallet-kit and settlement-network integration strategy

> **Sails P2P Trading SDK should ship with first-party integration paths for the major wallet development kits and the major settlement-capable networks relevant to P2P markets.**

The adoption rule is simple: **keep your wallet stack; plug into Sails.**
Sails Core must not require a wallet to replace its existing key-management,
signing, wallet SDK, or settlement stack in order to join the shared P2P
network. WDK is an important first-party integration target and reference
implementation dependency today, **not** a mandatory architectural dependency
for every wallet integrating Sails.

### Coverage matrix

**Presence in the coverage matrix means strategic integration target, not
demonstrated support.** Wallet-stack support, network support, asset
support, and settlement support are four separate claims — none is implied
by another, and each must be evidenced independently (a published adapter
package does not prove a working settlement rail; a working settlement
rail for one asset does not prove it for another).

Two different axes are deliberately kept in two different tables — a
wallet-kit adapter and a settlement-capable network are not the same kind
of thing (see "Wallet-kit adapters and settlement providers are different
axes" below).

**Wallet Stack / SDK targets** *(visible roadmap names, not published
packages and not claims of current support yet)*:

| Target | Category | Typical environment | Sails role | Current maturity |
|---|---|---|---|---|
| BDK (`@sails/adapter-bdk`) | Wallet stack | Bitcoin | Wallet integration | 📋 Planned |
| WDK (`@sails/adapter-wdk`) | Wallet stack | EVM / TRON / Solana / TON | Wallet integration + provider-specific paths | 📋 Planned / reference usage (`WDK_USDT_EVM` `SettlementProvider`, testnet — see "Rail readiness" above) |
| Breez SDK (`@sails/adapter-breez`) | Wallet stack | Lightning / supported Breez rails | Wallet integration | 📋 Planned |
| Spark SDK (`@sails/adapter-spark`) | Wallet / settlement stack | Spark | Wallet + settlement integration | 📋 Planned |
| LDK (`@sails/adapter-ldk`) | Wallet stack | Lightning | Wallet / node integration | 📋 Planned |
| ethers (`@sails/adapter-ethers`) | Wallet interaction stack | Ethereum, BNB Smart Chain, EVM | Wallet integration | 📋 Planned |
| TRON wallet stack (`@sails/adapter-tron`) | Wallet stack | TRON | Stablecoin wallet + settlement target | 📋 Planned |
| Solana wallet stack (`@sails/adapter-solana`) | Wallet stack | Solana | Stablecoin wallet + settlement target | 📋 Planned |
| TON wallet stack (`@sails/adapter-ton`) | Wallet stack | TON | Stablecoin wallet + settlement target | 📋 Planned |

These are the initial named targets, not a closed list. Additional wallet
development kits should be added when ecosystem relevance and real integrator
demand justify them.

**Network / Protocol / Settlement targets** *(a network appearing here is
an integration/distribution target — see "Rail readiness" above for which
of these already has a real, evidenced `SettlementProvider`)*:

| Target | Category | Typical environment | Sails role | Current maturity |
|---|---|---|---|---|
| Bitcoin | Bitcoin base layer | Bitcoin | Settlement target | ✅ Proven (`MULTISIG`) |
| Lightning | Bitcoin L2 | Lightning | Settlement target | 📋 Day-0 required, **NOT IMPLEMENTED / NOT EVIDENCED as a distinct capability** — see 2026-09-10 correction note below (no genuine plain-Lightning HTLC settlement path exists in this repository; `LIGHTNING_HODL` is Ark-based, not Lightning) |
| Spark | Bitcoin-adjacent settlement environment | Spark | Settlement target | 📋 Future |
| Liquid | Bitcoin sidechain | Liquid | Asset + settlement target | 📋 Designed, zero implementation |
| RGB | Bitcoin asset/protocol layer | Bitcoin / RGB | Asset + settlement target | 📋 Future |
| Arkade | Bitcoin settlement environment | Bitcoin / Ark | Settlement target | 🏗️ IMPLEMENTED / TESTNET-EVIDENCED (Mutinynet) — `LIGHTNING_HODL` (`lightning-hodl.provider.ts`) is a real Ark-protocol VTXO/Taproot implementation — see 2026-09-10 correction note below |
| Stacks | Bitcoin-adjacent smart-contract network | Stacks | Settlement target | 📋 Roadmap (Months 7-9, `docs/ROADMAP.md`) |
| RSK / Rootstock | Bitcoin sidechain / EVM | Rootstock | Settlement target | 📋 Roadmap (Months 7-9, `docs/ROADMAP.md`) |
| Ethereum | EVM network | Ethereum mainnet/Sepolia | Settlement target | ✅ Proven for USDT (`WDK_USDT_EVM`, testnet — see "Rail readiness" above); not proven for USDC or other assets |
| Base | EVM network | Base | Settlement target | 📋 Day-0 target, zero implementation (added 2026-09-10 — existing product/reference-wallet truth, not new scope) |
| Optimism | EVM network | Optimism | Settlement target | 📋 Day-0 target, zero implementation (added 2026-09-10) |
| Polygon | EVM network | Polygon | Settlement target | 📋 Day-0 target, zero implementation (added 2026-09-10) |
| Avalanche | EVM network | Avalanche | Settlement target | 📋 Day-0 target, zero implementation (added 2026-09-10) |
| Arbitrum | EVM network | Arbitrum | Settlement target | 📋 Day-0 target, zero implementation (added 2026-09-10) |
| BNB Chain | EVM network | BNB Smart Chain | Settlement target | 📋 Day-0 target, zero implementation (previously only bundled into a generic "EVM-family" mention, never its own tracked row — corrected 2026-09-10) |
| TRON | Smart-contract network | TRON | Stablecoin wallet + settlement target | 📋 Planned (`AssetType.USDT_TRC20` schema-represented, no `SettlementProvider`) |
| Solana | Smart-contract network | Solana | Stablecoin wallet + settlement target | 📋 Planned |
| TON | Smart-contract network | TON | Stablecoin wallet + settlement target | 📋 Planned |

**2026-09-10 Product Direction Freeze (Gate B) note.** Base, Optimism,
Polygon, Avalanche, Arbitrum, and a properly-tracked BNB Chain row are
added above as the Satsails Wallet V2 reference target's existing
Day-0 scope — this table previously omitted them entirely (BNB Chain
only appeared bundled inside a now-removed generic "EVM-family
networks" row); their addition here corrects this document's own
incomplete institutional memory, it is not new product scope invented
on this date. Whether these six networks are served by one generic EVM
`SettlementProvider` parameterized by chain-id, or by six separate
provider implementations, is an open architecture question — not
decided here, and shared implementation (if chosen) would not imply
shared maturity/evidence/eligibility across networks.

**2026-09-10 correction (semantic precision, same-day follow-up).** The
former single "Lightning / Arkade" row was first split into two rows
both showing Implemented — that overclaimed the evidence. Re-audited
directly against `lightning-hodl.provider.ts`'s own header comment and
a repository-wide search for any genuine Lightning-specific mechanism
(BOLT11/HTLC/LND — none found anywhere in `src/`, confirmed, not
inferred from naming): the single current implementation behind both
labels is **Ark-protocol VTXO/Taproot settlement**, not plain-Lightning
HTLC settlement — the provider's own comment states real Lightning has
no genuine multi-party escrow primitive, which is *why* it settles via
Ark instead. Shared current implementation cannot prove two distinct
capabilities when that implementation only realizes one capability's
actual semantics. Corrected: **Arkade** is IMPLEMENTED /
TESTNET-EVIDENCED (real, via `LIGHTNING_HODL`); **Lightning**, as its
own distinct capability, is **NOT IMPLEMENTED / NOT EVIDENCED** — no
genuine Lightning-specific settlement path exists in this repository
today. This does **not** remove Lightning from the Day-0 target — it
remains Day-0-required, per Product Direction, distinct from Arkade and
Spark; only its *current maturity claim* is downgraded to match actual
evidence. The blocking gap for Lightning specifically is an
architecture/provider path for real Lightning-native settlement, not
yet designed or built. Protocol/network family, implementation/client,
settlement capability, and interoperability path are four distinct
concepts that must never collapse into each other (e.g. Ark/Arkade
interoperating with Lightning would not make Ark "Lightning") — see the
"Institutional blind-spot rule" in `docs/BACKLOG.md` Cold Sweep Loop 5,
item 20 for the full worked examples. Full canonical Day-0 matrix and
this maturity correction: same location.

**Wallet-kit adapters and settlement providers are different axes.** A wallet
adapter connects the wallet's existing key/signing/balance/address stack to
the Sails SDK. A `SettlementProvider` proves that a specific rail can satisfy
the required settlement properties. Sails should expand to economically
relevant networks whose primitives can actually demonstrate the required
escrow/conditional-settlement, authority, evidence, refund/dispute, recovery,
and reconciliation properties — not claim support merely because a network
has smart contracts.

**The asset dimension.** The coverage matrix above is two-dimensional
(stack/network × maturity); the fuller picture this should eventually grow
into is **Adapter/Stack × Network/Protocol × Asset × Settlement Capability ×
Maturity** — because "this network is a settlement target" does not mean
every asset on it is. Relevant assets already in view, none claimed as
finally supported where evidence does not yet exist: **USDT, USDC, BTC,
LBTC, L-USDT, DePix, Tether Gold, RGB assets.** `WDK_USDT_EVM`'s own
"Rail readiness" entry above is the only one of these with a real,
evidenced (testnet) settlement path today. The current flat `AssetType`
enum (10 string values, e.g. `USDT_ERC20`) conflates asset identity and
network/rail identity into one token each — this is a real, recorded
architecture tension for the Day-0 target below, not yet resolved into
a mechanism (`docs/BACKLOG.md` Cold Sweep Loop 5, item 20 has the full
discussion).

**Full Reference Wallet Day-0 Capability Target (2026-09-10 Product
Direction freeze — Gate B).** This is the authoritative current-scope
statement, superseding any earlier framing in this README that read as
a choice between narrower beta scopes: **USDT** — Ethereum, Base,
Optimism, Polygon, Avalanche, Solana, Tron, TON, BNB Chain, Arbitrum,
Liquid. **USDC** — Ethereum, Base, Optimism, Arbitrum, Avalanche,
Polygon. **XAUT (Tether Gold)** — Ethereum. **DePix** — Liquid and
Spark, both required. **BTC** — on-chain, Spark, Lightning, Arkade, and
Liquid/L-BTC, as five distinct product capabilities. A capability
appearing in this target and still showing 📋/zero-implementation
elsewhere in this document is expected — Day-0 scope, protocol
representability, SDK representability, implementation, real-path
evidence, beta eligibility, and production eligibility are seven
different claims, and immaturity on any of them never removes a
capability from this scope. Full canonical matrix, provenance, and the
architecture questions this raises: `docs/BACKLOG.md` Cold Sweep Loop 5,
item 20.

**First-party supported criteria.** A wallet-kit adapter is not
"first-party supported" merely because the npm package exists. Depending
on what the adapter is for, first-party support means demonstrating, as
applicable:
- address derivation / retrieval
- signing
- balance / query
- network identification
- capability declaration
- understood error semantics
- real integration-boundary tests
- documented custody / key model
- documented limitations

**First-party wallet adapter support does not imply settlement-provider
maturity or production eligibility.** A wallet can be fully, genuinely
adapter-supported while the rail it settles over remains
`PRODUCTION-INELIGIBLE` (`WDK_USDT_EVM` today is exactly this case — see
"Rail readiness" above). **Interface compatibility does not imply security
compatibility** — implementing an interface correctly says nothing about
whether the underlying custody, signing, or trust model meets Sails'
settlement-property bar.

This is a network-effect requirement for OpenP2P: the easier it is for wallets
using different stacks and rails to join the same economic coordination layer,
the stronger the shared liquidity, counterparty reach, reputation surface, and
distribution of the Sails network become.

**New here? `docs/GETTING_STARTED.md`** — copy-paste commands, the
trade flow in 8 steps with no file names, and a "which endpoint for
which action" lookup table. Everything below is the fuller picture.

**The canonical developer journey (Missão 07.4):** this README (what it
is) → `docs/GETTING_STARTED.md` (zero to first operation) →
`examples/simple-wallet` (the full golden path, real and continuously
verified — run it, don't just read about it) → `docs/SDK_GUIDE.md` (how
to build a real integration) → `docs/API_REFERENCE.md` (detailed
reference) → `docs/API_STABLE.md` (the version/freeze contract). If two
docs ever seem to disagree, `API_STABLE.md` is the one that's actually
frozen — trust it.

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

*(This row lists every settlement rail Core's architecture is designed
to support — it is not a claim that all four are equally built. See
"Rail readiness" above: Bitcoin and USDT are implemented and real-path
validated, Lightning is real-path validated on testnet only, and Liquid
is designed only, with zero implementation.)*

**Sails P2P Trading SDK** is the MVP's product name — the concrete,
installable release of the Sails SDK package (`@satsails/p2p-trading-sdk`), scoped to
what's actually being built first: P2P trading. See
`docs/PROJECT_CONTEXT.md` section 3 for why it's scoped that way instead
of the full long-term Marketplace breadth.

**Core** (protocol, technology-agnostic): Intent, Timeline, Events,
Capability, Policy, Proof, Identity, Settlement, Reputation.
**Not Core** (implementation choices, belong here in the Reference Wallet,
never to the spec): PIX, Lightning, Bitcoin as settlement rails; HyperDHT,
WebSocket as transport; Redis, PostgreSQL, Prisma as storage.

**Read `docs/PROJECT_CONTEXT.md` first if you're new here** — it has the
full positioning, the Ideal Customer Profile, and the Developer Journey.
**Want to see one real trade move through every piece below, end to
end — QVAC, Pears, Intent Engine, Capability checks, escrow, the WDK
release, including exactly what changes when the two-person release
control is turned on? Read `docs/TRANSACTION_WALKTHROUGH.md`** — every
file/function it names was checked against the actual code, not written
from memory of what should be there. `docs/00-INDEX.md` has the full
reading order for all 20 handoff documents, and explains why a few
filenames cited inside them
(`MASTER_COORDINATION.md`, `RED_TEAM_REVIEW.md`, and similar internal
evaluation docs) don't resolve to a file in this repo — that's
deliberate (`docs/GOVERNANCE.md` §6C), not a broken link. Picking this
project up from someone else? Start with `docs/HANDOFF.md` instead.

## The three technologies Sails Protocol coordinates

The bottom row of the diagram above — **WDK**, **Pears**, **QVAC** — are
three separate, independently-developed technologies this codebase does
**not** reimplement. Sails Protocol's actual job is coordinating them: it
takes an AI agent's decision (QVAC), lets it reach a counterparty with no
central server (Pears), and settles the resulting trade with a real,
digitally signed transaction (WDK) — the same real, orchestrated sequence
`npm run demo:qvac` runs end to end (`demo-satsails-qvac.ts`,
`src/core/intent-engine.ts`, `src/modules/open-settlement/settlement-orchestrator.ts`).
If any of the three names below aren't familiar yet, that's expected —
read their docs before the rest of this codebase, since `src/infrastructure/`,
`src/modules/open-agents/`, and `src/modules/open-settlement/` all wrap
their real, official SDKs directly, not an abstraction invented here.
**`docs/TRANSACTION_WALKTHROUGH.md` narrates exactly how these three
coordinate for one real trade, step by step, file by file.**

| Technology | What it provides | Official docs |
|---|---|---|
| **WDK** (Tether's Wallet Development Kit) | Real, non-custodial key derivation and transaction signing — `@tetherto/wdk-wallet-evm` is what actually signs the USDT transfer in `wdk-settlement.provider.ts`. Sails Protocol never touches a private key directly; it only tells WDK *when* to sign, via `executeSettlement()`. | https://docs.wdk.tether.io/ |
| **Pears** (Holepunch's P2P stack — HyperDHT/Hyperswarm) | Serverless peer discovery and direct, NAT-traversed (hole-punched) connections between two nodes — `pear.service.ts`/`transport-provider.ts` wrap the real `hyperdht`/`hyperswarm` packages. Sails Protocol never runs its own DHT or discovery server; it only decides *what* gets sent once Pears has two peers connected. | https://docs.pears.com/ |
| **QVAC** (Tether's local-inference AI SDK) | An LLM that runs entirely on-device (llama.cpp, GPU-accelerated, no cloud API) — `qvac-agent.provider.ts` is what actually loads the model and generates the structured `TradeIntentPayload`/offer/risk-assessment JSON. Sails Protocol never builds or trains a model; it only validates what QVAC produces before trusting it (the CISO Byzantine/Economic rules in `intent-engine.ts`). | https://docs.qvac.tether.io/ |

## Status

This is a partial, actively-developed reference implementation.
`docs/BACKLOG.md` has the exact build order. `docs/TODO.md` has the exact
list of what's missing. Neither is aspirational — both are generated from
auditing this actual codebase, not written from a wishlist.

## Quick orientation

```
src/
├── config/            Environment loading, boot-time guards
├── core/               Intent Engine, State Machine, Coordination Engine,
│                      Capability Registry — all real (intent-engine.ts's
│                      create() runs the full CREATED -> VALIDATED ->
│                      COORDINATED lifecycle, RFC-012; capability-registry.ts
│                      persists real CapabilityGrants, RFC-013). Policy
│                      Engine is the one still-real stub — see docs/TODO.md
├── modules/           open-identity, open-liquidity, open-p2p,
│                      open-settlement, open-reputation, open-agents,
│                      open-proof — one folder per official module
├── infrastructure/    P2P transport (Pears/HyperDHT, real hyperdht/
│                      hyperswarm), wraps into TransportProvider per
│                      RFC-002; payload-crypto.ts (real libsodium
│                      encryption for direct P2P Intent delivery)
└── common/            Shared types, database, events, errors, auth

examples/demo/          pix-to-usdt-flow.ts (the full QVAC -> Pears ->
                        Intent Engine -> WDK settlement flow) and
                        demo-satsails-qvac.ts (its `npm run demo:qvac`
                        entrypoint) — moved out of src/ since neither is
                        library code another module imports
examples/wallet-integration/  A real, non-mock WalletAdapter — 
                        `RealBitcoinWalletAdapter implements WalletAdapter`
                        against a genuine non-custodial escrow type
                        (MULTISIG), not the `MockWalletAdapter` used
                        above for a quick local run. Start here if
                        you're integrating a real wallet.
examples/simple-wallet/       **The canonical golden-path reference**
                        (Missão 07.4) — every other doc points here
                        instead of keeping its own copy. Identity ->
                        authenticate -> publish offer -> discover ->
                        trade -> chat -> escrow -> mark payment ->
                        release -> reputation, against a real local
                        node, using only the SDK's public API — ~150
                        lines, answers "can I integrate this in 15
                        minutes?"
examples/sails-integration-starter/  Next.js starter — a real app
                        talking to a live Sails node, plus two
                        standalone end-to-end protocol scripts

packages/              npm workspaces
├── sails-p2p-schemas/  @satsails/p2p-schemas — types-only domain contracts
├── sails-sdk/          @satsails/p2p-trading-sdk — the Sails P2P Trading SDK
│                       (SDK_GUIDE.md). v0.1: Transport + Protocol SDK
│                       layers (identity, reputation, liquidity, openp2p,
│                       settlement, peers) are real, verified against
│                       actual routes. Intent facade partial — see its
│                       own src/intent-facade.ts
└── sails-ui/           @sails/ui — reference UI, 9 navigable screens,
                        structural skeleton only (mocked data, plain
                        Tailwind — no visual identity yet, that's a
                        deliberate later pass). `npm run dev:ui`. See
                        its own README.md for the real-vs-mocked split.

docs/                   Full engineering handoff — architecture, protocol
                        spec, database schema, API reference, SDK guide,
                        9 principles, governance, RFCs. Some documents
                        referenced here (due-diligence/red-team/strategic
                        reviews, e.g. RED_TEAM_REVIEW.md,
                        PROTOCOL_FREEZE_REPORT.md) are intentionally kept
                        internal, not published to this repo — see
                        `docs/GOVERNANCE.md` section 6C ("Publication
                        Discipline") for the policy and why
docs/rfcs/              Every structural decision, numbered, including
                        what was considered and rejected — not just what
                        shipped
docs/architecture/      Canonical Archify diagrams (JSON IR, source of
                        truth) — rendered and always current at
                        alan-schramm.github.io/Sails-Protocol
```

## Setup

**Fastest path — no Node/npm on your host at all** (2026-08-03,
`docker-compose.yml`): one command brings up real Postgres + Redis, applies
the schema, and starts the server, safe-by-default (mock escrow, no
secrets needed):

```bash
docker compose up -d --build   # Postgres + Redis + the server itself — http://localhost:3000
```

That's genuinely the whole setup — no `npm install`, no manual schema
step, nothing to configure. Verified against a real, cold `docker compose
up` (not just reviewed) before this was written.

**If you're actively editing code** (hot-reload, not a rebuild per
change): keep `docker compose up -d postgres redis` running for the
dependencies, then run the server on the host instead of in a
container — `npm install && npm run dev` (`ts-node-dev`, real
respawn-on-save, no rebuild needed per change).

## Usage

Below is a quick example demonstrating the core wallet methods provided by `SailsClient`. For a detailed API reference see [API.md](docs/API.md) and for more examples see [EXAMPLES.md](docs/EXAMPLES.md).


```ts
import { SailsClient, MockWalletAdapter } from '@satsails/p2p-trading-sdk';

// MockWalletAdapter is for exactly this — a quick local run with no real
// wallet. Swap it for your own WalletAdapter implementation in production.
const wallet = new MockWalletAdapter({
  peerId: 'mock-peer',
  addresses: { BTC: 'bc1qmockaddress...' },
  balances: { BTC: '1.5' },
});
const client = new SailsClient({ baseUrl: 'http://localhost:3000', wallet });

async function demo() {
  const balance = await client.getBalance('BTC');
  console.log('BTC balance:', balance);

  const addresses = await client.getWalletAddresses();
  console.log('Addresses:', addresses);

  // sendTransaction(asset, tx) — signs via wallet.signTransaction() then
  // broadcasts via wallet.broadcastTransaction(), returns the txid.
  const txHash = await client.sendTransaction('BTC', {
    to: 'bc1qrecipient...',
    value: '0.001',
  });
  console.log('Tx sent, hash:', txHash);

  const signed = await client.signMessage(new Uint8Array([1, 2, 3]));
  console.log('Signed message:', signed);

  const caps = await client.getCapabilities();
  console.log('Capabilities:', caps);
}

demo();
```

```bash
cp .env.example .env    # defaults already match docker-compose.yml
docker compose up -d postgres redis   # just the two real dependencies
npm install
npm run db:migrate       # real command is `prisma migrate deploy` — see package.json
npm run dev              # server — http://localhost:3000, hot-reload
npm run demo:qvac         # full QVAC + Pears + Intent Engine + WDK flow
npm test                  # 600+ tests, no external infra needed
```

See `docs/DEPLOYMENT.md` for the full setup (including the real AWS
production path) and `docs/HANDOFF.md` for what's actually been verified
live vs. only against mocks so far.
`docs/TODO.md` has the exact current gap list — the server boots and
every module's routes are real and tested (identity, peers, liquidity,
open-p2p trade/chat, settlement, reputation, the Intent API, capability
grants — RFC-013 — and Proof — claims/proofs/verification/evidence
bundles). **Corrected 2026-08-09**, this paragraph previously understated
what's real: `MultisigProvider` (Bitcoin) and `LightningHodlProvider`
(Arkade/VTXO) are both IMPLEMENTED and REAL-PATH VALIDATED today
alongside `MOCK`/`WDK_USDT_EVM` — not equally proven, though: MULTISIG
has one small, disclosed MAINNET-PROVEN rehearsal
(`docs/MAINNET_MULTISIG_PROOF.md`) behind it, while `LightningHodlProvider`
is confined to Arkade's public testnet deployment (Mutinynet) only —
see `lightning-hodl.provider.ts`'s own header for that scope. Only
`LiquidCovenantProvider` remains genuinely unbuilt (DESIGNED only). The Capability
Registry is also already *consulted*, not just persisted —
`intent-engine.ts` and `escrow.service.ts` both call `check()` (gated
behind `config.features.enforceCapabilities`, off by default until a real
deployment has issued grants to check against). `docs/TODO.md` and
`docs/BACKLOG.md` are both audited against the actual code, not a
wishlist.

## Before you touch anything architectural

The v1.0 specification is frozen — no new primitive, module, or Core
component gets added without a numbered RFC first. `docs/rfcs/00-INDEX.md`
has the process and every RFC (001-023) that has amended the frozen spec
so far. If you hit an architectural ambiguity while implementing, that's
a proposal to write up, not a decision to make silently — see
`CONTRIBUTING.md`.

## Author & Maintainer

Sails Protocol is created and led by **Alan Schramm**, drawing on 10+
years of experience in the Bitcoin and crypto markets. It's developed
by **Sails Labs**, part of **Satsails Holding**.

## Contributing

See `CONTRIBUTING.md` for the full process — architectural changes go
through an RFC first (see "Before you touch anything architectural"
above), everything else follows the standard PR flow.

## License

Apache 2.0 — see `LICENSE`. Chosen specifically for the patent grant,
which matters for a protocol spec more than one company is expected to
implement.
