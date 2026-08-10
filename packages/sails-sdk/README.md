# `@sails/sdk` — Sails P2P Trading SDK

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](../../LICENSE)
[![CI](https://github.com/alan-schramm/Sails-Protocol/actions/workflows/ci.yml/badge.svg)](https://github.com/alan-schramm/Sails-Protocol/actions/workflows/ci.yml)

<!-- No npm version badge yet — not published to any npm registry (see
     the root README's identical note); a badge pointing at a 404 is
     worse than no badge. -->

The single typed client a wallet/fintech imports to reach every Sails
Protocol module (OpenIdentity, OpenLiquidity, OpenP2P, OpenSettlement,
OpenReputation, OpenProof, OpenAgents) over HTTP/WebSocket. See
[`docs/SDK_GUIDE.md`](../../docs/SDK_GUIDE.md) for the full interface
specification, [`docs/API_STABLE.md`](../../docs/API_STABLE.md) for the
frozen no-breaking-changes contract, and [`docs/EXAMPLES.md`](../../docs/EXAMPLES.md)
for working code snippets.

## Quick start

```ts
import { SailsClient } from "@sails/sdk"

const client = new SailsClient({
  baseUrl: "http://localhost:3000",
})

// Register a participant and authenticate (Ed25519 challenge-response,
// byte-for-byte equivalent to src/common/middleware/auth.ts on the server).
const { keypair } = await client.identity.create()
await client.identity.authenticate(keypair)

// Discover offers and create a trade
const { offers } = await client.liquidity.discover({
  asset: "BTC",
  side: "BUY",
  limit: 10,
})
const trade = await client.openp2p.trade(offers[0].id, "0.001")

// Open the negotiation chat channel (WebSocket, real reconnect-with-backoff)
const chat = client.openp2p.chat(trade.id)
chat.onMessage((msg) => console.log(msg.content))
chat.send({ content: "Sending payment now", msgType: "TEXT" })
```

The SDK works in both Node.js (18+/20+/22+) and modern browsers. It
has no Node-only dependencies beyond `tweetnacl` (pure JS Ed25519).

## Module map

| Protocol name | Friendly alias | Source | What it does |
| --- | --- | --- | --- |
| `client.identity` | `client.auth` | `modules/identity.ts` | Register a Participant, Ed25519 challenge-response auth, session management |
| `client.liquidity` | `client.offers` | `modules/liquidity.ts` | Publish/discover/manage Offers, the order book |
| `client.openp2p` | `client.trades` | `modules/openp2p.ts` | Open/manage a Trade, real-time chat (`chat(tradeId)`) |
| `client.settlement` | `client.escrow` | `modules/settlement.ts` | Escrow lifecycle: create, lock, release, refund, dispute |
| `client.reputation` | `client.trustScore` | `modules/reputation.ts` | Reputation score, leaderboard, rating submission |
| `client.peers` | — | `modules/peers.ts` | P2P transport node (start/stop, topic/trade rooms) |
| `client.capabilities` | — | `modules/capabilities.ts` | RFC-013 Capability Registry: register/list/revoke grants |
| `client.arbitration` | — | `modules/arbitration.ts` | RFC-021 D2: permissionless arbiter registration |
| `client.paymentAccounts` | — | `modules/payment-account.ts` | RFC-021 D5: payment-account trust ramp |
| `client.proof` | — | `modules/proof.ts` | RFC-006 OpenProof: claims, proofs, verification |

The Intent-oriented facade (`client.createIntent`, `cancelIntent`,
`dispute`, `submitProof`, `releaseAsset`) is the recommended path for
most applications; the module-level methods above are for advanced/direct
use. Only `client.negotiate` still throws `SailsNotImplementedError` —
see `intent-facade.ts`'s own header for the architectural reason.

## Wallet adapter (optional)

`SailsClient` accepts an optional `wallet: WalletAdapter` for wallet
integration. Without one, every wallet-requiring method (`getBalance`,
`sendTransaction`, `signMessage`, `getWalletAddresses`,
`getCapabilities`) throws a clear `SailsTransportError` pointing at the
fix. See [`docs/EXAMPLES.md`](../../docs/EXAMPLES.md) and
[`packages/sails-sdk/src/wallet-adapter-mock.ts`](src/wallet-adapter-mock.ts)
for a reference implementation.

## Build

```bash
npm run build -w @sails/sdk    # produces dist/ via tsup
npm test -w @sails/sdk         # jest + ts-jest, 33 tests
npm run typecheck -w @sails/sdk # tsc --noEmit
```

## License

Apache-2.0 (same as the rest of this repository).
