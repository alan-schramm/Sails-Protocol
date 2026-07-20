/**
 * Local Postgres — real database for local dev/testing, no Docker required.
 *
 * A standing limitation had shadowed this whole project until 2026-07-20:
 * "no live Postgres reachable in this environment" appears dozens of
 * times across TODO.md/BACKLOG.md/RFC-018/RFC-019, forcing every prior
 * migration/persistence claim to stop at "schema edited, npx prisma
 * generate run, never applied to a real database." `embedded-postgres`
 * (real npm package, downloads a native Postgres binary per platform via
 * optionalDependencies) closes that gap for local development.
 *
 * NOT using embedded-postgres's own start()/stop() API here — found the
 * hard way that its module-level `AsyncExitHook(gracefulShutdown)`
 * (registered as soon as the package is required) stops every tracked
 * instance whenever the CALLING Node process exits, including a clean
 * `process.exit(0)` — so a short-lived "start" script kills the server
 * the moment it returns. This script instead shells out to the platform
 * package's real `pg_ctl`/`initdb` binaries directly (still resolved via
 * embedded-postgres's own bundled platform package, so binary
 * download/selection stays automatic) — `pg_ctl start` is a genuine OS
 * daemon start, independent of this script's own process lifetime.
 *
 * This is NOT a production deployment story — it's what unblocks running
 * real migrations and a real persisted backend locally.
 *
 * Usage: `node scripts/local-postgres.js start|stop|status`
 */
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const DATA_DIR = path.join(__dirname, '..', '.local-pgdata')
const LOG_FILE = path.join(__dirname, '..', '.local-pgdata.log')
// 5432 — matches config/index.ts's own fallback default for DATABASE_URL
// (and prisma.config.ts's identical fallback), so this instance works
// with zero .env changes.
const PORT = 5432
const USER = 'postgres'
const PASSWORD = 'password'
const DB_NAME = 'sails_protocol'
const DATABASE_URL = `postgresql://${USER}:${PASSWORD}@127.0.0.1:${PORT}/${DB_NAME}`

function binDir() {
  // embedded-postgres's own platform-package layout — same path this
  // project already confirmed working (windows-x64 today; another
  // platform's package name differs but this repo only runs on Windows).
  // embedded-postgres's package.json uses exports: "./dist/index.js"
  // (no subpath access, not even ./package.json) — walking from
  // scripts/ to node_modules/ directly instead of via require.resolve.
  const nodeModules = path.join(__dirname, '..', 'node_modules')
  const scopeDir = path.join(nodeModules, '@embedded-postgres')
  const candidates = fs.readdirSync(scopeDir)
  const platformDir = candidates.find((d) => fs.existsSync(path.join(scopeDir, d, 'native', 'bin', 'pg_ctl.exe')))
  if (!platformDir) throw new Error('Could not find an @embedded-postgres/<platform> package with native binaries')
  return path.join(scopeDir, platformDir, 'native', 'bin')
}

function pgCtl(args) {
  const bin = path.join(binDir(), 'pg_ctl.exe')
  return execFileSync(bin, args, { encoding: 'utf-8' })
}

function initdb() {
  const bin = path.join(binDir(), 'initdb.exe')
  const pwFile = path.join(__dirname, '..', '.local-pgdata.pwfile')
  fs.writeFileSync(pwFile, PASSWORD)
  try {
    execFileSync(bin, ['-D', DATA_DIR, '-U', USER, '--pwfile', pwFile, '--auth=trust'], { encoding: 'utf-8' })
  } finally {
    fs.rmSync(pwFile, { force: true })
  }
}

function isInitialised() {
  return fs.existsSync(path.join(DATA_DIR, 'PG_VERSION'))
}

async function ensureDatabase() {
  // createdb.exe isn't bundled in this platform package's bin dir (only
  // initdb/pg_ctl/postgres are) — using the already-installed `pg`
  // client to issue CREATE DATABASE directly against the "postgres"
  // superuser database instead, same effect.
  const { Client } = require('pg')
  const client = new Client({ host: '127.0.0.1', port: PORT, user: USER, password: PASSWORD, database: 'postgres' })
  await client.connect()
  try {
    await client.query(`CREATE DATABASE ${DB_NAME}`)
    console.log(`[local-postgres] Database "${DB_NAME}" created.`)
  } catch (err) {
    if (!/already exists/i.test(String(err.message))) throw err
  } finally {
    await client.end()
  }
}

async function waitForReady(retries = 20) {
  const { Client } = require('pg')
  for (let i = 0; i < retries; i++) {
    try {
      const client = new Client({ host: '127.0.0.1', port: PORT, user: USER, password: PASSWORD, database: 'postgres', connectionTimeoutMillis: 1000 })
      await client.connect()
      await client.end()
      return
    } catch {
      await new Promise((r) => setTimeout(r, 300))
    }
  }
  throw new Error(`Postgres did not become reachable on port ${PORT} after starting`)
}

async function start() {
  if (!isInitialised()) {
    console.log('[local-postgres] Initialising data directory...')
    initdb()
  }
  console.log('[local-postgres] Starting (pg_ctl, detached)...')
  // No -w (wait-for-ready): observed hanging indefinitely on Windows via
  // execFileSync even after the server was confirmed ready in its own
  // log/port — polling waitForReady() ourselves instead of trusting
  // pg_ctl's own wait mechanism through this stdio-capturing call.
  const out = pgCtl(['-D', DATA_DIR, '-l', LOG_FILE, '-o', `-p ${PORT}`, 'start'])
  console.log(out)
  await waitForReady()
  await ensureDatabase()
  console.log(`[local-postgres] Ready. DATABASE_URL=${DATABASE_URL}`)
}

function stop() {
  console.log('[local-postgres] Stopping...')
  const out = pgCtl(['-D', DATA_DIR, 'stop', '-m', 'fast'])
  console.log(out)
}

function status() {
  try {
    const out = pgCtl(['-D', DATA_DIR, 'status'])
    console.log(out)
  } catch (err) {
    console.log(err.stdout || err.message)
  }
}

async function main() {
  const cmd = process.argv[2]
  if (cmd === 'start') await start()
  else if (cmd === 'stop') stop()
  else if (cmd === 'status') status()
  else {
    console.log('Usage: node scripts/local-postgres.js start|stop|status')
    console.log(`DATABASE_URL when running: ${DATABASE_URL}`)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('[local-postgres] failed:', err.stdout || err.stderr || err.message)
  process.exit(1)
})
