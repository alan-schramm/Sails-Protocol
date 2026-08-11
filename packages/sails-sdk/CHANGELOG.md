# Changelog

All notable changes to `@satsails/p2p-trading-sdk` are documented here. Format loosely
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

**Note on versioning:** published to npm 2026-08-10 as
`@satsails/p2p-trading-sdk@0.1.0` (public, under the `@satsails` org
scope — corrected/updated 2026-08-11, superseding the "not published"
note that used to sit here). `v1.0.0-rc1` below is a **release
candidate**, not a final `1.0.0` — by SemVer, `1.0.0-rc1` has *lower*
precedence than `1.0.0` itself. `docs/API_STABLE.md`'s freeze
commitment ("0.1 becomes 1.0 once this SDK has had real external
usage") is not contradicted by tagging an RC: an RC is exactly "this is
what we believe 1.0.0 will be, pending a real consumer proving it out"
— the actual `1.0.0` tag still waits for that.

**A real gotcha found trying to bump `package.json`'s own `"version"`
field to match** (`0.1.0` → `1.0.0-rc1`): `packages/sails-ui/package.json`
declares `"@satsails/p2p-trading-sdk": "^0.1.0"`. The moment the local package's version
moved outside that range, `npm install` stopped treating it as a
workspace-local symlink and tried to satisfy the range from the real
npm registry instead — which 404s, since nothing is published. Reverted
immediately (confirmed `npm install` clean again after). **Consequence:**
the git tag `v1.0.0-rc1` and this changelog heading are intentionally
decoupled from `package.json`'s `"version"` field, which stays `0.1.0`
until either a real publish happens or every workspace consumer's
declared range is widened at the same time — not something to do
silently as a side effect of tagging a release candidate.

## [0.1.1] - 2026-08-11

### Fixed
- `custody/kms-signer.ts`'s lazy `import('@aws-sdk/client-kms')` now
  carries `webpackIgnore`/`turbopackIgnore` magic comments. Found via
  an actual standalone Next.js/Turbopack build of `0.1.0` pulled fresh
  from npm (not `tsc`/`jest`, which both erase this to a plain runtime
  call and never catch it): browser bundlers statically resolve every
  `import()` at build time regardless of whether it's ever reached, so
  any client-side consumer without `@aws-sdk/client-kms` installed hit
  a hard build failure — even one that never instantiates
  `SailsSignerService`. No API or Node.js runtime behavior change.

## [Unreleased]

### Added
- `WebSocketChannel` now sends a real heartbeat (`PING` every 30s by default,
  force-closes if no `PONG` arrives within 60s) to catch "zombie
  connections" — a socket object that's still open but whose underlying
  network path silently died, with no `close` event ever firing on its own
  (CTO_DUE_DILIGENCE_REPORT.md A-STA-03, closed 2026-08-08). The force-close
  feeds into the exact same reconnect-with-backoff path a real network drop
  already uses. New `WebSocketChannelOptions` fields: `heartbeat` (default
  `true`), `heartbeatIntervalMs` (default `30000`), `heartbeatTimeoutMs`
  (default `60000`) — all additive, no existing caller's code needs to
  change. The server side (`chat.routes.ts`) already answered `PING` with
  `PONG`; only the client side was silent.
- `SailsClient.proof` — now exposes the `SailsProofModule` (RFC-006, RFC-007) as
  `client.proof`, with `assertClaim()`, `submitProof()`, `issueVerificationNonce()`,
  `verifyProof()`, and `getEvidenceBundle()`. Previously the module existed as a
  standalone export but was never wired onto `SailsClient`.
- `Proof` and `Verification` types exported from the package root (both were
  already defined in `types.ts` but not re-exported from `index.ts`).
- `useSailsProof()` React hook in `@satsails/sdk-react` — wraps all five
  `SailsProofModule` methods with TanStack Query (`getEvidenceBundle` query,
  `assertClaim`/`submitProof`/`issueVerificationNonce`/`verifyProof` mutations).
  10 tests (5 success-path + 5 error-state) added to `tests/useSailsProof.test.tsx`.

### Changed
- `liquidity.discover()` (and the underlying backend
  `LiquidityRouter.getAggregatedOffers()`) now returns `{ offers, sources,
  total, hasMore }` instead of `{ offers, sources }`. The backend now applies
  global pagination (sort-then-slice across all aggregated providers) rather
  than per-provider pagination, and returns the total count and `hasMore`
  flag directly. `getOrderBook()` is unaffected — it only reads `.offers`
  from each side's result.
- `docs/SDK_GUIDE.md` section 2 updated to document `discove()`'s new
  `DiscoverResult` shape (with `total`/`hasMore`), plus the previously-undocumented
  `approveRelease()`, `getReleaseApprovals()`, `registerArbiter()`,
  `getArbiterProfile()`, `reconcileTrade()`, `getScoreByPeerId()`, and the
  full `proof:` namespace.

## [1.0.0-rc1] - 2026-07-20

Release-candidate audit pass (docs/TODO.md §28) — a final check for
internal implementation details leaked onto the public surface, before
handoff to ongoing maintenance. No new features; only real problems
found and fixed.

### Fixed (this audit)
- `SailsTransport`/`SailsTransportOptions` were re-exported from the
  public package root despite zero documented use case and zero real
  external usage — removed from the public surface (still exported
  from `transport.ts` itself for this package's own internal use).
- `SailsIntentFacade` (the class) was re-exported from the public
  package root despite `SailsClient.intents` being deliberately
  `private` specifically to prevent exactly this — a caller could
  construct one directly against a raw transport, bypassing
  `SailsClient`'s session management entirely. Removed from the public
  surface; the two payload types it also exports (`NegotiationEvent`,
  `ProofSubmission`) stayed, since `negotiate()`/`submitProof()`
  callers genuinely need them.
- One internal `as unknown as typeof fetch` cast in `transport.ts`'s
  constructor removed via restructuring (resolve → validate → assign,
  instead of assign-with-cast → validate).
- `docs/SDK_GUIDE.md` section 2's interface listing — despite its own
  banner claiming "verified route-by-route" — had drifted from the
  real implementation across `identity`/`liquidity`/`settlement`/
  `reputation` (wrong method names and signatures throughout;
  `liquidity.cancel()` was documented but never built — the real
  equivalent is `updateStatus()`). Rewritten to match the real code.

### Added

Everything below was already on `main` before this audit pass — folded
into this first tagged version rather than re-listed as a separate
entry.
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
