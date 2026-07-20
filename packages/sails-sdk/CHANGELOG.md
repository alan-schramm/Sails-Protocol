# Changelog

All notable changes to `@sails/sdk` are documented here. Format loosely
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

**Note on versioning:** this package has stayed at `0.1.0` throughout
everything below — it has not been version-bumped, and is not yet
published to any npm registry (confirmed via `npm view @sails/sdk` →
404, 2026-07-20). `docs/API_STABLE.md` is the actual frozen-API
contract; per that document, `0.1` becomes `1.0` once this SDK has had
real external usage (a real wallet/client consuming it in production) —
not before. This file uses `[Unreleased]` for that reason, even though
every entry below is already in `main`.

## [Unreleased]

Everything below has landed on `main` at `0.1.0`. Nothing has been
tagged or published yet.

### Added
- Initial SDK: `SailsClient`, the Transport layer, and six Protocol SDK
  modules — `identity`, `reputation`, `liquidity`, `openp2p`,
  `settlement`, `peers` — plus the Intent-oriented six-verb facade
  (`createIntent`/`cancelIntent`/`negotiate`/`submitProof`/
  `releaseAsset`/`dispute`).
- `capabilities` module and `WalletAdapter` (RFC-013: Capability
  Registry + portable identity via `peerId`).
- `openp2p.getTradeByIntent(intentId)` — RFC-018's Intent→Trade link,
  exposed directly.
- Friendly aliases on `SailsClient`: `auth`/`offers`/`trades`/`escrow`/
  `trustScore`, each the exact same instance as its protocol-name
  counterpart (`identity`/`liquidity`/`openp2p`/`settlement`/
  `reputation`) — not a rename, both frozen together. See
  `docs/API_STABLE.md`.
- `liquidity.discover()` gained optional `limit`/`offset` (default 10,
  max 50) — see Fixed below for why.
- `examples/simple-wallet` — a real, mock-free integration example
  using only this package's public API, proving the full golden path
  (register → publish → discover → trade → chat → escrow → release)
  works end to end.
- TypeDoc config (`npm run docs` from this package) generates browsable
  API docs from source + JSDoc directly.

### Fixed
- `dispute(intentId, reason)` — was a hardcoded `SailsNotImplementedError`
  stub; now resolves the real Trade/Escrow behind an `intentId` and
  performs a real dispute. `negotiate()`/`submitProof()`/`releaseAsset()`
  remain honest stubs (their server-side primitives don't exist yet) —
  their thrown messages were corrected to name the real, specific
  blocker instead of a generic "not implemented."
- `liquidity.discover()`/`liquidity.book()` were typed as returning the
  persisted `Offer` shape; the real route
  (`GET /v1/liquidity/offers`) returns a materially different
  aggregation shape (`LiquidityOfferSummary` — `paymentMethods[]` not
  `paymentMethod`, no `userId`/`status`, an aggregation-only `source`).
  Corrected to match the real response, found wiring the first real
  caller (`packages/sails-ui`).
- `openp2p.chat()`'s delivered message events were typed with the
  persisted `Message` row's field names (`id`, `createdAt`); the real
  WS `NEW_MESSAGE` frame payload uses different names (`messageId`,
  `timestamp`, no `readAt`). Corrected, same root cause as above — a
  live WS round trip was never exercised by this package's own tests
  until a real caller existed.
- `intent-facade.ts`'s `createIntent()` had an authorization gap
  (accepted a caller-supplied identity in the request body instead of
  deriving it from the authenticated session) — closed as part of a
  broader gap audit across the reference implementation.
- `Trade`'s type didn't expose the seller's payment details
  (`paymentDetails`, e.g. a PIX key) — added, so a buyer can actually
  see how to pay.
- `liquidity.discover()`'s hard `take: 10` cap (no pagination) meant a
  normally-priced new offer could be silently invisible on any
  sufficiently active marketplace — the exact failure a dogfooding pass
  (`examples/simple-wallet`) hit on its first real run. Fixed with the
  `limit`/`offset` params above (backend: `liquidity.service.ts`,
  `liquidity.routes.ts`). The same default-limit gap was also live in
  `packages/sails-ui`'s actual Marketplace screen
  (`realOffers.ts` calling `discover()` with no `limit`) — fixed there
  too, a real user-facing bug, not just a test artifact.

### Changed
- `reputation` intentionally has **no** `profile` alias — that module
  only returns a numeric trust score (`get`/`leaderboard`/`rate`), never
  displayName/avatar/trade history (that's `identity`), so `profile`
  would have promised more than it returns. Named `trustScore` instead.
- Dependency versions bumped across a Dependabot major-version sweep
  (TypeScript intentionally held back to avoid unrelated breakage).

### Verified, not changed
- **Package footprint:** `npm pack` → 22.3 kB packed / 77.4 kB unpacked,
  31 files (2026-07-20).
- **Standalone install:** installed the packed tarball into a folder
  with zero relation to this monorepo (no workspace symlinks, no shared
  `node_modules`) and ran a smoke script exercising every module, every
  alias, `generateKeypair()`, and the error classes — all worked
  identically to running inside the workspace.
- **Tree-shaking: does not apply today.** `package.json` only declares
  `main` (CommonJS) — no `module`/`exports`/`sideEffects` fields, no ESM
  build. Real tree-shaking requires static ESM analysis; a CJS-only
  package like this one cannot be meaningfully tree-shaken by any
  bundler regardless of how imports are written at the call site. Not
  fixed here — a dual CJS/ESM build is new packaging infrastructure,
  out of scope for this hardening pass (docs/TODO.md §15's freeze:
  verify and hold the line, don't add).
- **Node version:** verified against Node 24.16.0 only (this
  environment's only available runtime — no `nvm`/`fnm` present to test
  Node 20/22 LTS). Registered as an open verification gap, not silently
  claimed.
