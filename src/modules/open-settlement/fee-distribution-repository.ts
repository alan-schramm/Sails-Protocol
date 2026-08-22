/**
 * FeeDistributionRepository — Missão 11 Fase 2.2 economic accounting
 * foundation.
 *
 * Accounting/provenance ONLY (Fase 2.2 §8) — no real financial transfer or
 * payout is implemented anywhere in this file. addObligationToBatch()
 * records that a FeeObligation's already-COLLECTED amount has been
 * internally allocated to the four buckets; it never moves value anywhere.
 *
 * Provenance guarantee (Fase 1.2 §9 / Fase 2 §9): bucket shares are always
 * computed from the obligation's OWN feePolicyVersion (read inside the same
 * transaction), never from whatever policy happens to be live/PUBLISHED at
 * distribution time — this is what makes a single batch spanning multiple
 * policy versions provenance-safe.
 *
 * Double-distribution guarantee (Fase 2.2 mandate item 8): the DB-level
 * `@@unique([feeObligationId])` on fee_distribution_batch_items is the real
 * guarantee — a second attempt to distribute the same obligation fails at
 * the `create()` call with a P2002 before the transaction ever reaches the
 * FeeObligation status claim, so the whole transaction rolls back cleanly
 * with no partial state. The `collectionStatus = COLLECTED` precondition
 * check (via the same atomic claim-transition pattern used throughout this
 * module) is the second, independent layer.
 */
import { prisma } from '../../common/database'
import { Prisma } from '@prisma/client'
import type { AssetType } from '../../common/types'
import { EscrowError, NotFoundError } from '../../common/errors'

type FeeDistributionBatchRow = NonNullable<Awaited<ReturnType<typeof prisma.feeDistributionBatch.findUnique>>>
type FeeDistributionBatchItemRow = NonNullable<Awaited<ReturnType<typeof prisma.feeDistributionBatchItem.findFirst>>>

export interface FeeDistributionRepository {
  createBatch(asset: AssetType, totalAmount: Prisma.Decimal | string): Promise<FeeDistributionBatchRow>

  /** Reads feeObligationId's OWN policy version inside the same transaction,
   *  computes bucket shares from THAT version's percentages, records the
   *  batch item, and atomically claims collectionStatus COLLECTED -> DISTRIBUTED.
   *  Throws EscrowError if the obligation isn't OWED+COLLECTED, or if it has
   *  already been distributed (P2002 on the unique feeObligationId index). */
  addObligationToBatch(batchId: string, feeObligationId: string): Promise<FeeDistributionBatchItemRow>

  listItemsForBatch(batchId: string): Promise<FeeDistributionBatchItemRow[]>

  /** Sums already-distributed items grouped by feePolicyVersionId — the
   *  concrete per-policy-version-subtotal capability Fase 1.2 §9 / Fase 2.2
   *  §7's provenance requirement asks for. */
  sumDistributedByPolicyVersion(batchId: string): Promise<Array<{ feePolicyVersionId: string; total: Prisma.Decimal }>>
}

class PrismaFeeDistributionRepository implements FeeDistributionRepository {
  async createBatch(asset: AssetType, totalAmount: Prisma.Decimal | string) {
    return prisma.feeDistributionBatch.create({
      data: { asset: asset as any, totalAmount },
    })
  }

  async addObligationToBatch(batchId: string, feeObligationId: string) {
    return prisma.$transaction(async (tx) => {
      const obligation = await tx.feeObligation.findUnique({
        where: { id: feeObligationId },
        include: { feePolicyVersion: true },
      })
      if (!obligation) {
        throw new NotFoundError('FeeObligation', feeObligationId)
      }
      if (obligation.economicDetermination !== 'OWED' || obligation.computedFee === null) {
        throw new EscrowError(`FeeObligation ${feeObligationId} has no OWED computedFee to distribute.`)
      }
      if (obligation.collectionStatus !== 'COLLECTED') {
        throw new EscrowError(`FeeObligation ${feeObligationId} is not COLLECTED (status=${obligation.collectionStatus}) — cannot distribute.`)
      }

      const policy = obligation.feePolicyVersion
      const amount = new Prisma.Decimal(obligation.computedFee)
      const hundred = new Prisma.Decimal(100)
      const nodeOperatorShare = amount.times(policy.nodeOperatorPct).div(hundred)
      const treasuryShare = amount.times(policy.treasuryPct).div(hundred)
      const walletRebateShare = amount.times(policy.walletRebatePct).div(hundred)
      const arbitratorReserveShare = amount.times(policy.arbitratorReservePct).div(hundred)

      let item: FeeDistributionBatchItemRow
      try {
        item = await tx.feeDistributionBatchItem.create({
          data: {
            batchId,
            feeObligationId,
            feePolicyVersionId: policy.id,
            amount,
            nodeOperatorShare,
            treasuryShare,
            walletRebateShare,
            arbitratorReserveShare,
          },
        })
      } catch (err: any) {
        if (err?.code === 'P2002') {
          throw new EscrowError(`FeeObligation ${feeObligationId} has already been distributed — refusing to distribute it twice.`)
        }
        throw err
      }

      const claim = await tx.feeObligation.updateMany({
        where: { id: feeObligationId, collectionStatus: 'COLLECTED' },
        data: { collectionStatus: 'DISTRIBUTED', distributedInBatchId: batchId },
      })
      if (claim.count === 0) {
        throw new EscrowError(`FeeObligation ${feeObligationId} was not COLLECTED at claim time — a concurrent transition already moved it.`)
      }

      return item
    })
  }

  async listItemsForBatch(batchId: string) {
    return prisma.feeDistributionBatchItem.findMany({ where: { batchId } })
  }

  async sumDistributedByPolicyVersion(batchId: string) {
    const grouped = await prisma.feeDistributionBatchItem.groupBy({
      by: ['feePolicyVersionId'],
      where: { batchId },
      _sum: { amount: true },
    })
    return grouped.map((g) => ({
      feePolicyVersionId: g.feePolicyVersionId,
      total: g._sum.amount ?? new Prisma.Decimal(0),
    }))
  }
}

export const feeDistributionRepository: FeeDistributionRepository = new PrismaFeeDistributionRepository()
