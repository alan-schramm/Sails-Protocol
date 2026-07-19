# TODO.md
### Sails Protocol — Engineering Handoff · Document 11 of 20

> This list is derived from an actual filesystem audit of the reference
> implementation fragment, not from memory or assumption. Verify current
> state yourself before starting work — code may have moved since this
> handoff was written.

> **Re-audited 2026-07-16.** The previous version of this file had drifted
> out of sync with the codebase — several items it listed as missing or
> not-started had already been built (in the "MVP happy path" and
> "sails-p2p-schemas" work), but this file was never updated to reflect
> that. Fixed below, with the stale claims struck and moved to section 13
> rather than silently deleted, so it's clear what changed and why. For
> granular, frequently-updated per-item status, `BACKLOG.md`'s P0-P3
> tables are the more authoritative source — this file organizes by
> category (missing files, auth, tests, deployment) rather than by
> architectural dependency order, but the two must not contradict each
> other. If you find them disagreeing again, trust the filesystem, fix
> both, and don't leave the fix to whoever notices next.

> **Updated same day, route-restoration pass.** Section 1's biggest gap —
> HTTP routes for open-identity, open-p2p, open-settlement, and
> open-liquidity — is now closed. `npm run build` and `npm test` both pass
> with the new routes registered in `app.ts`.

> **Updated again same day — open-reputation built.** The one module this
> file flagged as more than route wiring (needed a real service layer,
> not just an HTTP shell) is now done: `reputation.service.ts` +
> `reputation.routes.ts`, with `recordOutcome()` wired dispute-aware into
> `common/events/handlers.ts`. Section 1 is now fully closed — every
> module has both routes and a real service layer. `npm run build`/
> `npm test` pass at 58 tests, 5 suites.

---

## 1. Missing Files (referenced by `app.ts` but not present in this environment)

`config/index.ts`, `common/database/index.ts`, `common/redis/index.ts`,
and `common/errors/index.ts` — all previously listed here as missing —
**now exist and are imported directly (uncommented) at the top of
`app.ts`.** See section 13. Route wiring is also done now, for every
module including `open-reputation` — see 13 for each. **This section is
now fully closed.**

- [x] **`src/main.ts` itself — found genuinely missing, fixed** *(new —
      root-level demo-satsails-qvac.ts pass, 2026-07-17)*. This section's
      "the server boots" claim below was never actually verified end to
      end: `package.json`'s `dev`/`start` scripts both referenced
      `src/main.ts`, but the file did not exist anywhere in the repo —
      confirmed by actually running `npm run dev`
      (`Error: Cannot find module 'src/main.ts'`), not assumed. Fixed
      with a thin entrypoint that calls `app.ts`'s already-real, complete
      `startServer()`. Also found and fixed along the way:
      `package.json`'s `"start"`/`"main"` pointed at `dist/main.js`, but
      `tsc`'s actual output lands at `dist/src/main.js` — `tsconfig.json`
      has no explicit `rootDir`, and the `@sails/p2p-schemas` path
      mapping (`paths` → `packages/sails-p2p-schemas/src/index.ts`) pulls
      that file directly into the same compiled program, shifting the
      inferred common root up to the repo root. Both scripts now point
      at the real `dist/src/main.js`. Verified: `npm run dev` and
      `npm start` both now resolve and run cleanly up to the expected,
      already-documented "no live Postgres/Redis in this environment"
      failure point — no more `MODULE_NOT_FOUND`.

## 2. Immediate Priority — Restore a Runnable Server

**Resolved, and now actually verified (previously an unverified claim —
see section 1's new note above).** `config/index.ts`,
`common/database/index.ts`, `common/redis/index.ts`,
`common/errors/index.ts`, and `main.ts` all exist, and
`routes/intentRoutes.ts` is registered in `app.ts` — the server boots
(given a reachable Postgres/Redis) and serves a real, tested route today.
This section previously blocked "almost everything else" per the closing
note below; it no longer does. **What's now the practical next blocker**
(not urgent in the "won't boot" sense, but the highest-leverage next
step): restoring the route files listed in section 1 above, so the
service layers that already exist for OpenSettlement, OpenLiquidity, and
the OpenP2P negotiation channel are actually reachable over HTTP/WS —
see `BACKLOG.md`'s "Why the Order Differs From Pure Priority" note, which
makes the same point in more detail.

## 3. Auth Middleware (status changed — closed)

- [x] Ed25519 signature verification middleware — `common/middleware/
      auth.ts` implements real challenge-response auth, closing
      `RED_TEAM_REVIEW.md` RT-002 (previously the highest-priority open
      security item here). See `BACKLOG.md` P2, "Sails OpenIdentity" row.
- [x] **Now wired.** Every write-side route added in the route-restoration
      pass (identity, peers, liquidity offers, trades, settlement/dispute)
      uses `requireAuth` as a `preHandler` and reads `request.participantId`
      — never a bare `userId`/`participantId` from the request body. Fixed
      a real bug found while wiring this: `verifySignedChallenge()`
      generated and stored a session token but never returned it to the
      caller, so the challenge-response flow was unusable end-to-end
      despite verifying correctly — see `common/middleware/auth.ts`.

## 4. Settlement Providers Beyond Mock

- [x] **`WDK_USDT_EVM`** *(new — QVAC/WDK MVP pass, 2026-07-17)* — real,
      not a stub: `wdk-settlement.provider.ts` uses
      `@tetherto/wdk-wallet-evm` for lock/release/refund, all real
      on-chain testnet transfers with real transaction hashes. Only
      active when `MOCK_ESCROW=false` and `WDK_SEED_PHRASE`/
      `WDK_USDT_CONTRACT` are set (`.env.example`) — inert otherwise, per
      RED_TEAM_REVIEW.md RT-001's existing gate. **Honest limitation, not
      hidden:** single-seed, two-hop escrow (one seed controls treasury
      + every per-trade escrow sub-account) — a real step up from `MOCK`,
      not yet a trustless multisig. `toBaseUnits()`/`escrowIndexFor()`
      (the pure, deterministic parts) are unit-tested in
      `tests/wdkSettlementProvider.test.ts`; the live wallet calls need a
      funded testnet key to verify, which wasn't available in this
      environment — same "cannot verify without live infrastructure"
      limitation the items below already have.
- [x] **`executeSettlement()`** *(new — same day, follow-up pass)* —
      `settlement-orchestrator.ts`'s real entrypoint: createEscrow ->
      lockFunds (real signed WDK collateral) -> markPaymentSent ->
      emulated seller PIX-receipt confirmation (`pixConfirmation.emulated:
      true`, explicitly labeled — Sails OpenProof, RFC-003, is still 📋
      future, this does not pretend to have built it) -> releaseFunds
      (real signed WDK USDT transfer). Reuses the existing
      `escrowService.releaseFunds()` -> `WdkSettlementProvider` ->
      `@tetherto/wdk-wallet-evm` signing path rather than adding a second
      WDK integration — checked against the real npm registry first:
      `@tetherto/wdk-core` does not exist as a package; the actual
      multi-chain umbrella package is `@tetherto/wdk`, a different thing
      from the chain-specific `@tetherto/wdk-wallet-evm` this codebase
      already correctly uses. Wired to `openp2p.trade.created`
      (`common/events/handlers.ts`) — this codebase's real stand-in for
      "the P2P engine gives Match," since the Intent Engine's own
      `MATCHED` state has no real matching engine wired to it — gated
      behind `config.features.autoSettleOnMatch` (default `false`,
      `AUTO_SETTLE_ON_MATCH` env var): that event fires for every real
      trade, not only demo/agent-driven ones, so autonomous fund release
      with no dispute-window step is not a safe unconditional default.
      `src/demo/pix-to-usdt-flow.ts`'s steps 8-9 now call this single
      function instead of re-implementing the sequence inline. Tested in
      `tests/settlementOrchestrator.test.ts` (6 tests, mocked
      `escrow.service.ts`) and `tests/autoSettleHandler.test.ts` (3 tests
      — confirms the flag actually gates it, and that a settlement
      failure doesn't crash the event dispatcher).
- [x] **Two-person control on release** *(new — RFC-015,
      `rfcs/RFC-015-dual-authorization-escrow-release.md`, 2026-07-18)* —
      a real, application-layer mitigation for the single-seed custody
      gap named above, not a claim of real multisig (checked and
      rejected for this pass: `@tetherto/wdk-wallet-evm-erc-4337` is
      single-owner-only against its real compiled types).
      `escrow.service.ts`'s `releaseFunds()` — the one real choke point
      for every release, across all three of its real callers — now
      requires both `Trade.buyerId` and `sellerId` to have separately
      called `POST /v1/settlement/escrow/:id/approve-release` before a
      normal (non-disputed) release proceeds, behind
      `config.features.requireDualApprovalForRelease`
      (`REQUIRE_DUAL_APPROVAL_RELEASE`, default `false` — turning it on
      changes `executeSettlement()`'s calling pattern, see the RFC's
      Decision §5). Also fixed a real gap found while building this:
      RFC-014's capability check had shipped inside
      `settlement-orchestrator.ts` only, missing the direct release route
      and the arbitrated-dispute release path — both checks now live
      inside `releaseFunds()` itself. 13 new tests
      (`tests/escrowReleaseControls.test.ts`).
- [ ] `LightningHodlProvider` — currently throws `EscrowError('not yet
      implemented')` for every method. Needs a real LND/CLN integration.
- [ ] `LiquidCovenantProvider` — does not exist yet at all, only referenced
      as an `EscrowType` enum value.
- [ ] Real Multisig 2-of-3 Bitcoin escrow — not implemented; only `MOCK`
      and now `WDK_USDT_EVM` are functional today. RFC-015's two-person
      control (above) is a real mitigation for *who may trigger* a
      release, not a substitute for this.

## 5. Liquidity Providers Beyond Internal

- [ ] `HodlHodlProvider.isAvailable()` always returns `false` — the
      integration is a stub. Real implementation needs to call
      `https://hodlhodl.com/api/v1/offers` per the TODO comments already in
      `liquidity.service.ts`.

## 5B. OpenAgents — QvacAgentProvider + BuyerAgent/SellerAgent *(section added QVAC/WDK MVP pass 2026-07-17, consolidated same day)*

- [x] `modules/open-agents/qvac-agent.provider.ts` (`QvacAgentProvider`) —
      OpenAgents' first real capability, previously 📋 Aspirational with
      zero code (`PROJECT_CONTEXT.md` §4). Uses the real `@qvac/sdk`
      (local LLM inference, `loadModel`/`completion`/`unloadModel`, no
      cloud dependency), matching `ARCHITECTURE.md`'s "risk analysis
      locally, without cloud dependency" description of the module.
      **Consolidated from an earlier, narrower `qvac-risk.service.ts`**
      (same day, follow-up pass) into one class every agent capability
      shares a model load/dispose cycle through — `assessIntentRisk()`
      (unchanged behavior, moved here), plus two new structured-generation
      capabilities: `generateTradeIntent()` and `generateOfferIntent()`.
      Live-verified in this environment: first call downloaded the model
      (LLAMA_3_2_1B_INST_Q4_0, ~737MB, ~167s); cached, later calls run in
      ~7-9s with coherent output.
- [x] `modules/open-agents/wallet-agent.ts` + `buyer-agent.ts` +
      `seller-agent.ts` — two local agents simulating two Satsails Wallet
      instances, each holding a real `participantId` and a stable
      `agentId` (distinct identifiers — `Intent.agentId` records *which
      agent* acted, `Intent.participantId` records *for whom*).
      `BuyerAgent.requestUsdtViaPix()` autonomously generates a real
      `TradeIntentPayload` (`common/types/intent.ts`, frozen since
      Protocol Freeze v8.8) from a plain-language goal — live-verified:
      `{"asset":"USDT_ERC20","side":"BUY","maxValue":"20.5","minValue":"0","currency":"BRL","fiatMethod":"PIX"}`,
      structurally valid against `core/intent-engine.ts`'s own
      `validateStructure()`. `SellerAgent.offerUsdtForPix()` is the
      symmetric capability for `liquidity.service.ts`'s offer shape
      (minus `priceUsd`, deliberately not QVAC's to decide — no live
      price feed, see that file's own doc comment). 5 tests in
      `tests/walletAgents.test.ts` (mocked `@qvac/sdk` — re-running the
      real ~737MB model on every `npm test` would make CI unusable; the
      live run above already proved the real SDK path works).
      `core/intent-engine.ts`'s `create()` now threads `agentId` through
      (the field already existed in `Intent`'s frozen shape and the
      Prisma schema, just was never wired to the one function that
      creates Intents — filling in already-specified surface, not new
      protocol surface, no RFC needed).
- [ ] **Still open:** these are narrow capabilities (structural-shape
      risk assessment, and turning a stated goal into a valid payload
      shape) — not the full OpenAgents module. No HTTP route exists for
      any of this — it's called directly from
      `src/demo/pix-to-usdt-flow.ts` and the agent classes, not exposed
      over `/v1/agents/*` yet.
- [x] **RFC-007 D5 (Timeline) + D7 (Social Engineering Agent) — real as
      of RFC-017** *(same day, direct owner instruction: "Construir o
      Social Engineering Agent de verdade")* — `core/timeline.ts` (a
      real, `correlationId`-keyed read-model, corrected from D5's literal
      `intentId`-keyed interface — see RFC-017's own Motivation) backed
      by a new `EventStore.getEvents()` query capability;
      `social-engineering-agent.ts`'s `SocialEngineeringAgent.evaluate()`
      (D7's own interface) uses QVAC to detect 2 of 3 named patterns
      (`off_channel_migration`/`payment_instruction_change`) from real
      chat messages, raising a real `RISK_WARNING` in the trade's chat —
      detection only. Off by default
      (`config.features.socialEngineeringDetection`). See
      `docs/rfcs/RFC-017-timeline-and-social-engineering-agent.md` and
      `BACKLOG.md`'s own rows for the full detail, including what's
      still explicitly not built (`unexpected_flow_deviation` detection,
      real Policy Engine integration).
- [ ] **Model output quality caveat, observed directly, not theorized:**
      the smallest model in QVAC's registry (`LLAMA_3_2_1B_INST_Q4_0`,
      1B params) occasionally produces internally inconsistent or
      degenerate output — `risk: "high"` paired with
      `recommendation: "proceed"` in one risk-assessment run;
      `minValue: "0"` and a `SellerAgent` offer with
      `minAmount === maxAmount` in the live BuyerAgent/SellerAgent run
      above. Expected behavior for a model this small, not a bug in the
      integration — every one of these outputs is still structurally
      valid JSON matching the requested schema, just not always a
      *sensible* value. A production deployment gating real money
      movement on agent-generated amounts should evaluate a larger model
      and/or add explicit range sanity checks before trusting these
      values, beyond the structural validation `intent-engine.ts` already
      does.

## 6. Rate Limiting & API Keys (status changed — per-IP resolved)

- [x] `@fastify/rate-limit` is real *(2026-07-18)* — global default
      (`config.rateLimit.max`/`timeWindow`, 100/min per IP) plus a
      tighter, independently-tracked override on the two identity
      challenge/authenticate routes (`config.rateLimit.authMax`/
      `authTimeWindow`, 10/min per IP each — the routes a credential-
      stuffing attempt actually hits, RED_TEAM_REVIEW.md RT-002). Found
      and fixed a real bug while wiring this: `app.ts`'s error handler
      previously flattened every non-`ZodError`/non-`AppError` to a
      generic 500, silently turning the rate-limit plugin's real 429
      into a misleading one — now any error carrying its own valid
      4xx/5xx `statusCode` is respected. Verified in
      `tests/rateLimit.test.ts` (4 tests, isolated `buildApp()` instance
      so its deliberately-exceeded limits don't pollute `routes.test.ts`'s
      shared counter) — 159 tests project-wide, all passing.
- [ ] **Still open:** per-API-key tiers (only per-IP exists today); a
      deployment behind a reverse proxy needs Fastify's own `trustProxy`
      option configured separately for `request.ip` to reflect the real
      client, not the proxy.

## 7. Intent Engine Tables (status changed — mostly resolved)

- [x] `Intent` and `IntentEvent` tables exist in `schema.prisma` and are
      real, verified via `npm run build`/`npm test`/HTTP round-trip
      (`BACKLOG.md` P0). This is 2 tables, not the 3 originally sketched
      in `PROTOCOL_SPECIFICATION.md` §2.6 — that section explains why a
      separate `intent_payloads` table wasn't needed.
- [x] `core/coordination-engine.ts`'s stub is resolved — `decide()` is now
      real (RFC-012, `rfcs/RFC-012-intent-validation-and-coordination.md`).
      `intent-engine.ts`'s `create()` runs `CREATED → VALIDATED →
      COORDINATED` through the existing hash-chained `transition()`
      mechanism, so `create()` now returns an Intent in `COORDINATED`
      status rather than `CREATED`. `IntentStatus` also had a duplicate
      declaration (`common/types/intent.ts` and `core/state-machine.ts`
      each defined their own) — fixed as part of the same RFC:
      `common/types/intent.ts` is now the single source of truth,
      `state-machine.ts` imports and re-exports it. `policy-engine.ts`'s
      governed-policy interface and `capability-registry.ts` remain
      untouched stubs — `coordinationEngine.decide()` does not consult
      either, a deliberate scope decision documented in RFC-012's
      Alternatives Considered.
- [x] `core/capability-registry.ts`'s stub is resolved — real
      `grant()`/`check()`/`revoke()`/`listGrants()` against a new
      `CapabilityGrant` Prisma table, plus real routes
      (`POST /v1/capabilities/register`, `GET /v1/capabilities/:participantId`,
      `POST /v1/capabilities/:grantId/revoke`) *(new — RFC-013,
      `rfcs/RFC-013-capability-registry-and-wallet-adapter.md`,
      2026-07-18)*. `coordinationEngine.decide()` still doesn't consult it
      (RFC-012's scope cut, unrevisited) — this closed the "the registry
      itself doesn't exist" half of that gap, not the "nothing calls it
      yet" half (that half closed by RFC-014 below). `policy-engine.ts`'s
      governed-policy interface remains the one still-untouched stub among
      the 6 formal Core components.
- [x] **Capability Registry actually has real callers now** *(new —
      RFC-014, `rfcs/RFC-014-capability-registry-enforcement.md`,
      2026-07-18; relocated by RFC-015 the same day — see next item)* —
      the "nothing calls it yet" half of the gap above.
      `intentEngine.create()` (TradeIntent) and
      `escrow.service.ts`'s `releaseFunds()` (immediately before the real
      USDT release, the highest-stakes line in that file — originally
      checked inside `settlement-orchestrator.ts`, moved into
      `releaseFunds()` itself once RFC-015 found that location missed two
      of its three real callers) both check `capabilityRegistry.check()`
      now, behind a new `config.features.enforceCapabilities` flag
      (`ENFORCE_CAPABILITIES`, default `false` — same off-by-default
      precedent as `AUTO_SETTLE_ON_MATCH`, since no deployment or test in
      this repo has ever issued a `CapabilityGrant`). `npm run demo:qvac`
      issues the two grants it needs unconditionally, so it works either
      way the flag is set. Still open: `coordinationEngine.decide()`
      itself doesn't consult the registry (unchanged from RFC-012's scope
      cut); no route/CLI for an operator to issue grants in bulk (still
      one self-issued `POST /v1/capabilities/register` call at a time).
- [ ] **Still open:** `IntentHandler` plugin registration pattern (§2.7 of
      `PROTOCOL_SPECIFICATION.md`) is fully specified but has zero code.
- [x] **Real gap found 2026-07-19 by a CTO-directed fidelity audit**
      ("a implementação está respeitando o modelo de Intent definido na
      especificação?" — not a design question, an audit of the shipped
      code against it), **fixed the same day.** No real `Offer` or
      `Trade` had an `Intent` row behind it — `liquidity.service.ts`'s
      `createOffer()` never called `intentEngine.create()`;
      `trade.service.ts`'s `createTrade()` never imported
      `core/intent-engine.ts` at all — directly contradicting
      `PROTOCOL_SPECIFICATION.md` §1.11's claim that a published `Offer`
      "is OpenLiquidity's concrete database artifact representing a
      published, discoverable Intent." **RFC-018**
      (`docs/rfcs/RFC-018-intent-as-canonical-trade-entry-point.md`,
      Core RFC) registered the target architecture, then Phases 1-2
      were implemented in the same pass: `Offer`/`Trade` gained a
      nullable `intentId` FK; `createOffer()` creates a real `Intent`;
      `createTrade()` walks it through `DISCOVERING → MATCHED →
      NEGOTIATING`; `common/events/handlers.ts`'s three
      `settlement.escrow.*` reactions drive `COMMITTED`/`SETTLING → 
      FULFILLED`/`FAILED`. Corrected from the RFC's own original draft
      during implementation: `COMMITTED` fires at escrow-lock time
      (matching §3.1's already-accepted mapping), not at trade
      creation, and no `intent-engine.ts` ownership-check change was
      actually needed. `npm run build` clean, `npm test` 212/212 (5 new
      tests). **Not yet applied to a live database** — schema edited,
      `npx prisma generate` run, but no Postgres reachable in this
      environment to run a real migration; needed before this code path
      works outside tests. Phase 3 (`OpenP2PTradeIntentHandler`, §2.7)
      remains deferred — a refactor of already-working logic, not a
      blocker.
- [x] **Second pass, same day (2026-07-19), CTO-directed follow-up**
      ("garantir que os testes cubram cenários de falha: escrow não
      bloqueado, trade cancelado, settlement falho, disputa durante
      negociação"). Live-PostgreSQL migration validation itself could
      not be performed — no Docker/Postgres reachable in this sandboxed
      environment (same limitation as Redis/live-WDK-testnet elsewhere
      in this project); that piece is deferred to the sócio dev's infra
      pass per the established division of labor. What was done instead:
      (1) **real bug found and fixed** — `trade.service.ts`'s
      `updateStatus()` left a cancelled Trade's Intent stuck at
      `NEGOTIATING` forever; now transitions it to `CANCELLED`. (2)
      **real bug found and fixed, more severe than the scenario asked
      for** — investigating "disputa durante negociação" surfaced that
      `Trade.escrowId` was **never persisted anywhere in the live code
      path**: `escrow.service.ts`'s `createEscrow()` emits
      `settlement.escrow.created` but its own module-boundary rule
      (OpenSettlement may read `Trade`, never write it) forbids setting
      `Trade.escrowId` itself, and no handler in
      `common/events/handlers.ts` ever reacted to that event to do it —
      meaning `dispute.service.ts`'s `raiseDispute()` guard
      (`if (!trade.escrowId) throw ...`) rejected **every** dispute
      unconditionally against a real database, regardless of trade
      status. Not merely "disputes during negotiation are blocked" —
      disputes were blocked, period. Fixed by adding the missing
      `settlement.escrow.created` handler. (3) escrow-lock provider
      failure confirmed already correctly handled by existing control
      flow (fails before persisting/emitting) — added as a regression
      test, no code change needed. `npm run build` clean, `npm test`
      216/216 (4 new tests this pass).
- [ ] **Related, more severe finding from the same audit — a real
      Constitutional Invariant violation, not a documentation gap:** the
      one real, tested `SettlementProvider` (`WdkSettlementProvider`,
      `wdk-settlement.provider.ts`, marked `[x]` above as shipped) signs
      every escrow release from **one server-held seed phrase**
      (`WDK_SEED_PHRASE`) — no user-supplied signature or credential is
      needed for `releaseFunds()` to succeed. This violates
      `PROTOCOL_INVARIANTS.md` Constitutional Invariant 2 ("The Protocol
      Never Custodies Assets") and `SECURITY_MODEL.md` §2 Principle 2
      ("User Always Signs") **in the one real settlement path this
      codebase ships today.** It was already disclosed at the code-comment
      level (`wdk-settlement.provider.ts`'s own header: "a single-seed,
      two-hop escrow, not a trustless multisig") but no document above
      the code said so plainly until this audit — `SECURITY_MODEL.md`,
      `PROTOCOL_INVARIANTS.md`, `TRUST_BOUNDARY.md`, and
      `CRYPTOGRAPHIC_MODEL.md` §5 all now state it explicitly.
      **Blocking for any production/mainnet use with real value** — do
      not represent `WDK_USDT_EVM` as satisfying the protocol's
      non-custodial invariant until a real multisig/threshold-signature
      `SettlementProvider` for EVM exists, or scope `WDK_USDT_EVM`
      explicitly to testnet/demo use only. **RFC-019**
      (`docs/rfcs/RFC-019-settlement-custody-reference-vs-normative.md`,
      accepted 2026-07-19, CTO-role review approved as P0/blocking)
      registers this reclassification and a 2-phase migration plan.
      **Phase 1 done (2026-07-19, Implementation Freeze — first real
      code from either Core RFC):** `WdkSettlementProvider.custodyModel`,
      a boot-time warning (`app.ts`'s `startServer()`) whenever
      `MOCK_ESCROW=false`, `.env.example` disclosure, `API_REFERENCE.md`
      pointer — purely additive, no behavior change, `npm test` 207/207.
      Phase 2 (a real non-custodial settlement path) remains unscoped,
      unstarted, no committed date.

## 8. SDK (status changed — v0.1 real, partial) *(2026-07-17)*

- [x] `@sails/sdk` (`packages/sails-sdk`) now exists — real npm workspace
      package, wired into root `package.json`'s `workspaces`/`build`
      scripts. `SailsClient`'s Transport layer (real `fetch`/`WebSocket`,
      no Node-only dependency — works in both Node and browser per
      `SDK_GUIDE.md` §6) and Protocol SDK layer (`identity`,
      `reputation`, `liquidity`, `openp2p`, `settlement`, `peers`) are
      genuinely implemented against the reference implementation's real,
      tested routes — each verified against its actual `*.routes.ts`
      file, not assumed from `API_REFERENCE.md`'s prose (found and
      documented two real deviations that way: `createIntent` needs an
      explicit `participantId`, `openp2p.trade()` needs `amount` — see
      `SDK_GUIDE.md` §2's note). `identity.authenticate()`'s Ed25519
      signing (`tweetnacl`, pure JS) was checked byte-for-byte against
      `src/common/middleware/auth.ts`'s exact verification logic (a
      subtle double-hex-encoding quirk) and confirmed to actually work
      against the real server-side verify function, not just assumed
      compatible — `packages/sails-sdk/tests/identity.test.ts` asserts
      this directly. 33 tests total across 4 files, all mocking only the
      network boundary (`fetchImpl`/`webSocketImpl` injection, no global
      mocking) — `npm run build`/`npm test` both verified clean (16
      suites, 131 tests project-wide).
- [x] **`WalletAdapter` + `client.capabilities`** *(new — RFC-013,
      `rfcs/RFC-013-capability-registry-and-wallet-adapter.md`,
      2026-07-18)* — `packages/sails-sdk/src/wallet-adapter.ts`: an
      optional constructor argument (`SailsClientOptions.wallet`) so a
      wallet's own signing/balance/address logic can plug into the SDK,
      which v0.1 had no such layer for at all (every v0.1 module only
      ever made HTTP/WS calls). `getPeerId()`, not `getNodeId()` — matches
      this codebase's own existing vocabulary instead of introducing a
      synonym. `client.capabilities.registerFromWallet(wallet)` derives
      a `trade-coordination` grant's scope directly from
      `wallet.getCapabilities()`. 7 new tests
      (`packages/sails-sdk/tests/capabilities.test.ts` +
      `client.test.ts` additions) — 40 SDK tests total, 155
      project-wide.
- [ ] **Still genuinely unbuilt/partial**, honestly, not silently
      claimed: of the six-verb Intent facade (`SDK_GUIDE.md` §2),
      `negotiate`/`submitProof`/`releaseAsset`/`dispute` throw
      `SailsNotImplementedError` — `intent-facade.ts`'s own header
      explains exactly why (no server-side Intent -> Trade -> Escrow
      linkage; the Proof primitive has zero routes at all). Closing this
      needs Core/module work (a real linkage path, and a first Proof
      primitive implementation, §7's own still-open item), not more SDK
      code — SDK_GUIDE.md §1's "no new business logic" rule means the
      SDK correctly cannot paper over a gap that belongs server-side.
      `@sails/protocol-spec` also still does not exist — v0.1 defines its
      own local response types (`packages/sails-sdk/src/types.ts`)
      rather than reconciling with `@sails/p2p-schemas`'s differently-
      shaped `OfferSchema`, a documented, deliberate deferral (that
      file's own header), not an oversight.

## 9. Monorepo Structure (status changed — first package landed)

- [x] `packages/sails-p2p-schemas` (`@sails/p2p-schemas`) exists — the
      first real npm workspace package, wired via root `package.json`'s
      `"workspaces": ["packages/*"]`. See `BACKLOG.md` P1.
- [ ] **Still open:** the full `packages/` / `apps/` split from
      `ARCHITECTURE.md` section 6 — everything else still lives flat under
      `src/`. A `Months 10-12` roadmap item, not urgent, but don't invent a
      different structure ad hoc if you start this early.

## 10. Tests (status changed — no longer zero)

- [x] `tests/intentFlow.test.ts`, `tests/transportFallback.test.ts`,
      `tests/disputeFlow.test.ts` exist and pass — 28 tests across the
      Intent Engine, transport fallback, and dispute flow. `jest`/`ts-jest`
      are real dependencies now, not just a `package.json` script pointing
      at nothing.
- [x] `tests/routes.test.ts` *(new — route-restoration pass, 2026-07-16)*
      — 26 `app.inject()` HTTP round-trip tests through the real routes
      added in this pass (identity, peers, liquidity, trade, chat,
      settlement, reputation), Prisma/Redis/eventBus/`pearNodeRegistry`
      mocked, same pattern as the other suites. Caught two real bugs
      before they shipped: `verifySignedChallenge()` not returning its
      session token (see section 3), and the chat message-history route
      having no auth at all while the WebSocket side already restricted
      it to the trade's two parties — both fixed, not just found.
- [x] `tests/reputationOutcome.test.ts` *(new — open-reputation pass)* —
      4 tests verifying the RFC-007 D8/D9 dispute-aware branching in
      `common/events/handlers.ts` directly: happy-path completion vs. a
      RELEASE dispute ruling, plain refund vs. a REFUND dispute ruling.
      Confirms the "winner gets Positive, loser gets Negative, no dispute
      means Neutral" rule actually holds, not just that the code compiles.
- [x] `tests/chatUnification.test.ts` *(new — chat-unification pass)* —
      3 tests confirming a message "arriving" via either transport
      (simulated `HumanChatChannel`/Pears emit, or the WS route's own
      emit) reaches every WS room member for that trade, and that
      broadcasting to a trade nobody's watching doesn't throw. Uses the
      real `chat-room-registry.ts`, not a mock, so this is exercising the
      actual join/broadcast code, not just asserting a function was
      called.
- [x] 2 more cases added to `tests/routes.test.ts` *(WS → Pears
      follow-up pass)* — first real use of `app.injectWS()` in this
      codebase's test suite, a genuine WS round-trip through
      `chat.routes.ts`'s route (not a mock of the handler). Found and
      fixed a real test-infra issue along the way, not a product bug:
      `ws.close()` on the injected client left a pending close-handshake
      handle that made `jest --runInBand` (this repo's actual `npm test`
      command) hang past its 1s exit check; `ws.terminate()` (immediate
      teardown, appropriate for tests) fixed it. Also found that
      `chatUnification.test.ts` and `reputationOutcome.test.ts` had no
      top-level `import`/`export`, making TypeScript treat them as
      scripts sharing the global scope — their identically-named
      `const mockUserUpdate`/`handlers` collided under some jest
      invocations (`--detectOpenHandles` surfaced it, plain `npm test`
      didn't). Fixed with a top-level `export {}` in both files.
- [x] `tests/payloadCrypto.test.ts` + `tests/intentTransport.test.ts`
      *(new — direct P2P Intent delivery pass, 2026-07-17)* — 8 tests
      total. `payloadCrypto.test.ts` (4) is real cryptography end to end:
      real `HyperDHT.keyPair()` keypairs, real Ed25519→Curve25519
      conversion, real libsodium sealed-box round-trip, plus wrong-key and
      tampered-ciphertext rejection — none of this needs a live network,
      so none of it is mocked. `intentTransport.test.ts` (4) verifies
      `PearsTransportProvider.sendIntentToPeer()`'s composition logic
      (topic join, connected-peer-first / Postgres-directory-fallback
      resolution, no-peerId-found short-circuit) with `pear.service.ts`
      and Postgres mocked — same discipline `transportFallback.test.ts`
      already established for anything that would otherwise need a real
      P2P network to verify.
- [ ] **Still open, in the priority order `BACKLOG.md` P0/P2 imply:**
      escrow state machine transitions beyond what `disputeFlow.test.ts`
      already covers, and liquidity matching (`open-liquidity`) — no
      dedicated test files yet.

## 11. Frontend (status changed — skeleton + real brand identity landed) *(2026-07-18)*

- [x] **`packages/@sails/ui`** *(new)* — a real, navigable 9-screen React
      + Vite + TypeScript + React Router app (Marketplace, Offer Detail,
      Trade with chat + escrow state machine, Login, Profile, Trade
      History, Admin Dashboard, Manage Offers, Disputes). Every screen
      reads `src/data/mock.ts` — no `@sails/sdk` call happens anywhere
      in this package yet; every read site has a
      `// TODO: replace with @sails/sdk ...` comment naming the real
      method. Manually verified in a real browser (not just
      `npm run build`) — found and fixed one real bug this way: an
      effect-ordering race in `AuthContext` that bounced a logged-in
      session back to `/login` on a hard navigation to `/profile`
      (React runs effects child-to-parent on mount; a `useEffect`-based
      localStorage read lost that race against `Profile`'s own
      "redirect if no user" effect — fixed with a lazy `useState`
      initializer instead, which `tsc`/build type-checking alone would
      never have caught).
- [x] **Real black + orange brand identity, light and dark theme**
      *(same day, requested directly)* — `src/index.css`'s CSS custom
      properties define the full palette for both themes (`:root`/
      `:root.dark`), toggled by `ThemeContext` (defaults to system
      preference, persisted to `localStorage`, same lazy-`useState`
      pattern `AuthContext` uses for the same effect-ordering reason).
      Orange (`#f97316`) stays constant across both themes. A handful of
      component classes (`.card`, `.btn-primary`, `.input-field`, etc.,
      `@layer components`) centralize the theme so a white-label partner
      edits ~8 rules later, not every file — see the package's own
      `README.md`.
- [x] **Binance P2P-style Marketplace filters** *(same day)* —
      `AssetPicker` (search-based, replacing a lateral pill row that
      doesn't scale past a handful of assets), `CurrencyPicker`
      (BRL/USD/EUR/... — generalizes the real but narrower
      `Offer.priceBrl` field, honestly flagged as presentation-layer in
      `types.ts`'s own comment), and `FilterPanel` (a drawer with the
      exact requested option set — save filter, negotiable-only,
      high-reputation-only, previously-traded, amount presets by
      currency, payment time limit, payment method, country/region, sort
      by — each with an "i" `InfoTooltip`). Three of the filter
      predicates (`negotiableOnly`/`highReputationOnly`/
      `previouslyTradedOnly`) run against UI-only demonstration fields
      on `Offer` — a real version needs a real block-list and
      trade-history join, neither exists in the backend yet.
- [x] **Agent QVAC interaction reflected in the UI + chat image/video
      attach** *(same day, requested directly)* — `AgentIntentionPanel`
      (Marketplace) and `AgentRiskCard` (Trade) mock the shape of the
      real `QvacAgentProvider`/`BuyerAgent`/`SellerAgent`
      (`src/modules/open-agents/*.ts` — a real local LLM via `@qvac/sdk`,
      no cloud dependency) since no HTTP route exposes that code to a
      browser yet; today it only runs in the demo script and
      `intent-engine.ts`'s own validation. `ChatWindow`'s new 📎 button
      lets a user attach an image/video, rendered inline in
      `ChatMessage` — a local `URL.createObjectURL()` blob only, nothing
      is transmitted. Real wiring needs: an agent HTTP route wrapping
      `qvacAgentProvider`'s methods; and, for media, an upload/storage
      step (`Message.content` is Postgres text, unsuited to a raw video
      blob — `msgType` itself needs no migration, it's already a
      free-form `String`) plus a Pears event kind carrying a media
      reference (today's WS→Pears relay in `chat.routes.ts` only
      forwards plain text). See `packages/sails-ui/README.md` for detail
      and the real bug found while building this (an `InfoTooltip`
      button nested inside another button — invalid HTML, caught by a
      browser console warning, not `tsc`).
- [x] **RFC-016 (Crypto-Native Agent boundary) + "AI Negotiator" mandate
      UI** *(same day, direct owner instruction: "O QVAC nunca deve
      tocar em PIX. Essa decisão precisa ser arquitetural")* — formalizes
      an invariant already true by construction (no code in this repo
      has ever called a banking API) as an explicit RFC
      (`docs/rfcs/RFC-016-qvac-crypto-native-agent-boundary.md`):
      QVAC/`BuyerAgent`/`SellerAgent` only act on digital assets via WDK,
      never on fiat rails; conversion is a regulated on/off-ramp
      provider's job, outside Sails Protocol's scope. Propagated into
      `PROJECT_CONTEXT.md`, `ARCHITECTURE.md`, `SDK_usecases.md`, and
      code comments in `qvac-agent.provider.ts`/`buyer-agent.ts`.
      `AgentIntentionPanel` renamed to lead with "🤖 AI Negotiator" and
      gained a bounded delegation mandate (quantity, limit price,
      deadline, tolerance, Negotiation Profile —
      Conservative/Balanced/Aggressive/Instant,
      `packages/sails-ui/src/lib/aiNegotiator.ts`) plus a mocked live
      negotiation view (status timeline, Agent Strategy panel) with a
      permanent "🛑 Parar Agente / Assumir Controle" stop control —
      verified in browser including mid-run interruption. Still a
      client-side simulation only; no backend accepts a mandate shaped
      like this yet (`packages/sails-ui/README.md` "Next steps").
- [x] **Offer publishing wizard + six cold-start UX fixes** *(same day,
      direct owner instruction: referenced RFC-017's documentation rigor
      and a Binance "Publicar Anúncio" screenshot for the wizard; then
      "está fidedigno o suficiente para achar os furos de UX?" →
      "Tudo da lista" for the fixes)* — `PublishOffer.tsx` is a 3-step
      wizard (tipo/preço → valor/método → condições) writing through
      `lib/offersStore.ts` (`getAllOffers()`/`addOffer()`, localStorage
      over the static `MOCK_OFFERS`) so a published offer shows up
      immediately in Marketplace/Profile/OfferDetail. A second cold-start
      walkthrough (clear `localStorage`, click through as a first-timer)
      then found and fixed 6 more real bugs, 2 critical: self-trading was
      possible (no `user.id === offer.userId` check anywhere); AI
      Negotiator's currency parser was hardcoded to BRL regardless of
      the goal text, silently producing zero-match Marketplace filters.
      Also fixed: no login/wallet indicator on mobile; Login screen led
      with "keypair Ed25519"/"WDK" jargon instead of plain language;
      raw backend enums (`USDT_ERC20`, `BANK_TRANSFER`, ...) rendered
      verbatim in several components instead of friendly labels; and a
      redundant duplicate price line in `OfferDetail`. Full detail and
      the fix for each in `packages/sails-ui/README.md`.
- [x] **Order history (date/time + cancel) + identity key clarity**
      *(same day, direct owner instruction: "minhas ordens tem que ter
      data e horario... e o usuario poder... remover a ordem", checked
      against Binance/Bisq/HodlHodl/El Dorado/P2P.me; separately "não
      fica claro se é minha chave Pears" after seeing Keet's unlabeled
      Public Key)* — `Profile.tsx`'s "Minhas Ofertas" now sorts
      newest-first, has status filter chips, shows `Criada em
      {formatDateTime}`, and gained Pausar/Ativar/Cancelar actions
      (destructive cancel gated behind an inline confirm, no browser
      `confirm()`); `lib/offersStore.ts` gained `updateOfferStatus()` — a
      status-only localStorage override, mirroring the real backend's
      actual `PATCH /v1/liquidity/offers/:id/status` (never a DELETE,
      matching how all 5 reference platforms actually behave). Doing
      this surfaced a second real bug immediately: `Marketplace.tsx`
      never filtered by `status`, so a just-cancelled offer stayed
      listed for sale — fixed with an `status !== 'ACTIVE'` check.
      Separately, `user.publicKey` was shown with no label at all;
      labeled "Sua chave de identidade (Pears / P2P)" with an
      `InfoTooltip` — genuinely the same key, not a simplification:
      `PearNode.getKeyPair()`'s Ed25519 keypair *is* the identity
      keypair (`docs/ARCHITECTURE.md`), used both for auth signing and
      as the Hyperswarm/HyperDHT P2P identity. See
      `packages/sails-ui/README.md` for full detail.

## 12. Deployment

- [ ] `docker-compose.yml` referenced in `DEPLOYMENT.md` does not exist in
      this environment and needs to be (re)created.
- [x] **CI/CD pipeline** *(new — handoff-readiness pass, 2026-07-17)* —
      `.github/workflows/ci.yml` runs `npm run build` + `npm test` on
      every push/PR to `main`, Node 20.x/22.x matrix. `.github/dependabot.yml`
      opens weekly dependency-update PRs. Neither needs live
      Postgres/Redis — every test in this repo mocks its own network/
      database boundary already.

## 13. Resolved Items (do not redo these — verify they're intact, don't rebuild)

- [x] Event bus namespacing (`{module}.{entity}.{action}`) — done
- [x] `moduleId`/`protocolVersion` in schema — done
- [x] Escrow service decoupled from Trade/User direct writes — done, logic
      moved to `common/events/handlers.ts`
- [x] `pear.service.ts` moved from Domain to Infrastructure layer — done
- [x] `PearPeerManager` singleton bug — done, replaced with
      `PearNode` + `PearNodeRegistry`
- [x] Dead message handlers (`OFFER_ANNOUNCE`, `CHAT_MESSAGE` no-ops) — removed
- [x] Duplicated offer-mapping logic in `liquidity.service.ts` — extracted
      into `mapOfferToLiquidityOffer()`
- [x] Module folder naming (`escrow/`, `identity/`, `routing/` → official
      `open-settlement/`, `open-liquidity/`) — done for the files that exist
- [x] `config/index.ts`, `common/database/index.ts`, `common/redis/index.ts`,
      `common/errors/index.ts` — all exist and are wired into `app.ts`
      (previously listed as missing in section 1/2 — that was stale)
- [x] Event Bus updated for RFC-003/RFC-004 — `claim.*`, `proof.*`,
      `verification.*`, `dispute.*`, and `negotiation.*` events all added
      and typed (previously flagged as out of sync in section 6B — that
      section is now closed and removed from this list)
- [x] `Intent`/`IntentEvent` Prisma tables — see section 7
- [x] `packages/sails-p2p-schemas` workspace package — see section 9
- [x] Jest test framework + 3 real test suites — see section 10
- [x] Ed25519 challenge-response auth middleware (`common/middleware/
      auth.ts`) — built and wired to every write-side route (see section 3)
- [x] `modules/open-identity/identity.routes.ts` + `identity.service.ts` —
      register/challenge/authenticate/get participant, per
      `API_REFERENCE.md` §2
- [x] `infrastructure/p2p/pear.routes.ts` — start/stop/status/join-topic/
      join-trade/broadcast-offer, wrapping `pearNodeRegistry` only, per
      `API_REFERENCE.md` §7
- [x] `modules/open-liquidity/liquidity.routes.ts` — list/publish/order
      book/status/match, per `API_REFERENCE.md` §3. Added
      `createOffer()`/`updateOfferStatus()`/`getOrderBook()` to
      `liquidity.service.ts`'s `LiquidityRouter` — only read/match methods
      existed before
- [x] `modules/open-p2p/trade.routes.ts` + new `trade.service.ts` — start
      trade from offer/detail/status, per `API_REFERENCE.md` §5.
      `negotiation.service.ts` already owned the negotiation channel but
      nothing created the `Trade` row it assumes exists — that was the gap
- [x] `modules/open-p2p/chat.routes.ts` — WebSocket negotiation channel +
      message history, per `API_REFERENCE.md` §5.
- [x] **Chat transport unification** *(new — same day, chat-unification
      pass)* — `chat-room-registry.ts` (new) holds the WS room registry;
      `common/events/handlers.ts` reacts to `openp2p.message.sent` and
      pushes `NEW_MESSAGE` to every WS-connected room member for that
      trade, regardless of whether the message was sent via
      `chat.routes.ts`'s WS route or `negotiation.service.ts`'s
      `HumanChatChannel` over Pears — both emit that same event after
      persisting to `Message`. Fixed a real bug found in the process:
      `HumanChatChannel.sendEvent()` discarded the created `Message` row
      and emitted a placeholder `messageId` equal to `tradeId`; every
      message now carries its own real id.
- [x] **WS → Pears best-effort relay** *(new — same day, follow-up pass)*
      — `chat.routes.ts`'s `SEND_MESSAGE` handler now attempts
      `pearNodeRegistry.get(senderId)?.sendToPeer(recipientId, ...)`
      after persisting, when the WS-connected sender also has an active
      PearNode. Verified in `tests/routes.test.ts` via
      `app.injectWS()` — a real WS round-trip through the actual route,
      not just a unit-level assertion. **Not full symmetry, and can't
      be:** `sendToPeer()` only exists on the sending identity's own
      node — a sender with no PearNode at all has nothing to relay from,
      a structural limit of peer-to-peer transports, not a missing
      wiring step.
- [ ] **Deeper gap found while investigating the above, not fixed:**
      `HumanChatChannel.onEvent()` — the handler for messages *arriving*
      via Pears — is defined (`negotiation.service.ts`) but never called
      anywhere in this codebase, for either transport's messages. Needs
      a live two-node Pears/HyperDHT setup to build and verify against —
      the same limitation `PearsTransportProvider`'s own tests already
      decline to fake (see `tests/transportFallback.test.ts`'s comment).
- [ ] **Key-custody gap found answering a direct owner question, not
      fixed:** "as chaves privadas do usuário podem ser consultadas?" —
      the answer for storage/auth is a clean no (no `secretKey`/
      `privateKey` field anywhere in `prisma/schema.prisma`;
      `common/middleware/auth.ts`'s challenge-response only ever receives
      a *signature*, never the key). But `POST /v1/peers/start`
      (`pear.routes.ts`) currently takes the caller's raw Ed25519 secret
      key in the request body and hands it to `PearNode.start()`
      (`pear.service.ts:71-76`) so the server can run that user's
      Hyperswarm/HyperDHT node on their behalf — held only in an
      in-memory `keyPair` field, never persisted or logged (only the
      derived `peerId` hex is written to `User.peerId`), but it does
      transit the server on that one call. Fine for this reference
      implementation's server-hosted P2P node, but a production design
      needs the P2P node — and key custody — to live entirely
      client-side (a wallet/mobile app), never touching the backend at
      all. Flag before treating this as production-ready.
- [x] **Documentation consolidation pass** *(2026-07-19, direct owner
      instruction relaying a CTO-role architectural review: "o foco
      deixa de ser adicionar funcionalidades e passa a ser consolidar o
      protocolo")* — the review proposed 6 new "structuring documents"
      (`TRUST_BOUNDARY.md`, `CAPABILITY_MODEL.md`, `THREAT_MODEL.md`,
      `CRYPTOGRAPHIC_MODEL.md`, `PROTOCOL_INVARIANTS.md`,
      `DESIGN_PRINCIPLES.md`) without full visibility into this repo's
      existing 20-document Engineering Handoff series. Checked each
      against what already exists before writing anything, per this
      project's own "single source of truth" discipline — the same
      instruction the review itself asked for:
      - `THREAT_MODEL.md` (doc 8) and `PROTOCOL_INVARIANTS.md` (doc 19)
        **already existed**, substantial and maintained — not touched
        as new files.
      - `DESIGN_PRINCIPLES.md` **not created** — `PRINCIPLES.md` (doc
        16) already covers 6 of the review's 8 proposed principles
        under existing names (Protocol First, Infrastructure Neutral
        subsumes Wallet/Settlement/Transport Agnostic, Privacy
        Preserving). Creating a competing file would have been exactly
        the duplication the instruction asked to eliminate. The 2
        genuinely uncovered concepts ("Agent Optional," "Local First")
        are noted here, not added — `PRINCIPLES.md`'s own text states
        its 9 principles "should appear, verbatim and in this order" in
        the Whitepaper and `PROJECT_CONTEXT.md`; growing that list is a
        cross-document change with its own precedent (the 8→9 growth
        happened via a named Protocol Freeze review), not something to
        do unilaterally while relaying a second-hand analysis.
      - `CAPABILITY_MODEL.md` **not created** — RFC-005 already defines
        `Capability`/`CapabilityGrant` formally, with a real Prisma
        model and real enforcement (RFC-013/014). Instead added a
        concrete CAN/CANNOT reference table operationalizing those
        interfaces to `PROTOCOL_SPECIFICATION.md` §1.10.1, using the
        QVAC Agent (RFC-016) as the worked example.
      - `TRUST_BOUNDARY.md` and `CRYPTOGRAPHIC_MODEL.md` **genuinely
        didn't exist anywhere** — created as new, unnumbered docs (same
        precedent as `DEVELOPER_JOURNEY.md`/`HANDOFF.md`/
        `TRANSACTION_WALKTHROUGH.md`), cross-referenced from
        `00-INDEX.md`, `ARCHITECTURE.md`, `NODE_ARCHITECTURE.md`,
        `SECURITY_MODEL.md`, and `THREAT_MODEL.md`. `CRYPTOGRAPHIC_MODEL.md`
        is explicit about what's real vs. designed-but-not-wired (the
        `IntentEvent` hash chain is real and active; RFC-008's
        `TimestampAnchor` anchoring and extending the hash chain to the
        general `Timeline` are not) and what has no guarantee at all yet
        (no forward secrecy on P2P payload encryption).
      - `PROTOCOL_INVARIANTS.md` extended, not replaced — the existing 6
        invariants retitled "Constitutional" (protocol-shape rules),
        with a new "Operational Invariants" section (`INV-OP-1`
        through `INV-OP-8`) adding concrete, code-traceable rules per
        the review's own example format, each tied to the RFC that
        decided it and the file that enforces it today — including
        being explicit about which are unconditional vs. gated behind
        an off-by-default feature flag (dual-approval release,
        social-engineering detection).
- [x] **Duplication/drift audit + RFC 2119 normative language**
      *(2026-07-19, direct owner instruction relaying a CTO-role
      follow-up: "não criar documentos duplicados... consolidar...
      tornar a documentação normativa... faça tudo")* — two pieces:
      1. **`PROTOCOL_SPECIFICATION.md` gained RFC 2119 language** (§0
         defines MUST/SHOULD/MAY; §6 is a consolidated conformance
         checklist), scoped to this one document deliberately — the
         other 19 handoff docs stay in their existing narrative style,
         which serves a different audience (engineers understanding the
         system, not implementers conforming to a spec) and was itself
         praised as a strength in the CTO review that requested this
         work. No prose in sections 1-5 was rewritten; §0/§6 are pure
         additions.
      2. **A systematic audit for repeated/divergent concepts across
         all 20 docs + 17 RFCs found 6 real issues, all fixed:**
         - `DATABASE.md` documented a `Capability` Prisma model that
           was never real — `prisma/schema.prisma`'s own comment and
           RFC-013 both say only `CapabilityGrant` is persisted.
           Corrected to show only the real model.
         - `Timeline`'s key: RFC-017 corrected it from `intentId` to
           `correlationId` months ago (`core/timeline.ts` ships the
           correction), but `DATABASE.md`, `PROTOCOL_SPECIFICATION.md`,
           and `ARCHITECTURE.md` still described the superseded
           `intentId` version — worse, `ARCHITECTURE.md` contradicted
           itself between two nearby lines. All three corrected.
         - `SECURITY_MODEL.md`/`NODE_ARCHITECTURE.md` still described
           dispute arbiters as "bonded community volunteers" — the
           actually-accepted-and-implemented model (RFC-007 D4) is
           application-registered Trusted Arbitrators via
           `ArbitrationProvider`, explicitly *not* a protocol-native
           role. Corrected, with the reputation-as-bond mechanism that
           replaced literal bonding made explicit.
         - `EscrowStatus.PENDING_BANK_SETTLEMENT` (RFC-007 D3) was
           documented as live in four files (`DATABASE.md`,
           `PROTOCOL_SPECIFICATION.md`, `API_REFERENCE.md`,
           `SDK_GUIDE.md`) but was never actually migrated into
           `prisma/schema.prisma` — designed, not built. All four now
           say so; a real migration is still needed for RFC-007 D3 to
           actually land, not just a doc fix.
         - `EscrowType` was missing `WDK_USDT_EVM` — a real, tested,
           live settlement provider — from its independently-spelled-out
           listing in `DATABASE.md` and `SDK_GUIDE.md`.
         - `CapabilityGrant.grantId` vs. the real API's `id`: RFC-005's
           own design interface (copied verbatim into
           `PROTOCOL_SPECIFICATION.md` and `SDK_GUIDE.md`) names the
           field `grantId`; the real Prisma model and the real
           `capability.routes.ts` both call it `id`. **Not silently
           renamed** — flagged in both docs as a live spec-vs-
           implementation drift needing a real decision (rename the
           column, or update the interface/SDK type), not something a
           documentation pass should resolve unilaterally.
         - `00-INDEX.md`'s "expected not to resolve" citation list was
           missing two internal-planning documents (
           `03-implementation_plan.md`, `04-Deepseek Review.md`) cited
           by name in several docs — added to the list.
      No false positives from the audit were "fixed" — `PRINCIPLES.md`/
      `PHILOSOPHY.md`/`PROTOCOL_INVARIANTS.md`'s three-tier layering and
      `THREAT_MODEL.md`/`SECURITY_MODEL.md`'s complementary scope were
      both confirmed intentional, not duplication, and left untouched.
- [x] `modules/open-settlement/settlement.routes.ts` — escrow
      create/lock/payment-sent/release/dispute/refund + a new dispute
      resolve route, per `API_REFERENCE.md` §4 (updated alongside this to
      document the resolve route, which wasn't listed there before)
- [x] `modules/open-reputation/reputation.service.ts` +
      `reputation.routes.ts` *(open-reputation pass)* — the module's
      first service layer, not just routes: `recordOutcome()` (RFC-007
      D8's sole score-mutating entrypoint), `rate()` (informational only,
      never touches `reputationScore`), `getScore()`, `getLeaderboard()`,
      per `API_REFERENCE.md` §6. `recordOutcome()` wired into
      `common/events/handlers.ts`'s `settlement.escrow.released`/
      `refunded` reactions, dispute-aware (checks for a resolved Dispute
      to tell a happy-path completion apart from a RELEASE/REFUND
      ruling) — see `tests/reputationOutcome.test.ts`.
- [x] **QVAC + WDK MVP pass** *(new — 2026-07-17)* — see section 4's
      `WDK_USDT_EVM` entry and section 5B for the two real integrations,
      and `src/demo/pix-to-usdt-flow.ts` (`npm run demo:pix-to-usdt`) for
      the end-to-end script tying them to the already-real Intent/
      OpenP2P/OpenSettlement pieces: Comprador PIX ➡️ Vendedor USDT.
      **Not run live in this pass** — needs a reachable Postgres/Redis,
      not available in this environment; each individual piece it calls
      is real and, where the environment allowed, live-verified on its
      own (QVAC directly; WDK's pure helpers via
      `tests/wdkSettlementProvider.test.ts`, the live wallet calls not
      verifiable without a funded testnet key).

## 14. Gap Audit — Authorization/IDOR Fixes *(new — 2026-07-18)*

Requested directly by the project owner ("faça uma auditoria geral antes
para identificar furos") as a general sweep for the same class of gap
RFC-014/RFC-015's own work had just surfaced (a check that existed but
didn't cover every real caller). Found four real, previously-untested
authorization gaps — not from an external report, from a systematic
pass over every route/service checking who's actually allowed to call
what. All four fixed the same day; full detail in `THREAT_MODEL.md` §4
(each entry there struck through and marked Resolved, not deleted, so
the history stays visible):

- [x] **Intent API had zero authentication** — `POST /api/v1/intents`/
      `DELETE /api/v1/intents/:id` accepted `participantId` straight
      from the request body, the exact RT-002 vulnerability
      `auth.ts`'s own doc comment warns against. Fixed: `requireAuth`
      added, `participantId` now session-derived only;
      `intentEngine.cancel()` gained an ownership check it never had.
      `@sails/sdk`'s `createIntent()`/`cancelIntent()` updated to send
      real auth and dropped `participantId` as a caller argument
      (closing a previously-noted `SDK_GUIDE.md` deviation as a side
      effect). Zero HTTP-level test coverage existed for this route
      before this pass — that's exactly why it went unnoticed; now
      covered in `tests/routes.test.ts`.
- [x] **No escrow mutation checked the caller was a party to the
      trade** — `lockFunds()`/`markPaymentSent()`/`releaseFunds()`/
      `refundFunds()`/`openDispute()` in `escrow.service.ts` all trusted
      `triggeredBy` with no ownership check; any authenticated
      participant could mutate any other trade's escrow via
      `settlement.routes.ts`'s direct routes. Fixed with real checks
      (seller/seller-agent, buyer/buyer-agent, or the dispute's assigned
      arbiter, as appropriate per method) — 11 new tests in
      `tests/escrowReleaseControls.test.ts`.
- [x] **Capability grant revoke had no ownership check** — any
      authenticated participant could revoke any other participant's
      grant. Fixed: `capabilityRegistry.revoke()` now verifies
      `grantedTo` matches the caller.
- [x] **Reputation `rate()` never verified the rater/rated were actual
      trade counterparties** — lower severity (informational only, never
      touches `reputationScore`), but a real spam/abuse vector. Fixed:
      verifies `raterId`/`ratedId` against the trade's real buyer/seller.

Verified: `npm run build` clean, `npm test` 21/21 suites, 193/193 tests.

---

## 15. Implementation Freeze (declared 2026-07-19)

Full declaration lives in `GOVERNANCE.md` §6B — not repeated here, per
this same document's own recent discipline about one source of truth.
Short version for anyone scanning this list top to bottom: governance
process is considered stable now (Core RFC classification, the review
checklist, RFC-018/019 — all landed the same day). Effort going forward
should weight roughly 80-90% code/tests/integration (WDK/Pears/QVAC)/UX/
developer docs, 10-20% new RFCs, and those should come from what
implementation reveals, not further architectural speculation. New
governance process/classifications/documents are the exception now, not
a natural next step — assume a concept already exists and consolidate
before proposing an expansion.

**Practical effect on this list:** sections 4 (Settlement Providers,
specifically RFC-019's Phase 1/2), 7 (Intent Engine Tables, specifically
RFC-018's 3 phases), 8 (SDK), 9 (Monorepo), and 11 (Frontend) are where
Implementation Freeze effort should actually go next — they're the real
code/SDK/UX work this phase exists to prioritize.

---

## How to Use This List

Work top to bottom by section number unless a specific business priority
overrides it. Section 1 ("Missing Files," the route wiring) is now fully
closed — every module has both a real service layer and HTTP routes.
What's left is genuinely lower-leverage: production-grade Settlement/
Liquidity providers (sections 4-5), rate limiting (6), remaining test
coverage (10), and the CRDT-free `FallbackTransportProvider`/`/ws/relay`
gap `BACKLOG.md` P0 tracks. Update the checkboxes in this file as you go;
don't let this document drift out of sync with reality the way this
version did before the 2026-07-16 re-audit.
