# HANDOFF.md
### Sails Protocol — Technical Handoff (2026-07-17)

> Short, practical brief for whoever is picking this repo up next. Not a
> replacement for `docs/00-INDEX.md`'s full 20-document reading order —
> this is "what to run, what's real, what to attack first."

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
  own passing tests (131 total, `npm test`) — QVAC's real LLM path was
  live-smoke-tested once this session (~737MB model download, ~7-9s per
  call after caching); the Ed25519/libsodium crypto is unit-tested for
  real, not mocked.
- ❌ **The full `demo-satsails-qvac.ts` run has never completed
  end-to-end in this environment** — no reachable Postgres/Redis, no
  live P2P bootstrap network, no funded WDK testnet key here. It has
  only been run up to the expected `Postgres unreachable` failure point.
  **This should be your first real test**: `docker-compose`/local
  Postgres+Redis, `npm run demo:qvac`, watch it all the way through.

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
2. **Rate limiting** (`TODO.md` §6) — zero mitigation exists anywhere.
   `THREAT_MODEL.md` already flags this as unmitigated; add
   `@fastify/rate-limit` per IP/API key before any public exposure.
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
6. **Capability Registry + Policy Engine's governed-policy interface**
   (`ARCHITECTURE.md` §1B) — both still stubs; `coordination-engine.ts`'s
   `decide()` deliberately doesn't consult either yet (RFC-012's own
   Alternatives Considered explains why that was kept out of scope).
7. **`docker-compose.yml`** referenced by `DEPLOYMENT.md` doesn't exist —
   needed for #1 above and for anyone else's local onboarding.

Lower priority but real: `LightningHodlProvider`/`LiquidCovenantProvider`
still throw "not implemented" (only `MOCK`/`WDK_USDT_EVM` settle for
real); the small QVAC model (`LLAMA_3_2_1B_INST_Q4_0`) occasionally
produces structurally-valid-but-semantically-off values (`TODO.md` §5B) —
fine for this demo, worth a bigger model or explicit range checks before
any real money moves on agent-generated amounts.
