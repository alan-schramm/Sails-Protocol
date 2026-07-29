# Use cases

Status tags follow this monorepo's own convention
(`docs/DEVELOPER_JOURNEY.md`): ✅ Proven (real code path, exercised
end-to-end in this repo), 🏗️ Partial (real but incomplete), 📋 Planned
(no implementation yet — stated plainly, not implied to exist).

## ✅ P2P asset swap (the protocol's core use case)

Two counterparties trade an asset for fiat (or another asset) with
neither side custodying the other's funds beyond the escrow window.
This is exactly `examples/p2p-bitcoin-trade.ts`: publish an offer,
discover it, open a trade, chat, lock funds in escrow, mark payment
sent, release. Every step is a real, tested route in this repo
(`src/modules/open-liquidity`, `open-p2p`, `open-settlement`).

Real asset support today (`AssetType`, `packages/sails-sdk/src/types.ts`):
`BTC`, `USDT_ERC20`, `USDT_TRC20`, `USDT_LIQUID`, `USDT_LIGHTNING`,
`LN_BTC`, `LIQUID_BTC`, `SPARK`, `STACKS`, `RSK_BTC`.

## ✅ Freelancer / milestone escrow

A client and a freelancer use a Trade + Settlement escrow exactly like
the P2P swap above, but the "asset" side is the freelancer's fiat
payout and the "payment" side is the deliverable. No protocol change is
needed for this — `openp2p.chat()` carries milestone updates and
deliverable links off-protocol, and the client releases the escrow
(`settlement.release()`) once satisfied, or raises a dispute
(`settlement.dispute()`) if not. This is a real, working pattern today,
not a planned feature — it's the same code path as
`examples/escrow-with-arbitration.ts`, just narrated differently:

- Client creates/locks the escrow after milestone 1 is agreed.
- Freelancer delivers, client releases (or disputes, and a Trusted
  Arbitrator — RFC-007 D4 — rules).

The one real gap: there's no dedicated "milestone" primitive — the
whole payout is one escrow amount, released or refunded as a unit.
Multi-milestone work needs multiple sequential Trade/Escrow pairs today
(a real, documented limitation, not hidden).

## 📋 NFT settlement — Planned, not implemented

There is **no NFT `AssetType`** in the current SDK (see the list above —
it's Bitcoin/USDT/sidechain-flavored only). An NFT marketplace or
collectible-swap use case would need a new `AssetType` value and
matching `SettlementProvider` (mirroring how `SAFE_GUARD_EVM`,
RFC-020, was added for EVM smart-account settlement) — real, scoped,
buildable work, but not started. Do not present this as working; it
isn't.

## What every use case above shares

- Identity is Ed25519 challenge-response (`identity.create` +
  `identity.authenticate`) — no wallet connection is required to trade.
  `src/wallet-mock/` in this starter shows the *separate*, optional
  `WalletAdapter` extension point (for apps that also want on-chain
  signing), which none of the use cases above actually require.
- `negotiate()`, `submitProof()`, and `releaseAsset()` on the SDK's
  six-verb Intent facade always throw `SailsNotImplementedError` today
  — every real flow above goes through the lower-level
  `settlement.*`/`openp2p.*` methods instead, not the facade's
  unimplemented verbs.
