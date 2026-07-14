/**
 * Coordination Engine — Sails Protocol Core Component
 * ARCHITECTURE.md section 1B, MASTER_COORDINATION.md v7.1
 *
 * STUB — not yet implemented. This is the formalized "brain": today,
 * cross-module reactions live in common/events/handlers.ts as flat,
 * independent eventBus.on(...) listeners. This engine is the same idea
 * with real decision inputs (Policy + Capability, not just the event
 * payload) — see TODO.md for the migration plan.
 */
import { capabilityRegistry } from './capability-registry'
import { policyEngine } from './policy-engine'

export interface CoordinationDecision {
  action: string
  targetModule: string
  payload: unknown
}

export interface CoordinationEngine {
  decide(intentId: string): Promise<CoordinationDecision>
}

// TODO(Meses 1-3): implement — migrate logic from common/events/handlers.ts
export const coordinationEngine: CoordinationEngine = {
  async decide() { throw new Error('Not yet implemented — see TODO.md') },
}
