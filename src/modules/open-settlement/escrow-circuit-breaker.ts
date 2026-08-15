/**
 * Escrow circuit breaker — complements escrow-lifecycle.ts's existing
 * concurrency defense (claimEscrowTransition()'s atomic conditional
 * updateMany, which already guarantees correctness — at most one of N
 * racing attempts on the same escrow can ever succeed, verified by
 * tests/escrowReleaseControls.test.ts). It doesn't notice when an escrow
 * is being hammered, though: a burst of conflicting attempts on one
 * escrowId in a short window is exactly the pattern an automated attack
 * (or a broken retry loop) produces, and every one of those attempts
 * still pays the cost of a full authorization check + DB round trip
 * before failing.
 *
 * Scoped per-escrowId, deliberately never global or per-participant —
 * pausing the whole exchange because of anomalous activity on ONE escrow
 * would turn the breaker itself into a denial-of-service lever. Auto-
 * resets after config.escrowCircuitBreaker.cooldownMs — this protocol
 * has no operator/admin tier (suspicious-activity.ts's own posture note
 * has the full reasoning), so a design requiring a human to manually
 * clear it would leave it stuck open with nobody able to.
 *
 * Detection-and-block, not detection-only — unlike suspicious-activity.ts
 * (which only ever logs/alerts), this one actually rejects further
 * attempts once open: a concurrency conflict on an escrow is already an
 * observed, concrete anomaly on a specific piece of money, not a
 * heuristic guess.
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
