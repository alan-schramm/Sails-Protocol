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
  // Stays console.error on purpose: this is the outermost catch for a
  // server that failed to even finish booting (e.g. Postgres/Redis
  // unreachable before any logger transport is confirmed working) — the
  // simplest possible primitive is the right choice for the very last
  // line of defense before process.exit, not a dependency on more
  // machinery than the actual crash already proved is present.
  console.error('[main] Failed to start server:', err)
  process.exit(1)
})
