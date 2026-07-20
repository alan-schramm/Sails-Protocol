/**
 * Local Redis — real Redis-protocol server for local dev/testing, no
 * Docker required. Companion to scripts/local-postgres.js.
 *
 * IMPORTANT — this is NOT literally `redis-server`: real Redis dropped
 * official Windows support years ago. `redis-memory-server` resolves to
 * Memurai (memurai.exe) on Windows — a Redis-protocol-compatible server
 * distributed under Memurai's own EULA (free "Developer Edition" for
 * this exact use case: local development/testing, not a production
 * deployment story). `ioredis` (this app's real client) speaks the
 * standard Redis wire protocol, so it works against Memurai exactly like
 * it would against real Redis — but flagging the substitution explicitly
 * rather than calling it "Redis" without qualification.
 *
 * Same lesson learned as local-postgres.js: don't use the wrapper
 * library's own start/stop lifecycle here — this script spawns the real
 * binary directly, detached, so it survives after this script's own
 * process exits.
 *
 * Usage: `node scripts/local-redis.js start|stop`
 */
const fs = require('fs')
const path = require('path')
const { spawn, execSync } = require('child_process')

// Matches config/index.ts's own fallback default for REDIS_URL — zero
// .env changes needed to point the app at this instance.
const PORT = 6379
const PID_FILE = path.join(__dirname, '..', '.local-redis.pid')
const LOG_FILE = path.join(__dirname, '..', '.local-redis.log')

function binaryPath() {
  // redis-memory-server caches its downloaded binary here after first
  // use (already confirmed present — see this project's own smoke test).
  const cacheDir = path.join(__dirname, '..', 'node_modules', '.cache', 'redis-memory-server', 'redis-binaries', 'stable')
  const exe = path.join(cacheDir, 'memurai.exe')
  if (!fs.existsSync(exe)) {
    throw new Error(
      `Memurai binary not found at ${exe}. Run "npx redis-memory-server" once (or the project's own smoke test) first to trigger the download.`
    )
  }
  return exe
}

function start() {
  const exe = binaryPath()
  console.log('[local-redis] Starting (Memurai, detached)...')
  const logFd = fs.openSync(LOG_FILE, 'a')
  const child = spawn(exe, ['--port', String(PORT)], {
    detached: true,
    stdio: ['ignore', logFd, logFd],
  })
  fs.writeFileSync(PID_FILE, String(child.pid))
  child.unref()
  console.log(`[local-redis] Started, pid=${child.pid}. REDIS_URL=redis://127.0.0.1:${PORT}`)
}

function stop() {
  if (!fs.existsSync(PID_FILE)) {
    console.log('[local-redis] No pid file — nothing to stop.')
    return
  }
  const pid = fs.readFileSync(PID_FILE, 'utf-8').trim()
  try {
    execSync(`taskkill /PID ${pid} /F`, { encoding: 'utf-8' })
    console.log(`[local-redis] Stopped pid ${pid}.`)
  } catch (err) {
    console.log(`[local-redis] taskkill note: ${err.message.split('\n')[0]}`)
  }
  fs.rmSync(PID_FILE, { force: true })
}

const cmd = process.argv[2]
if (cmd === 'start') start()
else if (cmd === 'stop') stop()
else {
  console.log('Usage: node scripts/local-redis.js start|stop')
  process.exit(1)
}
