# Sails Protocol

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
`docs/00-INDEX.md` has the full reading order for all 20 handoff
documents, and explains why a few filenames cited inside them
(`MASTER_COORDINATION.md`, `RED_TEAM_REVIEW.md`, and similar internal
evaluation docs) don't resolve to a file in this repo — that's
deliberate (`docs/GOVERNANCE.md` §6C), not a broken link.

## Status

This is a partial, actively-developed reference implementation.
`docs/BACKLOG.md` has the exact build order. `docs/TODO.md` has the exact
list of what's missing. Neither is aspirational — both are generated from
auditing this actual codebase, not written from a wishlist.

## Quick orientation

```
src/
├── config/            Environment loading, boot-time guards
├── core/               Intent Engine, State Machine, Coordination Engine
│                      — real (intent-engine.ts's create() runs the full
│                      CREATED -> VALIDATED -> COORDINATED lifecycle,
│                      RFC-012). Policy Engine partially real
│                      (validateFinancialSanity); Capability Registry is
│                      still a stub — see docs/TODO.md for the exact split
├── modules/           open-identity, open-liquidity, open-p2p,
│                      open-settlement, open-reputation, open-agents —
│                      one folder per official module
├── infrastructure/    P2P transport (Pears/HyperDHT, real hyperdht/
│                      hyperswarm), wraps into TransportProvider per
│                      RFC-002; payload-crypto.ts (real libsodium
│                      encryption for direct P2P Intent delivery)
├── demo/              pix-to-usdt-flow.ts — the full QVAC -> Pears ->
│                      Intent Engine -> WDK settlement flow, runnable via
│                      the root-level demo-satsails-qvac.ts entrypoint
│                      (`npm run demo:qvac`)
└── common/            Shared types, database, events, errors, auth

packages/              npm workspaces
├── sails-p2p-schemas/  @sails/p2p-schemas — types-only domain contracts
└── sails-sdk/          @sails/sdk — the Sails P2P Trading SDK
                        (SDK_GUIDE.md). v0.1: Transport + Protocol SDK
                        layers (identity, reputation, liquidity, openp2p,
                        settlement, peers) are real, verified against
                        actual routes. Intent facade partial — see its
                        own src/intent-facade.ts

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

```bash
cp .env.example .env    # edit DATABASE_URL / REDIS_URL
npm install
npx prisma generate
npx prisma migrate dev
npm run dev              # server — needs Postgres/Redis reachable
npm run demo:qvac         # full QVAC + Pears + Intent Engine + WDK flow
npm test                  # 131 tests, no external infra needed
```

See `docs/DEPLOYMENT.md` for the full setup. `docs/TODO.md` has the exact
current gap list — the server boots and every module's routes are real
and tested (identity, peers, liquidity, open-p2p trade/chat, settlement,
reputation, the Intent API). What's still genuinely open: real
`LightningHodlProvider`/`LiquidCovenantProvider` (only `MOCK` and
`WDK_USDT_EVM` settle for real today), the Proof primitive (zero routes
yet), and the Capability Registry (still a stub) — `docs/TODO.md` and
`docs/BACKLOG.md` are both audited against the actual code, not a
wishlist.

## Before you touch anything architectural

The v1.0 specification is frozen — no new primitive, module, or Core
component gets added without a numbered RFC first. `docs/rfcs/00-INDEX.md`
has the process and every RFC (001-012) that has amended the frozen spec
so far. If you hit an architectural ambiguity while implementing, that's
a proposal to write up, not a decision to make silently — see
`docs/CONTRIBUTING.md`.

## License

Apache 2.0 — see `LICENSE`. Chosen specifically for the patent grant,
which matters for a protocol spec more than one company is expected to
implement.
