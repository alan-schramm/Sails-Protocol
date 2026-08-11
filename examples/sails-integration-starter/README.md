# Sails Integration Starter

A real, working starting point for integrating `@satsails/p2p-trading-sdk` — a Next.js
app that talks to a live Sails node, plus two standalone scripts that
run the actual protocol flows end-to-end. Everything here has been run
against a real local node while writing it; nothing in this package is
a mock of the protocol itself (the `wallet-mock/` folder is a mock of a
*wallet*, clearly labeled — see below).

## Quick start

This package is workspace-linked, not a standalone install — `@satsails/p2p-trading-sdk`
isn't published to npm yet, it only exists inside this monorepo (see
`docs/FAQ.md`). All commands below run from the **repo root**
(`sails-push-ready/`), not from this directory.

**Prerequisites:** Node.js 20+, npm. No Docker needed — local Postgres
and Redis are scripted (see step 2).

1. **Install** (one-time; time depends on your connection and whether
   native dependencies need to compile — a few native modules are
   pulled in transitively for Bitcoin/Lightning support):
   ```bash
   npm install
   ```

2. **Start local infra** (one-time per machine; downloads a Postgres
   binary and a Redis-protocol-compatible server on first run, both
   detached so they survive after the script exits):
   ```bash
   npm run db:local:start
   npm run redis:local:start
   ```

3. **Set up the database**:
   ```bash
   cp .env.example .env
   npm run db:generate
   npm run db:migrate
   ```

4. **Start the Sails node** (keep this running in its own terminal):
   ```bash
   npm run dev
   ```
   Confirm it's up: `curl http://localhost:3000/health` should return `200`.

5. **In a second terminal, start this starter's Next.js app**:
   ```bash
   npm run dev -w @sails/example-integration-starter
   ```
   Open http://localhost:3001 — the "Discover offers" section makes a
   real `liquidity.discover()` call against the node from step 4. An
   empty list is expected on a fresh database; publish an offer first
   (step 6) or via `examples/simple-wallet` to see one.

6. **Run the golden-path example** (optional, in a third terminal —
   publishes a real offer, opens a real trade, locks and releases a
   real escrow, and prints a `tradeId` you can paste into the "View a
   trade" section of the app from step 5):
   ```bash
   npm run example:p2p-bitcoin-trade -w @sails/example-integration-starter
   ```

Steps 4-6 are the ones you'll repeat on future sessions — once infra
(steps 1-3) is set up once, starting the node and this app back up
takes under a minute.

## What's in here

```
src/
  sails-integration/
    client.ts          — SailsClient singleton (browser-safe lazy init)
    intent-builder.ts  — real TradeIntentPayload helpers
    event-handler.ts   — wraps openp2p.chat()'s WebSocketChannel
  wallet-mock/          — a real WalletAdapter implementation with FAKE
                           values — reference for the shape, not a
                           wallet. Neither example script below needs it;
                           this protocol's identity layer doesn't require
                           a wallet at all (see docs/FAQ.md).
  ui/                    — thin re-exports of @satsails/sdk-react's real
                           TradeCard/StatusBadge components
  app/                   — the Next.js pages from the quick start above
examples/
  p2p-bitcoin-trade.ts        — standalone script, the golden path
  escrow-with-arbitration.ts  — standalone script, real dispute/arbitration
tests/
  integration.test.ts   — real unit tests for intent-builder.ts/event-handler.ts (TDD)
docs/
  ARCHITECTURE.md        — how the pieces connect, with real sequence diagrams
  USE_CASES.md            — what's actually provable today vs. planned
  FAQ.md
  API.md                  — index into @satsails/p2p-trading-sdk's real method surface
```

## The two example scripts, in more detail

- **`examples/p2p-bitcoin-trade.ts`** — mirrors `examples/simple-wallet`'s
  proven pattern: two independent `SailsClient`s (seller, buyer), full
  identity → publish → discover → trade → chat → escrow flow. Run with
  `npm run example:p2p-bitcoin-trade -w @sails/example-integration-starter`.

- **`examples/escrow-with-arbitration.ts`** — the same setup, but the
  buyer raises a dispute and a Trusted Arbitrator resolves it
  (RFC-007 D4). **Read this file's own header comment before running
  it** — dispute resolution needs a one-time `TRUSTED_ARBITRATORS`
  config step on a fresh node, and the script explains exactly what to
  do (it also runs safely without that step — it just stops with a
  clear message instead of a dispute that can't be resolved). Run with
  `npm run example:escrow-with-arbitration -w @sails/example-integration-starter`.

## Honesty notes (per this repo's own convention)

- Both scripts use the node's default escrow type (`MOCK` on this
  repo's own local `.env`), not `MULTISIG` — `MULTISIG` is genuinely
  non-custodial and needs real on-chain funding a script can't
  automate. See `docs/USE_CASES.md` and each script's own header for
  why, and what driving real `MULTISIG` by hand looks like.
- `negotiate()`/`submitProof()`/`releaseAsset()` on the SDK's Intent
  facade always throw `SailsNotImplementedError` — neither example uses
  them. See `docs/FAQ.md`.
- No NFT use case is provable today — no NFT `AssetType` exists. See
  `docs/USE_CASES.md`.
