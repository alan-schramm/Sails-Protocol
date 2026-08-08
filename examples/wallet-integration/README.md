# @sails/example-wallet-integration

`PRODUCTION_READINESS_FIXES.md` item 22 — a real (non-mock) `WalletAdapter`
integration, for both of `@sails/sdk`'s genuinely non-custodial escrow
types: **MULTISIG** (Bitcoin) and **SAFE_GUARD_EVM** (EVM). Unlike
[`examples/simple-wallet`](../simple-wallet) (WDK_USDT_EVM — one
server-held seed signs everything, no client wallet needed at all), both
flows here generate a real private key in this process, submit only the
public half to the server, and sign the actual settlement transaction
client-side — the server never sees a private key.

## Why two wallets, not one

A real wallet only meaningfully implements `WalletAdapter` for the asset
it actually custodies. `RealBitcoinWalletAdapter` (secp256k1, via
`@sails/sdk`'s own `generateEscrowKeypair()`/`signEscrowPsbt()`) and
`RealEvmWalletAdapter` (secp256k1, via `ethers`) both throw a clear,
specific error for `getPeerId()`/`signMessage()` — Sails session identity
uses a *separate* Ed25519 keypair (`SailsClient.identity.create()`), a
different key material serving a different protocol layer (session auth
vs. fund custody). A real hardware wallet integrating this SDK would have
the exact same boundary — this isn't a shortcut, it's the honest shape of
the problem.

## Prerequisites

1. **A Sails node running locally**: `npm run dev` from the repo root
   (see `docs/DEVELOPER_JOURNEY.md`).
2. **Real testnet funds** — each flow prints the exact address to fund
   partway through:
   - Bitcoin: a public Bitcoin **testnet3** faucet (search "bitcoin
     testnet3 faucet") sending to the real 2-of-3 P2WSH deposit address
     the flow prints (**not** either wallet's own address — see the
     script's own comments for why).
   - EVM: a public **Sepolia** faucet (e.g. `sepoliafaucet.com`) sending
     to the real CREATE2 guard address the flow prints (it can receive
     funds before the Safe contract is actually deployed).
3. **EVM only, for the final step**: the server needs
   `SAFE_GUARD_EVM_BUNDLER_URL` configured (a real ERC-4337 bundler —
   Pimlico, Alchemy, and Stackup all expose the standard
   `eth_sendUserOperation` RPC method `safe-guard-evm.provider.ts` calls).
   Without it, the flow completes through funding/locking/signing and
   fails with a clear, specific error at the final broadcast — a real
   infrastructure gap, not a bug in this example or the SDK.

## Running

```bash
npm run start:bitcoin -w @sails/example-wallet-integration
npm run start:evm -w @sails/example-wallet-integration
```

Override the target node or RPC with `SAILS_BASE_URL`/`SEPOLIA_RPC_URL`.

## What's actually verified vs. what needs live infrastructure

Both wallet adapters' own logic (key generation, address derivation,
signing) has real, network-free unit tests in `tests/wallet-adapters.test.ts`
— run with the rest of the repo's suite (`npm test` from the repo root;
this package's `tests/` directory is already covered by the root
`jest.config.js`'s `testMatch`). The end-to-end flow scripts
(`src/bitcoin.ts`/`src/evm.ts`) need a live server, a live testnet, and
(for EVM) a live bundler to actually complete — the same honest
limitation `examples/demo/multisig-testnet-flow.ts` already discloses for
its own environment. Every step up to "send funds to this address" runs
with nothing but a running local Sails node.

## Custody model — read this before using either pattern with real value

Both wallets generate a fresh keypair on every run, held only in this
process's memory — there is no persistence, no secure storage, no backup.
This is a *reference pattern* for how a real wallet would wire up
`WalletAdapter`, not a wallet itself. A production integration must
handle key storage/backup with the same rigor any real Bitcoin/EVM
wallet already requires — nothing here substitutes for that.
