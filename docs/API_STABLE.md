# @sails/sdk — Stable API (frozen as of v0.1)

This is the CTO-directed SDK hardening commitment (docs/TODO.md §25/§26):
now that `@sails/sdk` is the primary product surface, the goal is no
longer "add more" — it's "make every name below safe for a wallet to
build against and never have it move." Everything listed here is public,
stable, real (not aspirational — verified against the actual source
files at the paths given, not against older prose docs known to have
drifted, see SDK_GUIDE.md's/liquidity.ts's own header comments), and
tested.

## The freeze commitment

**No breaking changes to anything in this document until v1.** That
means, for every name below: the property will keep existing on
`SailsClient`, will keep pointing at a module with these methods, and
those methods' parameter/return shapes will not change incompatibly.
New optional parameters, new methods, and new modules may be added —
those are additive, not breaking. If a real design mistake is found
before v1 that genuinely requires a breaking change, it will be called
out explicitly as an exception here, not made silently.

## Two names, one client — why

Different integrators reach for different vocabulary. A developer
building specifically for the P2P trading vertical thinks in
"offers/trades/escrow." A developer coming from general wallet/fintech
SDKs (Auth0, Stripe-style) thinks in "auth." Both should land on working
code without learning protocol-internal module names first — so every
module below has a **protocol name** (matches this repo's own
`src/modules/open-*` folder names, RFC-accurate) and, where one makes
sense, a **friendly alias**. An alias is not a separate module and is
never "the old name being deprecated" — `sdk.auth` and `sdk.identity`
are the literal same object (`packages/sails-sdk/src/client.ts`,
enforced by `packages/sails-sdk/tests/client.test.ts`'s
`client.auth === client.identity`-style assertions). Both names are
frozen together, permanently, as of v0.1.

Every property listed below (both names, in every pair) carries its own
JSDoc `@see`/alias pointer in `packages/sails-sdk/src/client.ts`, which
`tsc`'s `declaration: true` output preserves into the published
`.d.ts` — so hovering `sdk.auth` in an editor shows "alias for
`sdk.identity`, same instance" directly, without needing this document
open. The goal: two names in autocomplete should never be confusing,
only convenient.

One deliberate non-alias: `reputation` has **no** `profile` alias. This
module only returns a numeric trust score plus a leaderboard and rating
submission (`get`/`leaderboard`/`rate`) — it has no displayName, avatar,
or trade history (that data lives on `identity`). Calling it `profile`
would promise more than it returns, so the friendly name is
`trustScore` instead — it says what the module actually is.

## Modules

| Protocol name | Friendly alias | Source | What it does |
|---|---|---|---|
| `sdk.identity` | `sdk.auth` | `modules/identity.ts` | Register a Participant, Ed25519 challenge-response auth, session management |
| `sdk.liquidity` | `sdk.offers` | `modules/liquidity.ts` | Publish/discover/manage Offers, the order book |
| `sdk.openp2p` | `sdk.trades` | `modules/openp2p.ts` | Open/manage a Trade, real-time chat (`sdk.trades.chat(tradeId)` — chat has no separate module or alias, it lives here) |
| `sdk.settlement` | `sdk.escrow` | `modules/settlement.ts` | Escrow lifecycle: create, lock, release, refund, dispute |
| `sdk.reputation` | `sdk.trustScore` | `modules/reputation.ts` | Reputation score, leaderboard, rating submission |
| `sdk.peers` | — | `modules/peers.ts` | P2P transport node (start/stop, topic/trade rooms, direct offer broadcast) |
| `sdk.capabilities` | — | `modules/capabilities.ts` | RFC-013 Capability Registry: register/list/revoke capability grants |
| `sdk.intents` (private; see below) | — | `intent-facade.ts` | The six-verb Intent-oriented facade |

`sdk.peers` and `sdk.capabilities` have no friendly alias — both names
are already the plain-English word for what they do; a second name
would just be a synonym, not a real accessibility gain.

## Method inventory

### `identity` / `auth`
- `create(keypair?, displayName?)` → `{ participant, keypair }`
- `createWithPublicKey(publicKeyHex, displayName?)` → `Participant` *(wallet-backed registration — no keypair object, no secretKey; closes `PRODUCTION_READINESS_REVIEW.md`'s finding #3, 2026-08-02)*
- `get(participantId)` → `Participant`
- `me()` → `Participant` *(requires session)*
- `challenge(publicKeyHex)` → `{ challenge, expiresIn }`
- `authenticate(keypair)` → `{ participantId, sessionToken }` — also stores the session on the client
- `authenticateWithWallet(publicKeyHex, wallet)` → `{ participantId, sessionToken }` *(wallet-backed sign-in — `wallet: { signMessage(message: Uint8Array): Promise<Uint8Array> }`, never touches a raw secretKey; same session-storage side effect as `authenticate()`)*
- Standalone helper: `generateKeypair()` (not a method — a top-level SDK export)

### `liquidity` / `offers`
- `discover({ asset, side, limit?, offset? })` → `{ offers, sources }` (`limit`/`offset` added 2026-07-20, docs/TODO.md §25 — default `limit` 10, max 50)
- `getOffer(offerId)` → `Offer & { user: Participant }`
- `publish(input)` → `Offer` *(requires session)*
- `book(asset)` → `OrderBook`
- `updateStatus(offerId, status)` → `Offer` *(requires session)*
- `match({ asset, side, amount })` → `LiquidityOfferSummary | null`
- `getMyOffers()` → `Offer[]` *(requires session; additive, 2026-08-01 —
  the authenticated caller's own offers including non-ACTIVE ones, real
  `Offer` rows, not the `LiquidityOfferSummary` aggregation shape
  `discover()`/`book()` return. Added for a real caller,
  `packages/sails-ui`'s Profile screen — `GET /v1/liquidity/offers/mine`)*

### `openp2p` / `trades`
- `trade(offerId, amount)` → `Trade` *(requires session)*
- `getTrade(tradeId)` → `Trade`
- `getTradeByIntent(intentId)` → `Trade`
- `updateTradeStatus(tradeId, status)` → `Trade` *(requires session)*
- `getMessages(tradeId)` → `Message[]` *(requires session)*
- `chat(tradeId, options?)` → `WebSocketChannel` *(requires session)* — `.onMessage()`, `.onEvent()`, `.send()`, `.leave()`, `.close()`, `.onConnectionStateChange()`. Real reconnect-with-backoff by default as of 2026-08-02 (`options: WebSocketChannelOptions` — additive, `chat()`'s own signature was never frozen beyond its return type); `WebSocketChannel`'s own constructor changed shape (a socket factory, not a bare `WebSocket`) to make that possible — a disclosed, deliberate exception, not something `chat()` callers ever see

### `settlement` / `escrow`
- `create(input)` → `Escrow` *(requires session)*
- `get(escrowId)` → `Escrow`
- `submitKey(escrowId, pubkeyHex)` → `{ escrow, buyerKeySubmitted, sellerKeySubmitted }` *(requires session; MULTISIG/LIGHTNING_HODL client-held-keys path)*
- `lock(escrowId)` → `Escrow` *(requires session)*
- `markPaymentSent(escrowId)` → `Escrow` *(requires session)*
- `release(escrowId, toAddress)` → `Escrow` *(requires session)*
- `dispute(escrowId, reason, evidence?)` → `Dispute` *(requires session)*
- `refund(escrowId)` → `Escrow` *(requires session)*
- `initiateRelease(escrowId, toAddress)` → `EscrowPendingTransaction` *(requires session; MULTISIG multi-signer release, does not itself move funds)*
- `initiateRefund(escrowId)` → `EscrowPendingTransaction` *(requires session; mirror of `initiateRelease`)*
- `submitTransactionSignature(escrowId, signedPsbtBase64)` → `{ complete }` *(requires session)*
- `getPendingTransaction(escrowId)` → `EscrowPendingTransaction`
- `listDisputes(pagination?)` → `PaginatedDisputes` *(requires session; UI-audit gap closed 2026-08-03 — always scoped to the caller's own arbiterId, never a client-supplied filter)*
- `getDispute(disputeId)` → `Dispute` *(public read; UI-audit gap closed 2026-08-03)*
- `resolveDispute(disputeId, ruling, releaseToAddress?)` → `Dispute` *(requires session + assigned arbiter)*
- `appealDispute(disputeId)` → `{ dispute, appealFeeRequired }` *(requires session + trade party; RFC-021 D6, market arbitration mode only)*
- `submitDisputeEvidence(disputeId, descriptor)` → `Dispute` *(requires session + trade party; RFC-021 D8, may trigger a QVAC auto-resolution attempt server-side)*
- `contestAutoResolution(disputeId)` → `Dispute` *(requires session + trade party; RFC-021 D8, rejects a proposed automated ruling)*
- `parseSafeGuardBundle(unsignedPsbtBase64)` → `SafeGuardBundle` *(pure parsing helper, no transport call; SAFE_GUARD_EVM only — decodes the Safe Guard deployment info a `create()`/`initiateRelease()` response carries for that escrow type)*
- `signEscrowSafeUserOp(unsignedPsbtBase64, privateKey)` → `string` *(top-level SDK export, not a `settlement` method — same client-held-key pattern as `signEscrowPsbt()`/`signEscrowArkTx()`; produces a `0x`-prefixed 65-byte ECDSA signature over the bundle's `userOpHash`, ready for `submitTransactionSignature()`; UI-audit gap closed 2026-08-03 — SAFE_GUARD_EVM disputes were previously stuck forever with no way to actually produce this signature client-side)*

### `reputation` / `trustScore`
- `get(participantId)` → `ReputationScore`
- `leaderboard(limit?)` → `ReputationScore[]`
- `rate(input)` → informational only, does not affect the score `get()` returns *(requires session)*
- `vouchFor(voucheeId)` → `Vouch` *(requires session; RFC-021 D7 peer vouching — caller must have real trade history, own reputation is slashed if the vouchee's first payment account is later abused)*

### `peers`
- `start(secretKeyBase64)` → `{ peerId }`
- `stop()` → `void`
- `status()` → `PeerStatus`
- `joinTopic(topic)` → `void`
- `joinTrade(tradeId)` → `void`
- `broadcastOffer(input)` → `{ deliveredTo }`

### `capabilities`
- `register(input)` → `CapabilityGrant`
- `list(participantId)` → `CapabilityGrant[]`
- `revoke(grantId)` → `void`
- `registerFromWallet(wallet)` → `CapabilityGrant`

### Top-level (Intent facade, delegated straight off `SailsClient`)
`createIntent`, `cancelIntent`, `dispute`, `submitProof(intentId,
proof)`, and `releaseAsset(intentId, toAddress)` are all real as of
2026-08-01 — the last two were previously believed blocked
(`submitProof` on a missing Proof-primitive route that turned out to
already exist; `releaseAsset` on a missing `toAddress` parameter, now
added). Only `negotiate` still throws `SailsNotImplementedError` — the
canonical fire-and-forget signature can't represent the real
`WebSocketChannel` negotiation channel (`intent-facade.ts`'s own header
has the full reasoning). `negotiate` is **not** frozen — its
throw-vs-real status is expected to change before v1, and `releaseAsset`
gaining a required `toAddress` parameter is this document's own
precedent for why that kind of change is additive, not breaking, for
these six-verb methods specifically.

### Escape hatch
`setSessionToken(token)` / `getSessionToken()` — direct session control,
shared by every module and every alias (same transport underneath).

## What "v1" means for this document

Once the integration-test and dogfooding passes (docs/TODO.md §25 and
its follow-ups) are done and this SDK has had real external usage, `0.1`
becomes `1.0` and this document's freeze becomes the literal SemVer
contract: a breaking change to anything above requires a major version
bump. Nothing here changes about how frozen it already is — v0.1 is
being held to the same bar starting now, deliberately, so there is no
last-minute scramble of breaking changes right before the version
number changes.
