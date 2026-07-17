/**
 * Sails Protocol — Server Entrypoint
 *
 * `package.json`'s `dev`/`start` scripts have referenced `src/main.ts`
 * since before this pass, but the file itself was never created — a real,
 * pre-existing gap (confirmed via `npm run dev` failing with
 * `Cannot find module 'src/main.ts'`), not something removed by this
 * change. `app.ts` already exports the real, complete `startServer()`
 * (builds the Fastify app, connects Postgres/Redis, registers graceful
 * shutdown, listens) — this file's only job is to be the thin entrypoint
 * that calls it.
 */
import { startServer } from './app'

startServer().catch((err) => {
  console.error('[main] Failed to start server:', err)
  process.exit(1)
})
