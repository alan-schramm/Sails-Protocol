/**
 * EscrowFeeSnapshotService — Missão 11 Fase 2.2 (foundation) / Fase 4.1
 * (pre-funding waiver + fail-closed snapshot).
 *
 * computeSnapshotFields() is a PURE lookup+computation (one read, no
 * writes): given a rail and a trade notional, it decides — BEFORE any
 * funding has happened — whether a PUBLISHED policy exists for that rail
 * and, if so, whether the maximum possible Protocol Fee (Fmax, sized
 * against the full trade notional, the worst-case release basis) is even
 * economically collectible against the CURRENTLY configured collection
 * destination (Fase 4.1 §1). A seller must never be asked to pre-fund a
 * reserve that is already known, at this moment, to be uncollectible —
 * discovering that only at settlement time (Fase 4's own gap, closed
 * here) left a real class of escrows fundable-but-unreleasable.
 *
 * escrow.service.ts's createEscrow() calls this BEFORE creating the
 * escrow row and folds the result straight into that same INSERT — never
 * a separate best-effort update afterward. This is what makes the whole
 * operation fail-closed by construction (Fase 4.1 §4): if a PUBLISHED
 * policy exists for this rail and anything here throws, the escrow is
 * never created at all — there is no persistence step left to fail
 * independently, and therefore no way for a fee-aware escrow to end up
 * silently downgraded to a legacy (feePolicyVersionId=NULL) one because
 * of a DB hiccup. No active/published policy for the rail is the ONLY
 * case that returns null (normal no-fee behavior, unchanged).
 *
 * snapshotEscrowFeePolicy() (update-based) is kept for direct/isolated
 * testing against an ALREADY-existing escrow row (e.g. proving the
 * DB-native immutability trigger) — createEscrow() itself no longer uses
 * this path.
 */
import { prisma } from '../../common/database'
import { Prisma, FeePayerModel, FeeEconomicBasis } from '@prisma/client'
import { feePolicyService, FeePolicyService } from './fee-policy.service'
import { computeMaxProtocolFee } from './fee-reserve-math'
import { evaluateFeeCollectibility } from './multisig.provider'

// Missão 11 Fase 4.1 §1 — the pre-funding collectibility check is
// inherently Bitcoin/script-specific (dust-relay policy, script types —
// see bitcoin-dust-policy.ts's own header). Only MULTISIG implements ANY
// fee-aware output construction today (Fase 4's own rail-parity scope
// boundary, unchanged here) — every other rail has no dust/collection-
// address concept to evaluate at all, so this check simply never applies
// to them: their Fmax is computed from the raw rate alone, same as
// before, and their (currently nonexistent) fee-aware construction has no
// use for snapshotFeeCollectionAddress either way.
const RAILS_WITH_COLLECTION_ECONOMICS: ReadonlySet<string> = new Set(['MULTISIG'])

export interface FeeSnapshotFields {
  feePolicyVersionId: string
  snapshotProtocolFeeRate: Prisma.Decimal
  snapshotPayerModel: FeePayerModel
  snapshotEconomicBasis: FeeEconomicBasis
  snapshotFeeCollectionAddress: string | null
  snapshotFeeCollectionWaivedPreFunding: boolean
}

export class EscrowFeeSnapshotService {
  constructor(private readonly policyService: FeePolicyService = feePolicyService) {}

  /**
   * Returns null (no snapshot at all — legacy behavior, unchanged) only
   * when no PUBLISHED policy exists for `railScope`. Once a policy
   * exists, this ALWAYS returns real fields — never null, never a
   * partially-filled result — so the caller can persist them atomically.
   * Never writes to the database itself.
   */
  async computeSnapshotFields(railScope: string, lockedAmount: Prisma.Decimal | string): Promise<FeeSnapshotFields | null> {
    const policy = await this.policyService.findLivePolicyForRail(railScope)
    if (!policy) return null

    const rate = new Prisma.Decimal(policy.protocolFeeRate)
    let collectionAddress: string | null = null
    let waivedPreFunding = false

    // Missão 11 Fase 4.1 §1/§5 — a genuine zero-rate policy is NOT the
    // pre-funding-waived case (waivedPreFunding stays false; Fmax=0
    // follows from the rate math alone downstream) — the two are recorded
    // separately so accounting can always tell them apart (Fase 4.1 §6),
    // never inferred from Fmax=0 alone.
    if (rate.greaterThan(0) && RAILS_WITH_COLLECTION_ECONOMICS.has(railScope)) {
      const fmaxCandidate = computeMaxProtocolFee(lockedAmount, rate)
      const fmaxCandidateSats = Number(fmaxCandidate.times(1e8).toFixed(0))
      const decision = evaluateFeeCollectibility(fmaxCandidateSats)
      if (decision.collectible) {
        collectionAddress = decision.collectionAddress
      } else {
        waivedPreFunding = true
      }
    }

    return {
      feePolicyVersionId: policy.id,
      snapshotProtocolFeeRate: rate,
      snapshotPayerModel: policy.payerModel,
      snapshotEconomicBasis: policy.economicBasis,
      snapshotFeeCollectionAddress: collectionAddress,
      snapshotFeeCollectionWaivedPreFunding: waivedPreFunding,
    }
  }

  /**
   * Update-based variant — writes the computed fields onto an escrow row
   * that already exists. Idempotency note: relies on the migration-level
   * trigger to reject a second write to an already-snapshotted escrow
   * (escrows_fee_snapshot_immutability_guard) — this method does not
   * itself pre-check for an existing snapshot, matching the same
   * "let the database's own constraint be the real guarantee" discipline
   * already used for outpoint double-claim protection (Missão 10).
   */
  async snapshotEscrowFeePolicy(escrowId: string, railScope: string, lockedAmount: Prisma.Decimal | string): Promise<string | null> {
    const fields = await this.computeSnapshotFields(railScope, lockedAmount)
    if (!fields) return null

    await prisma.escrow.update({
      where: { id: escrowId },
      data: fields,
    })

    return fields.feePolicyVersionId
  }
}

export const escrowFeeSnapshotService = new EscrowFeeSnapshotService()
