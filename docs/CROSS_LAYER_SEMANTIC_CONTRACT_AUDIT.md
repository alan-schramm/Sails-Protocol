# Cross-Layer Semantic Contract Audit (`CROSS-LAYER-SEMANTIC-CONTRACT-AUDIT-1`, 2026-09-13)

**Status:** audit and truth-reconciliation only. **No implementation changes.**
Baseline: `main @ d52408b249c5678dd7fed7d422f92a5f32bca303`. Branch:
`docs/cross-layer-semantic-audit-1`.

**Purpose:** determine whether the same economic and technical meaning
survives across Protocol/Domain Model → Runtime → API → SDK → Sails
Market/Reference UI → Partner Wallet/Integrator expectations → future
Rust/Go implementations, before Mission 3 deepens product implementation
and before a second language implementation is introduced.

**Governing principles for this document:**
> Multiple implementations may vary internally. Economic and protocol
> semantics must not. Implementation convenience must never become
> protocol truth. The system may adapt the path. It may not adapt the
> truth.

**Method:** ten domains (A-J) investigated in parallel by dedicated
research passes, each instructed to gather evidence only (file:line
citations, quoted code) and never to fix anything. This document performs
the classification, severity assignment, and synthesis. Every material
finding separates FACT / EVIDENCE / INFERENCE / DECISION / UNKNOWN where
relevant. Where evidence was insufficient, findings are marked
`EVIDENCE GAP`, never promoted to fact.

**Frozen principles preserved throughout (not challenged by this
audit):** Stable semantics, replaceable edges. `Asset ≠ SettlementRail ≠
SettlementScope ≠ SettlementAdapter ≠ SettlementProvider`. `Permission
Policy ≠ Provider Selection Policy`. Interoperability is relationship
metadata, never identity. `Funds Authority ≠ Economic Identity ≠
Transport Identity`. `Economic Disposition Authority ≠ Destination
Authority ≠ Execution Authority`. `Technical Capability ≠ Protocol
Permission ≠ Economic Authority ≠ Settlement Eligibility`. Error
semantics are cross-layer truth. Product copy is not protocol truth.
Unknown outcome ≠ failed economic action. Implementation ≠ truth.
Evidence ≠ claim. Provider implementation ≠ product maturity. Sails
coordinates; it does not require technological homogeneity. No evidence
found in this audit contradicts any of the above — none is escalated for
reconsideration.

---

## A. Executive Result

**Overall verdict:** no unresolved Critical defect was found that
threatens current behavior or funds. The system is **materially
coherent** where consequence is highest (fund-moving MULTISIG and
WDK_USDT_EVM paths have real, tested idempotency/reorg/reconciliation
protections) and **genuinely drifted** in several bounded, identified
places — mostly at the documentation/SDK-type layer and in two rails
(LIGHTNING_HODL, SAFE_GUARD_EVM) whose reduced safety net is **already
disclosed** in existing evidence docs, not newly discovered here.

| Metric | Count |
|---|---|
| Critical | 0 |
| High | 4 (CSC-B01, CSC-D01, CSC-H01, CSC-H02) |
| Medium | 14 (CSC-A01, A02, B02, B03, B04, C01, C02, D03, E01, F01, F02, G01, H03, I02) |
| Low | 7 (CSC-C03, D02, D04, E02, G02, I01, I03) |
| Informational | 3 (CSC-C04, E03, F03) |
| Coherent domains (no material finding) | 0 fully coherent; every domain had at least one Low/Informational item — see Domain Matrix |
| Domains with real drift | A, B, C, D, E, F, G, H, I (9 of 9 investigated; J is synthesis) |
| Requiring Product Decision | 4 new (CSC-A02, CSC-C04, CSC-H02, CSC-I03), plus the already-tracked F-08.1/F-08.2 pair (`docs/BACKLOG.md` item 34 — not re-counted here) |
| Requiring Architecture Decision | 2 (CSC-B03, CSC-H01) |

No fake maturity percentage is computed. These counts describe how many
distinct findings exist, not what fraction of "the system" is correct.

**STOP-condition assessment (§11 of the mission brief), performed
explicitly, not silently skipped:** none of the findings below meet the
bar for an immediate STOP-and-report-before-continuing. The one finding
that could plausibly read as "a state transition that can falsely
finalize an economic action" (LIGHTNING_HODL/SAFE_GUARD_EVM marking
`Escrow.status` terminal before broadcast confirmation, no reorg sweep)
was verified directly against `docs/RECOVERY_RECONCILIATION_CONFORMANCE_EVIDENCE.md`
and found to be **already known, already disclosed, already registered**
debt (§26/§28 of that document state this in almost identical language)
— not a new discovery. The one finding that could read as "a precision
bug capable of value corruption" (BTC amounts converted via
`Math.round(parseFloat(x) * 1e8)`) was checked against float64's exact-
integer range (2^53) and found mathematically safe for every realistic
trade size, though still a real internal-consistency drift worth fixing
(CSC-E01). No sensitive secret leak was confirmed (one config-drift item,
CSC-I02, is flagged as an evidence gap requiring a runtime check, not a
confirmed leak). No authority collapse, no frozen-principle
contradiction, was found.

---

## B. Domain Matrix

| Domain | Status | Strongest evidence | Main finding | Risk | Next action |
|---|---|---|---|---|---|
| A. Error & Recovery Semantics | DRIFT | `src/common/errors/index.ts` vs `ERROR_CODE_MAP` vs `docs/API_REFERENCE.md` §9, read side by side | 4 backend codes (not 3) lack SDK typed subclasses and are undocumented; `API_STABLE.md` never mentions error semantics as part of its freeze commitment | Medium | Extend `docs/BACKLOG.md` item 35's scope (CSC-A01); Product Decision on whether error-type stability belongs in the freeze commitment (CSC-A02) |
| B. Retry/Idempotency/Unknown Outcome | DRIFT (bounded) | `escrow-lifecycle.ts`'s `claimEscrowTransition`, `wdk-execution-truth.ts`, `transport.ts`'s never-auto-retry-mutations design | MULTISIG/WDK_USDT_EVM are well-protected; `createTrade`/`createOffer`/`submitEvidence` have zero idempotency; non-WDK rails' finalize/broadcast retry has no execution-truth guard | High (CSC-B01), Medium (others) | New bounded backlog item for trade/offer/evidence idempotency; architecture-level follow-up on cross-rail finalize-retry safety |
| C. State/Status Semantics | DRIFT | `packages/sails-p2p-schemas/src/trade.ts` + `dispute.ts` vs `packages/sails-sdk/src/types.ts` | Two SDK-adjacent packages disagree on `DisputeStatus`'s own membership (4 vs 6 values); no `DisputeStatusBadge` in the UI, 3 inconsistent renderings | Medium | Reconcile `packages/sails-p2p-schemas`; add a real `DisputeStatusBadge`; fix `docs/DATABASE.md`'s stale tables |
| D. Null/Optional/Absent/Empty/Default | DRIFT (mostly disciplined) | `types.ts`'s own documented `?:`/`\| null` convention, confirmed deliberate in 90%+ of cases | A genuine, disciplined convention exists — with one concrete break (`Intent`'s optional keys) and one real SDK type-shape bug (`ArbiterProfile`) | High (CSC-D01), Medium (others) | Fix `ArbiterProfile`; align `Intent`'s optional-key typing to its real nullable-not-sparse wire shape |
| E. Money/Precision/Units/Rounding | COHERENT with one drift | `fee-reserve-math.ts`, `economic-outcome.ts`'s exact-remainder allocation, RFC-009's Decimal migration | Split/fee math is exact and conservation-proven by construction; one inconsistent (but currently safe) float-based BTC→sats conversion | Medium | Migrate `multisig.provider.ts`/`lightning-hodl.provider.ts`'s `expectedSats()` to the SDK's own exact `btcToSats()` pattern |
| F. Time/Expiry/Clock Semantics | DRIFT (disclosed + one undisclosed) | `escrow-repository.ts`'s two disjoint expiry branches, `dispute.service.ts`'s contest/sweep race | The SAME field (`Escrow.expiresAt`) has two opposite boundary conventions across two branches — deliberate, disclosed; a real, undisclosed race exists between manual contest and the expiry sweep at the exact deadline instant | Medium | Document the dual expiry convention explicitly as a conformance-test target; add a compare-and-swap guard to `contestAutoResolution()`/`sweepExpiredAutoResolutions()` |
| G. Capability State Semantics | DRIFT | `escrow-providers.ts`'s ≥5 distinct "not supported" throw sites | 6 structurally different underlying reasons ("technical gap," "not wired," "policy denial," "immaturity/profile mismatch," "config toggle off," "SDK stub") all surface as similarly-worded plain-text errors with no structured discriminator | Medium | Register as a future bounded mission: give capability-denial errors a structured `reason` category, not just a message string |
| H. Version/Capability Negotiation | UNDEFINED / ARCHITECTURE DECISION REQUIRED | `src/app.ts`'s single `/v1/` prefix, `API_VERSION = package.json` semver | No versioning beyond the URL prefix; SDK package version (`0.1.3`) and server version (`0.1.1`) have already diverged with nothing distinguishing "SDK version" from "protocol version" | High | Decide and document a protocol-version concept independent of any one SDK's package version, before a second-language SDK exists |
| I. Observability/Correlation/Redaction | COHERENT with two gaps | RFC-010's `correlationId`/Timeline mechanism, empirically-tested Zod v4 error shape | Real domain-ID-keyed correlation exists and works; the two core state-machine services log nothing at all; the app's request-logger config has drifted from the standalone logger's credential-scrubbing config | Medium | Add minimal domain-ID logging to `escrow.service.ts`/`dispute.service.ts`'s critical transitions; verify (don't assume) whether the logger-config drift is an actual leak path |
| J. Cross-Implementation Readiness | EVIDENCE GAP → now mapped | Synthesis of A-I | Money-as-decimal-string and the JSON error envelope are genuinely portable; the dual expiry-boundary convention, the `?:`/`\|null` ambiguity, and the implicit decimal-serialization contract are TypeScript/library-implicit and would surface immediately in Rust/Go | Medium-High for future work, none today | See §E below — three concrete pre-Rust/Go blockers named |

---

## C. Material Findings

Format per finding: ID, domain, severity, classification, evidence,
affected layers, consequence, recommended future mission, Mission-3
blocking status.

### CSC-A01 — Backend error-code taxonomy: 4 codes lack SDK typed coverage, not 3

- **Domain:** A. **Severity:** Medium. **Classification:** DRIFT.
- **Trace:** `src/common/errors/index.ts` (10 real codes: `NOT_FOUND`,
  `VALIDATION_ERROR`, `ESCROW_ERROR`, `AUTH_ERROR`, `FORBIDDEN`,
  `INTERNAL_ERROR`, `ECONOMIC_AUTHORITY_AMBIGUITY`,
  `CIRCUIT_BREAKER_OPEN`, `RATE_LIMIT_EXCEEDED`, `RATE_LIMIT_UNAVAILABLE`)
  + `src/app.ts:280` (an 11th, dynamic `REQUEST_ERROR` for any
  well-formed Fastify-plugin error not otherwise classified) →
  `packages/sails-sdk/src/errors.ts`'s `ERROR_CODE_MAP` (7 codes mapped)
  → `docs/API_REFERENCE.md` §9's table (7 codes documented, but a
  **different** 7 — it lists `REQUEST_ERROR` but not
  `RATE_LIMIT_UNAVAILABLE`, while the SDK maps the reverse).
- **Expected meaning:** every real backend error code has a named SDK
  subclass and a documented row. **Actual meaning:** `ECONOMIC_AUTHORITY_AMBIGUITY`,
  `CIRCUIT_BREAKER_OPEN`, `RATE_LIMIT_UNAVAILABLE`, and `REQUEST_ERROR`
  all fall through to the generic `SailsError` — information (`code`/
  `statusCode`) is preserved on the instance, but a caller pattern-
  matching via `instanceof` cannot distinguish "retry later" (503) from
  "look at your request again" (4xx) from "internal anomaly" (500).
  **Survives translation?** Partially — data survives, typed
  classification does not.
- **Consequence:** a partner integrator relying on `instanceof
  SailsRateLimitError`-style checks would treat `RATE_LIMIT_UNAVAILABLE`
  (503, "retry later") identically to a generic internal error, losing
  the retryability signal `docs/ENGINEERING_GOVERNANCE.md` §16.17
  explicitly requires be preserved.
- **Recommended future mission:** extend `docs/BACKLOG.md` item 35's
  scope note to include `REQUEST_ERROR` (currently only names the other
  three). Bounded, doc-and-SDK-only.
- **Blocks Mission 3?** No — Mission 3 is P2P journey/documentation work,
  not SDK error-class implementation.

### CSC-A02 — `docs/API_STABLE.md`'s freeze commitment never mentions error semantics

- **Domain:** A. **Severity:** Medium. **Classification:** PRODUCT DECISION REQUIRED.
- **Trace:** `docs/API_STABLE.md` (the document whose own header claims
  "if any other doc disagrees with this one on an SDK method's real
  shape, this document wins") contains zero mention of error codes,
  error types, or a cross-reference to `docs/API_REFERENCE.md` §9,
  confirmed by direct grep.
- **Expected meaning:** the "stable, frozen" contract a partner builds
  against includes everything that contract's own callers structurally
  depend on. **Actual meaning:** real, shipped code (`useEscrowKey.ts`,
  `Trade.tsx`) depends on `instanceof SailsAuthError`/`SailsForbiddenError`
  checks, but nothing in the frozen-contract document promises those
  types won't change. **Survives translation?** No — the freeze
  commitment has an unstated gap exactly where real code already
  depends on stability.
- **Consequence:** a future breaking change to an error class's shape
  would not violate the letter of `API_STABLE.md`'s freeze commitment,
  even though it would break real, shipped consumers.
- **Recommended future mission:** a Product Decision — should
  `API_STABLE.md`'s freeze commitment explicitly extend to the SDK's
  error-class hierarchy? This is a scope decision, not an implementation
  task.
- **Blocks Mission 3?** No.

### CSC-B01 — `createTrade()`/`createOffer()` have no idempotency mechanism

- **Domain:** B. **Severity:** High (`createTrade`), Medium (`createOffer`).
  **Classification:** DRIFT (genuinely new — not named in any existing
  evidence doc).
- **Trace:** `src/modules/open-p2p/trade-repository.ts:109-123` — plain
  `prisma.trade.create()`, no upsert, no unique constraint on
  `(offerId, buyerId, sellerId)` in `prisma/schema.prisma`'s `Trade`
  model. `src/modules/open-liquidity/liquidity.service.ts:419-450` —
  same pattern for `Offer`. `packages/sails-sdk/src/transport.ts:26-36`
  confirms POST is never auto-retried by the SDK, but a **manual**
  client retry (a real user re-clicking "Accept Offer" after a perceived
  timeout, or an integrator's own naive retry loop) hits this
  unprotected path directly.
- **Expected meaning:** one logical "accept this offer" intent produces
  one `Trade`. **Actual meaning:** a network-level retry of the
  identical request can produce two separate `Trade` rows, each
  triggering its own escrow-creation flow and negotiation channel, for
  what the client and the seller both believe is one acceptance.
  **Survives translation?** No.
- **Consequence:** duplicate trade coordination state for one offer;
  potential seller confusion (their offer "accepted twice"); no funds
  move at this step, so this is a coordination-integrity risk, not a
  funds-loss risk.
- **Recommended future mission:** a bounded mission adding a
  client-supplied or server-derived idempotency key to `POST
  /v1/openp2p/trades` and `POST /v1/liquidity/offers`, following the
  same "smallest deterministic seam" harness discipline
  (`docs/ENGINEERING_GOVERNANCE.md` §16.7-§16.8).
- **Blocks Mission 3?** **Yes, as an input, not a hard blocker** — Mission
  3 deepens the P2P economic journey and should not design new UI
  around "accept offer" without knowing this gap exists; it does not
  need to be fixed before Mission 3 starts.

### CSC-B02 — `submitEvidence()` has no idempotency

- **Domain:** B. **Severity:** Medium. **Classification:** DRIFT (new).
- **Trace:** `src/modules/open-settlement/dispute.service.ts:853-883` —
  appends unconditionally to `Dispute.evidence` (no dedup by content or
  key), and re-triggers a QVAC auto-resolution attempt (per the method's
  own header comment) on every call.
- **Expected/actual meaning:** one evidence submission should produce
  one evidence entry and at most one QVAC evaluation; a retry can
  produce two of each.
- **Consequence:** duplicated evidence entries, a duplicate (wasted, not
  dangerous) QVAC inference call.
- **Recommended future mission:** same bounded idempotency-key mission
  as CSC-B01, or a narrower content-hash dedup check.
- **Blocks Mission 3?** No — carries into future work.

### CSC-B03 — No execution-truth-style guard on `submitTransactionSignature()`'s finalize/broadcast retry for MULTISIG/LIGHTNING_HODL/SAFE_GUARD_EVM

- **Domain:** B. **Severity:** Medium (explicitly not Critical — see
  reasoning below). **Classification:** ARCHITECTURE DECISION REQUIRED.
- **Trace:** `escrow-pending-tx.ts:285-441` — on a finalize/broadcast
  failure, `revertEscrowStatus()` runs and the pending row/signatures
  are deliberately left in place so a retry can resubmit; but the retry
  re-invokes the provider's `finalizeRelease/Refund/Split`, which for
  these three rails has no equivalent to `wdk-execution-truth.ts`'s
  durable pre-broadcast attempt record.
- **Why this is NOT classified Critical, stated explicitly rather than
  silently downgraded:** Bitcoin's UTXO model (MULTISIG) makes a
  same-input rebroadcast structurally different from an account/nonce-
  based rebroadcast (WDK/EVM) — two broadcasts of the identical signed
  transaction share one txid and cannot double-spend the same input;
  two broadcasts of two *different* transactions spending the same
  input can only ever have one confirm. LIGHTNING_HODL's Ark/VTXO model
  and SAFE_GUARD_EVM's ERC-4337 UserOp model were not verified in this
  pass to have the same structural property — this is an **honest
  EVIDENCE GAP**, not an assumption that they're equally safe.
- **Consequence:** for MULTISIG, likely bounded by Bitcoin's own
  protocol properties (needs confirmation, not assumption). For
  LIGHTNING_HODL/SAFE_GUARD_EVM, unknown — this is exactly the kind of
  question `docs/ENGINEERING_GOVERNANCE.md` §16.1 (Decision Frontier)
  says must not be converted into a convenient assumption.
  Separately — this whole area is already registered as an open Backlog
  Delta at `docs/RECOVERY_RECONCILIATION_CONFORMANCE_EVIDENCE.md` §28
  ("LIGHTNING_HODL/WDK_USDT_EVM/SAFE_GUARD_EVM have zero automated
  crash-recovery coverage"), so this finding sharpens, rather than
  discovers, an already-tracked gap.
- **Recommended future mission:** an Architecture Decision Mission
  (per `docs/ENGINEERING_GOVERNANCE.md` §16.3) specifically to determine
  the actual replay/double-broadcast safety property of Ark/VTXO
  (LIGHTNING_HODL) and ERC-4337 UserOp (SAFE_GUARD_EVM) finalize retries
  — a research mission before any implementation mission.
- **Blocks Mission 3?** No — Mission 3 doesn't touch settlement internals.

### CSC-B04 — LIGHTNING_HODL's `finalizeArk()` has no Sails-configured timeout and no ambiguous-outcome handling

- **Domain:** B. **Severity:** Medium-High. **Classification:** LEGITIMATE
  DEFERRAL at the category level (already tracked), DRIFT at the
  mechanism level (this specific root cause wasn't previously named).
- **Trace:** `lightning-hodl.provider.ts:465-490` — no `boundedFetch`/
  `withBoundedRetry` wrapper anywhere in the file (confirmed by grep);
  relies entirely on `@arkade-os/sdk`'s own undocumented default HTTP
  timeout. A bare `try/catch` rethrows any failure — including a
  timeout — as a generic `EscrowError`, with no distinction between
  "rejected before submission" and "submitted, response lost."
- **Consequence:** this rail's already-disclosed "zero automated
  crash-recovery" gap (per `RECOVERY_RECONCILIATION_CONFORMANCE_EVIDENCE.md`)
  is now understood to start even earlier than a missing reorg sweep —
  there isn't even a Sails-bounded timeout at the HTTP layer for this
  rail's most consequential call.
- **Recommended future mission:** part of the same Architecture
  Decision Mission as CSC-B03.
- **Blocks Mission 3?** No.

### CSC-C01 — `packages/sails-p2p-schemas`'s `DisputeStatus`/`DisputeStatusInput` disagree with `packages/sails-sdk`'s `DisputeStatus`

- **Domain:** C. **Severity:** Medium. **Classification:** DRIFT.
- **Trace:** `packages/sails-p2p-schemas/src/dispute.ts:20` and
  `trade.ts:60-63` declare `DisputeStatus`/`DisputeStatusInput` with
  4 values (missing `APPEALED`, `AUTO_PROPOSED`); `packages/sails-sdk/src/types.ts:39`
  declares the complete, correct 6-value type; the real Prisma enum
  (`prisma/schema.prisma:1326-1333`) has 6 values. `dispute.ts`'s own
  header comment explicitly claims this schema "is what
  `prisma/schema.prisma`'s... `Dispute` model actually persists — not a
  second, divergent shape" — a claim its own code contradicts.
- **Consequence:** a real dispute at `APPEALED`/`AUTO_PROPOSED` would
  collapse into `deriveTradeState()`'s generic `dispute_opened` fallback
  — undisclosed, unlike this same file's other, carefully-commented
  collapses (EXPIRED, PAYMENT_PENDING, SPLIT). **Mitigating context**:
  `deriveTradeState()`/`TradeState` (this whole package) has zero
  production consumers found in `src/` or `packages/sails-ui`/`sails-sdk`
  — it is currently exercised only by its own package's tests (see
  CSC-C04).
- **Recommended future mission:** a small, bounded fix — widen
  `packages/sails-p2p-schemas`'s `DisputeStatus`/`DisputeStatusInput` to
  the real 6 values, matching `packages/sails-sdk`'s already-correct
  type, and disclose the `APPEALED`/`AUTO_PROPOSED` → `dispute_opened`
  collapse with the same comment discipline the file already uses for
  its other collapses.
- **Blocks Mission 3?** No — this package is not currently wired into
  the product.

### CSC-C02 — No `DisputeStatusBadge`; 3 inconsistent renderings of `DisputeStatus` in the UI

- **Domain:** C. **Severity:** Medium. **Classification:** DRIFT.
- **Trace:** `packages/sails-ui/src/components/ui/StatusBadges.tsx` has
  complete, exhaustive-checked badge maps for `TradeStatus`,
  `EscrowStatus` (8/8), `OfferStatus` — but none for `DisputeStatus`.
  `Disputes.tsx:236-247` and `TradeDisputePanel.tsx:41-43` each
  independently render dispute status with different, narrower logic;
  `APPEALED` has no distinct color/icon/label in either.
- **Consequence:** a real, active dispute state (`APPEALED`) is
  visually indistinguishable from `OPENED`/`EVIDENCE_SUBMITTED`/
  `ARBITRATED` in one component and from those plus `AUTO_PROPOSED` in
  another — a UX/state-legibility gap, not a data-correctness one (the
  underlying `Dispute.status` value itself is never wrong).
- **Recommended future mission:** add a real `Record<DisputeStatus, ...>`
  `DisputeStatusBadge` to `StatusBadges.tsx` (the same
  exhaustiveness-checked pattern `EscrowStatusBadge` already uses), and
  have both consuming components use it instead of their own ad hoc
  logic.
- **Blocks Mission 3?** No, but worth doing before Mission 3 if Mission
  3 touches dispute UI at all — otherwise carries forward.

### CSC-C03 — `docs/DATABASE.md`'s `EscrowStatus` listing and transition table are stale

- **Domain:** C. **Severity:** Low-Medium. **Classification:** DRIFT
  (doc staleness).
- **Trace:** `docs/DATABASE.md:112-120` lists 7 of 8 real `EscrowStatus`
  values (missing `EXPIRED`); its transition table (lines 469-479) is
  missing the `EXPIRED` row entirely and the `SPLIT` row entirely, and
  under-lists `FUNDS_LOCKED`'s and `DISPUTED`'s real target states
  versus `escrow-lifecycle.ts`'s actual `VALID_TRANSITIONS`.
- **Consequence:** a reader relying on this doc as the transition-table
  source of truth would not know `EXPIRED`/`SPLIT` exist as real,
  enforced states.
- **Recommended future mission:** a doc-only correction, bounded to this
  one table.
- **Blocks Mission 3?** No.

### CSC-C04 — `deriveTradeState()`/`TradeState` vocabulary is currently dead code

- **Domain:** C. **Severity:** Informational. **Classification:**
  PRODUCT DECISION REQUIRED.
- **Trace:** grep across `src/` and `packages/sails-ui`/`sails-sdk`
  (excluding `.claude/worktrees/*` stale copies) finds zero call sites
  for `deriveTradeState()`/`TradeState` outside `packages/sails-p2p-schemas`
  itself and its own tests.
- **Consequence:** this whole, carefully-built vocabulary (including
  the recent F-01 SPLIT fix) currently protects no live code path — it
  is drifting (CSC-C01) without anyone noticing precisely because
  nothing consumes it.
- **Recommended future mission:** a Product Decision — wire it into a
  real consumer (the natural candidate being the Reference UI's own
  status-derivation logic, which today appears to read raw
  `Escrow.status`/`Trade.status` directly rather than through this
  derived layer) or explicitly mark the package as forward-looking/
  not-yet-adopted so future contributors don't assume it's live.
- **Blocks Mission 3?** **Possibly relevant as an input** if Mission 3's
  journey work assumes this derived-state layer is the UI's source of
  truth — it currently is not.

### CSC-D01 — `ArbiterProfile` (settlement.ts) vs `ArbiterCandidate` (arbitration.ts): incompatible SDK types for the same two live routes

- **Domain:** D. **Severity:** High. **Classification:** DRIFT.
- **Trace:** `packages/sails-sdk/src/modules/arbitration.ts:17-23`
  (`ArbiterCandidate`, verified correct against the real server response
  shape via `market-arbitration.provider.ts:100-107,152-173`'s
  `toCandidate()`) vs `packages/sails-sdk/src/modules/settlement.ts:159-166`
  (`ArbiterProfile`, different field names entirely — `reputationScore`/
  `activeDisputes`/`registeredAt` vs the real `arbiterReputation`/
  `effectiveStake`, and an incorrectly non-nullable `collateralAsset:
  string` where the real field is `string | null`). Additionally,
  `settlement.ts:874-880` types `getArbiterProfile(): Promise<ArbiterProfile
  | null>`, but `transport.ts` never resolves `null` — it throws
  `SailsNotFoundError` on a 404. The `| null` case is unreachable.
- **Expected meaning:** one route, one correct response shape, declared
  once. **Actual meaning:** two SDK modules independently declare two
  different, incompatible shapes for `POST
  /v1/settlement/arbitration/register` and `GET
  /v1/settlement/arbitration/profile/:id`. **Survives translation?** No.
- **Consequence, precisely bounded:** `grep`-ing `packages/sails-ui/src`
  finds **zero** call sites for either `settlement.registerArbiter()`/
  `settlement.getArbiterProfile()` or `arbitration.register()`/
  `arbitration.getProfile()` — this bug has not yet caused a visible
  production defect because the reference UI doesn't exercise
  market-arbitration mode. It would, however, immediately mislead any
  partner integrator building against `settlement.ts`'s documented
  shape.
- **Recommended future mission:** a small, bounded SDK fix — either
  remove `settlement.ts`'s duplicate `registerArbiter`/`getArbiterProfile`
  (if `arbitration.ts`'s versions are the intended, correct surface) or
  correct `ArbiterProfile`'s shape to match the real response and fix
  its unreachable `| null` return type.
- **Blocks Mission 3?** No.

### CSC-D02 — `requiredSigners` empty-array case is unguarded

- **Domain:** D. **Severity:** Low. **Classification:** EVIDENCE GAP /
  INFORMATIONAL (currently unreachable, not a live bug).
- **Trace:** every real provider construction path
  (`multisig.provider.ts`, `safe-guard-evm.provider.ts`,
  `lightning-hodl.provider.ts`) produces a non-empty array; consuming
  code (`escrow-pending-tx.ts:293,295,307,310,332`) uses `.every()`/
  `.includes()` with no length guard. `.every()` over `[]` is vacuously
  `true`.
- **Consequence:** if a future code change ever produced an empty
  `requiredSigners` array, "all signers submitted" would silently and
  incorrectly evaluate `true` with zero required signers — a latent
  defensive gap, not a currently-exploitable one.
- **Recommended future mission:** a one-line defensive assertion
  (`requiredSigners.length > 0`) at construction time, bundled into
  whichever future mission touches this file next — too small to
  justify its own mission.
- **Blocks Mission 3?** No.

### CSC-D03 — `Intent`'s SDK type uses `?:` where the real wire shape is nullable-not-sparse

- **Domain:** D. **Severity:** Medium. **Classification:** DRIFT — the
  one confirmed break in an otherwise-disciplined convention.
- **Trace:** `packages/sails-sdk/src/types.ts:440-455` declares
  `agentId?: string`, `parentIntentId?: string`, `expiresAt?: string`,
  `fulfilledBy?: string` as optional keys; the matching Prisma columns
  (`schema.prisma:1821-1829`) are nullable (`String?`/`DateTime?`), not
  sparse, and nothing in the route layer strips null-valued keys before
  serialization — the real wire JSON is `"agentId": null` (key present),
  contradicting `types.ts`'s own documented rule (quoted in its own
  comments at lines 213-220/235-246) that `?:` means "endpoint-variant
  absence," not "per-instance nullable data."
- **Consequence:** low today (TypeScript doesn't distinguish `undefined`
  from a JSON `null` strongly enough for this to bite in practice), but
  directly relevant to Domain J — a strict Rust `serde` struct using
  `Option<String>` for a truly-optional key would deserialize
  correctly, but a naive implementation treating this as "sometimes the
  key is just missing" could diverge from one that expects `null`
  explicitly.
- **Recommended future mission:** retype these four fields as `| null`
  (matching the file's own documented convention), bundled with any
  other Intent-facade maintenance.
- **Blocks Mission 3?** No.

### CSC-D04 — Inconsistent UI handling of nullable `displayName`

- **Domain:** D. **Severity:** Low. **Classification:** DRIFT.
- **Trace:** `UserAvatar.tsx:36` and `OfferCard.tsx:46` guard with `??
  'fallback'`; `Topbar.tsx:41`, `TradeParties.tsx:34`, `Profile.tsx:147`,
  `ChatMessage.tsx:38` render `{user.displayName}` raw, showing blank if
  null.
- **Consequence:** cosmetic only — a participant with no display name
  set sees blank text in some UI surfaces and a fallback in others.
- **Recommended future mission:** bundle into any future UI-polish pass;
  too small to justify its own mission.
- **Blocks Mission 3?** No.

### CSC-E01 — BTC decimal-to-sats conversion is float-based in two providers, exact elsewhere

- **Domain:** E. **Severity:** Medium (not Critical — see reasoning).
  **Classification:** DRIFT.
- **Trace:** `multisig.provider.ts:685-687` and
  `lightning-hodl.provider.ts:291-293` both use
  `Math.round(parseFloat(lockedAmount) * 1e8)`; `wdk-settlement.provider.ts:51-66`
  and the SDK's own `wallet-verification.ts:370-376` (`btcToSats()`) use
  exact string-splitting/BigInt arithmetic for the equivalent
  conversion; `safe-guard-evm.provider.ts:76-80`'s own comment names
  the float version as an "accepted existing precedent for realistic
  trade sizes."
- **Why Medium, not Critical, stated explicitly:** float64 exactly
  represents every integer up to 2^53 (≈9.007×10^15); the maximum
  possible Bitcoin amount (21,000,000 BTC) in satoshis is 2.1×10^15 —
  well inside that exact range. For any realistic trade size, this
  conversion is mathematically lossless today, confirmed by the
  arithmetic, not merely asserted.
- **Consequence:** an internal inconsistency (two conversion
  disciplines for the same conceptual operation) and a portability risk
  — a future Rust/Go port copying "the obvious float-multiply pattern"
  from `multisig.provider.ts` without knowing the SDK's own exact
  version exists nearby could reproduce a pattern that is only safe by
  virtue of float64's specific exact-integer range, not by design.
- **Recommended future mission:** migrate `multisig.provider.ts`/
  `lightning-hodl.provider.ts`'s `expectedSats()` helper to the SDK's
  own exact conversion function (or an equivalent exact server-side
  one), closing the inconsistency before it's copied into a second
  language.
- **Blocks Mission 3?** No.

### CSC-E02 — Legacy float `protocolFeeRate` is dead code but still described as live in two files

- **Domain:** E. **Severity:** Low-Medium. **Classification:** DRIFT
  (comment/doc staleness pointing at removed code).
- **Trace:** `src/config/index.ts:488` still parses
  `PROTOCOL_FEE_RATE` via `parseFloat`; `escrow.service.ts:682-687`
  confirms the only real consumer (`chargeProtocolFee()`) was removed
  (Missão 11 Fase 6.5.2) and `feeCharged` is now permanently `null`;
  `src/core/policy-engine.ts:13` and
  `src/modules/open-reputation/reputation.service.ts:154` still contain
  comments describing this value as "read directly by `escrow.service.ts`'s
  `releaseFunds()`," which is no longer true.
- **Consequence:** a reader of either stale comment would believe a
  dead config value is live.
- **Recommended future mission:** correct the two stale comments;
  bundle with any future pass touching either file.
- **Blocks Mission 3?** No.

### CSC-E03 — Two coexisting, non-interchangeable percentage conventions

- **Domain:** E. **Severity:** Informational. **Classification:**
  IMPLEMENTATION-SPECIFIC (each internally consistent, not a bug).
- **Trace:** `protocolFeeRate` (Decimal, 0-1 fraction) vs `buyerBps`/
  `splitBuyerBps` (integer, 0-10000 basis points) — two different units
  for "a percentage," each correctly scoped and consistently used
  within its own domain.
- **Consequence:** none today; named here purely as a Domain-J
  readiness item — a future implementation must know which convention
  applies to which field, since "a fee rate" is not one universal type
  in this protocol.
- **Recommended future mission:** none required; worth one line in a
  future SDK/protocol glossary.
- **Blocks Mission 3?** No.

### CSC-F01 — `Escrow.expiresAt` has two disjoint code paths with opposite boundary conventions

- **Domain:** F. **Severity:** Medium. **Classification:** DRIFT
  (disclosed and deliberate, but a real landmine for any future
  reimplementation).
- **Trace:** `escrow-repository.ts:262-264` (legacy branch): `expiresAt:
  { lt: now }` — exclusive. `escrow-repository.ts:107-115` +
  `expiry-authority.ts:66` (Core-authoritative branch): `<=`/`>=` —
  inclusive, explicitly corrected from the legacy exclusive check
  ("legacy's strict `<` structurally hid equality from ever being
  decided"). Both branches are real, both are scoped to disjoint
  escrow-type sets, both are commented as deliberate.
- **Consequence:** the SAME field means two different things depending
  on which code path reads it. A future Rust/Go port, or even a future
  TS contributor, reproducing "how expiry works" from reading only one
  branch would build the wrong rule for the other.
- **Recommended future mission:** no code change needed (this is
  deliberate) — but this exact duality should be named explicitly in
  `docs/PROTOCOL_INVARIANTS.md` or `docs/DATABASE.md` as a documented,
  intentional per-branch rule, not left to be independently
  rediscovered.
- **Blocks Mission 3?** No.

### CSC-F02 — Race between `contestAutoResolution()` and `sweepExpiredAutoResolutions()` at the exact deadline instant

- **Domain:** F. **Severity:** Medium (final state is always correct;
  the audit trail can be duplicated/mislabeled). **Classification:**
  DRIFT (genuinely new finding).
- **Trace:** `dispute.service.ts:936-960` (manual contest) and
  `dispute.service.ts:1009-1024` (sweep) both do a plain read, an
  application-level deadline check, then a plain (non-conditional)
  `prisma.dispute.update()` — unlike `claimEscrowTransition()`'s
  explicit conditional-`updateMany`-plus-`count===0`-throw idiom used
  everywhere else in the escrow state machine.
- **Consequence:** at the exact deadline boundary, both paths can
  independently update the same row to the same final values but each
  emits its own `dispute.auto_resolution_contested` event with a
  different `contestedBy` attribution (a real contester's id vs. the
  literal string `'window-expired-advisory-only'`) — the persisted
  dispute state converges correctly, but the event/audit trail can
  contain two events for one logical transition, one of them
  mislabeling who caused it.
- **Recommended future mission:** add the same conditional-update
  compare-and-swap guard `claimEscrowTransition()` already uses,
  scoped to this one function pair. Small, bounded, has a clear test
  (simulate the race, assert exactly one event fires).
- **Blocks Mission 3?** No.

### CSC-F03 — Four distinct expiry-enforcement mechanisms coexist

- **Domain:** F. **Severity:** Informational. **Classification:**
  IMPLEMENTATION-SPECIFIC.
- **Trace:** application-level `Date` comparisons (two boundary
  conventions, CSC-F01), Redis TTL for session expiry
  (`auth.ts:94-100,143-152`), advisory-lock-guarded Core evaluator for
  escrow expiry, and owner-supplied-and-locally-verified timestamps for
  `OfferEnvelope` (ADR-001's deliberately decentralized design, "wall-
  clock time isn't trusted across independently-operated nodes").
- **Consequence:** none individually wrong — each is justified in its
  own context — but a future implementer needs to know there are four
  different models, not one, and which applies where.
- **Recommended future mission:** a Domain-J conformance-test
  obligation (see §E below), not a code change.
- **Blocks Mission 3?** No.

### CSC-G01 — Six structurally different "not supported/denied" reasons surface as similarly-worded plain-text errors

- **Domain:** G. **Severity:** Medium. **Classification:** DRIFT.
- **Trace:** `escrow-providers.ts` alone has ≥5 distinct throw sites for
  "not supported"-shaped messages, spanning: (a) structural/rail
  limitation (`lightning-hodl.provider.ts:449`, SPLIT unsupported),
  (b) deployment-not-wired (`escrow-providers.ts:494-497`, no provider
  registered), (c) policy/permission denial (`escrow-lifecycle.ts:148-160`,
  `ForbiddenError` on a missing `CapabilityGrant`), (d) immaturity/
  profile-mismatch (`capability-profile.ts:65-100`), (e) config-toggle
  (`enforceCapabilities` default `false`), (f) genuine SDK-side stub
  (`SailsNotImplementedError`). All surface as plain `Error`/`EscrowError`
  text with no structured discriminator field.
- **Consequence:** a caller (or a future partner integrator) cannot
  mechanically distinguish "this will never work here" from "this isn't
  configured yet" from "you lack permission" from "this deployment
  turned a feature off" without reading source or getting lucky with
  message-string matching.
- **Recommended future mission:** a bounded mission adding a structured
  `reason` category (not a new error framework — an enum field on the
  existing `EscrowError`/generic error shape) distinguishing these six
  cases. Explicitly: this is NOT a new taxonomy — it reuses the
  existing error classes, adding one classificatory field.
- **Blocks Mission 3?** No.

### CSC-G02 — ADR-002's "zero real registry consumers" claim is now partially stale

- **Domain:** G/H. **Severity:** Low. **Classification:** DRIFT (doc
  staleness).
- **Trace:** `escrow.service.ts:183-251`'s `resolveEscrowType()`
  (dated "VERTICAL-SLICE-1, 2026-09-12") is a real, `createEscrow()`-
  reachable consumer of `settlement-scope-registry.ts`/
  `settlement-provider-registry.ts`, scoped to `asset === 'BTC'` only —
  confirmed by the function's own comment explaining why (the SDK
  resolves `type` client-side before the server ever sees an absent
  value, "a real architectural bypass, found during this mission's own
  discovery pass").
- **Consequence:** a reader of ADR-002 alone would believe these
  registries have zero consumers; one now exists, narrowly scoped.
- **Recommended future mission:** a one-paragraph ADR-002 addendum
  (dated, per the existing addendum convention), not a reopening of the
  ADR itself.
- **Blocks Mission 3?** No.

### CSC-H01 — No API/protocol versioning beyond the literal `/v1/` URL prefix

- **Domain:** H. **Severity:** High (for future readiness; not urgent
  today). **Classification:** ARCHITECTURE DECISION REQUIRED.
- **Trace:** every route string has `/v1/` baked in directly per
  `*.routes.ts` file; `API_VERSION` (`app.ts:44-48`) is the root
  `package.json`'s npm semver, exposed via health/root/Swagger, not an
  independent schema-version field; no code or mechanism found that
  would let a `/v2/` coexist with `/v1/` without a hard cutover.
- **Consequence:** today, with one TypeScript client, this is not
  urgent. Once a second-language SDK exists, a breaking protocol change
  would require every client (TS, Rust, Go) to move simultaneously —
  no graceful coexistence period is architecturally possible without
  first adding prefix-parameterization.
- **Recommended future mission:** an Architecture Decision Mission
  (not implementation) to decide the versioning strategy before it's
  urgently needed — this is exactly the kind of decision
  `docs/ENGINEERING_GOVERNANCE.md` §16.1 says should be resolved while
  there's still room to choose, not retrofitted under pressure.
- **Blocks Mission 3?** No — but should be sequenced before any
  Rust/Go SDK work begins (see §E).

### CSC-H02 — SDK package version and protocol semantic version are conflated and already diverged

- **Domain:** H. **Severity:** High. **Classification:** PRODUCT
  DECISION REQUIRED.
- **Trace:** `packages/sails-sdk/package.json` version `0.1.3`; root
  `package.json` (server) version `0.1.1` — already two different
  numbers. `docs/API_STABLE.md`'s own "what v1 means" section frames
  the freeze commitment purely in terms of the SDK's own npm semver
  (`0.1` → `1.0`), with no separate "protocol semantic version" concept
  anywhere. `prisma/schema.prisma`'s `protocolVersion` column exists
  but (confirmed by grep) is write-only provenance — never read back,
  never enforced, never exposed via any API response.
- **Consequence:** nothing today distinguishes "which SDK build" from
  "which protocol semantics" — a reader could easily (and currently
  would have no way not to) conflate the two. This is exactly the axis
  a second-language SDK needs to declare its own compatibility against
  independently of the first SDK's own release cadence.
- **Recommended future mission:** a Product Decision — define protocol
  semantic versioning as a concept independent of any single SDK
  package's version, before a Rust or Go SDK is versioned against
  something that doesn't yet have an independent identity.
- **Blocks Mission 3?** No — but should be sequenced before any
  Rust/Go SDK work begins (see §E).

### CSC-H03 — Unknown object keys are silently stripped; unknown enum values are explicitly rejected — inconsistent within the same schema files

- **Domain:** H. **Severity:** Medium. **Classification:** DRIFT.
- **Trace:** zero `.strict()`/`.passthrough()` calls anywhere in `src/`
  (confirmed by repo-wide grep) — every Zod object schema silently
  drops unrecognized keys by default. Enum fields (`z.enum([...])`)
  reject an unrecognized value explicitly with a structured 400.
- **Consequence:** a newer client (a future TS SDK version, or a Rust/Go
  client) sending an additive field this server doesn't yet recognize
  gets **silent, invisible discarding** — no error, no warning — while
  the identical client sending an unrecognized enum value gets a loud,
  correct rejection. A client believing it successfully set a new field
  would have no signal that it didn't.
- **Recommended future mission:** a bounded decision + implementation —
  either adopt `.passthrough()` (preserve-but-ignore, detectable) or an
  explicit "unknown fields present" warning mechanism, consistently
  applied. This is a Domain-H forward-compatibility question, not an
  error-taxonomy one.
- **Blocks Mission 3?** No — but directly relevant to CSC-H01/H02's
  future-implementation sequencing.

### CSC-I01 — `escrow.service.ts`/`dispute.service.ts` have zero logging

- **Domain:** I. **Severity:** Low-Medium. **Classification:** DRIFT
  (debuggability, not security).
- **Trace:** grepped both files (1122 and 1065 lines respectively) for
  any logger call — zero matches. They rely entirely on the durable
  EventStore/`correlationId` mechanism and thrown `AppError`s.
- **Consequence:** an operator grepping pino stdout/stderr cannot
  reconstruct the happy-path settlement/dispute flow — only the
  EventStore/Timeline API (`GET /v1/proof/trades/:tradeId/bundle`) can.
  This is a real but narrow gap: the durable record exists, it's just
  not in the log stream operators conventionally reach for first.
- **Recommended future mission:** add minimal, domain-ID-tagged log
  lines at the same points these services already emit events — low
  effort, bundled with any future pass through these files.
- **Blocks Mission 3?** No.

### CSC-I02 — `src/app.ts`'s request-logger config has drifted from the standalone logger's credential-scrubbing config

- **Domain:** I. **Severity:** Medium (flagged conservatively — security-
  adjacent). **Classification:** EVIDENCE GAP.
- **Trace:** `src/app.ts:79-96`'s Fastify logger config sets only
  `redact: { paths: ['req.headers.authorization', 'req.headers.cookie',
  'token'] }`; it does not import or apply `src/common/logger.ts`'s
  fuller `redact.paths` (covering `password`/`secret`/`databaseUrl`/
  `seed`/`privateKey`/`mnemonic`/`wif`/`xprv`) or its custom
  connection-string-credential-scrubbing `err` serializer. The one
  generic catch-all (`app.ts:289`, `app.log.error(error)`) is therefore
  not covered by that scrubber.
- **Honest limitation, stated rather than guessed past:** whether this
  constitutes a real leak path depends on exactly how Pino serializes a
  bare `Error` object in this specific version pairing — not verified
  in this pass (a runtime check, not a code-reading exercise, would be
  required). Reported as `EVIDENCE GAP`, not asserted as a confirmed
  leak.
- **Recommended future mission:** a small, bounded verification-first
  mission — first confirm empirically whether the gap is real (harness:
  trigger the generic 500 handler with an error whose message contains
  a fake credential-shaped string, inspect the actual log line), then
  fix only if confirmed.
- **Blocks Mission 3?** No.

### CSC-I03 — No explicit treatment of whether logging a raw transaction id is itself a privacy consideration

- **Domain:** I. **Severity:** Low. **Classification:** PRODUCT DECISION
  REQUIRED.
- **Trace:** real Bitcoin txids are deliberately logged (e.g.
  `multisig.provider.ts:1356-1359`) specifically to detect
  provider/explorer disagreement — a legitimate, disclosed reason. No
  comment or doc anywhere discusses whether a txid itself carries
  chain-analysis counterparty-linkage risk.
- **Consequence:** none confirmed — this is a question not yet asked,
  not a confirmed problem.
- **Recommended future mission:** none required unless a future privacy
  review decides txid-logging policy needs a formal statement.
- **Blocks Mission 3?** No.

### CSC-J01 through CSC-J05 — Cross-Implementation Readiness synthesis

See §E (Rust/Go Readiness) below — these are synthesis findings across
A-I, not independent new investigation, per the mission's own framing
of Domain J as an assessment of existing findings' portability.

---

## D. Mission 3 Impact

**Does any finding block starting Mission 3 design?** No.

**Does any finding block Mission 3 implementation?** No — every finding
above is either already-tracked debt (CSC-B03/B04, cross-referencing
`RECOVERY_RECONCILIATION_CONFORMANCE_EVIDENCE.md`), a bounded doc/SDK
fix independent of the P2P journey (CSC-A01/A02/C01-C04/D01-D04/E01-E03/
G01-G02/I01-I03), or an architecture/product decision explicitly
sequenced for *before Rust/Go work*, not before Mission 3
(CSC-H01/H02/H03).

**Which findings must be consumed by Mission 3?**
- CSC-B01 (`createTrade()` has no idempotency) — Mission 3 designs the
  economic-commitment journey; it should know a network retry can
  currently double-create a trade before designing UX around "accept
  offer."
- CSC-C04 (`deriveTradeState()` is dead code) — if Mission 3's journey
  work assumes a derived-state layer exists as the UI's source of
  truth, it does not today; Mission 3 should decide whether to wire it
  in or continue reading raw statuses directly.
- **P3-F08.1 and P3-F08.2** (app-wide session-expiry handling;
  trade-context-preserving re-auth return path) — **already registered**
  at `docs/BACKLOG.md` item 34, from `PRE-M3-REALITY-GATE-1`. Not
  duplicated here, not lost — restated only to confirm this audit found
  nothing that changes their disposition. They remain open Product/
  Architecture decisions Mission 3 must consume explicitly, exactly as
  already stated.

**Which can safely remain future work?** Everything else in §C —
none of it touches the P2P journey/documentation surface Mission 3
operates on.

---

## E. Rust/Go Readiness

**Semantic contracts already portable** (would reproduce correctly in
an independent Rust or Go implementation without copying TypeScript
internals):
- Money as a decimal string on the wire (RFC-009's `Decimal` columns,
  consistently typed as `string` in `packages/sails-sdk/src/types.ts`,
  never a bare JSON number) — verified via `decimal.js`'s own
  `toJSON()`/`valueOf()` always producing a quoted string.
- The JSON error envelope shape (`{ success, error, message, details,
  requestId, docsUrl }`) and its HTTP-status-to-code mapping (modulo
  CSC-A01's 4 uncovered codes).
- Split/fee-distribution exact-remainder allocation (`economic-outcome.ts`,
  `fee-obligation.service.ts`) — pure integer/BigInt arithmetic with an
  explicitly-named remainder beneficiary; conservation is provable by
  construction, language-independent.
- The `EscrowStatus`/`TradeStatus` enums and their transition graphs
  (once CSC-C03's doc staleness is fixed) — these are simple, explicit,
  finite state machines with no JS-specific behavior.
- Zod schema definitions could, in principle, generate an OpenAPI/JSON-
  Schema artifact other languages could codegen against (Swagger is
  already wired per `app.ts`'s `openapi.info.version`) — not yet done,
  but the raw material exists.

**Contracts still TypeScript/library-implicit:**
- **CSC-J02a — Decimal serialization is implicit, not specified.**
  The wire format ("a string, up to 8 decimal places, decimal.js's own
  formatting rules") exists only as an emergent property of which JS
  library happens to be used, never written down as an explicit,
  language-independent contract. A Rust `rust_decimal` or Go
  `shopspring/decimal` implementation would need this stated explicitly
  (exact max precision/scale per field, rounding mode, sign
  representation) rather than inferred from `decimal.js`'s behavior.
- **CSC-J02b — the `?:`/`| null` distinction (CSC-D03) has no
  cross-language equivalent without an explicit contract.** TypeScript's
  "key omitted" vs. "key present with `null`" distinction is a
  JS/JSON-level nicety; Rust's `serde` needs `#[serde(skip_serializing_if
  = "Option::is_none")]` or `Option<Option<T>>` gymnastics to replicate
  it exactly, and a naive implementation would likely collapse the two.
- **CSC-J02c — the dual expiry-boundary convention (CSC-F01) is
  entirely undocumented as a duality.** A second implementation
  reading only one code path (as this audit's own research agent
  initially did, before independent verification) would build the
  wrong rule for the other branch.
- **CSC-J05 (new, synthesis-only finding) — Go zero-value collision
  risk.** Go's zero values (`0`, `""`, `false`) are indistinguishable
  from "not set" unless a Go SDK author deliberately uses pointers or
  a nullable wrapper type everywhere the TS `| null` convention applies.
  Concretely: `buyerBps: 0` is a real, valid "0% to buyer" split
  outcome, not "not applicable" — a naive Go struct field `BuyerBps int`
  would conflate these two facts where a TypeScript `number | null`
  does not. This applies to every `| null`-typed numeric/boolean field
  catalogued across Domain D.

**Required future conformance tests** (candidate obligations, not
implemented here):
1. A cross-language "given this JSON error envelope, classify it per
   the Failure Taxonomy" test — one fixture set, run against every
   client implementation.
2. A "given this Decimal-string amount, round-trip through your
   language's decimal type and re-serialize — must match byte-for-byte"
   test, covering edge cases (max precision, negative, zero).
3. An expiry-boundary test suite, explicitly covering each of the
   distinct conventions found in CSC-F01/F03, keyed to the exact field/
   escrow-type each applies to.
4. An "unknown field" test pair: sending an additive unknown field must
   have one defined, consistent behavior (not silently vary), and
   sending an unrecognized enum value must be rejected identically
   across all future clients.

**Blockers before any Rust/Go SDK implementation**, in dependency
order:
1. **CSC-H02** (protocol-version vs. SDK-version conflation) — resolve
   first; a second-language SDK needs an independent version axis to
   declare compatibility against.
2. **The Decimal-serialization contract (CSC-J02a)** — write it down
   explicitly, independent of `decimal.js`.
3. **CSC-F01's dual expiry convention** — resolve or exhaustively
   document per-field before a second implementation attempts to
   reproduce expiry logic generically.

None of these three are implementation work — they are Decision or
Documentation missions, sequenced before, not blocking, Mission 3.

---

## F. Backlog Delta

Duplication check performed before registering anything: searched
`docs/BACKLOG.md`, `docs/TECHNICAL_DEBT_AUDIT.md`, `docs/NORTE_FIXO.md`,
`docs/PRODUCT_INTERACTION_MODEL.md`, `docs/SYSTEM_COHERENCE_INTEGRATION_AUDIT.md`,
and the relevant ADR/RFC set before writing each item below.

- **Extends `docs/BACKLOG.md` item 35** (Unified Error & Recovery
  Semantics) — add `REQUEST_ERROR` to its named-codes list (CSC-A01
  found a 4th uncovered code beyond the 3 already named).
- **Reuses `docs/RECOVERY_RECONCILIATION_CONFORMANCE_EVIDENCE.md` §28**
  — CSC-B03/B04 sharpen, not duplicate, its already-registered
  "LIGHTNING_HODL/SAFE_GUARD_EVM have zero automated crash-recovery"
  finding with a more precise mechanism-level root cause.
- **Reuses `docs/BACKLOG.md` item 34** — P3-F08.1/F08.2 restated, not
  duplicated (§D above).
- **This audit itself registers as `docs/BACKLOG.md` item 36** (a
  pointer to this document, not a duplicate of it), carrying four new
  bounded obligations as its own sub-items:
  - **Item 37 — Trade/Offer/Evidence Creation Idempotency**: bundles
    CSC-B01 and CSC-B02 (both are the same class of gap: no idempotency
    key on a POST that creates a durable record). Single future
    mission, narrow scope.
  - **Item 38 — SDK Type-Shape Reconciliation**: bundles CSC-C01 and
    CSC-D01 (both are "two SDK-adjacent type declarations disagree
    about the same real shape"). Single future mission.
  - **Item 39 — Capability-Denial Reason Structuring**: CSC-G01 alone;
    adds a `reason` category to existing error classes, no new
    taxonomy.
  - **Item 40 — Protocol Version / Cross-Implementation Readiness**:
    bundles CSC-H01, CSC-H02, CSC-H03, and the Rust/Go blockers named
    in §E. This is explicitly a Decision Mission (per
    `docs/ENGINEERING_GOVERNANCE.md` §16.3), not an implementation
    mission — it should run before any Rust/Go SDK work, not before
    Mission 3.
- **Not registered as new items** (bundled into "next time this file is
  touched" rather than a dedicated mission, per proportionality):
  CSC-C02, CSC-C03, CSC-D02, CSC-D04, CSC-E01, CSC-E02, CSC-G02, CSC-I01,
  CSC-I03 — each named precisely above with its own recommended action,
  none large enough to justify its own numbered backlog item or
  mission.
- **CSC-I02** — not registered as a fix-it item; registered as a
  verification-first item (confirm before fixing), distinct from the
  others.
- **No new macrofront** created in `docs/NORTE_FIXO.md` — this audit's
  findings are cross-cutting corrections, not a new conceptual front.

---

## G. Recommended Sequencing

The smallest set of next missions, in dependency order:

1. **Bounded corrective mission** (items 37-39: CSC-B01/B02, CSC-C01/
   D01, CSC-G01): a single, moderate-sized mission fixing the concrete,
   low-risk, non-architectural items — trade/offer/evidence
   idempotency, `ArbiterProfile`/`DisputeStatus` type reconciliation,
   capability-denial reason structuring. All bounded, all testable with
   the existing harness patterns this session has already established.
2. **Architecture Decision Mission** (item 40: CSC-H01/H02/H03) —
   resolve protocol-versioning strategy and the SDK-version/protocol-
   version conflation. Must complete before any Rust/Go SDK work
   begins; does not block Mission 3.
3. **Research mission** (CSC-B03/B04's Architecture Decision half) —
   determine the actual replay/double-broadcast safety property of
   Ark/VTXO (LIGHTNING_HODL) and ERC-4337 UserOp (SAFE_GUARD_EVM)
   finalize retries. A Decision Mission, not implementation, per
   `docs/ENGINEERING_GOVERNANCE.md` §16.3.

Everything else (CSC-C02/C03/C04/D02/D04/E01/E02/G02/I01/I02/I03)
bundles into whichever future mission next touches its own file —
no dedicated mission needed for any of them individually.

Mission 3 itself may proceed in parallel with any of 1-3 above — none
of them are a prerequisite, per §D.

---

## H. Blind-Spot Pass (performed once; no new systemic category surfaced requiring a second loop)

- *What semantic contract exists only because TypeScript makes it
  convenient?* The `?:`/`| null` distinction itself (CSC-D03/J02b).
- *What would Rust force us to specify?* Exact Decimal serialization
  (CSC-J02a); explicit per-field null-vs-absent semantics (CSC-D03).
- *What would Go zero values expose?* CSC-J05 (new) — `buyerBps: 0` vs.
  "not applicable" collision risk.
- *What would a partner wallet misunderstand without our context?* That
  error-type stability is part of the frozen contract, when
  `API_STABLE.md` never actually promises this (CSC-A02).
- *What would an independent integrator guess incorrectly?* That an
  unrecognized-but-sent field was accepted, when it was silently
  dropped (CSC-H03).
- *What would fail under network interruption?* Trade/offer/evidence
  creation (CSC-B01/B02); non-WDK finalize/broadcast retries (CSC-B03).
- *What would silently duplicate economic action?* Same as above —
  bounded by protocol-specific factors for MULTISIG, unresolved for
  LIGHTNING_HODL/SAFE_GUARD_EVM (honest `EVIDENCE GAP`, not assumed).
- *What would produce different values due to precision/rounding?*
  CSC-E01 (safe today, fragile pattern); the dual percentage convention
  (CSC-E03, not itself a bug).
- *What state could be shown as final before runtime knows it is
  final?* Already covered by CSC-B03/B04 and the already-disclosed
  MULTISIG-only reorg-sweep scope.
- *What semantic ambiguity could become a security problem rather than
  a UX problem?* CSC-I02 (logger-config drift) — explicitly the
  category this question is asking about; flagged as `EVIDENCE GAP`,
  not confirmed, not ignored.
- *What assumption did we not inspect because current tests happen to
  pass?* CSC-D02 (`requiredSigners` empty-array vacuous-true risk) —
  no current test exercises this path, which is precisely why it's
  never been caught.

**Stop condition met**: no new Critical/High cross-layer semantic
defect emerged from this pass that isn't already classified above under
an existing domain. One second-order synthesis finding (CSC-J05)
emerged and is folded into §E — not a new systemic category requiring
a fresh A-J sweep.

---

## I. Validation

This is a documentation-only mission. No `tsc`/test-suite run is
required or claimed as evidence here — every material finding above
cites its own direct file:line evidence, read from the actual current
source on this branch, not inferred from green CI (per this mission's
own explicit instruction: "Use actual repository evidence. Green CI is
not enough.").

## J. Recommendation

**CROSS-LAYER-SEMANTIC-CONTRACT-AUDIT-1 COMPLETE — CROSS-LAYER SEMANTIC
DRIFT, GAPS AND PORTABILITY RISKS MAPPED — NO IMPLEMENTATION CHANGES
MADE — READY FOR CTO GATE**

STOP. No merge without CTO Gate.
