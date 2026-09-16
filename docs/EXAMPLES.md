# Examples for Sails SDK usage

This document provides quick code snippets demonstrating how to use the
wallet-requiring convenience methods on `SailsClient`. Every example here
matches the actual signatures in `packages/sails-sdk/src/client.ts` and
has been validated against `packages/sails-sdk/tests/client-wallet.test.ts`.

> **Note**: `SailsClient` accepts an optional `wallet` parameter (a
> `WalletAdapter`). Every wallet-requiring method throws a clear
> `SailsTransportError` if no wallet adapter is configured.

## Basic setup

```ts
import { SailsClient, MockWalletAdapter } from "@satsails/p2p-trading-sdk"

const wallet = new MockWalletAdapter({
  peerId: "mock-peer",
  addresses: { BTC: "bc1qmockaddress..." },
  balances: { BTC: "1.5" },
})

const client = new SailsClient({
  baseUrl: "http://localhost:3000",
  wallet,
})
```

`MockWalletAdapter` is part of the public package surface so an external
consumer can use the same import shown above after `npm install
@satsails/p2p-trading-sdk`. It is a convenience for local development,
examples and tests — not a production wallet implementation.

> The `wallet` field is optional. The SDK is fully functional over
> HTTP/WS alone — every module method works without a wallet adapter.
> Supplying one unlocks the methods below plus
> `capabilities.registerFromWallet()` and the wallet-backed
> `identity.authenticateWithWallet()`.

## Get balance

```ts
const balance = await client.getBalance("BTC")
console.log("BTC balance:", balance) // "1.5"
```

## Get addresses

```ts
const addresses = await client.getWalletAddresses()
console.log("All wallet addresses:", addresses)
// ["bc1qmockaddress..."]
```

## Sign + broadcast a transaction

```ts
// sendTransaction signature: sendTransaction(asset: string, tx: unknown)
// — the SDK signs the tx via wallet.signTransaction() then broadcasts
// the result via wallet.broadcastTransaction() and returns the txid.
const txHash = await client.sendTransaction("BTC", {
  to: "bc1qrecipient...",
  value: "0.001",
})
console.log("Transaction hash:", txHash)
```

## Sign an arbitrary message

```ts
const message = new Uint8Array([1, 2, 3])
const signed = await client.signMessage(message)
console.log("Signed message bytes:", signed)
```

## Query wallet capabilities

```ts
const caps = await client.getCapabilities()
console.log("Wallet capabilities:", caps)
// { assets: [...], fiatRails: [...], supportsP2PTrading, supportsOnchainSettlement }
```

## Set / get the session token

Every authenticated method reads the session token from the same
in-memory store `identity.authenticate()` writes to. If you're
loading the token from your own secure storage instead, set it once at
boot:

```ts
client.setSessionToken("session-from-your-secure-store")

// later, anywhere in your app:
const me = await client.identity.me()
```

## Moving from mock to a real wallet

These snippets prove the wallet-requiring convenience surface with the
public mock. A real wallet should implement the public `WalletAdapter`
interface and keep responsibility for its own key storage, signing,
address/balance lookup, transaction broadcast and any transport cleanup.
Sails consumes that interface; it does not take ownership of those wallet
responsibilities.

For the canonical non-mock references, including real Bitcoin and EVM
adapter/signing boundaries, see
[`examples/wallet-integration`](../examples/wallet-integration).

These snippets can be copied into a file (e.g., `example.ts`) and run with
`ts-node` after installing the SDK and a local Sails node (see the
root `README.md` for the one-liner that starts one).
