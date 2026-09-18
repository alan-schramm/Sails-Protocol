/**
 * ADR-004 / #211 — Execution Commit Gate for asynchronous settlement.
 *
 * This is Policy/Eligibility Authority only. It does not replace signer
 * verification, Execution Authority, Destination Authority, or current
 * Economic Disposition Authority.
 *
 * The first successful call for a pending operation:
 *   1) serializes with revoke() in Postgres;
 *   2) re-evaluates the ORIGINAL pending.triggeredBy;
 *   3) resolves one exact live CapabilityGrant;
 *   4) durably commits operation-bound authorization evidence.
 *
 * A retry for the exact same immutable pending operation reuses that durable
 * authorization and does NOT require the grant to still be live. That is the
 * frozen ADR-004 distinction between "not yet execution-committed" and an
 * already-authorized attempt being recovered/reconciled.
 */
import { createHash } from 'crypto'
import type { Prisma } from '@prisma/client'
import { prisma } from '../../common/database'
import { ForbiddenError, EscrowError } from '../../common/errors'
import { config } from '../../config'
import { CAPABILITY_IMPLEMENTATIONS } from '../../core/capability-registry'

type PendingExecutionFacts = {
  id: string
  escrowId: string
  kind: string
  toAddress: string
  toAddressSecondary: string | null
  buyerBps: number | null
  feeCollectionSats: number | null
  feeCollectionWaived: boolean | null
  minerFeeSats: number | null
  unsignedPsbtBase64: string
  requiredSigners: string[]
  triggeredBy: string
}

function requiredScope(kind: string): string {
  if (kind === 'release') return 'settlement.escrow.released'
  if (kind === 'refund') return 'settlement.escrow.refunded'
  if (kind === 'split') return 'settlement.escrow.split'
  throw new EscrowError(`Unknown pending settlement kind '${kind}'`)
}

export function capabilityOperationDigest(pending: PendingExecutionFacts): string {
  // Explicit ordered object: every field below is an immutable economic or
  // execution fact captured by EscrowPendingTransaction at admission time.
  const canonical = JSON.stringify({
    pendingOperationId: pending.id,
    escrowId: pending.escrowId,
    kind: pending.kind,
    toAddress: pending.toAddress,
    toAddressSecondary: pending.toAddressSecondary,
    buyerBps: pending.buyerBps,
    feeCollectionSats: pending.feeCollectionSats,
    feeCollectionWaived: pending.feeCollectionWaived,
    minerFeeSats: pending.minerFeeSats,
    unsignedPsbtBase64: pending.unsignedPsbtBase64,
    requiredSigners: pending.requiredSigners,
    triggeredBy: pending.triggeredBy,
  })
  return createHash('sha256').update(canonical).digest('hex')
}

export async function authorizePendingExecution(pending: PendingExecutionFacts) {
  if (!config.features.enforceCapabilities) return null

  const capabilityName = CAPABILITY_IMPLEMENTATIONS.opensettlement
  const scope = requiredScope(pending.kind)
  const operationDigest = capabilityOperationDigest(pending)

  return prisma.$transaction(async (tx) => {
    // Same namespace used by CapabilityGrantRepository.markRevoked().
    // This serializes "is a grant live?" + durable authorization commit
    // against revocation across every process/node sharing Postgres.
    const lockKey = `capability:${pending.triggeredBy}:${capabilityName}`
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey})::bigint)`

    const existing = await tx.capabilityExecutionAuthorization.findUnique({
      where: { pendingOperationId: pending.id },
    })

    if (existing) {
      // Reuse is legal only for the exact immutable operation previously
      // authorized. Any mutation means this is not the same committed attempt.
      if (
        existing.escrowId !== pending.escrowId ||
        existing.grantedTo !== pending.triggeredBy ||
        existing.capabilityName !== capabilityName ||
        existing.requiredScope !== scope ||
        existing.operationDigest !== operationDigest
      ) {
        throw new EscrowError(
          `Pending operation ${pending.id} no longer matches its committed capability authorization`
        )
      }
      return existing
    }

    const grants = await tx.capabilityGrant.findMany({
      where: {
        grantedTo: pending.triggeredBy,
        capabilityName,
        revokedAt: null,
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    })

    const now = new Date()
    const grant = grants.find((candidate) => {
      if (!candidate.scope.includes(scope)) return false
      const expiresAt =
        candidate.constraints &&
        typeof candidate.constraints === 'object' &&
        !Array.isArray(candidate.constraints)
          ? (candidate.constraints as Record<string, unknown>).expiresAt
          : undefined
      if (typeof expiresAt === 'string' && new Date(expiresAt) <= now) return false
      return true
    })

    if (!grant) {
      throw new ForbiddenError(
        `${pending.triggeredBy} has no active '${capabilityName}' capability grant covering '${scope}' at execution commit`,
        'FORBIDDEN'
      )
    }

    return tx.capabilityExecutionAuthorization.create({
      data: {
        pendingOperationId: pending.id,
        escrowId: pending.escrowId,
        grantId: grant.id,
        grantedTo: grant.grantedTo,
        capabilityName: grant.capabilityName,
        requiredScope: scope,
        constraints:
          grant.constraints === null
            ? undefined
            : (grant.constraints as Prisma.InputJsonValue),
        operationDigest,
      },
    })
  })
}
