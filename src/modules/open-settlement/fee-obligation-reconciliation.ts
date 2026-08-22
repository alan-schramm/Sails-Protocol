/**
 * FeeObligationReconciliation — Missão 11 Fase 3 §5.
 *
 * The terminal-escrow invariant: for any Escrow with a non-null
 * feePolicyVersionId that has reached a terminal settlement status
 * (COMPLETED/REFUNDED/SPLIT), a FeeObligation row must exist — its absence
 * is provably an integrity error, never an ambiguous case (Fase 2.1 §3).
 *
 * findTerminalPolicyAwareEscrowsMissingObligation() DETECTS this gap only —
 * it never creates a missing FeeObligation itself. A silent auto-fix here
 * would be exactly the kind of undisclosed backfill this whole mission has
 * repeatedly ruled out for historical/legacy data, and would also hide a
 * real bug (a settlement path that bypassed
 * recordObligationForEscrowSettlement()) behind a self-healing side effect
 * instead of surfacing it.
 *
 * Legacy escrows (feePolicyVersionId IS NULL) are correctly excluded by the
 * WHERE clause itself — their absence of a FeeObligation is the expected,
 * permanent, correct state (Fase 3 §8), never flagged here.
 */
import { prisma } from '../../common/database'
import { Prisma } from '@prisma/client'
import { computeRequiredFundingAmount } from './fee-reserve-math'

export interface MissingObligationRow {
  escrowId: string
  status: string
  feePolicyVersionId: string
}

export async function findTerminalPolicyAwareEscrowsMissingObligation(): Promise<MissingObligationRow[]> {
  const rows = await prisma.escrow.findMany({
    where: {
      feePolicyVersionId: { not: null },
      status: { in: ['COMPLETED', 'REFUNDED', 'SPLIT'] },
      feeObligation: { is: null },
    },
    select: { id: true, status: true, feePolicyVersionId: true },
  })

  return rows.map((r) => ({
    escrowId: r.id,
    status: r.status,
    feePolicyVersionId: r.feePolicyVersionId!,
  }))
}

export interface FundedAmountMismatchRow {
  escrowId: string
  fundedAmount: string
  requiredFundingAmount: string
}

// Missão 11 Fase 4 §K — DB-only (no live chain lookup): compares the
// purely observational Escrow.fundedAmount (Fase 4 §C, recorded once at
// lockFunds() success time) against the requiredFundingAmount computed
// fresh from lockedAmount + the escrow's own immutable rate snapshot.
// Under exact-funding enforcement (multisig.provider.ts) these should
// always agree in the success case — this exists to DETECT a regression
// (e.g. a future bug loosening the exact-match check) without needing to
// re-query the explorer for every escrow on every reconciliation pass.
export async function findFundedAmountMismatches(): Promise<FundedAmountMismatchRow[]> {
  const rows = await prisma.escrow.findMany({
    where: {
      feePolicyVersionId: { not: null },
      fundedAmount: { not: null },
      snapshotProtocolFeeRate: { not: null },
    },
    select: { id: true, lockedAmount: true, fundedAmount: true, snapshotProtocolFeeRate: true },
  })

  const mismatches: FundedAmountMismatchRow[] = []
  for (const row of rows) {
    const required = computeRequiredFundingAmount(row.lockedAmount, row.snapshotProtocolFeeRate!)
    if (!new Prisma.Decimal(row.fundedAmount!).equals(required)) {
      mismatches.push({
        escrowId: row.id,
        fundedAmount: row.fundedAmount!.toString(),
        requiredFundingAmount: required.toString(),
      })
    }
  }
  return mismatches
}

export interface CollectionEvidenceMismatchRow {
  feeObligationId: string
  escrowId: string
  computedFee: string
  confirmedEvidenceAmount: string | null
}

// Missão 11 Fase 4 §K — DB-only. For any obligation already marked
// COLLECTED, its most recent CONFIRMED FeeCollectionEvidence (if any)
// should record the same amount as computedFee. Flags both an outright
// missing confirmation and an amount disagreement — never auto-corrects
// either (Fase 2.1's own "detect, don't silently fix" principle, applied
// here too). No collection-tracking mechanism writes FeeCollectionEvidence
// yet in this phase (Fase 4's own scope boundary — see this mission's own
// report) — this query is forward-ready for when one does, not exercised
// by any real data today.
export async function findCollectionEvidenceMismatches(): Promise<CollectionEvidenceMismatchRow[]> {
  const obligations = await prisma.feeObligation.findMany({
    where: { collectionStatus: 'COLLECTED' },
    include: { evidence: { where: { kind: 'CONFIRMED' }, orderBy: { recordedAt: 'desc' }, take: 1 } },
  })

  const mismatches: CollectionEvidenceMismatchRow[] = []
  for (const obligation of obligations) {
    const latestConfirmed = obligation.evidence[0]
    const computedFee = obligation.computedFee?.toString() ?? null
    const confirmedAmount = latestConfirmed?.amount?.toString() ?? null
    if (confirmedAmount === null || confirmedAmount !== computedFee) {
      mismatches.push({
        feeObligationId: obligation.id,
        escrowId: obligation.escrowId,
        computedFee: computedFee ?? '(null)',
        confirmedEvidenceAmount: confirmedAmount,
      })
    }
  }
  return mismatches
}
