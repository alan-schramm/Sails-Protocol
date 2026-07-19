/**
 * Dispute Service — Sails OpenSettlement
 * 04-Deepseek Review.md Task 2: raiseDispute()/resolveDispute().
 *
 * First real implementation of the Dispute primitive
 * (PROTOCOL_SPECIFICATION.md §1.9) — the primitive itself isn't new, only
 * its persistence and the escalation flow RFC-007 D4 already specified
 * (Trusted Arbitrator, not a protocol-native role).
 *
 * Deliberately built on the existing Postgres + EventStore (RFC-010)
 * architecture, not a CRDT document — reconciled directly with the user
 * before writing this file: a CRDT-based dispute state would create a
 * second, potentially divergent source of truth alongside `Trade`/
 * `Escrow`, exactly the risk RFC-011 was built to close for Postgres/P2P
 * consistency. "Freeze the trade and notify the arbitrator via pubsub"
 * (the task's own words) is achieved here without introducing CRDTs:
 * freezing = escrowService.openDispute() (already real code, transitions
 * Escrow to DISPUTED); pubsub = eventBus.emit('dispute.opened', ...)
 * (RFC-010's EventStore, already real).
 */
import { prisma } from '../../common/database'
import { NotFoundError, ValidationError, ForbiddenError } from '../../common/errors'
import { eventBus } from '../../common/events/event-bus'
import { escrowService } from './escrow.service'
import type { ArbitrationProvider } from './arbitration-provider'
import type { EvidenceDescriptor, DisputeRuling } from '@sails/p2p-schemas'

export class DisputeService {
  constructor(private readonly arbitrationProvider: ArbitrationProvider) {}

  async raiseDispute(
    tradeId: string,
    raisedBy: string,
    reason: string,
    evidence: EvidenceDescriptor[] = []
  ) {
    const trade = await prisma.trade.findUnique({ where: { id: tradeId } })
    if (!trade) throw new NotFoundError('Trade', tradeId)
    if (!trade.escrowId) throw new ValidationError(`Trade ${tradeId} has no escrow to dispute`)

    // CISO Byzantine Rule, applied here too: only the two actual
    // counterparties may raise a dispute on their own trade.
    if (raisedBy !== trade.buyerId && raisedBy !== trade.sellerId) {
      throw new ForbiddenError(`${raisedBy} is not a party to trade ${tradeId}`)
    }

    // Freezes the trade — escrow.service.ts's real, existing state
    // transition (Escrow -> DISPUTED), not new logic written here.
    await escrowService.openDispute(trade.escrowId, raisedBy, reason)

    const dispute = await prisma.dispute.create({
      data: {
        tradeId,
        escrowId: trade.escrowId,
        openedBy: raisedBy,
        reason,
        evidence: evidence as unknown as object,
        status: 'OPENED',
      },
    })

    const arbiterId = await this.arbitrationProvider.assign(dispute.id, tradeId)
    const updated = await prisma.dispute.update({
      where: { id: dispute.id },
      data: { arbiterId },
    })

    // Notification via pubsub (EventStore, RFC-010) — correlationId =
    // tradeId, the established convention for trade-lifecycle events.
    await eventBus.emit('dispute.opened', {
      disputeId: dispute.id,
      settlementId: trade.escrowId,
      tradeId,
      arbiterId,
      reason,
      triggeredBy: raisedBy,
    }, tradeId)

    return updated
  }

  async resolveDispute(
    disputeId: string,
    arbiterId: string,
    ruling: DisputeRuling,
    // Required only for RELEASE — escrowService.releaseFunds() needs a
    // real payout address, and no field in the current schema models a
    // participant's payout address (a real, separate gap — BACKLOG.md).
    // Not fabricated here; the caller must supply it.
    releaseToAddress?: string
  ) {
    const dispute = await prisma.dispute.findUnique({ where: { id: disputeId } })
    if (!dispute) throw new NotFoundError('Dispute', disputeId)
    if (dispute.status === 'RESOLVED') {
      throw new ValidationError(`Dispute ${disputeId} is already resolved`)
    }
    if (dispute.arbiterId !== arbiterId) {
      throw new ForbiddenError(`${arbiterId} is not the arbiter assigned to dispute ${disputeId}`)
    }

    if (ruling === 'RELEASE' && !releaseToAddress) {
      throw new ValidationError('releaseToAddress is required when ruling is RELEASE')
    }

    // Real bug found by tests/fullTradeLifecycle.test.ts (end-to-end
    // chain, added investigating the CTO-role "validate the full flow"
    // follow-up): this used to call escrowService.releaseFunds()/
    // refundFunds() BEFORE marking the Dispute RESOLVED below. Those
    // calls emit settlement.escrow.released/refunded, which
    // common/events/handlers.ts reacts to with RFC-007 D8/D9's
    // dispute-aware branch — a query for a Dispute row with
    // `status: 'RESOLVED'` on this exact tradeId. That query always
    // raced this function's own not-yet-run update() below and lost:
    // every disputed resolution was silently scored as an ordinary
    // no-dispute outcome (both parties POSITIVE/NEUTRAL) instead of the
    // asymmetric win/loss RFC-007 D8/D9 specifies. Fixed by marking
    // RESOLVED first; if the fund movement then fails, the ruling is
    // reverted rather than left claiming a resolution that never
    // actually moved funds.
    const updated = await prisma.dispute.update({
      where: { id: disputeId },
      data: { status: 'RESOLVED', ruling, resolvedAt: new Date() },
    })

    try {
      if (ruling === 'RELEASE') {
        await escrowService.releaseFunds(dispute.escrowId, releaseToAddress as string, arbiterId)
      } else if (ruling === 'REFUND') {
        await escrowService.refundFunds(dispute.escrowId, arbiterId)
      }
      // SPLIT: no automated settlement action exists for this today (the
      // existing SettlementProvider interface only has release/refund,
      // not a split operation) — the ruling is recorded, but does not
      // itself move funds. Documented here rather than silently no-op'd
      // without explanation.
    } catch (err) {
      await prisma.dispute.update({
        where: { id: disputeId },
        data: { status: 'OPENED', ruling: null, resolvedAt: null },
      })
      throw err
    }

    await eventBus.emit('dispute.resolved', {
      disputeId,
      settlementId: dispute.escrowId,
      tradeId: dispute.tradeId,
      ruling,
      triggeredBy: arbiterId,
    }, dispute.tradeId)

    return updated
  }
}
