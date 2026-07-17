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

---

## 1. Missing Files (referenced by `app.ts` but not present in this environment)

`config/index.ts`, `common/database/index.ts`, `common/redis/index.ts`,
and `common/errors/index.ts` — all previously listed here as missing —
**now exist and are imported directly (uncommented) at the top of
`app.ts`.** See section 13. What's actually still missing:

- [ ] `modules/open-identity/` — full module: identity routes (challenge,
      authenticate, create), Ed25519 signature verification middleware
      wired to routes. **Note:** the middleware itself (`common/middleware/
      auth.ts`, real Ed25519 challenge-response) already exists — see
      section 3. What's missing is the module's routes and service layer
      around it, not the crypto.
- [ ] `modules/open-p2p/` — trade routes, chat routes (Secretstream
      negotiation channel wired to WebSocket). **Note:** the service layer
      (`negotiation.service.ts`'s `HumanChatChannel`, `reconciliation.service.ts`)
      already exists and is real — see `BACKLOG.md` P0. Only the HTTP/WS
      route wiring is missing.
- [ ] `modules/open-reputation/` — reputation routes + service (score
      calculation, leaderboard, rating submission) — genuinely not started,
      neither routes nor service exist yet.
- [ ] `*.routes.ts` for `open-settlement` and `open-liquidity` — their
      service layers (`escrow.service.ts`, `dispute.service.ts`,
      `arbitration-provider.ts`, `liquidity.service.ts`) are real and
      reviewed (`BACKLOG.md` P2/P3), but still have no HTTP route wiring.

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

## 3. Auth Middleware (status changed — partially closed)

- [x] Ed25519 signature verification middleware — `common/middleware/
      auth.ts` implements real challenge-response auth, closing
      `RED_TEAM_REVIEW.md` RT-002 (previously the highest-priority open
      security item here). See `BACKLOG.md` P2, "Sails OpenIdentity" row.
- [ ] **Still open:** the middleware is not wired into any route, because
      the routes it would protect (section 1's `open-identity`/`open-p2p`/
      etc.) don't exist yet. Do not expose any restored route publicly
      without confirming this middleware is actually applied to it — a
      route file existing is not the same as it being authenticated.

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
      `tests/disputeFlow.test.ts` exist and pass — 18+10 tests across the
      Intent Engine, transport fallback, and dispute flow. `jest`/`ts-jest`
      are real dependencies now, not just a `package.json` script pointing
      at nothing.
- [ ] **Still open, in the priority order `BACKLOG.md` P0/P2 imply:**
      escrow state machine transitions beyond what `disputeFlow.test.ts`
      already covers, liquidity matching (`open-liquidity`), and event bus
      dispatch (`common/events`) — none of these have dedicated test files
      yet.

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
      auth.ts`) — built, not yet wired to routes (see section 3)

---

## How to Use This List

Work top to bottom by section number unless a specific business priority
overrides it — section 1 ("Missing Files," the route wiring) is now the
highest-leverage remaining gap, since the server itself boots and the
service layers behind most of those routes already exist. Update the
checkboxes in this file as you go; don't let this document drift out of
sync with reality the way this version did before the 2026-07-16 re-audit.
