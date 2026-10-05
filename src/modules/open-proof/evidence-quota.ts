/**
 * Issue #267 — durable OpenProof evidence quota admission.
 *
 * PostgreSQL is the authoritative cumulative quota ledger. Admission is
 * serialized on two deterministic advisory-lock domains: the Proof budget
 * and the uploader+Proof budget. The transaction counts committed
 * EvidenceReference rows plus still-active pre-storage reservations, checks
 * all four CTO-frozen lifecycle budgets, and creates the reservation in the
 * SAME transaction. There is no read/check/unlocked-insert race.
 *
 * The reservation intentionally survives the transaction. Object storage
 * happens afterwards, with no database lock held across network/filesystem
 * I/O. RESERVED and UNKNOWN reservations consume quota until committed or
 * explicitly reconciled/released; UNKNOWN is never treated as FAILED.
 */
import { createHash } from 'crypto'
import { prisma } from '../../common/database'
import { config } from '../../config'
import { ValidationError } from '../../common/errors'

export interface EvidenceQuotaReservationInput {
  proofId: string
  submittedBy: string
  sizeBytes: number
  operationKey: string
  mediaSha256: string
  mimeType: string
}

const activeReservationStatuses = ['RESERVED', 'UNKNOWN'] as const

function lockKey(value: string): string {
  return `openproof:evidence-quota:${createHash('sha256').update(value).digest('hex')}`
}

export async function reserveEvidenceQuota(input: EvidenceQuotaReservationInput) {
  if (!Number.isSafeInteger(input.sizeBytes) || input.sizeBytes < 1) {
    throw new ValidationError('Evidence decoded size must be a positive safe integer')
  }

  return prisma.$transaction(async (tx) => {
    // Fixed acquisition order prevents proof/uploader lock-order inversion.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey(`proof:${input.proofId}`)})::bigint)`
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey(`proof:${input.proofId}:uploader:${input.submittedBy}`)})::bigint)`

    // Same logical operation: return the durable reservation rather than
    // consuming quota a second time. A different payload under the same
    // operation key is forbidden.
    const existing = await tx.evidenceUploadReservation.findUnique({
      where: {
        submittedBy_operationKey: {
          submittedBy: input.submittedBy,
          operationKey: input.operationKey,
        },
      },
    })
    if (existing) {
      if (
        existing.proofId !== input.proofId ||
        existing.sizeBytes !== input.sizeBytes ||
        existing.mediaSha256 !== input.mediaSha256 ||
        existing.mimeType !== input.mimeType
      ) {
        throw new ValidationError('Evidence upload operation key was already used for a different request')
      }
      return existing
    }

    const [proofRefs, uploaderRefs, proofReservations, uploaderReservations] = await Promise.all([
      tx.evidenceReference.aggregate({
        where: { proofId: input.proofId },
        _count: { _all: true },
        _sum: { sizeBytes: true },
      }),
      tx.evidenceReference.aggregate({
        where: { proofId: input.proofId, submittedBy: input.submittedBy },
        _count: { _all: true },
        _sum: { sizeBytes: true },
      }),
      tx.evidenceUploadReservation.aggregate({
        where: { proofId: input.proofId, status: { in: [...activeReservationStatuses] } },
        _count: { _all: true },
        _sum: { sizeBytes: true },
      }),
      tx.evidenceUploadReservation.aggregate({
        where: {
          proofId: input.proofId,
          submittedBy: input.submittedBy,
          status: { in: [...activeReservationStatuses] },
        },
        _count: { _all: true },
        _sum: { sizeBytes: true },
      }),
    ])

    const proofCount = proofRefs._count._all + proofReservations._count._all
    const proofBytes = (proofRefs._sum.sizeBytes ?? 0) + (proofReservations._sum.sizeBytes ?? 0)
    const uploaderCount = uploaderRefs._count._all + uploaderReservations._count._all
    const uploaderBytes = (uploaderRefs._sum.sizeBytes ?? 0) + (uploaderReservations._sum.sizeBytes ?? 0)

    if (proofCount + 1 > config.proof.evidenceMaxPerProofCount) {
      throw new ValidationError('Evidence Proof reference quota exceeded')
    }
    if (proofBytes + input.sizeBytes > config.proof.evidenceMaxPerProofBytes) {
      throw new ValidationError('Evidence Proof byte quota exceeded')
    }
    if (uploaderCount + 1 > config.proof.evidenceMaxPerUploaderProofCount) {
      throw new ValidationError('Evidence uploader+Proof reference quota exceeded')
    }
    if (uploaderBytes + input.sizeBytes > config.proof.evidenceMaxPerUploaderProofBytes) {
      throw new ValidationError('Evidence uploader+Proof byte quota exceeded')
    }

    return tx.evidenceUploadReservation.create({
      data: {
        proofId: input.proofId,
        submittedBy: input.submittedBy,
        sizeBytes: input.sizeBytes,
        operationKey: input.operationKey,
        mediaSha256: input.mediaSha256,
        mimeType: input.mimeType,
      },
    })
  })
}


export async function markEvidenceReservationUnknown(reservationId: string): Promise<void> {
  await prisma.evidenceUploadReservation.updateMany({
    where: { id: reservationId, status: 'RESERVED' },
    data: { status: 'UNKNOWN' },
  })
}

export async function releaseEvidenceReservation(reservationId: string): Promise<void> {
  await prisma.evidenceUploadReservation.updateMany({
    where: { id: reservationId, status: 'RESERVED' },
    data: { status: 'RELEASED' },
  })
}

export async function recoverCommittedEvidenceReservation(reservationId: string) {
  const reservation = await prisma.evidenceUploadReservation.findUnique({ where: { id: reservationId } })
  if (!reservation?.evidenceRefId) return null
  return prisma.evidenceReference.findUnique({ where: { id: reservation.evidenceRefId } })
}

/**
 * Atomically converts one active quota reservation into its durable
 * EvidenceReference. The reservation stops contributing as an active
 * reservation in the same transaction in which the committed reference
 * starts contributing, so quota accounting never observes a free gap or
 * double-counted committed operation.
 */
export async function commitEvidenceReservation(
  reservationId: string,
  stored: { provider: string; uri: string },
  signature: string
) {
  return prisma.$transaction(async (tx) => {
    const reservation = await tx.evidenceUploadReservation.findUnique({ where: { id: reservationId } })
    if (!reservation) throw new ValidationError('Evidence upload reservation no longer exists')

    if (reservation.status === 'COMMITTED') {
      if (!reservation.evidenceRefId) {
        throw new ValidationError('Committed evidence reservation is missing its durable reference')
      }
      const existing = await tx.evidenceReference.findUnique({ where: { id: reservation.evidenceRefId } })
      if (!existing) throw new ValidationError('Committed evidence reservation points to a missing durable reference')
      return existing
    }
    if (reservation.status === 'RELEASED') {
      throw new ValidationError('Released evidence reservation cannot be committed')
    }

    const reference = await tx.evidenceReference.create({
      data: {
        proofId: reservation.proofId,
        provider: stored.provider,
        uri: stored.uri,
        sha256: reservation.mediaSha256,
        mimeType: reservation.mimeType,
        signature,
        submittedBy: reservation.submittedBy,
        sizeBytes: reservation.sizeBytes,
      },
    })

    const committed = await tx.evidenceUploadReservation.updateMany({
      where: { id: reservation.id, status: { in: ['RESERVED', 'UNKNOWN'] } },
      data: { status: 'COMMITTED', evidenceRefId: reference.id },
    })
    if (committed.count !== 1) {
      throw new ValidationError('Evidence reservation changed concurrently while committing')
    }

    return reference
  })
}
