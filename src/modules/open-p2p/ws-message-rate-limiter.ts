/**
 * Per-participant WS message rate limiter — closes the gap
 * @fastify/rate-limit structurally can't cover (see config/index.ts's
 * `rateLimit.wsMessageMax` comment): a WebSocket upgrade is one HTTP
 * request, then every later `message` frame never touches Fastify's
 * request/response lifecycle again. Keyed by participantId, not socket
 * or tradeId — a participant opening multiple connections still shares
 * one budget.
 */
import { config } from '../../config'
import { FixedWindowCounter } from '../../common/fixed-window-counter'
import { redis } from '../../common/redis'

const counter = new FixedWindowCounter(5 * 60 * 1000)

/** Returns true if the message is allowed, false if the participant is over budget for the current window. */
export function checkWsMessageRateLimit(participantId: string): boolean {
  return counter.increment(participantId, config.rateLimit.wsMessageWindowMs) <= config.rateLimit.wsMessageMax
}

/**
 * #307 — shared post-upgrade budget for the public Blind Relay. Unlike
 * chat's historical local helper above, this boundary must not multiply
 * by the number of production instances. Redis INCR + first-hit PEXPIRE
 * mirrors common/middleware/redis-rate-limit.ts without needing an HTTP
 * FastifyRequest. Redis failure fails closed: an authenticated relay
 * channel is not authority to become unbounded when the shared budget
 * store is unavailable.
 */
export async function checkSharedWsMessageRateLimit(participantId: string): Promise<boolean> {
  const key = `ratelimit:ws-relay:${participantId}`
  try {
    const count = await redis.incr(key)
    if (count === 1) await redis.pexpire(key, config.rateLimit.wsMessageWindowMs)
    return count <= config.rateLimit.wsMessageMax
  } catch {
    return false
  }
}

/** Test-only: clears all tracked windows so suites don't leak state across tests. */
export function resetWsMessageRateLimiter(): void {
  counter.reset()
}
