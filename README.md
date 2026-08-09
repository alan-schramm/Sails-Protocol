# Sails Protocol

[![CI](https://github.com/alan-schramm/Sails-Protocol/actions/workflows/ci.yml/badge.svg)](https://github.com/alan-schramm/Sails-Protocol/actions/workflows/ci.yml)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)

<!-- No npm version badge yet — @sails/sdk isn't published to any npm
     registry (confirmed via `npm view @sails/sdk`, 404). Add one the
     day it actually publishes; a badge pointing at a 404 is worse than
     no badge for a partner-facing README. -->

**Open infrastructure for interoperable P2P Financial Marketplaces.**

Today, every wallet has to rebuild marketplace, reputation, identity,
escrow, settlement, mediation, and antifraud from scratch. Sails Protocol
standardizes that infrastructure through a single SDK and interoperable
modules — non-custodial, intent-driven, built for Bitcoin, USDT, Lightning,
Liquid, and multi-chain wallets.

This repository is the **Reference Wallet implementation** — Satsails'
own integration, the first concrete proof that the protocol works in
production. It is one implementation of the spec, not the spec itself
(the same relationship Bitcoin Core has to the Bitcoin protocol).

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

**Sails P2P Trading SDK** is the MVP's product name — the concrete,
installable release of the Sails SDK package (`@sails/sdk`), scoped to
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

packages/              npm workspaces
├── sails-p2p-schemas/  @sails/p2p-schemas — types-only domain contracts
├── sails-sdk/          @sails/sdk — the Sails P2P Trading SDK
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
import { SailsClient, MockWalletAdapter } from '@sails/sdk';

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
(Arkade/VTXO) both settle for real today alongside `MOCK`/`WDK_USDT_EVM`;
only `LiquidCovenantProvider` remains genuinely unbuilt. The Capability
Registry is also already *consulted*, not just persisted —
`intent-engine.ts` and `escrow.service.ts` both call `check()` (gated
behind `config.features.enforceCapabilities`, off by default until a real
deployment has issued grants to check against). `docs/TODO.md` and
`docs/BACKLOG.md` are both audited against the actual code, not a
wishlist.

## Before you touch anything architectural

The v1.0 specification is frozen — no new primitive, module, or Core
component gets added without a numbered RFC first. `docs/rfcs/00-INDEX.md`
has the process and every RFC (001-012) that has amended the frozen spec
so far. If you hit an architectural ambiguity while implementing, that's
a proposal to write up, not a decision to make silently — see
`CONTRIBUTING.md`.

## License

Apache 2.0 — see `LICENSE`. Chosen specifically for the patent grant,
which matters for a protocol spec more than one company is expected to
implement.
