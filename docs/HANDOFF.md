# HANDOFF.md
### Sails Protocol — Technical Handoff (2026-07-17, updated 2026-07-20)

> Short, practical brief for whoever is picking this repo up next. Not a
> replacement for `docs/00-INDEX.md`'s full 20-document reading order —
> this is "what to run, what's real, what to attack first."
>
> **Updated 2026-07-18** — items 2, 6, and 7 in section 3 below were
> closed since this doc was first written (rate limiting, Capability
> Registry enforcement, `docker-compose.yml`); struck through rather than
> deleted so the history of what was actually attacked, and in what order,
> stays visible. Also added the same day, item 8: a real two-person
> release control (RFC-015), and — read this one first if you only read
> one thing —
> **[`docs/TRANSACTION_WALKTHROUGH.md`](TRANSACTION_WALKTHROUGH.md)**,
> tracing one real trade through every piece named in this document at
> once, including exactly what changes with both custody controls on.
>
> **Updated 2026-07-20** — section 1's core blocker claim ("no reachable
> Postgres/Redis") is now stale and corrected below: both run for real in
> this environment without Docker (`docs/TODO.md` §18,
> `npm run db:local:start` / `npm run redis:local:start`), and
> `packages/sails-ui` has been verified end-to-end against them in a real
> browser (`docs/TODO.md` §19) — register/login, Marketplace, a real
> trade, real chat over WebSocket, real QVAC risk evaluation. Item 4 below
> is also corrected: RFC-018 (all 3 phases, done 2026-07-19/20) built the
> server-side Intent→Trade/Offer linkage this item said was missing — but
> a real, narrower gap was found while double-checking that claim,
> written up in place of the old one, not silently dropped.
>
> **Also 2026-07-20 — read this before manually walking the golden path
> again:** it's automated now. `npm run test:e2e` (`docs/TODO.md` §23)
> runs `e2e/golden-path.spec.ts` — two real identities, register through
> settlement, against the real local stack, no mocks. Found 3 real UI
> gaps in the process (stale "loading" state never gated, `discover()`'s
> silent 10-result cap, a fake "connected" chat indicator) — all in §23,
> not repeated here. This is now the fastest way to confirm the golden
> path still works after a change, not a manual browser walkthrough.

## 1. `demo-satsails-qvac.ts` — current state

Root-level entrypoint (`npm run demo:qvac`). Delegates to
`src/demo/pix-to-usdt-flow.ts`'s `main()` (does not duplicate it) and
runs, in order:

1. **QVAC agents** (`src/modules/open-agents/`) generate a
   `TradeIntentPayload` (buyer) and an offer shape (seller) via real
   local LLM inference — no cloud call, no hardcoded response.
2. **Pears P2P** (`src/infrastructure/p2p/`) opens two real HyperDHT
   nodes, joins a trade-scoped topic (triggers real NAT hole-punching),
   and sends the buyer's Intent directly to the seller's node, encrypted
   with a real libsodium sealed box (`payload-crypto.ts`).
3. **Intent Engine state machine** (`src/core/`) runs
   `CREATED → VALIDATED → COORDINATED` (RFC-012) with the CISO
   Byzantine/Economic checks gating persistence.
4. **WDK settlement** (`src/modules/open-settlement/settlement-orchestrator.ts`'s
   `executeSettlement()`) locks escrow, emulates the seller's PIX
   confirmation (explicitly labeled `emulated: true` — not a real
   payment-rail integration), and releases USDT via a real, digitally
   signed `@tetherto/wdk-wallet-evm` transfer when `WDK_SEED_PHRASE` is
   configured (falls back to `MockSettlementProvider` otherwise, per
   `RED_TEAM_REVIEW.md` RT-001's boot-time gate — never silently signs
   nothing and calls it success).

**What's verified vs. not, honestly:**
- ✅ Compiles clean (`npm run build`), every individual piece has its
  own passing tests (222 total, `npm test`, up from 166 as of this doc's
  prior update). QVAC's real LLM path was live-smoke-tested once
  (~737MB model download, ~7-9s per call after caching); the
  Ed25519/libsodium crypto is unit-tested for real, not mocked.
- ✅ **The blocker this section used to lead with — "no reachable
  Postgres/Redis" — is resolved as of `docs/TODO.md` §18.** Real local
  Postgres + Redis now run in this environment without Docker
  (`npm run db:local:start` / `npm run redis:local:start`, wrapping real
  `pg_ctl`/`initdb` and a real Memurai binary respectively — not a mock
  layer). `packages/sails-ui` has been verified against them end-to-end
  in a real browser session (`docs/TODO.md` §19): register/login (real
  Ed25519), browse a real Marketplace, open a real trade, real chat over
  a live WebSocket, a real QVAC risk card firing mid-negotiation.
- ❌ **`demo-satsails-qvac.ts` specifically (the standalone WDK/Pears/QVAC
  CLI script, distinct from the HTTP server + UI path verified above) has
  still never been run against this now-working local infra** — that's
  a genuinely different code path (real HyperDHT peer discovery between
  two local nodes, a funded WDK testnet key for the real signed USDT
  transfer) and remains untested end-to-end. **This is the actual
  remaining "needs a dev's hands" item, and specifically why:** it needs
  a funded WDK EVM testnet key (`WDK_SEED_PHRASE`/`WDK_USDT_CONTRACT` in
  `.env.example`) that no environment this project has been built in has
  had access to, plus confirming two local HyperDHT nodes can actually
  hole-punch and reach each other from wherever you're running this
  (network-dependent, not something a sandboxed dev environment can
  verify). `docker-compose.yml` still exists at the repo root as an
  alternative to the local-infra scripts above (`docs/DEPLOYMENT.md`) —
  either gets you the database layer; neither solves the two items in
  this paragraph, which are the real remaining gap. Run
  `npm run demo:qvac` once you have a funded testnet key — that's still
  the single most valuable thing an incoming dev can do here.

## 2. Installed WDK / Pears / QVAC dependencies (exact versions)

| Package | Version | Used by |
|---|---|---|
| `@tetherto/wdk-wallet-evm` | `^1.0.0-beta.15` | `wdk-settlement.provider.ts` — real signing |
| `hyperdht` | `^6.32.0` | `pear.service.ts` — DHT node, peer discovery |
| `hyperswarm` | `^4.17.0` | `pear.service.ts` — connection swarm on top of HyperDHT |
| `b4a` | `^1.8.1` | `pear.service.ts` — buffer helpers Hyperswarm expects |
| `@qvac/sdk` | `^0.15.0` | `qvac-agent.provider.ts` — local LLM inference |
| `sodium-native` | `^5.1.0` | `payload-crypto.ts` — Ed25519→Curve25519 + sealed-box encryption |
| `tweetnacl` / `tweetnacl-util` | `^1.0.3` / `^0.15.1` | `common/middleware/auth.ts` (server) and `packages/sails-sdk` (client) — Ed25519 challenge-response, same library both sides |

Docs: https://docs.wdk.tether.io/ · https://docs.pears.com/ · https://docs.qvac.tether.io/
(also linked from `README.md`'s "three technologies" section, with what
each one actually does in this codebase).

## 3. `docs/TODO.md` — attack in this order

1. ~~**Run the full demo against real local infra.**~~ **Partially
   closed (2026-07-20).** Local Postgres+Redis and the HTTP server + UI
   path are verified end-to-end (section 1 above). **Still open, and now
   the real first step:** run `npm run demo:qvac` itself — needs a
   funded WDK EVM testnet key and two reachable local HyperDHT nodes,
   neither available in any sandboxed environment this project has been
   built in (section 1's last paragraph has the exact "why").
2. ~~**Rate limiting** — zero mitigation exists anywhere.~~ **Closed.**
   `@fastify/rate-limit` is real: a general per-IP ceiling on every route
   plus a tighter tier on `/v1/identity/challenge`/`authenticate`
   specifically (`RED_TEAM_REVIEW.md` RT-002's own named target).
   `TODO.md` §6, `THREAT_MODEL.md` §4. Still open: no per-API-key tier,
   and `trustProxy` needs setting explicitly if this ever sits behind a
   reverse proxy (not yet done — no proxy exists yet either).
3. **Proof primitive** (`BACKLOG.md` P0) — **corrected claim (2026-07-20):
   the `Claim`/`Proof`/`EvidenceVerification` tables already exist**
   (`DATABASE.md`, `common/types`); what's actually missing is
   `modules/open-proof/proof.service.ts` — no `assertClaim()`/
   `submitProof()`/`verify()` service logic and zero routes. This is
   what's blocking `submitProof()`/`dispute()` in `@sails/sdk`'s Intent
   facade (currently throw `SailsNotImplementedError`, see
   `intent-facade.ts`), and real evidence capture for disputes.
4. **`@sails/sdk`'s Intent facade doesn't consume the Intent→Trade/Offer
   link RFC-018 built — corrected (2026-07-20), narrower than this item
   used to claim.** RFC-018 (all 3 phases, done) gave `Trade`/`Offer` a
   real, populated `intentId` FK — the server-side data link
   `intent-facade.ts`'s own doc comment says is missing no longer is.
   What's still actually missing, found while verifying that comment:
   **no route resolves an `intentId` to the `Trade`/`Escrow` it
   produced** (checked — nothing in `trade.routes.ts` queries by
   `intentId`). Concretely, closing this is: (a) one new route, e.g.
   `GET /v1/openp2p/trades/by-intent/:intentId` (`Trade.findFirst({
   where: { intentId } })` — the column and data already exist), (b)
   wiring `intent-facade.ts`'s `negotiate()`/`releaseAsset()`/
   `dispute()` to call it instead of throwing
   `SailsNotImplementedError`, delegating to the same
   `openp2p.chat()`/`settlement.release()`/`settlement.dispute()` calls
   their error messages already point callers to today. Small, scoped,
   no external infra needed — a reasonable next pass, not attempted in
   this one since it wasn't the task in progress when found.
5. **Chat/negotiation messages are still plaintext** — found while
   building `payload-crypto.ts`: Intent payloads sent via
   `sendIntentToPeer()` are properly encrypted, but `chat.routes.ts`/
   `HumanChatChannel` still send plain JSON. `websocket-relay.service.ts`'s
   own doc comment used to claim otherwise everywhere — now corrected to
   say precisely where it's true.
6. ~~**Capability Registry** — still a stub, zero real callers.~~
   **Closed, in two RFCs.** RFC-013 made `capability-registry.ts` real
   (persisted `CapabilityGrant`, `grant()`/`check()`/`revoke()`); at that
   point it still had no real caller anywhere in the money-moving path —
   RFC-014 closed that specifically: `intentEngine.create()` and (as of
   RFC-015, which found the check needed to move) `escrow.service.ts`'s
   `releaseFunds()` both check it now, behind
   `config.features.enforceCapabilities` (`ENFORCE_CAPABILITIES`, default
   `false` — no grant has ever been issued in this repo's history outside
   the demo script, so enforcing unconditionally would reject everything).
   **Still a real stub:** `policy-engine.ts`'s governed-policy interface
   (`ARCHITECTURE.md` §1B) — `coordination-engine.ts`'s `decide()`
   deliberately doesn't consult it (RFC-012's own Alternatives Considered
   explains why that was kept out of scope, and it still is).
8. ~~**Custody is single-seed, no defense against a single compromised
   release trigger.**~~ **Real, application-layer mitigation added
   (RFC-015) — not on-chain multisig.** `@tetherto/wdk-wallet-evm-erc-4337`
   was checked and found single-owner-only (its real compiled types),
   so one WDK seed still signs the eventual transfer regardless. What's
   real: `escrow.service.ts`'s `releaseFunds()` now requires both a
   trade's buyer and seller to have independently approved
   (`POST /v1/settlement/escrow/:id/approve-release`) before a normal
   release proceeds, behind `config.features.requireDualApprovalForRelease`
   (`REQUIRE_DUAL_APPROVAL_RELEASE`, default `false`). See
   `docs/TRANSACTION_WALKTHROUGH.md` §3 for the concrete request sequence
   and exactly what this does and doesn't protect against. **Still open:**
   real on-chain multisig (deferred, RFC-015's Alternatives Considered #1);
   binding an approval to the exact release terms rather than a bare
   per-escrow checkbox.
7. ~~**`docker-compose.yml`** referenced by `DEPLOYMENT.md` doesn't
   exist.~~ **Closed.** It exists at the repo root now — Postgres 16 +
   Redis 7, healthchecked, matches `.env.example` exactly. Still not
   exercised against real Docker anywhere in this project's history (see
   section 1's note above) — that verification is still yours to do.

Lower priority but real: `LightningHodlProvider`/`LiquidCovenantProvider`
still throw "not implemented" (only `MOCK`/`WDK_USDT_EVM` settle for
real); the small QVAC model (`LLAMA_3_2_1B_INST_Q4_0`) occasionally
produces structurally-valid-but-semantically-off values (`TODO.md` §5B) —
fine for this demo, worth a bigger model or explicit range checks before
any real money moves on agent-generated amounts.

## 4. What genuinely needs a dev with real infrastructure vs. what's
   buildable in a sandboxed environment (2026-07-20)

The gap list above mixes two very different kinds of "not done yet":
things blocked on infrastructure a sandboxed environment structurally
cannot provide (funded keys, reachable peers, a second real device), and
things that are just unwritten code. Conflating them wastes a dev's
first day re-discovering which is which. This section is the audited
split, current as of this writing — update it, don't let it silently go
stale the way section 1's old "no reachable Postgres/Redis" claim did.

### Needs a dev in a real environment — and precisely why

| Item | Why it can't be closed here |
|---|---|
| **RFC-019 Phase 2** — real multisig/threshold-signature `SettlementProvider` for EVM | Not an infra gap, a real design decision (which scheme, which library) that then needs verification against funded testnet keys — the current single-seed `WdkSettlementProvider` is the disclosed blocker for any production/mainnet use (`PROTOCOL_INVARIANTS.md` Constitutional Invariant 2) |
| **`demo-satsails-qvac.ts` run end-to-end** | Needs a funded WDK EVM testnet key and two `HyperDHT` nodes actually reaching each other over a real network — section 1 above has the full detail |
| **`HumanChatChannel.onEvent()`** (defined, never called — incoming Pears messages have no consumer) | Same reason: only verifiable with two real peer nodes, not something to fake a passing test against |
| **`LightningHodlProvider`/`LiquidCovenantProvider`** | Need a real LND/CLN node or real Liquid covenant tooling — neither exists in any environment this project has been built in |
| Real liquidity / real strangers trading repeatedly (PIX↔USDT/BTC at volume) | Not engineering at all — a GTM/business milestone, out of scope for this list entirely |

### Buildable now, no live infra required

| Item | Status |
|---|---|
| **A route resolving `intentId → Trade/Escrow`, plus wiring `@sails/sdk`'s `dispute()` to it** | **Done (2026-07-20).** `GET /v1/openp2p/trades/by-intent/:intentId` + `trade.service.ts`'s `getTradeByIntentId()`; `intent-facade.ts`'s `dispute(intentId, reason)` now really resolves the Trade, gets its `escrowId`, and raises a real `Dispute` — same route `settlement.dispute()` uses. **Found while building this, corrected in the same pass:** `negotiate()`/`releaseAsset()` were NOT just missing this same route — each has its own, different real blocker, discovered only by checking `SDK_GUIDE.md`'s exact canonical signatures instead of assuming they'd fall to the same fix. `negotiate(intentId, event): Promise<void>` can't represent `openp2p.chat(tradeId)`'s real shape (a persistent `WebSocketChannel`, not a fire-and-forget call). `releaseAsset(intentId): Promise<Settlement>` has no destination-address parameter, but the one real release route requires `toAddress` with no default — a gap in `SDK_GUIDE.md`'s own canonical signature, not a missing route. Both left throwing `SailsNotImplementedError`, with corrected messages — forcing either into "working" would mean silently diverging from the documented contract, which this project's own discipline treats as worse than an honest not-yet. `npm run build` clean, `npm test` 223/223. |
| **`RedisStreamsEventStore`** (RFC-010's own Reference Implementation Plan: `XADD`/`XGROUP`/`XREADGROUP`/`XACK`) | Not yet attempted. Previously blocked on "no reachable Redis to integration-test against" — no longer true, real local Redis runs in this environment (§18 above). A first pass without `XCLAIM`-based crash recovery (the RFC's own stated prerequisite before this becomes Satsails Wallet's *active* store) would be real, honestly-scoped progress, matching the same disclosure pattern `WdkSettlementProvider` already uses. Flagged as the next reasonable candidate — not started without confirmation given its size (a consumer-group polling loop, not a small tweak). |

### Deliberately not attempted — a scoping decision, not a blocker

**`PolicyEngine`'s governed-policy interface** (`get`/`propose`/`activate` — `FeePolicy`/`TrustPolicy`/`RoutingPolicy`, `core/policy-engine.ts`) stays a stub on purpose, not because anything blocks it technically. Closing it for real needs: a new Prisma-backed policies table (none exists), and a decision to wire `coordination-engine.ts`'s `decide()` into it — something RFC-012's own Alternatives Considered explicitly kept out of scope, and nothing in the current P2P Trading SDK golden path calls `policyEngine.get()` at all. Per `PROJECT_CONTEXT.md`'s priority filter ("does this directly improve building a P2P Financial Marketplace?"), this doesn't clear the bar today — it's a real architectural decision that deserves its own RFC when something in the real flow actually needs fee/trust/routing rules enforced, not a stub to remove opportunistically. Note this is a **different reason** than the "needs live infra" row above — worth keeping distinct so it isn't miscategorized as either "blocked" or "just do it."

## 5. `@sails/sdk` v1.0.0-rc1 — release notes and the maintenance-mode rule (2026-07-20)

CTO's explicit closing instruction before a dev takes over ongoing
maintenance: don't hand off "loose." This section is that organized
transition for `@sails/sdk` specifically — everything else in this file
still applies to the wider reference implementation.

### What "Release Candidate" means here, precisely

`v1.0.0-rc1` is a git tag on this commit, not an npm-published version —
`packages/sails-sdk/package.json`'s own `"version"` field stays `0.1.0`
(see `packages/sails-sdk/CHANGELOG.md`'s versioning note for the exact
technical reason it can't be bumped yet without breaking
`packages/sails-ui`'s workspace install — a real gotcha, not an
oversight). By SemVer, `1.0.0-rc1` has lower precedence than `1.0.0`
itself: this is "what we believe v1.0.0 will be," not v1.0.0 itself.
`docs/API_STABLE.md`'s freeze commitment (0.1 → 1.0 only after real
external usage) is unaffected — the actual `1.0.0` tag still waits for
a real consumer to prove this out.

### Release-candidate checklist — done

- ✅ **API frozen** — `docs/API_STABLE.md`: every module (protocol name
  + friendly alias), every real method, zero-breaking-changes
  commitment until v1.
- ✅ **Documentation delivered** — `docs/API_STABLE.md`,
  `docs/SDK_GUIDE.md` (corrected 2026-07-20, `docs/TODO.md` §28),
  `packages/sails-sdk/README`-equivalent context in this file and
  `PROJECT_CONTEXT.md`, `examples/simple-wallet/README.md`,
  `packages/sails-sdk/CHANGELOG.md`, generated API docs
  (`npm run docs -w @sails/sdk` → `packages/sails-sdk/docs-api/`,
  gitignored — regenerate locally, not committed).
- ✅ **Tests green** — Jest 226/226, Playwright 3/3 (golden path + both
  concurrency scenarios), `examples/simple-wallet` dogfooding passes,
  production builds (backend + SDK + UI) all clean.
- ✅ **Final audit done** — `docs/TODO.md` §28: 2 High findings (internal
  classes leaked onto the public surface), 1 Medium (stale docs), 1 Low
  (an avoidable cast) — all fixed, none Critical.

### Pendências registradas — known, open, not blocking the RC

- `liquidity.discover()`'s pagination is a real fix (`limit`/`offset`,
  max 50) but not a complete one — a marketplace with more than 50
  active offers per asset/side still has no way to reach the rest; real
  pagination/infinite-scroll in `packages/sails-ui`'s Marketplace screen
  is unbuilt.
- No ESM build — `package.json` only declares `main` (CommonJS), so
  real tree-shaking is not possible today regardless of how a consumer
  writes their imports (`docs/TODO.md` §27).
- Node LTS validation (20/22) genuinely not done — only Node 24.16.0
  was available in this environment, no version manager present.
- `negotiate()`/`submitProof()`/`releaseAsset()` remain honest
  `SailsNotImplementedError` stubs — each has a distinct, disclosed
  reason (`intent-facade.ts`'s own header), not a linkage gap.
- The wider CTO roadmap beyond this SDK (Satsails Wallet, Rumble, QVAC
  agents, Portable Trust, Capability Registry evolution, OpenIdentity)
  is explicitly **out of scope for this handoff** — the SDK is the
  first layer; those are meant to be built *against* it, not alongside
  it in this same pass.

### The rule for whoever maintains this next

> **`@sails/sdk` is in controlled maintenance and evolution. Do not
> change anything in `docs/API_STABLE.md` without an RFC or explicit
> approval. New changes should come from real integration needs — a
> real wallet, a real bug, a real second consumer — not from new ideas
> about the SDK itself.**

This exists specifically to prevent the common failure mode of a new
maintainer arriving and starting to "improve" the architecture,
breaking a base that real dogfooding (`examples/simple-wallet`) and a
full audit (`docs/TODO.md` §28) already validated. From here, the right
kind of work is: fixing bugs real users hit, performance, real new
integrations, supporting new clients, evolving the Wallet on top of
this SDK, and preparing an actual stable release — not restructuring
what's already frozen.
