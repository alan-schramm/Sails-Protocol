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
 */
import { prisma } from '../common/database'
import { NotFoundError } from '../common/errors'

export interface CoordinationDecision {
  action: string
  targetModule: string
  payload: unknown
}

export interface CoordinationEngine {
  decide(intentId: string): Promise<CoordinationDecision>
}

export const coordinationEngine: CoordinationEngine = {
  async decide(intentId: string): Promise<CoordinationDecision> {
    const record = await prisma.intent.findUnique({ where: { id: intentId } })
    if (!record) throw new NotFoundError('Intent', intentId)
    return { action: 'route', targetModule: record.moduleId, payload: record.payload }
  },
}
