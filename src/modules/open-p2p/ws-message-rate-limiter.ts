/**
 * Per-participant WS message rate limiter — closes the gap
 * @fastify/rate-limit structurally can't cover (see config/index.ts's
 * `rateLimit.wsMessageMax` comment): a WebSocket upgrade is one HTTP
 * request, then every later `message` frame never touches Fastify's
 * request/response lifecycle again.
 *
 * Fixed-window counter, keyed by participantId (not by socket or
 * tradeId) — a participant opening multiple connections, or targeting
 * multiple trades, still shares one budget. Same in-memory,
 * single-instance, deliberate-simplification precedent app.ts's own
 * rate-limit comment already established for the HTTP tiers: a real
 * improvement over no ceiling at all, not a distributed solution.
 */
import { config } from '../../config'

interface Window {
  count: number
  resetAt: number
}

const windows = new Map<string, Window>()

// Bounds the map's size for long-running processes: a participant who
// sent messages once and never reconnects would otherwise sit in
// memory forever. Runs far less often than the window itself so it
// never interferes with the actual limiting logic below.
const SWEEP_INTERVAL_MS = 5 * 60 * 1000
setInterval(() => {
  const now = Date.now()
  for (const [participantId, window] of windows) {
    if (window.resetAt <= now) windows.delete(participantId)
  }
}, SWEEP_INTERVAL_MS).unref()

/** Returns true if the message is allowed, false if the participant is over budget for the current window. */
export function checkWsMessageRateLimit(participantId: string): boolean {
  const now = Date.now()
  const existing = windows.get(participantId)

  if (!existing || existing.resetAt <= now) {
    windows.set(participantId, { count: 1, resetAt: now + config.rateLimit.wsMessageWindowMs })
    return true
  }

  if (existing.count >= config.rateLimit.wsMessageMax) return false

  existing.count += 1
  return true
}

/** Test-only: clears all tracked windows so suites don't leak state across tests. */
export function resetWsMessageRateLimiter(): void {
  windows.clear()
}
