# DEPLOYMENT.md
### Sails Protocol — Engineering Handoff · Document 12 of 20

> Covers the Satsails reference implementation only. The protocol itself
> has no deployment requirements — see `PROTOCOL_SPECIFICATION.md` section 5.
>
> **Rewritten 2026-07-18** — the previous version of this document
> predated almost the entire build-out documented in `docs/TODO.md`/
> `docs/BACKLOG.md` and had drifted badly from what's actually true (it
> claimed `npm run dev` couldn't start, zero tests existed, Ed25519 auth
> and rate limiting weren't in place, and referenced a `JWT_SECRET`/
> `PEAR_PEER_ID` env vars that were never real). Every claim below was
> checked against the actual code/config before being written, not
> carried over from the old draft.

---

## 1. Prerequisites

- Node.js 20+ (`package.json`'s `engines` field)
- Docker + Docker Compose (for local Postgres/Redis — see section 3)
- Git

## 2. Environment Variables (`.env`, copy from `.env.example`)

`.env.example` at the repo root is the authoritative list — every
variable it defines is read in `src/config/index.ts`, which is itself
the single source of truth if this document and the code ever disagree.
The short version:

```bash
DATABASE_URL=postgresql://postgres:password@localhost:5432/sails_protocol
REDIS_URL=redis://localhost:6379
PORT=3000
HOST=0.0.0.0
NODE_ENV=development
LOG_LEVEL=info
AUTH_CHALLENGE_TTL=120
AUTH_SESSION_TTL=3600
HYPERDHT_BOOTSTRAP=
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW=1 minute
RATE_LIMIT_AUTH_MAX=10
RATE_LIMIT_AUTH_WINDOW=1 minute
MOCK_ESCROW=true
MOCK_SETTLEMENT=true
DEFAULT_TIMELOCK_HOURS=24
AUTO_SETTLE_ON_MATCH=false
TRUSTED_ARBITRATORS=
WDK_SEED_PHRASE=
WDK_RPC_URL=https://sepolia.drpc.org
WDK_USDT_CONTRACT=
```

There is no `JWT_SECRET` — authentication is real Ed25519 challenge-
response (`common/middleware/auth.ts`, `tweetnacl`), not JWTs. There is
no `PEAR_PEER_ID` env var either — a participant's `peerId` is generated
per-node at runtime (`pear.service.ts`'s `PearNode.start()`), not
configured statically.

**Important:** `MOCK_ESCROW=true`/`MOCK_SETTLEMENT=true` must be
`false` in any environment handling real value — `MockSettlementProvider`
generates fake transaction IDs and moves nothing real. Left `true` in
`NODE_ENV=production`, the app refuses to boot (`config/index.ts`'s own
hard stop, `RED_TEAM_REVIEW.md` RT-001) rather than silently running
theater-escrow in production.

## 3. Setup

```bash
git clone https://github.com/alan-schramm/Sails-Protocol.git
cd Sails-Protocol
cp .env.example .env              # defaults already match docker-compose.yml below
docker compose up -d              # Postgres + Redis, real local infra
npm install                       # also runs @prisma/client's own postinstall (prisma generate)
npm run db:migrate                # applies prisma/schema.prisma, including RFC-013's CapabilityGrant table
npm run dev                       # http://localhost:3000 — hot-reload dev server
```

`docker-compose.yml` (repo root) defines `postgres:16-alpine` and
`redis:7-alpine` with healthchecks and named volumes, matching the
`DATABASE_URL`/`REDIS_URL` in `.env.example` exactly — no values to edit
for local dev. `docker compose down -v` removes the volumes if you want
a clean database.

**Not yet built:** `npm run db:seed` (`src/test/seeds/seed.ts`) is
referenced by `package.json` but the file doesn't exist — seeding is
still manual (via the routes, or `docs/HANDOFF.md`'s `npm run demo:qvac`
flow, which creates real participants/offers/intents/escrow as it runs).

**Verify it actually boots** rather than trusting this document — run
`npm test` first (159 tests, no external infra required, see section 4)
to confirm the code itself is sound, then `npm run dev` against the
Docker-composed Postgres/Redis above. `docs/HANDOFF.md` has the exact
current status of what's been verified live vs. only against mocks —
read that before assuming either way.

## 4. package.json Scripts (verified against the real file)

| Script | Command | Purpose |
|---|---|---|
| `dev` | `ts-node-dev --respawn --transpile-only src/main.ts` | Hot-reload dev server |
| `build` | `npm run build -w @sails/p2p-schemas && npm run build -w @sails/sdk && tsc` | Builds both workspace packages, then the server (`dist/`) |
| `start` | `node dist/src/main.js` | Run the compiled build (note the `dist/src/` path — `tsc`'s inferred rootDir includes `packages/` via a `paths` alias, so output isn't flat under `dist/`) |
| `db:migrate` | `npx prisma migrate dev` | Apply schema migrations |
| `db:generate` | `npx prisma generate` | Regenerate the Prisma client (also runs automatically on `npm install`) |
| `db:seed` | `ts-node src/test/seeds/seed.ts` | ⚠️ Still not built — see section 3 |
| `db:studio` | `npx prisma studio` | Visual database browser |
| `demo:pix-to-usdt` | `ts-node --transpile-only src/demo/pix-to-usdt-flow.ts` | The full QVAC → Pears → Intent Engine → WDK settlement flow |
| `demo:qvac` | `ts-node --transpile-only demo-satsails-qvac.ts` | Root-level entrypoint for the same flow — see `docs/HANDOFF.md` |
| `test` | `jest --runInBand` | 19 suites, 159 tests, no external infra required — every test mocks its own network/database boundary |

`src/main.ts` (the actual server entrypoint `dev`/`start` invoke) is
real — a thin wrapper around `app.ts`'s `startServer()`.

## 5. Dependencies (from `package.json`, current — spot-check this
   table against the real file if it's been a while since this doc was
   updated, rather than trusting it indefinitely)

**Runtime (selected — see `package.json` for the complete, exact-pinned
list):** `fastify` + `@fastify/cors`/`rate-limit`/`swagger`/`swagger-ui`/
`websocket`, `@prisma/client`, `zod`, `pino`, `dotenv` — the HTTP server
stack. `hyperdht`/`hyperswarm`/`b4a` — real Pears P2P transport.
`sodium-native` — real libsodium encryption for direct P2P Intent
delivery. `tweetnacl`/`tweetnacl-util` — real Ed25519 challenge-response
auth. `@tetherto/wdk-wallet-evm` — real signed USDT settlement (testnet).
`@qvac/sdk` — real local LLM inference. `@sails/p2p-schemas` — the
in-repo types workspace package.

**Dev:** `typescript`, `ts-node`/`ts-node-dev`, `jest`/`ts-jest`,
`prisma`, `pino-pretty`, plus `@types/*` packages.

`npm install` also installs and builds `packages/sails-p2p-schemas` and
`packages/sails-sdk` (the real npm workspaces — root `package.json`'s
`workspaces` field).

## 6. Docker Compose

`docker-compose.yml` exists at the repo root (see section 3) — Postgres
16 + Redis 7, healthchecked, with named volumes for persistence across
restarts. No application container yet: the server itself still runs
via `npm run dev`/`npm start` on the host, not inside Compose — adding
an `app` service is reasonable follow-up work once there's a reason to
containerize the server too (e.g. a real staging deployment), not
required for local development.

## 7. Production Considerations

- [ ] Reverse proxy (nginx or similar) + TLS termination — not yet set
      up. If you put one in front of this server, also set Fastify's own
      `trustProxy` option (`app.ts`) so rate limiting's per-IP tracking
      (section below) sees the real client IP, not the proxy's.
- [ ] `MOCK_ESCROW=false`, `MOCK_SETTLEMENT=false`, and a funded
      `WDK_SEED_PHRASE` — required for real settlement; the app refuses
      to boot with mock settlement in `NODE_ENV=production` (section 2).
- [x] **Rate limiting is in place** — `@fastify/rate-limit`, global +
      tighter auth-route tier (`docs/THREAT_MODEL.md`). Still open: no
      per-API-key tier, only per-IP.
- [x] **Ed25519 auth middleware is in place** — real challenge-response
      (`common/middleware/auth.ts`), not a placeholder. There is no
      `JWT_SECRET` to configure; nothing here needs one.
- [x] **Capability Registry has real enforcement callers** (RFC-014,
      `ENFORCE_CAPABILITIES`) and **escrow release has a two-person
      control option** (RFC-015, `REQUIRE_DUAL_APPROVAL_RELEASE`) — both
      real, both off by default (no `CapabilityGrant`/approval exists
      anywhere by default, so enforcing unconditionally would reject
      everything). Turning `REQUIRE_DUAL_APPROVAL_RELEASE` on changes the
      required calling pattern for a release — read RFC-015's Decision §5
      before enabling it, it is not a drop-in flag flip.
- [ ] Custody is still single-seed, not real multisig —
      `WDK_SEED_PHRASE` controls the treasury account and every per-trade
      escrow sub-account (two-hop derivation, not independent keys; see
      `wdk-settlement.provider.ts`'s own doc comment). RFC-015's
      two-person control is a real, application-layer mitigation for
      *who may trigger* a release, not a replacement for real on-chain
      multisig — that remains future work (RFC-015's Alternatives
      Considered #1: `@tetherto/wdk-wallet-evm-erc-4337` is
      single-owner-only, checked against its real compiled types before
      choosing this pass's design).
- [ ] A real Postgres migration run (`npm run db:migrate`) against
      production infra — every schema change in this repo so far has
      only been verified via `prisma generate` (client types) in an
      environment with no live Postgres reachable; the actual `migrate
      dev` application has never been run outside a developer's own
      local Docker setup (see `docs/HANDOFF.md` for the exact scope of
      what's been live-verified vs. not).
