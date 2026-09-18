/**
 * ADR-005 / #218 — Economic Disposition Commit Gate.
 *
 * Closes the gap ADR-004's Execution Commit Gate (capability-execution-
 * authorization.ts) deliberately does not cover: a technically valid,
 * fully-signed pending transaction can still be attributable to a ruling
 * generation the Dispute has since moved past (appeal/reassignment). ADR-004
 * proves the ORIGINAL initiator still has Capability/Eligibility Authority.
 * This module proves the pending operation's recorded Economic Disposition
 * Authority — the ruling generation that actually authorized its economic
 * disposition — is still the dispute's current authoritative generation.
 * Neither gate substitutes for the other (ADR-005 §7).
 *
 * Immediately before the first provider side effect:
 *   1) serializes with appeal() and the disputed-ruling resolve-write in
 *      Postgres, on the same `economic-disposition:<disputeId>` lock scope
 *      ADR-005 §3 names;
 *   2) re-loads the LIVE Dispute row (never trusts transient request
 *      memory) and compares it against the generation snapshotted on the
 *      pending operation at creation time (escrow-pending-tx.ts's
 *      initiateSignatureCollectionCore());
 *   3) fails closed if the dispute has moved to a different generation;
 *   4) otherwise durably commits economic-disposition execution
 *      authorization before returning.
 *
 * A retry for the exact same immutable pending operation reuses that durable
 * authorization and does NOT re-validate against the (possibly by-then-
 * superseded) live dispute state — ADR-005 §4/§5E: "later appeal/revocation
 * is prospective with respect to an already committed execution attempt."
 *
 * No-op (returns null) for a pending operation with no recorded ruling
 * generation — an ordinary cooperative release/refund/split never had one
 * (ADR-005 §9 does not redefine that authority).
 */
import { prisma } from '../../common/database'
import { EscrowError } from '../../common/errors'
import { capabilityOperationDigest } from './capability-execution-authorization'

type DisputedPendingFacts = {
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
  disputeId: string | null
  rulingAppealRound: number | null
  rulingArbiterId: string | null
  rulingOutcome: string | null
  rulingAuthoritySignature: string | null
  rulingAuthorityIssuedAt: Date | null
}

export function economicDispositionLockKey(disputeId: string): string {
  return `economic-disposition:${disputeId}`
}

export async function authorizeDisputedPendingExecution(pending: DisputedPendingFacts) {
  // Not a disputed-origin operation — ADR-005 does not apply. Cooperative
  // seller-authorized release/refund/split keeps its existing authority
  // semantics unchanged (ADR-005 §9).
  if (!pending.disputeId) return null

  const disputeId = pending.disputeId
  const operationDigest = capabilityOperationDigest(pending)

  return prisma.$transaction(async (tx) => {
    // Same lock scope appeal() and the disputed-ruling resolve-write
    // (dispute.service.ts's applyRuling(), dispute-outcome.ts's
    // commitAuthoritativeDisputeRuling()) acquire before touching this
    // dispute's authority — ADR-005 §3's single serialization domain.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${economicDispositionLockKey(disputeId)})::bigint)`

    const existing = await tx.economicDispositionAuthorization.findUnique({
      where: { pendingOperationId: pending.id },
    })

    if (existing) {
      // Reuse is legal only for the exact immutable operation previously
      // authorized — a later appeal is prospective with respect to an
      // already-committed attempt (ADR-005 §4), so the live dispute state
      // is deliberately NOT re-checked here.
      if (
        existing.escrowId !== pending.escrowId ||
        existing.disputeId !== disputeId ||
        existing.operationDigest !== operationDigest
      ) {
        throw new EscrowError(
          `Pending operation ${pending.id} no longer matches its committed economic disposition authorization`
        )
      }
      return existing
    }

    const currentDispute = await tx.dispute.findUnique({ where: { id: disputeId } })
    if (!currentDispute) {
      throw new EscrowError(`Dispute ${disputeId} not found while committing economic disposition authority for pending operation ${pending.id}`)
    }

    // Fail closed on ANY divergence from the recorded generation — this is
    // the exact set of facts ADR-005 §2 requires: the dispute must not
    // have advanced to another appeal round, the assigned ruling authority
    // must still match, no later ruling may have superseded the recorded
    // one, and RESOLVED (not e.g. APPEALED, which nulls `ruling`) must
    // still hold. A stale pending operation is not "failed execution" — it
    // is no longer economically authorized.
    const stillCurrent =
      currentDispute.status === 'RESOLVED' &&
      currentDispute.appealRound === pending.rulingAppealRound &&
      currentDispute.arbiterId === pending.rulingArbiterId &&
      currentDispute.ruling === pending.rulingOutcome &&
      currentDispute.authoritySignature === pending.rulingAuthoritySignature

    if (!stillCurrent) {
      throw new EscrowError(
        `Pending operation ${pending.id} was authorized under dispute ${disputeId}'s appeal round ${pending.rulingAppealRound}, ` +
        `but that ruling generation is no longer current (dispute is now status=${currentDispute.status}, ` +
        `appealRound=${currentDispute.appealRound}, arbiterId=${currentDispute.arbiterId}) — refusing to execute a ` +
        'pending operation whose Economic Disposition Authority has been superseded (ADR-005).'
      )
    }

    return tx.economicDispositionAuthorization.create({
      data: {
        pendingOperationId: pending.id,
        escrowId: pending.escrowId,
        disputeId,
        appealRound: currentDispute.appealRound,
        arbiterId: currentDispute.arbiterId!,
        ruling: currentDispute.ruling!,
        operationDigest,
      },
    })
  })
}
