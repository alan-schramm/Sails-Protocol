# Getting Started

Commands only — no architectural context here, that's `PROJECT_CONTEXT.md`.
For the full narrated version of everything below, see `TRANSACTION_WALKTHROUGH.md`.

## 1. Run the server

No Node/npm on your host needed:

```bash
docker compose up -d --build   # Postgres + Redis + the server — http://localhost:3000
```

## 2. Run the full demo flow

```bash
npm run demo:qvac    # QVAC decides -> Pears connects the peers -> Intent Engine -> WDK settles
```

## 3. Use the SDK from your own code

```bash
npm install @satsails/p2p-trading-sdk   # not on npm yet — for now, workspace-link this monorepo, see docs/FAQ.md
```

```ts
import { SailsClient, MockWalletAdapter } from '@satsails/p2p-trading-sdk';

const wallet = new MockWalletAdapter({
  peerId: 'mock-peer',
  addresses: { BTC: 'bc1qmockaddress...' },
  balances: { BTC: '1.5' },
});
const client = new SailsClient({ baseUrl: 'http://localhost:3000', wallet });

const balance = await client.getBalance('BTC');
```

Swap `MockWalletAdapter` for a real one when you're ready —
`examples/wallet-integration/src/bitcoin-wallet-adapter.ts` is a
complete, tested, non-mock reference (`RealBitcoinWalletAdapter`).

## 4. Run the tests

```bash
npm test    # 600+ tests, no external infra needed
```

## The trade flow, conceptually

The full technical walkthrough (`TRANSACTION_WALKTHROUGH.md`) names every
file and function involved. This is the same flow with none of that —
just what happens, in order:

```
1. Offer published        Seller lists an asset/price/payment method
                                  │
2. Intent created         Buyer expresses "I want this" — validated,
                           never trusted as-is
                                  │
3. Peers connect          No central server — buyer and seller find
                           each other directly (Pears)
                                  │
4. Negotiate & agree       Terms confirmed over a private channel
                                  │
5. Escrow locked           Funds locked non-custodially — Sails Protocol
                           never holds the keys
                                  │
6. Payment sent            Off-chain leg (PIX, bank transfer, etc.)
                           happens outside the protocol
                                  │
7. Proof submitted         Evidence the payment happened, hashed and
                           recorded — not trusted blindly, verifiable
                                  │
8. Escrow released         Funds move to the buyer. If something's
                           wrong, step 8 becomes a dispute instead —
                           see RFC-021 for that path
```

## Which endpoint for which action

The full reference, with every field and edge case, is
`API_REFERENCE.md`. This is the lookup table for "I want to do X":

| I want to... | Call |
|---|---|
| Register a new identity | `POST /v1/identity/participants` |
| Log in | `POST /v1/identity/challenge` then `POST /v1/identity/authenticate` |
| Publish an offer | `POST /v1/liquidity/offers` |
| See available offers | `GET /v1/liquidity/offers` |
| See my own offers | `GET /v1/liquidity/offers/mine` |
| Express intent to trade | `POST /v1/intents` |
| Start a trade from an offer | `POST /v1/openp2p/trades` |
| Chat with my counterparty | `GET /v1/openp2p/chat/:tradeId/messages` |
| Create escrow for a trade | `POST /v1/settlement/escrow` |
| Lock funds in escrow | `POST /v1/settlement/escrow/:id/lock` |
| Mark payment as sent | `POST /v1/settlement/escrow/:id/payment-sent` |
| Submit proof of payment | `POST /v1/proof/proofs` |
| Release escrow to the buyer | `POST /v1/settlement/escrow/:id/release` |
| Open a dispute | `POST /v1/settlement/escrow/:id/dispute` |
| Check my reputation | `GET /v1/reputation/:participantId` |
| Rate a completed trade | `POST /v1/reputation/rate` |
| Start P2P networking | `POST /v1/peers/start` |

**Note:** `MULTISIG`/`LIGHTNING_HODL`/`SAFE_GUARD_EVM` escrow types don't
use `release` directly — client-held keys mean `initiate-release` +
`submit-transaction-signature` instead. `API_REFERENCE.md`'s Settlement
section covers the full per-type distinction.
