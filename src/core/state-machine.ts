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
