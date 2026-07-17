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

## Status

This is a partial, actively-developed reference implementation.
`docs/BACKLOG.md` has the exact build order. `docs/TODO.md` has the exact
list of what's missing. Neither is aspirational — both are generated from
auditing this actual codebase, not written from a wishlist.

## Quick orientation

```
src/
├── config/           Environment loading, boot-time guards
├── core/             Intent Engine, Coordination Engine, Capability
│                     Registry, Policy Engine, State Machine — the 6
│                     formal Core components (mostly stubs — see
│                     docs/TODO.md)
├── modules/          open-p2p, open-settlement, open-liquidity — one
│                     folder per official module
├── infrastructure/   P2P transport (Pears/HyperDHT), wraps into
│                     TransportProvider per RFC-002
└── common/           Shared types, database, events, errors, auth

docs/                 Full engineering handoff — architecture, protocol
                       spec, database schema, API reference, SDK guide,
                       9 principles, governance, RFCs
docs/rfcs/             Every structural decision, numbered, including
                       what was considered and rejected — not just what
                       shipped
```

## Setup

```bash
cp .env.example .env    # edit DATABASE_URL / REDIS_URL
npm install
npx prisma generate
npx prisma migrate dev
npm run dev
```

See `docs/DEPLOYMENT.md` for the full setup. `docs/TODO.md` (re-audited
2026-07-16) has the exact current gap list — the server boots and the
Intent API route is real; most other module routes (open-identity,
open-p2p trade/chat, open-settlement, open-liquidity, open-reputation)
still don't exist yet, even though their service layers mostly do.

## Before you touch anything architectural

The specification is frozen as of `docs/MASTER_COORDINATION.md`'s
"Sails Protocol v1.0 Specification Frozen" milestone. No new primitive,
module, or Core component gets added without a numbered RFC first —
`docs/rfcs/00-INDEX.md` has the process. If you hit an architectural
ambiguity while implementing, that's a proposal to write up, not a
decision to make silently — see `docs/CONTRIBUTING.md`.

## License

Apache 2.0 — see `LICENSE`. Chosen specifically for the patent grant,
which matters for a protocol spec more than one company is expected to
implement.
