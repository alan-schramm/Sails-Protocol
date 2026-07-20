/**
 * The single real @sails/sdk client this UI talks to — first real
 * backend wiring for this reference UI (previously 100% mock, see every
 * `TODO: replace with @sails/sdk` comment this file replaces the reason
 * for). Points at the real Fastify server (src/app.ts) running locally
 * against real Postgres + Redis (scripts/local-postgres.js,
 * scripts/local-redis.js — no Docker needed, see docs/TODO.md §18).
 *
 * baseUrl is a Vite env var so a deployed build can point elsewhere
 * without code changes — falls back to the dev server's own default
 * port (src/config/index.ts's PORT default, 3000).
 */
import { SailsClient } from '@sails/sdk'

export const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000'

export const sailsClient = new SailsClient({ baseUrl: BASE_URL })
