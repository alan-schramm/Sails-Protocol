# DEPLOYMENT.md
### Sails Protocol — Engineering Handoff · Document 12 of 20

> Covers the Satsails reference implementation only. The protocol itself
> has no deployment requirements — see `PROTOCOL_SPECIFICATION.md` section 5.

---

## 1. Prerequisites

- Node.js 20+
- Docker + Docker Compose
- Git

## 2. Environment Variables (`.env`, copy from `.env.example`)

```bash
# Database
DATABASE_URL="postgresql://postgres:password@localhost:5432/satsails_p2p"

# Redis
REDIS_URL="redis://localhost:6379"

# App
PORT=3000
HOST=0.0.0.0
NODE_ENV=development
LOG_LEVEL=info

# Security
JWT_SECRET=change-me-in-production-use-long-random-string

# Pears / HyperDHT (optional for local dev — empty uses Holepunch's public
# default bootstrap nodes; set this in restrictive network environments,
# e.g. behind a corporate firewall that blocks the defaults)
HYPERDHT_BOOTSTRAP=
PEAR_PEER_ID=

# Feature flags
MOCK_ESCROW=true
MOCK_SETTLEMENT=true
```

**Important:** `MOCK_ESCROW=true` and `MOCK_SETTLEMENT=true` must be `false`
in any environment handling real value. The `MockSettlementProvider`
generates fake transaction IDs and does not move real funds — see
`escrow.service.ts` and `THREAT_MODEL.md`.

## 3. Setup

```bash
git clone <repo>
cd satsails-p2p
cp .env.example .env          # edit DATABASE_URL / REDIS_URL as needed
docker-compose up -d postgres redis
npm install
npm run db:migrate
npm run db:seed               # prints test user IDs to the terminal
npm run dev                   # http://localhost:3000
```

**Known blocker as of this handoff:** `npm run dev` will fail to start
until the missing files listed in `TODO.md` section 1-2 are restored —
`app.ts` imports `config`, `common/database`, `common/redis`, and
`common/errors`, none of which currently exist in this environment. Do not
assume the server currently boots; verify first.

## 4. package.json Scripts (as currently defined)

| Script | Command | Purpose |
|---|---|---|
| `dev` | `ts-node-dev --respawn --transpile-only src/main.ts` | Hot-reload dev server |
| `build` | `tsc` | Compile TypeScript → `dist/` |
| `start` | `node dist/main.js` | Run compiled build |
| `db:migrate` | `npx prisma migrate dev` | Apply schema migrations |
| `db:generate` | `npx prisma generate` | Regenerate Prisma client |
| `db:seed` | `ts-node src/test/seeds/seed.ts` | Populate test data (⚠️ seed file not found in this environment — see `TODO.md`) |
| `db:studio` | `npx prisma studio` | Visual database browser |
| `test` | `jest --runInBand` | Run tests (⚠️ zero test files exist currently) |

Note: `src/main.ts` is also referenced by the `dev`/`start` scripts but was
not found during the code audit — only `src/app.ts` (the `buildApp()` /
`startServer()` factory functions) exists. `main.ts` likely just imports and
calls `startServer()`; recreate it if missing, following the pattern
already visible in `app.ts`'s `startServer()` function.

## 5. Dependencies (from `package.json`, current versions)

**Runtime:** `@fastify/cors`, `@fastify/swagger`, `@fastify/swagger-ui`,
`@fastify/websocket`, `@prisma/client`, `b4a`, `dotenv`, `fastify`,
`fastify-plugin`, `hyperdht`, `hyperswarm`, `ioredis`, `pino`, `tweetnacl`,
`tweetnacl-util`, `uuid`, `zod`

**Dev:** `@types/node`, `@types/uuid`, `@types/ws`, `prisma`, `ts-node`,
`ts-node-dev`, `typescript`

No `node_modules` currently exists in this environment — run `npm install`
before attempting to run or build anything.

## 6. Docker Compose (referenced, needs to be (re)created)

No `docker-compose.yml` file exists in this environment. It needs to define
at minimum:

```yaml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_PASSWORD: password
      POSTGRES_DB: satsails_p2p
    ports: ["5432:5432"]
  redis:
    image: redis:7
    ports: ["6379:6379"]
```

Add an `app` service once the missing source files are restored and the
project builds successfully.

## 7. Production Considerations (not yet actioned — see `ROADMAP.md` Months 1-3)

- Reverse proxy (nginx) + TLS termination
- `MOCK_ESCROW=false`, `MOCK_SETTLEMENT=false`, real `SettlementProvider`
  implementations wired in (see `TODO.md` section 4)
- Rate limiting in place (`TODO.md` section 6) before any public exposure
- `JWT_SECRET` replaced with a properly generated, long random value —
  never the placeholder from `.env.example`
- Ed25519 auth middleware in place (`TODO.md` section 3) — this is the
  single most important gate before any public deployment
