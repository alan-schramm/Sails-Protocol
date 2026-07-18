/**
 * Capability Registry — Sails Protocol Core Component
 * PROTOCOL_SPECIFICATION.md section 1.10, rfcs/RFC-005-capability-model.md
 * (the `Capability`/`CapabilityGrant` shapes), rfcs/RFC-013-capability-registry-and-wallet-adapter.md
 * (this file's first real implementation — stub since Architecture Freeze).
 *
 * Real, not a stub. Only `CapabilityGrant` (the permission side) is
 * persisted (`prisma.capabilityGrant`) — `Capability`/`CapabilityImplementation`
 * (the static moduleId <-> capabilityName mapping RFC-005's own table
 * lists as "illustrative... a Reference Implementation detail") stays an
 * in-code map below, since it has no real write path in this pass
 * (RFC-013's Alternatives Considered).
 *
 * Corrects a signature drift found while implementing: the pre-RFC-013
 * stub's `grant(capability: Capability): Promise<void>` predates RFC-005
 * disambiguating `Capability` from `CapabilityGrant` and was never
 * updated — it took the wrong shape (the abstract category, not the
 * permission grant) and returned nothing a caller could reference later.
 * Fixed here as part of making this real, not a silent behavior change
 * to code that never actually ran (the stub only ever threw).
 */
import { prisma } from '../common/database'
import { NotFoundError, ForbiddenError } from '../common/errors'
import type { CapabilityGrant } from '../common/types/capability'

// RFC-005's own module <-> Capability mapping table, illustrative but
// stable enough to encode directly — a genuinely new Capability (a new
// functional category, not a new feature within one of these) requires
// its own RFC per that document's "Stability Guidance."
export const CAPABILITY_IMPLEMENTATIONS: Record<string, string> = {
  openp2p: 'trade-coordination',
  opensettlement: 'settlement',
  openliquidity: 'liquidity-discovery',
  openidentity: 'identity-verification',
  openreputation: 'reputation-scoring',
  openagents: 'agent-delegation',
  openfinance: 'financial-instruments', // 📋 future — PROJECT_CONTEXT.md
  openproof: 'proof-verification', // RFC-006
}

export interface CapabilityRegistry {
  grant(input: Omit<CapabilityGrant, 'grantId'>): Promise<CapabilityGrant>
  check(grantedTo: string, capabilityName: string, requiredScope: string): Promise<boolean>
  // requestedBy added during a gap audit: this previously took only
  // grantId, with no check that the caller revoking a grant actually
  // owned it — any authenticated participant could revoke any other
  // participant's CapabilityGrant. Required, not optional.
  revoke(grantId: string, requestedBy: string): Promise<void>
  listGrants(grantedTo: string): Promise<CapabilityGrant[]>
}

function toCapabilityGrant(record: {
  id: string
  grantedTo: string
  capabilityName: string
  scope: string[]
  constraints: unknown
  issuedBy: string
}): CapabilityGrant {
  return {
    grantId: record.id,
    grantedTo: record.grantedTo,
    capabilityName: record.capabilityName,
    scope: record.scope,
    constraints: (record.constraints as Record<string, unknown> | null) ?? undefined,
    issuedBy: record.issuedBy,
  }
}

export const capabilityRegistry: CapabilityRegistry = {
  async grant(input) {
    const record = await prisma.capabilityGrant.create({
      data: {
        grantedTo: input.grantedTo,
        capabilityName: input.capabilityName,
        scope: input.scope,
        constraints: (input.constraints ?? undefined) as object | undefined,
        issuedBy: input.issuedBy,
      },
    })
    return toCapabilityGrant(record)
  },

  async check(grantedTo, capabilityName, requiredScope) {
    const grants = await prisma.capabilityGrant.findMany({
      where: { grantedTo, capabilityName, revokedAt: null },
    })

    const now = new Date()
    return grants.some((g) => {
      if (!g.scope.includes(requiredScope)) return false
      const expiresAt = (g.constraints as { expiresAt?: string } | null)?.expiresAt
      if (expiresAt && new Date(expiresAt) <= now) return false
      return true
    })
  },

  async revoke(grantId, requestedBy) {
    const existing = await prisma.capabilityGrant.findUnique({ where: { id: grantId } })
    if (!existing) throw new NotFoundError('CapabilityGrant', grantId)
    // Gap-audit fix: only the grant's own holder may revoke it — grants
    // are self-issued only in this pass (RFC-013's own scope cut,
    // grantedTo === issuedBy), so checking grantedTo covers both.
    if (existing.grantedTo !== requestedBy) {
      throw new ForbiddenError(`${requestedBy} does not own CapabilityGrant ${grantId}`)
    }
    await prisma.capabilityGrant.update({ where: { id: grantId }, data: { revokedAt: new Date() } })
  },

  async listGrants(grantedTo) {
    const grants = await prisma.capabilityGrant.findMany({
      where: { grantedTo, revokedAt: null },
      orderBy: { createdAt: 'desc' },
    })
    return grants.map(toCapabilityGrant)
  },
}
