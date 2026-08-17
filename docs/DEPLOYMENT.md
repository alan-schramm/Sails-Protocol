# DEPLOYMENT.md
### Sails Protocol — Engineering Handoff · Document 12 of 20

> Covers the Satsails reference implementation only. The protocol itself
> has no deployment requirements — see `PROTOCOL_SPECIFICATION.md` section 5.
>
> **Rewritten 2026-07-18, updated 2026-08-02** — the 2026-07-18 rewrite
> predated `RFC-020`/`RFC-021`'s entire build-out and had already drifted
> in one concrete way: it documented `npm run db:migrate` (`prisma migrate
> dev`) as the schema-apply command, but at the time every real schema
> change in this repo since Prisma 7 landed had actually been applied via
> `npx prisma db push` — no `prisma/migrations/` directory existed yet.
> `package.json`'s own `db:migrate` script was silently wrong (still
> invoking `migrate dev`) until this pass fixed it to run `db push` for
> real, matching what actually worked at the time. This update also adds
> section 8 — a real AWS production deployment, written because a real
> deployment (real infrastructure, real MULTISIG custody, a self-funded
> live test — not opened to the public) is now actually happening, not a
> hypothetical future reader's problem.
>
> **Corrected 2026-08-09** — `prisma/migrations/` now exists (added
> 2026-08-07, real migration history, `db push` no longer the way schema
> changes ship) — the paragraph above is a historical record of the
> 2026-08-02 state, not current guidance. Real, reproduced bug found the
> same day diagnosing a fresh `docker compose up` from an empty
> database: a bare `prisma migrate deploy` fails applying the very first
> migration (`20260807_init`) immediately followed by any later
> migration in the same invocation. Fixed with a wrapper script
> (`scripts/migrate-deploy-safe.sh`, `docker-compose.yml`'s `migrate`
> service now uses it) — see that script's own header comment for the
> full diagnosis and workaround. The AWS RDS instance section 8 below
> describes was itself provisioned via `db push` before migration
> history existed, so this bug doesn't affect it directly; it matters
> for any genuinely fresh deployment going forward (a new environment,
> disaster recovery, or anyone cloning this repo and running `docker
> compose up` for the first time).

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

**Docker-first path (2026-08-03) — no Node/npm on the host at all**, the
one this project now recommends by default (real per-service reasoning:
letting a non-technical project owner or a brand-new contributor get a
real, working instance up without installing a JS toolchain first):

```bash
git clone https://github.com/alan-schramm/Sails-Protocol.git
cd Sails-Protocol
docker compose up -d --build      # Postgres + Redis + the server itself — http://localhost:3000
```

That's the whole setup. `docker-compose.yml` (repo root) now has three
services: `postgres`/`redis` (real local infra, unchanged from before),
plus `migrate` (a one-shot `npx prisma db push` against `postgres`,
built from the Dockerfile's own `builder` stage so the real `prisma` CLI
is present) and `app` (the server itself, also built from `builder` —
deliberately not the slim `runtime` stage the production Dockerfile path
uses, since local dev wants `pino-pretty`'s readable logs, a
devDependency the production stage prunes). `app` waits for `migrate` to
finish successfully before starting, so a schema always exists before
the first request. `MOCK_ESCROW`/`MOCK_SETTLEMENT` stay `true` here —
this is the safe, no-secrets onboarding path; see section 8 for the real
AWS/`MULTISIG`-mainnet production path, which is deliberately separate.
**Verified against a real, cold run before this was written**, not just
reviewed — `docker compose down -v` first for a genuinely clean retry.

**If you're actively editing code** (hot-reload on save, not a Docker
rebuild per change):

```bash
cp .env.example .env              # defaults already match docker-compose.yml below
docker compose up -d postgres redis   # just the two real dependencies, not the app container
npm install
npm run db:migrate                # real command is `npx prisma db push` (package.json, corrected 2026-08-02) — applies prisma/schema.prisma, including RFC-013's CapabilityGrant table
npm run dev                       # http://localhost:3000 — hot-reload dev server
```

`docker compose down -v` removes the volumes if you want a clean database
either way.

**Not yet built:** `npm run db:seed` (`src/test/seeds/seed.ts`) is
referenced by `package.json` but the file doesn't exist — seeding is
still manual (via the routes, or `docs/HANDOFF.md`'s `npm run demo:qvac`
flow, which creates real participants/offers/intents/escrow as it runs).

**Verify it actually boots** rather than trusting this document — run
`npm test` first (600+ tests as of 2026-08-03, no external infra required, see section 4)
to confirm the code itself is sound, then `npm run dev` against the
Docker-composed Postgres/Redis above. `docs/HANDOFF.md` has the exact
current status of what's been verified live vs. only against mocks —
read that before assuming either way.

## 4. package.json Scripts (verified against the real file)

| Script | Command | Purpose |
|---|---|---|
| `dev` | `ts-node-dev --respawn --transpile-only src/main.ts` | Hot-reload dev server |
| `build` | `npm run build -w @satsails/p2p-schemas && npm run build -w @satsails/p2p-trading-sdk && tsc` | Builds both workspace packages, then the server (`dist/`) |
| `start` | `node dist/src/main.js` | Run the compiled build (note the `dist/src/` path — `tsc`'s inferred rootDir includes `packages/` via a `paths` alias, so output isn't flat under `dist/`) |
| `db:migrate` | `npx prisma db push` | Apply the current `schema.prisma` state directly — no migration history exists in this repo (corrected 2026-08-02; the script name is legacy, the command underneath is what's actually real) |
| `db:generate` | `npx prisma generate` | Regenerate the Prisma client (also runs automatically on `npm install`) |
| `db:seed` | `ts-node src/test/seeds/seed.ts` | ⚠️ Still not built — see section 3 |
| `db:studio` | `npx prisma studio` | Visual database browser |
| `demo:pix-to-usdt` | `ts-node --transpile-only examples/demo/pix-to-usdt-flow.ts` | The full QVAC → Pears → Intent Engine → WDK settlement flow |
| `demo:qvac` | `ts-node --transpile-only examples/demo/demo-satsails-qvac.ts` | Full-ecosystem entrypoint for the same flow — see `docs/HANDOFF.md` |
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
`@qvac/sdk` — real local LLM inference. `@satsails/p2p-schemas` — the
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

- [ ] Reverse proxy/TLS — closed differently than originally planned:
      AWS App Runner terminates TLS itself (real HTTPS on its own
      `*.awsapprunner.com` domain, zero nginx/cert config needed) — see
      section 8. If a custom domain is later put in front via
      CloudFront/ALB instead, set Fastify's own `trustProxy` option
      (`app.ts`) so rate limiting's per-IP tracking sees the real client
      IP, not the proxy's.
- [x] **`MOCK_ESCROW=false`/`MOCK_SETTLEMENT=false` decision made,
      2026-08-02**: real custody goes live via **`MULTISIG`, not
      `WDK_USDT_EVM`** — deliberately. `MULTISIG` is a genuine 2-of-3
      (buyer/seller hold their own keys, only the arbiter is a server
      key); `WDK_USDT_EVM` is explicitly single-seed custody, and its own
      header comment says testnet-only for exactly that reason. See
      section 8 for the real `MULTISIG_NETWORK=bitcoin` production
      checklist.
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
- [x] **`MULTISIG`'s release/refund/split fee is a real rate lookup**
      (`mempool.space /v1/fees/recommended`, 2026-08-02) — the flat
      1000-sat placeholder this file previously left as future work is
      gone; a real Bitcoin spend now pays a real, current fee instead of
      risking an unconfirmed stuck transaction.
- [ ] **Not yet closed, stated plainly rather than glossed over now that
      real funds are actually in scope**: no external security audit of
      this codebase has happened. The plan (per the project owner,
      2026-08-02) is to have a real, working deployment first — small,
      self-funded, not opened to the public — specifically so an
      external reviewer (the intended next step, tied to a Tether grant
      conversation) has something real to evaluate rather than a
      hypothetical design. This is a deliberate, informed sequencing
      choice, not an oversight being carried forward silently.
- [ ] **`MULTISIG`'s single-arbiter limitation still applies** —
      exactly one `TRUSTED_ARBITRATORS` entry is baked into each escrow's
      script at creation time (`multisig.provider.ts`'s own comment). Not
      a blocker for a self-funded test with no disputes expected, but a
      real constraint before any third party's funds are involved.
- [x] **A real Postgres run against production infra is happening as
      part of this deployment** (section 8) — every schema change before
      this was only ever verified via `prisma generate` against no live
      Postgres. `npx prisma db push` (not `migrate dev`/`migrate deploy`
      — no migration history exists in this repo, see this file's own
      2026-08-02 header note) is the real, tested command, run once
      against the new RDS instance before the service's first real
      traffic.

## 8. AWS Production Deployment (2026-08-02)

**Scope, stated explicitly rather than assumed**: a real, live deployment
— real domain, real Postgres, real `MULTISIG` custody on Bitcoin mainnet
— funded by the project owner's own balance to validate the full flow in
practice, not opened to the public. The plan is to have this working
first, then bring in external security review with something real to
evaluate (tied to a Tether grant conversation) — a deliberate sequencing
choice, not a shortcut around review.

Architecture, chosen for this stage specifically (SLC: simple and
complete, not maximal):

- **Compute: AWS App Runner** — a container-based managed service with a
  real HTTPS endpoint out of the box (`*.awsapprunner.com`), no
  nginx/ALB/ACM certificate configuration needed to get real TLS. Builds
  from the repo's own `Dockerfile` (root, added 2026-08-02).
- **Database: Amazon RDS for PostgreSQL**, smallest real instance class
  (`db.t4g.micro`), single-AZ — a managed real Postgres, not the local
  Docker Compose one section 3 uses for development.
- **Secrets: AWS Secrets Manager** — `DATABASE_URL`, `MULTISIG_SEED`,
  and any other sensitive value are stored here and referenced by App
  Runner's own environment-variable-from-secret binding, never typed
  directly into the App Runner console's plain env var fields and never
  passed through a chat/AI session.

### 8.1 Dockerfile

Root `Dockerfile` (2026-08-02) — a two-stage build: `builder` installs
the full workspace (`npm ci`) and runs this repo's own `npm run build`
(the exact same command `section 4`'s table already documents, not a
Docker-specific build path), then `runtime` copies only the pruned
`node_modules`, `dist/`, `prisma/`, and the two workspace packages'
build output (`packages/sails-sdk`, `packages/sails-p2p-schemas` —
npm-workspaces symlinks, both sides need to exist). `node:20-bookworm-slim`
(glibc), not `alpine`: this project's native dependencies
(`sodium-native`, `tiny-secp256k1`) are markedly more reliable to build
against glibc than musl. **Not build-tested against a live Docker daemon
as of this writing** (this pass had no `docker` CLI available) — the
first real `docker build .` (locally, if Docker Desktop is available, or
via App Runner's own build service) is the actual first real test; if it
fails, the error will point at exactly which assumption above was wrong.

### 8.2 Setup order

1. **IAM** — a dedicated IAM user for deployment (not the AWS root
   account) with an access key, used only from your own machine/AWS
   CLI — never pasted into a chat session.
2. **RDS** — create the Postgres instance, keep it *not* publicly
   accessible (App Runner reaches it via a VPC connector, not the public
   internet).
3. **Secrets Manager** — store `DATABASE_URL` (built from the RDS
   endpoint + master password from step 2) and `MULTISIG_SEED` (a real,
   securely-generated seed — generate it locally, e.g. `openssl rand
   -hex 32`, and paste it directly into Secrets Manager, never into a
   chat session or a file that gets committed).
4. **App Runner** — create a service from the GitHub source, Dockerfile
   build mode, port 3000, environment variables per section 8.3 below
   (non-secret ones set directly, secret ones referenced from step 3).
5. **`npx prisma db push`** against the RDS instance — run once, from a
   machine that can reach the database (locally via an SSH
   tunnel/bastion, or as a one-off App Runner/ECS task), *before* the
   service serves its first real request. This is the "real Postgres
   migration run" section 7 flags as newly closed.

### 8.3 Production environment variables (real values, not the
    `.env.example` local-dev defaults)

```bash
NODE_ENV=production
DATABASE_URL=                      # from Secrets Manager — the real RDS endpoint
PORT=3000
HOST=0.0.0.0

MOCK_ESCROW=false
MOCK_SETTLEMENT=false

# MULTISIG — the real-custody path for this deployment (not WDK_USDT_EVM,
# see section 7's own reasoning). MULTISIG_SEED from Secrets Manager.
MULTISIG_SEED=                     # from Secrets Manager
MULTISIG_NETWORK=bitcoin
MULTISIG_EXPLORER_API_URL=https://mempool.space/api

# Exactly one arbiter identity — multisig.provider.ts's single-arbiter
# limitation (section 7) requires this to stay a single entry.
TRUSTED_ARBITRATORS=<one-participant-id>
ARBITRATION_MODE=trusted-list

# Everything else (RATE_LIMIT_*, AUTH_*, PROTOCOL_FEE_RATE, the sweeper
# flags) can stay at .env.example's own documented defaults unless this
# deployment specifically needs otherwise — see each variable's own
# comment there before changing it.
```

Deliberately **not** set for this deployment: `WDK_SEED_PHRASE`,
`AWS_KMS_KEY_ID` (`SAFE_GUARD_EVM`) — both stay empty, keeping those two
providers inert, consistent with the decision to bring exactly one real
custody path live at a time.

## 9. Multi-Instance Deployment (Missão 08B, 2026-08-17)

Section 8's deployment above runs a single App Runner instance. Running
**two or more instances behind a load balancer** (App Runner's own
auto-scaling, or any other setup) is safe for the primary HTTP + WebSocket
trading experience as of this mission, provided every instance shares the
same real Postgres and Redis — real, tested via genuinely separate Node
processes sharing one dockerized Postgres/Redis, not simulated in one
process. What makes this true, and what still doesn't:

- **Durable state (source of truth) — Postgres, always instance-independent.**
  Every Trade/Message/Escrow/Dispute write, and the full `durable_events`
  event log (`PostgresEventStore`, RFC-010), lands in Postgres regardless
  of which instance handled the request. Restarting or replacing any
  instance never loses data.
- **Real-time push across instances — Redis Pub/Sub, a signal only.**
  `PostgresEventStore.publish()` broadcasts every event on
  `sails:cross-instance-events` (see `docs/DATABASE.md`'s Redis key
  table) so an instance whose WS clients didn't originate an event still
  learns about it immediately and pushes it to its own connected
  sockets. If Redis is briefly unreachable, this fan-out fails silently
  and is logged — the durable write already succeeded either way; the
  only thing lost is *live* delivery to another instance's sockets for
  events published during the outage (not: the events themselves, which
  remain queryable via `getEvents()`/reconcile). The subscriber
  reconnects and resumes automatically once Redis recovers — no app
  restart needed.
- **Which sockets get a push — process-local, and correctly so.**
  `chat-room-registry.ts`'s room membership is a plain in-process `Map`,
  one instance's own view of who's currently connected to *it*. This is
  deliberately not shared — fixing the event fan-out above is sufficient,
  since each instance already only needs to know about its own sockets.
- **Auth-tier and critical-tier rate limits — shared via Redis.**
  `/v1/identity/challenge`+`authenticate` and the dispute/capability-revoke/
  agent-intent routes share one counter across every instance
  (`common/middleware/redis-rate-limit.ts`) instead of each instance
  getting its own full budget. Both fail closed (503) if Redis is
  unreachable — both tiers already hard-depend on Redis independent of
  rate limiting (session/challenge lookups), so this adds no new failure
  mode. The global and WS-message tiers stay local/per-instance,
  unchanged, by design (low-severity volume ceiling, not a security
  boundary in the same sense).
- **Escrow circuit breaker — process-local by design, not a gap.**
  `escrow-circuit-breaker.ts` is a secondary fast-reject optimization; the
  real correctness guarantee is `claimEscrowTransition()`'s atomic
  Postgres `updateMany`+count-check, which is already instance-independent.
  Not moved to Redis.
- **`pearNodeRegistry` / Pears-HyperDHT P2P transport — process-local,
  a real deployment constraint, not fixed by this mission.** A `PearNode`
  holds live DHT/socket state with no serializable resumable form — a
  participant's real-time P2P connection is pinned to whichever instance
  first accepted it. Postgres reconciliation (RFC-011,
  `reconcileTrade()`) is what a client should fall back to for anything
  missed, same as it already is for any transient drop.
- **WS-ticket single-use property (GET-then-DEL)** — a documentation-only
  note carried over from Missão 08A's audit, not escalated: a real
  window exists in principle between reading and deleting a ticket in
  Redis where two racing requests could theoretically both see it valid.
  No real replay was produced during this mission's multi-instance
  testing; left as a known, disclosed limitation rather than a fixed
  finding.

None of the above requires sticky sessions at the load balancer — any
instance can serve any HTTP request or accept any new WebSocket
connection; a client's own SDK-side reconnect-with-backoff handles
picking up wherever it lands next.
