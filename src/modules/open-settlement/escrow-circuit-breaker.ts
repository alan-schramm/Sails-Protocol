/**
 * Escrow circuit breaker — complements escrow-lifecycle.ts's atomic
 * claimEscrowTransition() (which already guarantees correctness under
 * concurrency, tests/escrowReleaseControls.test.ts) by noticing when one
 * escrow is being hammered with conflicting attempts, and rejecting
 * further ones cheaply instead of paying a full auth+DB round trip each
 * time.
 *
 * Scoped per-escrowId, never global — a global breaker would itself
 * become a denial-of-service lever. Auto-resets after
 * config.escrowCircuitBreaker.cooldownMs since this protocol has no
 * operator tier to clear it manually.
 *
 * Unlike suspicious-activity.ts (log/alert only), this one blocks: a
 * concurrency conflict on an escrow is an observed anomaly on real
 * money, not a heuristic guess.
 */
import { CircuitBreakerOpenError } from '../../common/errors'
import { config } from '../../config'
import { FixedWindowCounter } from '../../common/fixed-window-counter'

const failures = new FixedWindowCounter(10 * 60 * 1000)
const openCircuits = new FixedWindowCounter(10 * 60 * 1000)

/**
 * Throws CircuitBreakerOpenError if this escrow's circuit is currently
 * open. Call at the top of any escrow state-transition attempt, before
 * doing any real work — the whole point is to reject cheaply once
 * tripped, not to run the full authorization/DB path first.
 */
export function assertCircuitClosed(escrowId: string): void {
  if (openCircuits.peek(escrowId) === 0) return
  throw new CircuitBreakerOpenError(
    `Escrow ${escrowId} is temporarily paused after repeated conflicting requests — retry shortly`
  )
}

/**
 * Records one conflicting/failed transition attempt for `escrowId`. Once
 * config.escrowCircuitBreaker.failureThreshold is crossed within the
 * window, opens the circuit for cooldownMs.
 */
export function recordEscrowConflict(escrowId: string): void {
  const { failureThreshold, windowMs, cooldownMs } = config.escrowCircuitBreaker
  const count = failures.increment(escrowId, windowMs)
  if (count < failureThreshold) return
  openCircuits.increment(escrowId, cooldownMs)
}

/** Test-only: clears all tracked state so suites don't leak across tests. */
export function resetEscrowCircuitBreaker(): void {
  failures.reset()
  openCircuits.reset()
}
