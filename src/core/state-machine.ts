/**
 * State Machine — Sails Protocol Core Component
 * PROTOCOL_SPECIFICATION.md section 2.4 (generic) + section 3.1 (reconciliation
 * with module-specific refinements like OpenP2P's Trade Lifecycle)
 *
 * STUB — not yet implemented. This is the single source of truth for valid
 * Intent-state transitions. Module-specific lifecycles (e.g. OpenP2P's 9
 * Trade states) must be expressed as a refinement of this generic machine,
 * never as a parallel, independent state machine — see the reconciliation
 * table in PROTOCOL_SPECIFICATION.md section 3.1.
 */
export type IntentStatus =
  | 'CREATED' | 'DISCOVERING' | 'MATCHED' | 'NEGOTIATING'
  | 'COMMITTED' | 'SETTLING' | 'FULFILLED' | 'EXPIRED' | 'CANCELLED' | 'FAILED'

const VALID_TRANSITIONS: Record<IntentStatus, IntentStatus[]> = {
  CREATED: ['DISCOVERING', 'CANCELLED', 'EXPIRED'],
  DISCOVERING: ['MATCHED', 'EXPIRED', 'CANCELLED'],
  MATCHED: ['NEGOTIATING', 'CANCELLED'],
  NEGOTIATING: ['COMMITTED', 'CANCELLED'],
  COMMITTED: ['SETTLING', 'FAILED'],
  SETTLING: ['FULFILLED', 'FAILED'],
  FULFILLED: [],
  EXPIRED: [],
  CANCELLED: [],
  FAILED: [],
}

export function assertValidTransition(from: IntentStatus, to: IntentStatus): void {
  if (!VALID_TRANSITIONS[from]?.includes(to)) {
    throw new Error(`Invalid Intent transition: ${from} → ${to}`)
  }
}

// Terminal states an expired Intent could still be in — expiry only applies
// to an Intent still mid-flight.
const EXPIRABLE_STATES: readonly IntentStatus[] = [
  'CREATED', 'DISCOVERING', 'MATCHED', 'NEGOTIATING', 'COMMITTED', 'SETTLING',
]

// Hard timeout enforcement — CISO Byzantine Rule (03-implementation_plan.md):
// "Se a contraparte não liquidar dentro da janela estipulada, forçar
// expiração (EXPIRED) para neutralizar ataques de Free Option" — a
// counterparty who commits to a trade and then simply never settles,
// holding the other side's terms open indefinitely for free while markets
// move, must not be able to do that past `expiresAt`.
//
// This is a pure, lazily-evaluated check — called wherever an Intent's
// status is read or acted on (core/intent-engine.ts), not a background
// sweeper. A proactive sweeper (setInterval/cron forcing expiry on Intents
// nobody is actively querying) is real future work, not built here — see
// BACKLOG.md. Lazy evaluation is correct for every path that matters today
// (no route/handler acts on an Intent without reading it first) but does
// not, by itself, guarantee an abandoned Intent flips to EXPIRED the
// instant its window closes if nothing ever reads it again.
export function isExpired(intent: { status: IntentStatus; expiresAt?: Date | null }): boolean {
  if (!EXPIRABLE_STATES.includes(intent.status)) return false
  if (!intent.expiresAt) return false
  return intent.expiresAt.getTime() <= Date.now()
}
