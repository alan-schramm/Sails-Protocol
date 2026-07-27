import { Client } from 'pg'
import Redis from 'ioredis'

/**
 * Real, non-redundant checks — not a re-check of what playwright.config.ts's
 * `webServer` entries already guarantee (they wait for /health to
 * respond, which only proves the Node process started — src/app.ts's
 * `/health` route is a static liveness payload, it never actually pings
 * Postgres or Redis). Without this, a backend that started fine but
 * can't reach the database would pass every `webServer` health check
 * and then fail every single spec with a confusing mid-test connection
 * error. This fails once, up front, with a clear message instead —
 * matching HANDOFF.md's own documented prerequisites (`npm run
 * db:local:start && npm run redis:local:start`), not orchestrating them.
 *
 * No destructive reset here (no TRUNCATE, no DROP) — see this file's
 * header precedent in e2e/flows/p2p-trade-happy-path.spec.ts and
 * e2e/flows/concurrency.spec.ts, both written to be safe to run
 * repeatedly against a shared local database with leftover state.
 */
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://postgres:password@localhost:5432/sails_protocol'
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379'

async function checkPostgres(): Promise<void> {
  const client = new Client({ connectionString: DATABASE_URL })
  try {
    await client.connect()
    await client.query('SELECT 1')
  } catch (err) {
    throw new Error(
      `Postgres not reachable at ${DATABASE_URL} — run "npm run db:local:start" first. Original error: ${err instanceof Error ? err.message : String(err)}`
    )
  } finally {
    await client.end().catch(() => {})
  }
}

async function checkRedis(): Promise<void> {
  const redis = new Redis(REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 })
  try {
    await redis.connect()
    await redis.ping()
  } catch (err) {
    throw new Error(
      `Redis not reachable at ${REDIS_URL} — run "npm run redis:local:start" first. Original error: ${err instanceof Error ? err.message : String(err)}`
    )
  } finally {
    redis.disconnect()
  }
}

export default async function globalSetup(): Promise<void> {
  await checkPostgres()
  await checkRedis()
}
