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
Install Sails P2P Trading SDK → Create Wallet → Enable OpenP2P →
Enable Settlement → Enable Reputation → Working Marketplace
```

"Sails P2P Trading SDK" is the MVP's product name for the `@satsails/p2p-trading-sdk`
package — see `PROJECT_CONTEXT.md` section 3 for why it's scoped that
way rather than the long-term "Sails SDK."

This is the same shape as the developer diagram in `PROJECT_CONTEXT.md`
section 3, walked one layer at a time. Each step below adds exactly one
module. Nothing here requires understanding the protocol's internals
first — that's the point: a wallet developer should be able to follow
this without reading `PROTOCOL_SPECIFICATION.md`.

---

### Step 1 — Install the Sails P2P Trading SDK

**Status: 📋 Aspirational.** `@satsails/p2p-trading-sdk` does not exist yet — see
`SDK_GUIDE.md`'s own status banner. When it does, this is the entire
install step:

```bash
npm install @satsails/p2p-trading-sdk
```

One package. No per-module installs, no separate clients for identity,
settlement, and reputation — that flattening is the SDK's entire reason
to exist (`SDK_GUIDE.md` section 1).

### Step 2 - Create a wallet-backed client

**Status: ? Proven** (`SailsClient` is fully implemented in v0.1; the
`baseUrl` + optional `wallet` constructor below is real, verified against
`packages/sails-sdk/src/client.ts`).

```typescript
import { SailsClient } from '@satsails/p2p-trading-sdk'

const sails = new SailsClient({
  baseUrl: 'http://localhost:3000',
})
```

The `wallet` field is optional - every authenticated method on
`SailsClient` works over plain HTTP/WS alone. Supplying one unlocks
the wallet-backed convenience methods (`getBalance`,
`getWalletAddresses`, `sendTransaction`, `signMessage`,
`getCapabilities`) and `identity.authenticateWithWallet()`; see
`docs/EXAMPLES.md` for the `MockWalletAdapter` reference implementation.

Everything past this line talks to `sails`, not to WDK, Pears, or QVAC
directly - those three stay infrastructure the protocol coordinates,
never things your wallet code calls into on its own (`PROJECT_CONTEXT.md`
section 3).

### Step 3 - Enable OpenP2P (negotiation)

**Status: ? Proven in the Reference Wallet** (`SailsClient` is fully
implemented in v0.1). This is the one module with real code today -
see `ARCHITECTURE.md` section 3 and section 4 (Actual Code Inventory) for
exactly what exists.

```typescript
// Discover offers (the discover() filter takes asset + side + optional
// pagination only - paymentMethod/price-range filters described in
// API_REFERENCE.md are aspirational, not yet implemented).
const matches = await sails.liquidity.discover({
  asset: 'BTC',
  side: 'BUY',
  limit: 10,
  offset: 0,
})

// Open a trade with the best match (requires an active session).
const trade = await sails.openp2p.trade(matches[0].id, '0.001')

const chat = sails.openp2p.chat(trade.id)
chat.onMessage((msg) => console.log(msg.content))
chat.send({ content: 'Sending payment now', msgType: 'TEXT' })
```

### Step 4 - Enable Settlement (escrow)

**Status: ? Proven** (`sails.settlement.create` / `lock` / `release` are
real implementations of MULTISIG, LIGHTNING_HODL, SAFE_GUARD_EVM,
WDK_USDT_EVM, and MOCK providers, all covered by integration tests).

```typescript
// create() takes an object body (EscrowType, lockedAmount, asset,
// network?, timelockHours?) - not positional args.
const escrow = await sails.settlement.create({
  tradeId: trade.id,
  type: 'MULTISIG',
  lockedAmount: '0.001',
  asset: 'BTC',
})
await sails.settlement.lock(escrow.id)
// buyer sends fiat directly to seller, shares proof via chat
await sails.settlement.release(escrow.id, buyerPayoutAddress)
```

This is the step that turns a negotiation into money actually moving -
non-custodially: Sails Protocol never holds the funds itself.

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
buildable yet — `@satsails/p2p-trading-sdk` has zero implementation
(`PROJECT_CONTEXT.md` section 4). Read `docs/ROADMAP.md` for when that
changes, and `docs/TODO.md` for the exact gap list. This document exists
so the target experience is unambiguous the moment the SDK ships — not
so it looks finished before it is.
