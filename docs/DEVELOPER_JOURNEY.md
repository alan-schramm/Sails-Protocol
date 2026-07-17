# DEVELOPER_JOURNEY.md
### Sails Protocol — v1 Positioning Freeze addendum (added after the original 20-document handoff)

> **Status: 📋 Aspirational narrative.** This document describes the
> target onboarding experience — the "five minutes to understand, ten
> minutes to a working integration" flow the v1 Positioning Freeze
> commits to. It is not a tutorial for code that runs today. Every step
> below is tagged with its real status (✅ Proven / 🏗️ Specified /
> 📋 Aspirational) per `PROJECT_CONTEXT.md` section 4's status legend —
> read those tags, don't skip them. Where a step is Aspirational, the
> code sample shows the *intended* `SailsClient` shape from `SDK_GUIDE.md`
> section 4, not something you can `npm install` and run.

## The Developer Journey (v1 Positioning Freeze target — 5 steps to a working Marketplace)

```
Install SDK → Create Wallet → Enable OpenP2P → Enable Settlement →
Enable Reputation → Working Marketplace
```

This is the same shape as the developer diagram in `PROJECT_CONTEXT.md`
section 3, walked one layer at a time. Each step below adds exactly one
module. Nothing here requires understanding the protocol's internals
first — that's the point: a wallet developer should be able to follow
this without reading `PROTOCOL_SPECIFICATION.md`.

---

### Step 1 — Install the SDK

**Status: 📋 Aspirational.** `@sails/sdk` does not exist yet — see
`SDK_GUIDE.md`'s own status banner. When it does, this is the entire
install step:

```bash
npm install @sails/sdk
```

One package. No per-module installs, no separate clients for identity,
settlement, and reputation — that flattening is the SDK's entire reason
to exist (`SDK_GUIDE.md` section 1).

### Step 2 — Create a wallet-backed client

**Status: 📋 Aspirational** (the `SailsClient` constructor is specified,
not implemented).

```typescript
import { SailsClient } from '@sails/sdk'

const sails = new SailsClient({
  wdk: await WDK.fromKeypair(keypair),
  network: 'mainnet',
})
```

This is the only place WDK appears in your integration code. Everything
past this line talks to `sails`, not to WDK, Pears, or QVAC directly —
those three stay infrastructure the protocol coordinates, never things
your wallet code calls into on its own (`PROJECT_CONTEXT.md` section 3).

### Step 3 — Enable OpenP2P (negotiation)

**Status: 🏗️ Specified, ✅ Proven in the Reference Wallet.** This is the
one module with real code today — see `ARCHITECTURE.md` section 3 and
section 4 (Actual Code Inventory) for exactly what exists.

```typescript
const matches = await sails.liquidity.discover({
  type: 'trade',
  asset: 'BTC',
  side: 'BUY',
  maxValue: 2000,
  currency: 'BRL',
  fiatMethod: 'PIX',
})

const trade = await sails.openp2p.trade(matches[0].id)

const chat = sails.openp2p.chat(trade.id)
chat.onMessage((msg) => console.log(msg))
chat.send({ content: 'Sending payment now', msgType: 'TEXT' })
```

At this point your wallet can discover a counterparty and negotiate —
the Intent → Negotiation part of the flow. No money has moved yet.

### Step 4 — Enable Settlement (escrow)

**Status: 🏗️ Specified.** `SettlementProvider` interface and a Mock
provider are implemented; production providers (Multisig, Lightning HODL,
Liquid Covenant) are not — see `ARCHITECTURE.md` section 3.

```typescript
const escrow = await sails.settlement.create('MULTISIG', trade.id)
await sails.settlement.lock(escrow.id)
// buyer sends fiat directly to seller, shares proof via chat
await sails.settlement.release(escrow.id)
```

This is the step that turns a negotiation into money actually moving —
non-custodially: Sails Protocol never holds the funds itself
(`PROJECT_CONTEXT.md` section 1, Principle 1).

### Step 5 — Enable Reputation

**Status: 🏗️ Specified — embedded inside OpenP2P today**, not yet its own
callable surface (`PROJECT_CONTEXT.md` section 4).

```typescript
await sails.reputation.rate(trade.id, 5)
```

Reputation is portable across every module and every wallet that
integrates the protocol — it's tied to the keypair from Step 2, not to
your app (`ARCHITECTURE.md` section 3).

### Step 6 — Working Marketplace

Five steps, one SDK, one keypair. What you have at this point is a wallet
that can discover a counterparty, negotiate, settle non-custodially, and
build portable reputation — the definition of a P2P Financial Marketplace
used throughout this project (`PROJECT_CONTEXT.md` section 1). Everything
past this — OpenAgents fraud detection, OpenFinance's future modules — is
additive, not required to reach a working Marketplace.

---

## Where the honesty caveat matters most

If you are evaluating Sails Protocol to decide whether to integrate it
today: Step 3 is real, proven in production via the Satsails Wallet
Reference Implementation. Steps 1, 2, 4, and 5 are specified but not
buildable yet — `@sails/sdk` has zero implementation
(`PROJECT_CONTEXT.md` section 4). Read `docs/ROADMAP.md` for when that
changes, and `docs/TODO.md` for the exact gap list. This document exists
so the target experience is unambiguous the moment the SDK ships — not
so it looks finished before it is.
