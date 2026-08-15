/**
 * Escrow circuit breaker — complements escrow-lifecycle.ts's existing
 * concurrency defense (claimEscrowTransition()'s atomic conditional
 * updateMany), it doesn't replace it. That mechanism already guarantees
 * *correctness* under concurrent requests — at most one of N racing
 * transition attempts on the same escrow can ever succeed, verified by
 * tests/escrowReleaseControls.test.ts. What it doesn't do is notice when
 * an escrow is being hammered: a burst of conflicting attempts on one
 * specific escrowId in a short window is exactly the pattern an
 * automated attack (or a broken retry loop) produces, and today every
 * one of those attempts still pays the cost of a full authorization
 * check + DB round trip before failing.
 *
 * Scoped per-escrowId, deliberately never global or per-participant —
 * pausing the whole exchange (or one participant's every trade) because
 * of anomalous activity on ONE escrow would turn the breaker itself into
 * a denial-of-service lever: trip it on your own trade, everyone else's
 * trading keeps working, but a global breaker would let one attacker
 * freeze the whole platform for free. Auto-resets after
 * config.escrowCircuitBreaker.cooldownMs — this protocol has no
 * operator/admin tier (a deliberate choice, see
 * common/security/suspicious-activity.ts's own posture note), so a
 * design requiring a human to manually clear a tripped breaker would
 * leave it stuck open with nobody able to reset it.
 *
 * Detection-and-block, not detection-only — unlike
 * suspicious-activity.ts (which only ever logs/alerts), this one
 * actually rejects further attempts once open. That's the point: a
 * concurrency conflict on an escrow is already an observed, concrete
 * anomaly on a specific piece of money, not a heuristic guess.
 */
import { CircuitBreakerOpenError } from '../../common/errors'
import { config } from '../../config'

interface FailureWindow {
  count: number
  resetAt: number
}

interface OpenCircuit {
  openUntil: number
}

const failures = new Map<string, FailureWindow>()
const openCircuits = new Map<string, OpenCircuit>()

// Bounds map growth for a long-running process — same rationale as every
// other in-memory window tracker in this codebase (ws-message-rate-limiter.ts,
// suspicious-activity.ts). An escrow that never conflicts again shouldn't
// sit in memory forever.
const SWEEP_INTERVAL_MS = 10 * 60 * 1000
setInterval(() => {
  const now = Date.now()
  for (const [escrowId, window] of failures) {
    if (window.resetAt <= now) failures.delete(escrowId)
  }
  for (const [escrowId, circuit] of openCircuits) {
    if (circuit.openUntil <= now) openCircuits.delete(escrowId)
  }
}, SWEEP_INTERVAL_MS).unref()

/**
 * Throws CircuitBreakerOpenError if this escrow's circuit is currently
 * open. Call at the top of any escrow state-transition attempt, before
 * doing any real work — the whole point is to reject cheaply once
 * tripped, not to run the full authorization/DB path first.
 */
export function assertCircuitClosed(escrowId: string): void {
  const circuit = openCircuits.get(escrowId)
  if (!circuit) return
  const now = Date.now()
  if (circuit.openUntil > now) {
    const retryInSeconds = Math.ceil((circuit.openUntil - now) / 1000)
    throw new CircuitBreakerOpenError(
      `Escrow ${escrowId} is temporarily paused after repeated conflicting requests — retry in ~${retryInSeconds}s`
    )
  }
  openCircuits.delete(escrowId)
}

/**
 * Records one conflicting/failed transition attempt for `escrowId`. Once
 * config.escrowCircuitBreaker.failureThreshold is crossed within the
 * window, opens the circuit for cooldownMs.
 */
export function recordEscrowConflict(escrowId: string): void {
  const { failureThreshold, windowMs, cooldownMs } = config.escrowCircuitBreaker
  const now = Date.now()
  const existing = failures.get(escrowId)

  if (!existing || existing.resetAt <= now) {
    failures.set(escrowId, { count: 1, resetAt: now + windowMs })
    return
  }

  existing.count += 1
  if (existing.count < failureThreshold) return

  failures.delete(escrowId)
  openCircuits.set(escrowId, { openUntil: now + cooldownMs })
}

/** Test-only: clears all tracked state so suites don't leak across tests. */
export function resetEscrowCircuitBreaker(): void {
  failures.clear()
  openCircuits.clear()
}
