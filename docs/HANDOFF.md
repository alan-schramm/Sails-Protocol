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
