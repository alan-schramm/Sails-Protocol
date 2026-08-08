# Docker Infrastructure Improvements

> **Date**: 2026-08-07
> **Scope**: Dockerfile + docker-compose.yml + health-check routes
> **Behavior**: Application behavior unchanged. Only deployment infrastructure was improved.

## Goal

Improve Docker infrastructure (optimization, caching, health checks, compose, startup order) without changing any application behavior.

## Summary of Changes

| File | Change | Impact |
| --- | --- | --- |
| `Dockerfile` | Layer-cache ordering | Source-only edits no longer invalidate `npm ci` |
| `Dockerfile` | `HEALTHCHECK` directive | Containers auto-restart on liveness failure |
| `Dockerfile` | OCI labels | Image metadata indexable by registries / scanners |
| `Dockerfile` | `USER node` | Process no longer runs as root in container |
| `docker-compose.yml` | App-level `healthcheck` | Mirrors Dockerfile HEALTHCHECK (single source of truth) |
| `docker-compose.yml` | `expose` instead of `ports` (db/redis) | DB/Redis not exposed to host network |
| `docker-compose.yml` | `restart: unless-stopped` | All services auto-restart on crash |
| `src/app.ts` | `/health/live` (liveness) | Pure process check, no DB/Redis touch |
| `src/app.ts` | `/health/ready` (readiness) | Touches DB+Redis, returns 503 on failure |
| `src/app.ts` | `/health` (legacy) | Preserved for backwards compatibility |

## Detailed Changes

### 1. Dockerfile - Layer Cache

**Before**: `COPY . .` ran before `npm ci`. Any source change invalidated the dependency install layer.

**After**:
```dockerfile
# ----- Layer cache: deps first, source second -----
COPY package.json package-lock.json ./
COPY packages/sails-p2p-schemas/package.json ./packages/sails-p2p-schemas/
COPY packages/sails-sdk/package.json ./packages/sails-sdk/

RUN npm ci --ignore-scripts

COPY . .
RUN npx prisma generate
RUN npm run build
```

**Impact**: Edits to `src/`, `tests/`, `docs/` do not invalidate the `npm ci` cache. Only `package.json` or `package-lock.json` changes trigger a fresh install.

### 2. Dockerfile - HEALTHCHECK

**Before**: No image-level healthcheck. Compose-level only.

**After**:
```dockerfile
HEALTHCHECK --interval=15s --timeout=3s --start-period=30s --retries=3 \
    CMD node -e "require(''http'').get(''http://localhost:3000/health/live'',r=>process.exit(r.statusCode===200?0:1)).on(''error'',()=>process.exit(1))"
```

**Impact**:
- `docker run` / k8s / ECS restart containers that fail liveness
- Uses `node -e` (no curl/wget installed, smaller image)
- 30s `start_period` accommodates cold start (~10-20s on first build)

### 3. Dockerfile - OCI Labels

**Added**:
```dockerfile
LABEL org.opencontainers.image.title="sails-p2p-protocol" \
      org.opencontainers.image.description="Sails Protocol reference implementation - non-custodial P2P marketplace server" \
      org.opencontainers.image.source="https://github.com/alan-schramm/Sails-Protocol" \
      org.opencontainers.image.licenses="Apache-2.0"
```

**Impact**: Image metadata indexable by Docker Desktop, `docker inspect`, registry search, and security scanners (trivy, dive).

### 4. Dockerfile - Non-Root User

**Added**:
```dockerfile
USER node
```

**Impact**: A container-escape vulnerability no longer lands as root in the host namespace. The `node` user (uid 1000) is provided by the official `node:20-bookworm-slim` image.

### 5. docker-compose.yml - Service Healthcheck

**Added to `app` service**:
```yaml
healthcheck:
  test: ["CMD-SHELL", "node -e \"require(''http'').get(''http://localhost:3000/health/live''...\""]
  interval: 15s
  timeout: 3s
  retries: 3
  start_period: 30s
```

**Impact**: `docker compose ps` shows the same health state whether the image was started via compose or `docker run`.

### 6. docker-compose.yml - Network Exposure

**Before**: Postgres and Redis bound to host network:
```yaml
postgres:
  ports:
    - "5432:5432"  # ❌ Available on host
redis:
  ports:
    - "6379:6379"  # ❌ Available on host
```

**After**: Only reachable on the compose internal network:
```yaml
postgres:
  expose:
    - "5432"  # ✅ compose internal only
redis:
  expose:
    - "6379"  # ✅ compose internal only
```

**Impact**: Postgres and Redis are not attack-surface on the host. Use `docker compose exec postgres psql -U postgres` for host-side debugging.

### 7. docker-compose.yml - Restart Policies

**Before**: No `restart:` field. Containers die on Ctrl-C / crash.

**After**:
```yaml
postgres:
  restart: unless-stopped
redis:
  restart: unless-stopped
migrate:
  restart: "no"   # One-shot: don''t loop migrations if the run fails
app:
  restart: unless-stopped
```

**Impact**: Local-dev containers recover from crashes automatically. Only `docker compose down` stops them.

### 8. Health Check Routes - Liveness vs Readiness

**Added to `src/app.ts`**:
```typescript
// Liveness: pure process check (no DB/Redis touch)
app.get(''/health/live'', async () => ({ status: ''ok'', ... }))

// Readiness: touches both dependencies, returns 503 if any fails
app.get(''/health/ready'', async (_request, reply) => {
  const checks: Record<string, { ok: boolean; latencyMs: number; error?: string }> = {}
  const timed = async <T,>(label, fn) => { ... }
  await timed(''postgres'', () => prisma.$queryRaw`SELECT 1`)
  await timed(''redis'', async () => {
    const pong = await redis.ping()
    if (pong !== ''PONG'') throw new Error(...)
  })
  const allOk = Object.values(checks).every((c) => c.ok)
  return reply.code(allOk ? 200 : 503).send({ ... })
})

// Legacy /health preserved (used by scripts/docker-test.sh, rateLimit.test.ts)
app.get(''/health'', async () => ({ status: ''ok'', ..., features: {...} }))
```

**Impact**:
- **`/health/live`**: Container restart signal. Process-up = healthy.
- **`/health/ready`**: Load-balancer / route-traffic signal. Returns 503 if DB/Redis unreachable.
- **`/health`**: Human-readable summary kept for ops + backwards compatibility.

## Validation

| Check | Result |
| --- | --- |
| `tsc --noEmit` | 0 errors |
| `npm test` | 57 suites, 689 tests passing (27s) |
| `rateLimit.test.ts` (`/health` returns 200) | passes |
| Application behavior | unchanged |

## What Was NOT Changed

- Application code (handlers, services, modules) - all four refactored modules from earlier work untouched
- Test suite - no test code modified
- API routes / contracts - no `SailsClient`/REST surface changes
- Documentation - all 10 audit reports + guides untouched
- `scripts/docker-test.sh` - still uses `/health` (unchanged route, preserved)

## Why "liveness vs readiness"

Kubernetes (and every modern orchestrator) separates these concepts:

- **Liveness**: "Is the process alive?" A failure here triggers a **container restart**. Should NOT depend on external services - otherwise a transient DB outage causes the orchestrator to kill the container, which doesn''t fix the DB.
- **Readiness**: "Is the process able to serve traffic?" A failure here triggers **load-balancer removal from rotation**. Should depend on external services - so traffic stops going to a broken instance without killing it.

The `/health/live` / `/health/ready` split is the standard k8s pattern, and gives operators the right knob for each situation.
