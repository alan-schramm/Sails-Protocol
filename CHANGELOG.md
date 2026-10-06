# Changelog

All notable changes to this project will be documented in this file.

> **Current-truth note (2026-09-19):** This changelog is a historical change record, not an architecture or production-readiness authority. For current system truth, start with `README.md`, `docs/PROJECT_CONTEXT.md`, `docs/SYSTEM_DESIGN.md`, governing ADR/RFC/specification documents, and live GitHub Issues/Project state. Older entries below may describe implementation states that were true when recorded but have since evolved.

### September 2026 — current development highlights

- Current pre-v1 SDK source/package line is **0.2.0** for `@satsails/p2p-schemas`, `@satsails/p2p-trading-sdk`, and `@satsails/sdk-react`; publication/release claims remain governed by release evidence rather than this changelog alone.
- Added `docs/SYSTEM_DESIGN.md` as the consolidated current system-level technical map and aligned the repository entry path around it.
- Reconciled the canonical Protocol Whitepaper, Technical Paper, and P2P Trading SDK Paper with current institutional truth.
- Froze the current Capability Authority and Economic Disposition Authority architecture through ADR-004 / ADR-005 and continued path-specific hardening.
- Hardened production eligibility so protocol-representable settlement mechanisms do not silently become deployment-eligible.
- Hardened OpenProof/evidence authorization boundaries and direct trade-evidence bundle access.
- Established explicit distinctions between participant/economic identity, transport/communication identity, wallet funds authority, and optional external identity interoperability.
- Institutionalized the Day-0 multi-operator/shared-market target and the distinction between open/public and private/permissioned market contexts without redefining protocol semantics.
- Completed repository current-truth reconciliation across primary and specialized documentation.
- Production EvidenceProvider durability/provenance, cross-evidence integrity, upload controls, and remaining Day-0 production owners remain active under dedicated Issues; this changelog does not round active work up to completed readiness.


### Security
- **#235 R7G-F6B-P1 — no irreversible WDK conclusion rests on one RPC; treasury lanes halt and resume under
  governance; a stuck lowest nonce stops new signing.** CONFIRMED (→ FUNDS_LOCKED), a final REVERTED and
  NONCE_CONSUMED_ELSEWHERE now need a second, distinct observer (`WDK_CORROBORATING_RPC_URL`, evidence only,
  never broadcasts) to agree — same transaction, status, block number and block hash, final under the same
  rule at its own head; for NONCE_CONSUMED_ELSEWHERE, the nonce consumed at a block final for both and no
  receipt on either. Both source labels and the corroborator's head are persisted with the terminal state and
  are immutable; the database refuses a terminal state without them. Missing, lagging or unreachable
  corroboration leaves the attempt unresolved; a contradiction (`RPC_DISAGREEMENT`) is surfaced for review.
  Unset corroborator: nothing becomes terminal (fail closed). Lane halts are now structured
  (`wdk_lane_halts`: OPERATOR_PAUSE, STUCK_LOWEST_NONCE, SUSPECTED / PROVEN_EXTERNAL_NONCE_CONSUMPTION),
  never deleted, cleared only with an append-only audit record (`wdk_lane_audit`) in the same transaction.
  An operator removes only an operator pause, and only while no economic halt is active; economic halts
  clear only through a mechanical resume (both RPCs agree on the final treasury nonce, nothing pending,
  every signed transaction of the lane terminal), which realigns the lane forward to that nonce atomically —
  no force option, no nonce setter (`npm run wdk:lane -- status|pause|unpause|resume|reconcile`).
  `WDK_LANE_STUCK_BLOCKS` (no default): once the lowest unmined signed transaction has waited that many
  blocks the lane halts — the transaction is not failed, reverted or replaced and keeps being rebroadcast.
  The production network and confirmation depth remain unfrozen (CTO). Migration
  `20261010120000_wdk_rpc_corroboration_lane_governance` (existing halts carried over);
  `npm run wdk:lock-preflight` reports halts and the corroborator / threshold configuration.

- **#235 R7G-F6B-P — WDK LOCK finality is evidenced, a single RPC never decides an irreversible anomaly, and
  a nonce lane advances only by allocation.** A signed LOCK becomes CONFIRMED / REVERTED only together with
  the evidence that made its receipt final — receipt block number and hash, observed head, and the rule
  applied (`CONFIRMATIONS:<n>`, which they must satisfy) — immutable afterwards; the database refuses a
  terminal state without it. One RPC showing the treasury nonce consumed by another transaction no longer
  writes NONCE_CONSUMED_ELSEWHERE (irreversible, and a stale/forked endpoint can show exactly that): the
  attempt stays unresolved and the lane is halted for operator review; the database refuses that terminal
  state until corroborated evidence exists. `wdk_nonce_lanes.nextNonce` moves only by one, in the
  transaction that persists the signed transaction using that nonce. The production finality value and
  target network remain a CTO decision (`WDK_FINALITY_CONFIRMATIONS` still has no default). Migration
  `20261009120000_wdk_lock_finality_evidence`; `npm run wdk:lock-preflight` lists rows it would refuse.

- **#235 R7G-F6B — a WDK LOCK is one signed transaction, persisted before it is broadcast; the escrow is
  FUNDS_LOCKED only once that transaction is final.** WDK `transfer()` let the RPC choose the treasury
  nonce and exposed the hash only after broadcast, so a lost response, a crash or a retry could not tell
  whether funds had moved; the escrow was claimed FUNDS_LOCKED up front and reverted to CREATED on any
  error, and any receipt status other than 1 counted as a revert (a malformed receipt could start a second
  treasury transfer). Now the LOCK is: nonce allocated from a PostgreSQL lane per (chain, treasury), the
  transaction built with every field explicit (pinned `WDK_CHAIN_ID`), signed locally, decoded and checked,
  and persisted with its hash in the same transaction — then broadcast with ethers (pinned 6.17.0; WDK has
  no safe raw-broadcast primitive). Every broadcast and rebroadcast sends those exact bytes after
  re-verifying them; nothing ambiguous ever produces a new transaction. Only receipt status 0x1 / 0x0
  decide; finality is `WDK_FINALITY_CONFIRMATIONS` (no default: unset means never final). A final success
  projects FUNDS_LOCKED with its transition in one transaction; a final revert allows a new LOCK; a nonce
  consumed by a foreign transaction is NONCE_CONSUMED_ELSEWHERE, and foreign treasury activity halts the
  lane (operator review). Reconciliation advances signed LOCKs from durable state on any node. A committed
  signed LOCK blocks cancellation and refund-from-CREATED; WDK `markPaymentSent` requires the final LOCK;
  WDK release/refund/split are refused until outbound authority exists (F6C). Prisma `Decimal` amounts now
  reach providers as exact decimal strings (NF1); amounts finer than USDT's 6 decimals are refused.
  Migration `20261008120000_wdk_signed_lock_authority`; run `npm run wdk:lock-preflight` (read-only)
  against production first.

- **#235 R7G-F6A-1 — every WDK escrow has its own account, allocated and frozen by the database.** A
  WDK_USDT_EVM escrow's account was derived on every use as `m/44'/60'/0'/0/<sha256(tradeId) % (2^31-1)>`.
  Distinct trades map to the same index (a real pair was found after ~50k trade ids; on a local EVM the
  second trade's account spent the first trade's locked USDT), and that namespace also holds the treasury
  (index 0) and the auto-settle buyer accounts. Now each escrow carries `wdkAccountScheme` +
  `wdkAccountPath`: new escrows get `1'/0/<n>` from a database sequence on INSERT (unique, never reused,
  never wraps — creation fails when the non-hardened range is exhausted); escrows that already existed keep
  exactly their historical account, persisted once as `LEGACY_TRADE_HASH_V0`. The identity is set by the
  database only and is immutable together with the escrow it belongs to (trigger + CHECK + unique index).
  Lock, release, refund, split and reconciliation derive the account from that path only, and fail closed
  when it is missing or when a persisted escrow address is not what it derives. Migration
  `20261007120000_wdk_escrow_account_identity` refuses to install if two existing WDK escrows share an
  account or one uses the treasury's; run `npm run wdk:account-preflight` (read-only) against production
  first. Buyer accounts (`buyerIndexFor`, auto-settle only) still use the hashed namespace and are reported
  by the preflight, not changed.

- **#235 R7G-B2A — a MULTISIG escrow's script authority is frozen and every signature is verified.** The
  buyer/seller keys could be replaced at any time after they had derived the deposit address — even after
  funding — while lock, refund, release and recovery re-derived the script from those mutable rows: a swap
  blocked settlement, misdirected funding (lockFunds then overwrote the address), and duplicate keys were
  accepted (one key listed twice lets its holder, or the server for the arbiter key, spend alone). Partial
  signatures were never verified by Sails: a well-formed signature over the wrong message was accepted,
  finalized and broadcast. Now: once the address exists the keys that derived it and the address itself are
  immutable (service check plus database triggers; resubmitting the same key is a no-op); the three keys
  must be distinct; every lock, rescan, spend and reconciliation asserts the keys still derive the persisted
  address and fails closed otherwise; each submitted signature is verified against the stored signing round
  and the signer's key (SIGHASH_ALL) before it is stored or counted, and every signature is verified again
  before finalization. Migration `20261006120000_multisig_script_authority` refuses to install over any
  inconsistent MULTISIG escrow; run `npm run multisig:preflight` (read-only) against production first.
  LIGHTNING_HODL and SAFE_GUARD_EVM have no signature validator and now refuse signature submissions.

- **#235 R7G-B1 — a trade is cancelled unilaterally only while no funds can exist for it.** A manual
  cancellation used to be accepted while the escrow was CREATED, FUNDS_LOCKED, PAYMENT_PENDING or EXPIRED,
  marking the trade CANCELLED while funds stayed locked (or a buyer had already paid). It is now refused once
  funds may exist: any escrow status other than CREATED, a MULTISIG escrow with a deposit address, or a
  WDK_USDT_EVM escrow with a transfer attempt that may have been submitted (even if the escrow reads CREATED).
  Those trades end through refund, dispute or settlement, which are unchanged. Submitting a participant key
  and locking funds now take the same trade-lifecycle lock and refuse a CANCELLED trade. A cancellation that
  fails leaves nothing behind: the trade's Intent is cancelled in the same transaction as the trade (an Intent
  that cannot be cancelled refuses the whole request), and events are published only after the commit.

- **#235 R7G-A — a cancelled trade takes no new escrow.** `createEscrow()` never checked the trade's
  status, and a manual cancellation (#294) only serialized against an escrow that already existed, so a
  CANCELLED trade could still get an escrow, including one created after the cancellation committed. A
  trade now takes its first escrow only while PENDING or ACTIVE, and the cancellation and the escrow insert
  take one trade-scoped PostgreSQL advisory lock before reading the trade: either the cancellation wins (no
  escrow) or the escrow commits first and the cancellation then follows #294's rules. Existing rows are not
  touched.

- **#235 R7F-B (N3/N3b) — an escrow commits exactly its trade's economic intent.** `createEscrow()`
  took `asset` and `lockedAmount` from the caller unchecked, and for five legacy assets the caller also
  chose the rail — so a BTC 0.001 trade could get a USDT 500 escrow, or a SPARK trade lock BTC, USDT or
  native ETH. Now `Escrow.asset = Trade.asset` and `Escrow.lockedAmount = Trade.amount` (the principal T;
  the fee reserve stays separate), compared as exact Decimals; the caller's values are assertions and a
  mismatch is refused before anything is written. Trades in LN_BTC, USDT_LIGHTNING, SPARK, STACKS or RSK_BTC
  (no authorized translation, ADR-002 §11) cannot be escrowed, and SAFE_GUARD_EVM never backs a trade.
  Existing escrow rows are not rewritten.

- **#235 R7D (N2) — payment-account trust ramp counts real completions.** `completedTrades` had no
  production writer. The seller's bound account now gains one completed trade per clean completion
  (escrow COMPLETED, no dispute ever), exactly once across replay, concurrency, nodes and crash
  recovery (projection claim + PASS 3). The unguarded helpers `recordCompletedTrade()`
  / `recordChargeback()` were removed; chargebacks stay unwired (no canonical fiat-reversal fact).

- **#235 R7C — payment-account binding and peer-attestation authority.** Any authenticated
  participant could sign any payment account, including their own, raising its trade-limit tier.
  The seller's account is now bound to the trade at creation (SELL offer: declared on the offer;
  BUY offer: by the taker), checked for ownership and payment method, and fixed. Only the buyer of a
  clean COMPLETED trade (no dispute) may attest that trade's bound account, once, atomically
  (`POST /v1/settlement/payment-accounts/:hash/sign` now requires `tradeId`). Provenance is recorded
  (PEER / VOUCHER / LEGACY for rows signed before). Trade-limit enforcement is not part of this change.

- **Master Backlog R6 — security windows fail closed.** A window configured as 0 or negative
  silently disabled the protection it bounds: the Redis-shared auth/critical rate limits (a
  non-positive PEXPIRE deletes the counter), the WebSocket message limit, the escrow circuit
  breaker and suspicious-activity detection (a max <= 0 also never fired). Those settings are now
  strict positive integers; an invalid value refuses to boot. Defaults are unchanged.

- **Master Backlog R5 — escrow timelock authority.** A trade party could set `timelockHours` on
  `POST /v1/settlement/escrow` (0 or negative made the escrow expire as soon as funds locked; a
  huge value made it never expire). The field is now accepted but ignored: `createEscrow()` freezes
  `DEFAULT_TIMELOCK_HOURS` on the escrow, `lockFunds()` keeps deriving `expiresAt` from that frozen
  value, and existing escrows are never recomputed. `DEFAULT_TIMELOCK_HOURS` must be a positive
  integer in every environment and is required in production.

- **Issues #291 / #294 / #298 — settlement result integrity, authoritative projection, replay
  safety.** `Escrow.txReleaseId`/`releasedAt` are now write-once (one `persistSettlementResult()`
  primitive for every writer + a database trigger); a provider-success/local-failure no longer
  reverts the escrow; Trade status is projected monotonically from the persisted Escrow (manual
  transitions are CAS-guarded); downstream event effects are idempotent per
  `(eventId, projectionKey, subjectId)` (`event_projection_claims`), with recovery of claimed-but-
  unprojected transitions (PASS 3). Two migrations. See `PROTOCOL_INVARIANTS.md` INV-OP-12.

- **Issue #303 - Capability Authority is a production-eligibility invariant.** A
  `NODE_ENV=production` process now refuses to boot unless
  `ENFORCE_CAPABILITIES=true` exactly (dev/test/reference unchanged). Only canonical
  `(capabilityName, scope)` pairs (`trade-coordination`: `intent.created`,
  `intent.discovering`; `settlement`: `settlement.escrow.{released,refunded,split}`)
  can be registered; anything else is 400. SDK `capabilities.ensureCanonicalGrants()`
  added (run by the reference UI on login); `registerFromWallet()` deprecated
  (its old grant shape matched no gate). Self-issued grants remain the participant's
  own consent, not independent authorization. ADR-004/INV-08 amended.

- **Issue #302 — registration now requires proof of possession.** `POST
  /v1/identity/participants` requires `signature`: an Ed25519 signature over
  `sails-registration-proof-of-possession:v1:<challenge>:<displayName>` for a
  challenge from the new `POST /v1/identity/register-challenge`. Knowledge of a
  public key no longer allows squatting its canonical `User` row. Verification
  precedes consumption; the exact verified challenge is consumed atomically
  (reusing #301's `atomicCompareAndConsume`); `User.publicKey @unique` remains
  the independent final barrier. SDK: `create()` signs transparently;
  `createWithWallet()` and `registerChallenge()` added; `createWithPublicKey()`
  deprecated (cannot produce a proof). React: `useSailsIdentity().createWithWallet`.

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
- `Proof` and `Verification` types exported from `@satsails/p2p-trading-sdk`'s public API.
- `useSailsProof()` React hook in `@satsails/sdk-react` — TanStack Query-backed
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
  `@satsails/p2p-trading-sdk` still typed their return as a bare array
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
