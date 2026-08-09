# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added
- `docs/PRODUCTION_READINESS_FIXES.md` — a complete document with 22 fixes
  organized by priority (P0/P1/P2), each with file, exact line, and
  before/after code.
- `docs/TECHNICAL_DEBT_AUDIT.md` — an audit of invisible technical debt with
  45 items organized by impact (Critical/High/Medium/Low) and area
  (maintenance, scalability, onboarding, SDK, tests, modularization).
- `.github/workflows/ci.yml` — CI/CD with typecheck, tests, and build (Node 22).
- `SECURITY.md` — security policy and vulnerability reporting.
- `CODE_OF_CONDUCT.md` — community code of conduct.
- `SUPPORT.md` — support guide and communication channels.
- `.gitignore` updated — added `graphify-out/`, `GITHUB_ORGANIZATION.md`, `*.txt`.
- `CLAUDE.md` updated with Production Readiness audit status.
- `SailsClient.proof` module (`SailsProofModule`) with `assertClaim()`,
  `submitProof()`, `issueVerificationNonce()`, `verifyProof()`, and
  `getEvidenceBundle()` — now wired onto `SailsClient` as `client.proof`
  and exported from the public API.
- `Proof` and `Verification` types exported from `@sails/sdk`'s public API.
- `useSailsProof()` React hook in `@sails/sdk-react` — TanStack Query-backed
  wrapper for all `SailsProofModule` methods (10 tests incl. error paths).
- `useSailsIdentity`, `useSailsLiquidity`, `useSailsReputation`,
  `useSailsCapabilities` React hooks.
- `useSailsLiquidityDiscover` React hook with customizable filter params.
- Expanded `useSailsLiquidity` hook — `book` and `match` now accept custom
  parameters via `UseSailsLiquidityOptions`.
- Settlement RFC-021 gap closures: `approveRelease()`, `getReleaseApprovals()`,
  `registerArbiter()`, `getArbiterProfile()` with `ArbiterProfile`,
  `ReleaseApproval`, `ReleaseApprovalsResult` types.
- `openp2p.reconcileTrade()` — RFC-011 client-side reconciliation.
- `reputation.getScoreByPeerId()` — RFC-021 peer-based score lookup.
- Prisma migrations: `20260807_init` (schema completo) e `20260807_add_indices`
  (Dispute.arbiterId+status, User.reputationScore).
- React hook tests: `useSailsTrade` (3 tests) and `useSailsTrades` (4 tests).
- Pagination on `GET /v1/reputation/leaderboard` (limit/offset).
- Pagination on `GET /v1/openp2p/chat/:tradeId/messages` (limit/offset).
- `CLAUDE.md` — document defining Claude Code's engineering role for this project.
- `config/index.ts`: `requiredInt()` helper for numeric env var validation
  (throws instead of silently returning NaN).
- `config/index.ts`: production guard for `mockSettlement` (warns when
  `mockEscrow=false` but `mockSettlement=true`).

### Changed
- `liquidity.discover()` and backend `getAggregatedOffers()` now return
  `{ offers, sources, total, hasMore }` with proper global pagination applied
  after aggregating and sorting across all providers.
- `docs/SDK_GUIDE.md` section 2 updated with all new method signatures.
- `package.json` scripts: `db:migrate` now uses `prisma migrate deploy`;
  added `db:migrate:dev` for development.
- `docker-compose.yml`: migrate service uses `prisma migrate deploy`.
- `GET /v1/reputation/leaderboard` response: now returns
  `{ items, total, hasMore, nextOffset }` instead of a bare array.
- `GET /v1/openp2p/chat/:tradeId/messages` response: now returns
  `{ items, total, hasMore, nextOffset }` instead of a bare array.
- `identity.routes.ts`: `publicKey` now validates 64-character hex via regex.
- `trade.routes.ts`: `listTradesSchema` now has `limit` (1-100) and `offset` (>=0) bounds.
- `chat.routes.ts`: `sendMessageSchema` now has `content.max(10000)` and `msgType` as an enum.
- `settlement.routes.ts`: `createEscrowSchema.asset` now uses `z.enum(...)` instead of `z.string()`.
- `settlement.routes.ts`: `disputeSchema.evidence` now validates against a typed schema.
- `liquidity.service.ts`: removed 3 unnecessary `as any` casts (input was already typed).
- `config/index.ts`: `mockEscrow`/`mockSettlement` now case-insensitive.
- `config/index.ts`: removed duplicate `config.server` (identical to `config.app`).
- `proof.service.ts`: removed redundant `as any` on `verdict` (already typed as `'ACCEPTED' | 'REJECTED'`).
- `proof.service.ts`: replaced `as any` with `as unknown as Prisma.InputJsonValue` for JSON fields.
- `liquidity.routes.ts`: replaced `as any` with `as AssetType` in 3 places.
- `dispute.service.ts`: replaced `dispute.status as any` with `as DisputeStatus`.
- `settlement.routes.ts`: removed redundant `as any` on `body.paymentMethod` (already typed by the Zod schema).
- `routes.test.ts`: fixed 14 pre-existing reputation tests (publicKeys now valid hex, pagination limits respected, assets use a valid enum).
- `escrow.service.ts`: extracted `initiateSignatureCollection()` — eliminates ~180 lines of duplication across `initiateRelease/Refund/Split`.
- `auth.ts`: added `AuthenticatedRequest` interface — eliminates 25 `(request as any).participantId` casts across 9 route files.
- `client.ts` (SDK): extraído `requireWallet()` — elimina boilerplate repetido em 5 métodos.

### Fixed
- `trade.mock.ts` `ReputationScore` missing `total`/`tradeScore`/`volumeScore`/
  `settlementScore`/`disputeRate`/`cumulativeFeesObserved` fields caused
  TypeScript errors in dependent tests.
- `StatusBadge.tsx` missing `SPLIT` escrow status.
- `liquidity.service.ts`'s `getAggregatedOffers()` had the sort comparator
  reversed for both BUY and SELL sides — BUY offers were sorted ascending
  (lowest bid first) instead of descending (highest bid first); SELL offers
  were sorted descending (highest ask first) instead of ascending (lowest
  ask first). Corrected to standard order-book convention.
- `routes.test.ts` dispute config-error tests expected 400 (ValidationError
  from `getDisputeService()` with empty `TRUSTED_ARBITRATORS`) but got 404
  due to `.env`'s `TRUSTED_ARBITRATORS=k6-test-arbiter` setting. Fixed by
  clearing `process.env.TRUSTED_ARBITRATORS` before config import — dotenv
  does not override existing env vars.
- **CRITICAL**: `event-bus.ts` `SocialEngineeringRiskDetectedEvent.pattern`
  union tinha `| string` que colapsava todo o mapa de eventos tipados para
  `string` genérico — removido.
- `escrow.service.ts`: adicionado null check antes de chamar `provider.finalizeSplit!`.

### Security
- **`escrow.service.ts`'s `createEscrow()` had no membership check at
  all** — any authenticated participant could create an escrow against
  ANY trade, with attacker-chosen `type`/`lockedAmount`/`asset`. Since
  `Trade.escrowId` is set on the first successful call and a trade can
  only ever have one escrow, this let a stranger permanently block the
  real parties from ever settling a trade they could merely
  guess/observe the id of. Fixed: requires `participantId`, checked
  against `trade.buyerId`/`trade.sellerId`.
- **`GET /v1/openp2p/trades/:id` and `.../trades/by-intent/:intentId`
  had no auth at all** — both include the trade's full message history
  and the seller's real payment details (`Offer.paymentDetails`).
  Anyone who merely guessed or leaked a trade UUID could read a
  stranger's negotiation and payment instructions. Fixed: `requireAuth`
  + buyer/seller check, same as every other trade-detail route.

### Fixed (2026-08-08, verify-then-fix sweep of accumulated uncommitted work)
- `packages/sails-sdk/src/client.ts` had literal dead code: an orphaned
  `if (!this.wallet) {...}` block floating in the class body right
  after `signMessage()`'s closing brace, left over from an old
  `getAddresses()` implementation. Never caught because
  `packages/sails-sdk` isn't covered by the root `tsconfig`'s
  `include` — `npx tsc --noEmit -p packages/sails-sdk` is a distinct
  check the root `npm run build` doesn't run. Consolidated into
  `getWalletAddresses()` + a shared `requireWallet()` helper.
- `Dockerfile` and `docker-compose.yml` both had a UTF-8 BOM and every
  apostrophe in every comment doubled (`''` instead of `'`) — an
  encoding-roundtrip artifact. Not cosmetic: the same corruption hit
  the `HEALTHCHECK`'s embedded JS one-liner in both files, turning
  `require('http')` into `require(''http'')` — invalid syntax that
  would have made the container's own health check fail permanently in
  production. Rewrote both files clean.
- `reputation.leaderboard()` and `openp2p.getMessages()` in
  `@sails/sdk` still typed their return as a bare array
  (`ReputationScore[]`/`Message[]`) after their backend routes had
  already moved to `{items, total, hasMore, nextOffset}` pagination —
  would have shipped broken against the real response shape. Fixed
  both, added `LeaderboardEntry`/`LeaderboardResult`/`PaginatedMessages`
  types.
- `tests/useSailsCapabilities.test.tsx` and
  `tests/useSailsLiquidity.test.tsx` (sdk-react) were written against
  an imagined API shape that doesn't match the real types
  (`granteeId`/string `scope` instead of `CapabilityGrant`'s real
  `grantedTo`/`scope: string[]`/`capabilityName`; `assetSell`/
  `assetBuy`/`amountSell` instead of `Offer`'s real `asset`/`side`/
  `priceUsd`/`minAmount`/`maxAmount`). Neither ever ran under
  `packages/sdk-react`'s own `tsc` for the same "not in root tsconfig"
  reason as `client.ts` above.
- `scripts/sdk-pressure-test.ts` (a real end-to-end SDK-level load
  script) had 5 type errors that would have blocked `ts-node` from
  ever running it. Fixed; wired as `npm run loadtest:sdk`.
