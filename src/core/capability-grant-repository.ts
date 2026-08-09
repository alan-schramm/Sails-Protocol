/**
 * CapabilityGrantRepository — Sails Protocol Core Component
 *
 * ARCHITECTURE_AUDIT_REPORT.md recommendation #3 ("Introduzir
 * repositórios: IntentRepository, CapabilityGrantRepository,
 * TradeRepository, EscrowRepository — dependência via injeção no
 * construtor"), step 1 of an incremental rollout, closed 2026-08-08.
 * Smallest, lowest-risk entity to start with — 5 pre-existing
 * `prisma.capabilityGrant.*` call sites, all inside
 * `capability-registry.ts`, zero fund-movement involved.
 *
 * Every method here is a verbatim move of an existing query from
 * `capability-registry.ts` — no behavior change, same discipline used
 * for the escrow.service.ts decomposition. The Prisma-record-to-domain
 * mapping (`toCapabilityGrant`, formerly a private helper in
 * `capability-registry.ts`) now lives here too — the repository's job
 * is exactly "translate the persistence shape to the domain shape,"
 * `capability-registry.ts` should never need to know `CapabilityGrant`'s
 * raw Prisma row shape at all.
 *
 * Interface-first, following this codebase's existing Provider
 * convention (`SettlementProvider`, `TransportProvider`) — a concrete
 * class implementation exported as an eagerly-built singleton, and
 * `CapabilityRegistry` (a factory function, not a class — see that
 * file) takes this interface as an optional constructor-style argument
 * defaulting to the real singleton, so a test can pass a plain fake
 * object instead of `jest.mock('../common/database', ...)`.
 */
import { prisma } from '../common/database'
import type { CapabilityGrant } from '../common/types/capability'

export interface CapabilityGrantRepository {
  create(input: Omit<CapabilityGrant, 'grantId'>): Promise<CapabilityGrant>
  /** Non-revoked grants matching (grantedTo, capabilityName) — check()'s own scope/expiry filtering happens on the result, not here. */
  findActiveGrants(grantedTo: string, capabilityName: string): Promise<CapabilityGrant[]>
  /** Null if no grant exists with this id — revoke()'s own ownership check happens on the result. */
  findById(grantId: string): Promise<CapabilityGrant | null>
  markRevoked(grantId: string): Promise<void>
  /** Every non-revoked grant for a participant, newest first. */
  listActiveGrants(grantedTo: string): Promise<CapabilityGrant[]>
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

class PrismaCapabilityGrantRepository implements CapabilityGrantRepository {
  async create(input: Omit<CapabilityGrant, 'grantId'>): Promise<CapabilityGrant> {
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
  }

  async findActiveGrants(grantedTo: string, capabilityName: string): Promise<CapabilityGrant[]> {
    const grants = await prisma.capabilityGrant.findMany({
      where: { grantedTo, capabilityName, revokedAt: null },
    })
    return grants.map(toCapabilityGrant)
  }

  async findById(grantId: string): Promise<CapabilityGrant | null> {
    const record = await prisma.capabilityGrant.findUnique({ where: { id: grantId } })
    return record ? toCapabilityGrant(record) : null
  }

  async markRevoked(grantId: string): Promise<void> {
    await prisma.capabilityGrant.update({ where: { id: grantId }, data: { revokedAt: new Date() } })
  }

  async listActiveGrants(grantedTo: string): Promise<CapabilityGrant[]> {
    const grants = await prisma.capabilityGrant.findMany({
      where: { grantedTo, revokedAt: null },
      orderBy: { createdAt: 'desc' },
    })
    return grants.map(toCapabilityGrant)
  }
}

export const capabilityGrantRepository: CapabilityGrantRepository = new PrismaCapabilityGrantRepository()
