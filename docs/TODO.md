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

## 2. Immediate Priority — Restore a Runnable Server

**Resolved.** `config/index.ts`, `common/database/index.ts`,
`common/redis/index.ts`, `common/errors/index.ts` all exist, and
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

- [ ] `LightningHodlProvider` — currently throws `EscrowError('not yet
      implemented')` for every method. Needs a real LND/CLN integration.
- [ ] `LiquidCovenantProvider` — does not exist yet at all, only referenced
      as an `EscrowType` enum value.
- [ ] Real Multisig 2-of-3 Bitcoin escrow — not implemented; only `MOCK` is
      functional today.

## 5. Liquidity Providers Beyond Internal

- [ ] `HodlHodlProvider.isAvailable()` always returns `false` — the
      integration is a stub. Real implementation needs to call
      `https://hodlhodl.com/api/v1/offers` per the TODO comments already in
      `liquidity.service.ts`.

## 6. Rate Limiting & API Keys

- [ ] No rate limiting exists anywhere in the current code. Add
      `@fastify/rate-limit` per IP and per API key before any public
      exposure. See `THREAT_MODEL.md` — this is currently an unmitigated
      Low-severity item that becomes higher severity at scale.

## 7. Intent Engine Tables (status changed — mostly resolved)

- [x] `Intent` and `IntentEvent` tables exist in `schema.prisma` and are
      real, verified via `npm run build`/`npm test`/HTTP round-trip
      (`BACKLOG.md` P0). This is 2 tables, not the 3 originally sketched
      in `PROTOCOL_SPECIFICATION.md` §2.6 — that section explains why a
      separate `intent_payloads` table wasn't needed.
- [ ] **Still open:** `IntentHandler` plugin registration pattern (§2.7 of
      `PROTOCOL_SPECIFICATION.md`) is fully specified but has zero code.

## 8. SDK — Entirely Unbuilt

- [ ] `@sails/sdk` package does not exist. See `SDK_GUIDE.md` for the full
      interface spec it must satisfy, and `docs/DEVELOPER_JOURNEY.md` for
      the onboarding flow it's meant to support once built.
- [ ] `@sails/protocol-spec` package does not exist either — the TypeScript
      interfaces in `PROTOCOL_SPECIFICATION.md` need to be extracted into a
      real, published npm package.

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
- [ ] **Still open, in the priority order `BACKLOG.md` P0/P2 imply:**
      escrow state machine transitions beyond what `disputeFlow.test.ts`
      already covers, and liquidity matching (`open-liquidity`) — no
      dedicated test files yet.

## 11. Frontend

- [ ] No frontend code exists in this environment. Prior sessions
      referenced a Lovable-generated React/Vite frontend and an HTML/JSX
      operator dashboard — neither is present here. Check with the project
      owner before rebuilding; there may be a Lovable project already
      exported elsewhere.

## 12. Deployment

- [ ] `docker-compose.yml` referenced in `DEPLOYMENT.md` does not exist in
      this environment and needs to be (re)created.
- [ ] No CI/CD pipeline exists.

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
      message now carries its own real id. **Still one-directional:** a
      message sent via the WS route is not relayed onto Pears — that
      remains `HumanChatChannel`-only, tracked alongside the
      `FallbackTransportProvider`/`/ws/relay` gap in `BACKLOG.md` P0,
      which is the bigger piece of work actually closing it would need.
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
