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

const counter = new FixedWindowCounter(5 * 60 * 1000)

/** Returns true if the message is allowed, false if the participant is over budget for the current window. */
export function checkWsMessageRateLimit(participantId: string): boolean {
  return counter.increment(participantId, config.rateLimit.wsMessageWindowMs) <= config.rateLimit.wsMessageMax
}

/** Test-only: clears all tracked windows so suites don't leak state across tests. */
export function resetWsMessageRateLimiter(): void {
  counter.reset()
}
