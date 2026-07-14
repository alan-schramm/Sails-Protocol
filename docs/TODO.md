# TODO.md
### Sails Protocol — Engineering Handoff · Document 11 of 20

> This list is derived from an actual filesystem audit of the reference
> implementation fragment, not from memory or assumption. Verify current
> state yourself before starting work — code may have moved since this
> handoff was written.

---

## 1. Missing Files (referenced by `app.ts` but not present in this environment)

These need to be either recovered from an earlier build or rewritten from
the specs in this handoff. Do not assume their old implementation matches
current naming/event conventions — rewrite following `CONTRIBUTING.md`.

- [ ] `config/index.ts` — environment variable loading
- [ ] `common/database/index.ts` — Prisma client singleton
- [ ] `common/redis/index.ts` — Redis client
- [ ] `common/errors/index.ts` — `AppError`, `NotFoundError`, `EscrowError`,
      `ValidationError` classes
- [ ] `modules/open-identity/` — full module: identity routes (challenge,
      authenticate, create), Ed25519 signature verification middleware
- [ ] `modules/open-p2p/` — trade routes, chat routes + service
      (Secretstream negotiation channel wired to WebSocket)
- [ ] `modules/open-reputation/` — reputation routes + service (score
      calculation, leaderboard, rating submission)
- [ ] `*.routes.ts` for every module — only service-layer logic survived
      the previous session; no HTTP route wiring exists for
      `open-settlement` or `open-liquidity` either, despite their services
      being present

## 2. Immediate Priority — Restore a Runnable Server

The current `app.ts` will not start successfully until at minimum:

- [ ] `config/index.ts`, `common/database/index.ts`, `common/redis/index.ts`,
      `common/errors/index.ts` exist (everything imports these)
- [ ] At least one route file exists and is registered, or the commented-out
      registration block in `app.ts` is fully removed until routes return

## 3. Auth Middleware (flagged repeatedly across older audits — still open)

- [ ] Ed25519 signature verification middleware — routes currently accept a
      raw `userId` in the request body with no proof the caller controls
      that identity's keypair. This is a **High severity** item per
      `THREAT_MODEL.md` — do not expose any restored route publicly without
      this in place.

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

## 6B. Event Bus Out of Sync With Protocol Freeze (found during Protocol Freeze audit)

- [ ] `common/events/event-bus.ts` has not been updated since RFC-003
      (Claim/Proof/Verification) and RFC-004 (Negotiation revised events)
      were decided. Missing event types: `claim.asserted`,
      `proof.submitted`, `verification.accepted`, `verification.rejected`,
      `dispute.opened`, `dispute.evidence_submitted`, `dispute.arbitrated`,
      `dispute.resolved`, and `negotiation.event_received` (replacing the
      old `negotiation.message_sent`). This is expected at this stage —
      Protocol Freeze happens before Implementation Freeze — but must be
      the first `event-bus.ts` change made once Implementation Freeze
      begins, per `PROTOCOL_SPECIFICATION.md` §1.8-1.9 and
      `rfcs/RFC-003-proof-primitive.md` / `rfcs/RFC-004-negotiation-state-machine.md`.

## 7. Intent Engine Tables (not yet built)

- [ ] `intents`, `intent_payloads`, `intent_transitions` tables described in
      `PROTOCOL_SPECIFICATION.md` section 2.6 do not exist in
      `schema.prisma` yet. Today, `Offer` with its `intentType` field is a
      stand-in for `TradeIntent` — this is a known simplification, not the
      final design.
- [ ] `IntentHandler` plugin registration pattern (section 2.7 of
      `PROTOCOL_SPECIFICATION.md`) is fully specified but has zero code.

## 8. SDK — Entirely Unbuilt

- [ ] `@sails/sdk` package does not exist. See `SDK_GUIDE.md` for the full
      interface spec it must satisfy.
- [ ] `@sails/protocol-spec` package does not exist either — the TypeScript
      interfaces in `PROTOCOL_SPECIFICATION.md` need to be extracted into a
      real, published npm package.

## 9. Monorepo Structure — Not Set Up

- [ ] No `packages/` / `apps/` split exists. All current code lives flat
      under `src/`. Setting up the target structure from `ARCHITECTURE.md`
      section 6 is a `Months 10-12` roadmap item, not urgent, but don't
      invent a different structure ad hoc if you start this early.

## 10. Tests — None Exist

- [ ] Zero automated tests exist in this environment (`package.json`
      references `jest --runInBand` but no test files were found). Priority
      order once routes are restored: escrow state machine transitions
      (`open-settlement`), liquidity matching (`open-liquidity`), event bus
      dispatch (`common/events`).

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

---

## How to Use This List

Work top to bottom by section number unless a specific business priority
overrides it — section 2 ("Immediate Priority") blocks almost everything
else, since the server won't boot without it. Update the checkboxes in this
file as you go; don't let this document drift out of sync with reality the
way earlier versions of other documents in this project did.
