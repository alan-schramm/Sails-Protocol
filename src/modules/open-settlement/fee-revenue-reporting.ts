/**
 * FeeRevenueReporting — Missão 11 Fase 2.2, CTO-mandated correction before
 * implementation ("COLLECTED e DISTRIBUTED NÃO podem ser somados como
 * categorias independentes de Protocol Revenue").
 *
 * DISTRIBUTED is an evolution of the same value that was previously
 * COLLECTED, not a second, independent pool of revenue — an obligation
 * moves COLLECTED -> DISTRIBUTED (fee-distribution-repository.ts's own
 * addObligationToBatch()), it is never counted once at each stage as if
 * they were different money. This module is the one place "Protocol
 * Revenue" is computed, precisely to prevent any future caller from
 * re-deriving it incorrectly as SUM(COLLECTED) + SUM(DISTRIBUTED).
 *
 * grossCollected = every OWED obligation that was economically charged
 *   exactly once, REGARDLESS of whether it has since been distributed —
 *   i.e. collectionStatus IN (COLLECTED, DISTRIBUTED). This is the correct
 *   "total real revenue" figure.
 * undistributedCollected = collectionStatus = COLLECTED only (money
 *   collected but not yet internally allocated to the four buckets).
 * alreadyDistributed = collectionStatus = DISTRIBUTED only.
 *
 * Invariant proven in tests/integration/feeAccountingFoundation.test.ts
 * (Test R): grossCollected == undistributedCollected + alreadyDistributed,
 * always, by construction — because grossCollected is computed from the
 * union of exactly those two statuses, never as an independent third sum.
 *
 * Per the standing hard rule (Fase 2.1 §9 / Fase 2.2 correction): QUOTED,
 * DUE-equivalent (PENDING_COLLECTION/IN_PROGRESS), WAIVED, and
 * UNCOLLECTIBLE_BYPASSED obligations are NEVER included in any of these
 * three figures — they are not revenue under any definition used here.
 */
import { prisma } from '../../common/database'
import { Prisma } from '@prisma/client'
import type { AssetType } from '../../common/types'

export interface ProtocolRevenueSummary {
  grossCollected: Prisma.Decimal
  undistributedCollected: Prisma.Decimal
  alreadyDistributed: Prisma.Decimal
}

export async function getProtocolRevenueSummary(asset?: AssetType): Promise<ProtocolRevenueSummary> {
  const baseWhere = { economicDetermination: 'OWED' as const, ...(asset ? { asset } : {}) }

  const [collectedAgg, distributedAgg] = await Promise.all([
    prisma.feeObligation.aggregate({ where: { ...baseWhere, collectionStatus: 'COLLECTED' }, _sum: { computedFee: true } }),
    prisma.feeObligation.aggregate({ where: { ...baseWhere, collectionStatus: 'DISTRIBUTED' }, _sum: { computedFee: true } }),
  ])

  const undistributedCollected = collectedAgg._sum.computedFee ?? new Prisma.Decimal(0)
  const alreadyDistributed = distributedAgg._sum.computedFee ?? new Prisma.Decimal(0)

  return {
    // Deliberately NOT a separate query — computed as the sum of the two
    // figures already fetched above, so it is structurally impossible for
    // this function to double-count: there is no third, independent
    // "collected OR distributed" query that could ever drift from the two
    // components it's built from.
    grossCollected: undistributedCollected.plus(alreadyDistributed),
    undistributedCollected,
    alreadyDistributed,
  }
}
