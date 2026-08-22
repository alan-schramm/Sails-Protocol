/**
 * EscrowFeeSnapshotService — Missão 11 Fase 2.2 economic accounting
 * foundation.
 *
 * Implements the CAPABILITY to snapshot a PUBLISHED FeePolicyVersion's three
 * most decision-relevant scalar fields onto an Escrow row (Fase 2.1 §5's
 * defense-in-depth recommendation), plus the FK reference itself.
 *
 * Deliberately NOT called from escrow-lifecycle.ts's createEscrow() in this
 * pass (Fase 2.2 §5's explicit instruction — "NÃO faça cutover global
 * automático... Se não existe policy publicada/configurada para aquele
 * fluxo durante esta fase, o comportamento atual deve continuar intacto").
 * This file exists and is tested in isolation so a future, separately
 * authorized phase can wire it into a real flow without first inventing the
 * primitive.
 *
 * No hidden default policy: if snapshotEscrowFeePolicy() is called for a
 * railScope with no PUBLISHED policy, it is a no-op (returns null) rather
 * than fabricating or falling back to any policy.
 */
import { prisma } from '../../common/database'
import { feePolicyService, FeePolicyService } from './fee-policy.service'

export class EscrowFeeSnapshotService {
  constructor(private readonly policyService: FeePolicyService = feePolicyService) {}

  /**
   * Snapshots the live PUBLISHED policy for `railScope` onto `escrowId`, if
   * one exists. Returns the snapshotted policy id, or null if no policy is
   * published for this rail (the escrow's feePolicyVersionId simply stays
   * null — identical, by design, to today's pre-Fase-2.2 behavior).
   *
   * Idempotency note: this writes feePolicyVersionId + the three scalar
   * snapshot columns exactly once, relying on the migration's own
   * immutability trigger to reject a second write to an already-snapshotted
   * escrow (see escrows_fee_snapshot_immutability_guard) — this method does
   * not itself pre-check for an existing snapshot, matching the same
   * "let the database's own constraint be the real guarantee" discipline
   * already used for outpoint double-claim protection (Missão 10).
   */
  async snapshotEscrowFeePolicy(escrowId: string, railScope: string): Promise<string | null> {
    const policy = await this.policyService.findLivePolicyForRail(railScope)
    if (!policy) return null

    await prisma.escrow.update({
      where: { id: escrowId },
      data: {
        feePolicyVersionId: policy.id,
        snapshotProtocolFeeRate: policy.protocolFeeRate,
        snapshotPayerModel: policy.payerModel,
        snapshotEconomicBasis: policy.economicBasis,
      },
    })

    return policy.id
  }
}

export const escrowFeeSnapshotService = new EscrowFeeSnapshotService()
