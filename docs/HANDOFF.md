# HANDOFF.md
### Sails Protocol — Technical Handoff (2026-07-17, updated 2026-07-18)

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
  own passing tests (166 total, `npm test`, up from 131 as of this doc's
  original writing — rate limiting and RFC-014's capability enforcement
  each added their own suites since) — QVAC's real LLM path was
  live-smoke-tested once this session (~737MB model download, ~7-9s per
  call after caching); the Ed25519/libsodium crypto is unit-tested for
  real, not mocked.
- ❌ **The full `demo-satsails-qvac.ts` run has still never completed
  end-to-end in this environment** — no reachable Postgres/Redis, no
  live P2P bootstrap network, no funded WDK testnet key here. It has
  only been run up to the expected `Postgres unreachable` failure point.
  **This should be your first real test**: `docker-compose.yml` now
  exists at the repo root (`docker compose up -d` — Postgres 16 + Redis
  7, healthchecked, matches `.env.example` exactly, see
  `docs/DEPLOYMENT.md`) — it just hasn't been exercised against real
  Docker anywhere in this project's history, since none was reachable in
  any environment this was built in. Run `npm run demo:qvac` against it
  and watch it all the way through — that's still the single most
  valuable thing an incoming dev can do here.

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

1. **Run the full demo against real local infra** (section 1 above) —
   nothing else on this list matters until you've confirmed the happy
   path actually completes outside a sandboxed environment.
2. ~~**Rate limiting** — zero mitigation exists anywhere.~~ **Closed.**
   `@fastify/rate-limit` is real: a general per-IP ceiling on every route
   plus a tighter tier on `/v1/identity/challenge`/`authenticate`
   specifically (`RED_TEAM_REVIEW.md` RT-002's own named target).
   `TODO.md` §6, `THREAT_MODEL.md` §4. Still open: no per-API-key tier,
   and `trustProxy` needs setting explicitly if this ever sits behind a
   reverse proxy (not yet done — no proxy exists yet either).
3. **Proof primitive** (`BACKLOG.md` P0) — zero routes, zero tables. This
   is what's blocking two real gaps at once: `submitProof()`/`dispute()`
   in `@sails/sdk`'s Intent facade (currently throw
   `SailsNotImplementedError`, see `intent-facade.ts`), and real evidence
   capture for disputes.
4. **Intent → Trade → Escrow linkage** — the reason
   `releaseAsset(intentId)`/`negotiate(intentId, ...)` don't work yet
   either. An Intent and the Trade/Escrow it produces are currently
   unlinked entities server-side; closing this unblocks the rest of the
   SDK's six-verb facade.
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
