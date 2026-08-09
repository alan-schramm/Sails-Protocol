/**
 * Coordination Engine — Sails Protocol Core Component
 * ARCHITECTURE.md section 1B; first real implementation via RFC-012
 * (rfcs/RFC-012-intent-validation-and-coordination.md).
 *
 * Real, not a stub. Deliberately minimal: `decide()` resolves the target
 * module from the Intent's own `moduleId` (already set at creation time
 * by `core/intent-engine.ts`'s `create()`) and returns a
 * `CoordinationDecision` — formalizing that routing choice as an
 * explicit, auditable step instead of an implicit hardcoded value. Does
 * NOT yet consult the Policy Engine's governed-policy store
 * (`policy-engine.ts`'s `get`/`propose`/`activate`, still a stub) or the
 * Capability Registry (`capability-registry.ts`, still a stub) — RFC-012's
 * own Alternatives Considered explains why folding those in was out of
 * scope for that RFC. A governed, policy-gated routing decision is real
 * future work, tracked in `BACKLOG.md`, not silently implied as already
 * done by this file existing.
 *
 * ARCHITECTURE_AUDIT_REPORT.md recommendation #3, step 2, closed
 * 2026-08-08 — moved its one `prisma.intent.findUnique` call to
 * `intent-repository.ts`, same repository `intent-engine.ts` now uses.
 * `createCoordinationEngine()` is a factory (not a class) for the same
 * reason `createIntentEngine()`/`createCapabilityRegistry()` are —
 * `coordinationEngine` was always a plain object literal.
 */
import { NotFoundError } from '../common/errors'
import { intentRepository, type IntentRepository } from './intent-repository'

export interface CoordinationDecision {
  action: string
  targetModule: string
  payload: unknown
}

export interface CoordinationEngine {
  decide(intentId: string): Promise<CoordinationDecision>
}

export function createCoordinationEngine(repo: IntentRepository = intentRepository): CoordinationEngine {
  return {
    async decide(intentId: string): Promise<CoordinationDecision> {
      const record = await repo.findById(intentId)
      if (!record) throw new NotFoundError('Intent', intentId)
      return { action: 'route', targetModule: record.moduleId, payload: record.payload }
    },
  }
}

export const coordinationEngine: CoordinationEngine = createCoordinationEngine()
