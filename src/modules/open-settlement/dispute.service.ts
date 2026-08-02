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
import { config } from '../../config'
import { TrustedArbitratorProvider, type ArbitrationProvider } from './arbitration-provider'
import { marketArbitrationProvider } from './market-arbitration.provider'
import type { AssetType } from '../../common/types'
import type { EvidenceDescriptor, DisputeRuling } from '@sails/p2p-schemas'

// RFC-021 D6 — appeal fee, PROTOCOL_ECONOMY.md §4.4's own arbitration-fee
// baseline (1-2% of the disputed amount, charged as Escrow.feeCharged by
// escrow.service.ts's Phase 0 fee collection) multiplied per round, the
// same "escalating cost discourages frivolous appeals" reasoning Kleros
// uses for its own appeal rounds.
//
// Real charge as of 2026-08-01 (BACKLOG.md P0, closed) — appeal() now
// persists this as a real DisputeAppealFee row, and resolveDispute()
// settles its outcome (FORFEITED on a denied/frivolous appeal, REFUNDED
// on an overturn). Same "computed and persisted, not actually routed
// on-chain" realness as the Protocol Fee itself already has
// (escrow.service.ts's chargeProtocolFee() doesn't move funds anywhere
// either — no SettlementProvider here has a real configured treasury/
// arbitrator-reserve address to send anything to). A real on-chain
// appeal-fee lock (the appellant actually posting collateral before the
// panel convenes) is a separate, larger undertaking blocked on the same
// missing treasury infrastructure the Protocol Fee itself already is —
// not attempted here.
export const APPEAL_FEE_MULTIPLIER = 2

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

    // Security-validation round (2026-07-19, "disputa dupla" scenario):
    // this create() reads-then-writes across two calls (this one and
    // openDispute() above) with no locking — buyer and seller calling
    // raiseDispute() concurrently could both pass every check above
    // before either write lands. The schema's new @@unique([tradeId])
    // on Dispute (see that model's own comment) is the actual guard: the
    // loser of the race hits a real P2002 here, caught and turned into a
    // clean rejection instead of a second, corrupting Dispute row —
    // same pattern reputation.service.ts's rate() already established
    // for its own unique-constraint race.
    let dispute
    try {
      dispute = await prisma.dispute.create({
        data: {
          tradeId,
          escrowId: trade.escrowId,
          openedBy: raisedBy,
          reason,
          evidence: evidence as unknown as object,
          status: 'OPENED',
        },
      })
    } catch (err: any) {
      if (err?.code === 'P2002') {
        throw new ValidationError(`A dispute has already been raised for trade ${tradeId}`)
      }
      throw err
    }

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

  // Extracted from resolveDispute() (RFC-021 D8, 2026-08-02) so
  // sweepExpiredAutoResolutions() below can reuse the exact same
  // mechanical release/refund + revert-on-failure logic — including the
  // hard-won ordering fix in its own comment — without duplicating it.
  // Shared by both the human-ruling path and the QVAC auto-resolution
  // path; slashing/recordRuling/appeal-fee settlement are NOT here — those
  // are specific to a human arbiter's own track record and stay in
  // resolveDispute() itself.
  private async applyRuling(
    dispute: { id: string; escrowId: string; tradeId: string; status: string },
    ruling: DisputeRuling,
    releaseToAddress: string | undefined,
    triggeredBy: string
  ) {
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
      where: { id: dispute.id },
      data: { status: 'RESOLVED', ruling, resolvedAt: new Date() },
    })

    try {
      if (ruling === 'RELEASE') {
        await escrowService.releaseFunds(dispute.escrowId, releaseToAddress as string, triggeredBy)
      } else if (ruling === 'REFUND') {
        await escrowService.refundFunds(dispute.escrowId, triggeredBy)
      }
      // SPLIT: no automated settlement action exists for this today (the
      // existing SettlementProvider interface only has release/refund,
      // not a split operation) — the ruling is recorded, but does not
      // itself move funds. Documented here rather than silently no-op'd
      // without explanation.
    } catch (err) {
      await prisma.dispute.update({
        where: { id: dispute.id },
        data: { status: dispute.status as any, ruling: null, resolvedAt: null },
      })
      throw err
    }

    await eventBus.emit('dispute.resolved', {
      disputeId: dispute.id,
      settlementId: dispute.escrowId,
      tradeId: dispute.tradeId,
      ruling,
      triggeredBy,
    }, dispute.tradeId)

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

    const updated = await this.applyRuling(dispute, ruling, releaseToAddress, arbiterId)

    // RFC-021 D6/D4 — feeds the arbiter's track record on every real
    // resolution, correct or not (optional: only market mode has an
    // ArbiterProfile to update; trusted-list mode silently skips this).
    // feeObserved reads the escrow fresh — a RELEASE ruling's
    // escrowService.releaseFunds() call above has already computed and
    // persisted Escrow.feeCharged (Phase 0) by this point; REFUND never
    // charges a fee, so this is correctly undefined for those.
    if (this.arbitrationProvider.recordRuling) {
      const resolvedEscrow = await prisma.escrow.findUnique({ where: { id: dispute.escrowId } })
      const feeObserved = resolvedEscrow?.feeCharged ? String(resolvedEscrow.feeCharged) : undefined
      await this.arbitrationProvider.recordRuling(arbiterId, feeObserved)
    }

    // RFC-021 D6 — an appeal round reversing the ruling being appealed is
    // real evidence the original arbiter got it wrong; slash them.
    // `dispute` here is the pre-update fetch at the top of this method,
    // so previousRuling/previousArbiterId still reflect whatever appeal()
    // set them to before this resolution — untouched by the RESOLVED
    // write above. If the appeal panel reaches the SAME ruling, the
    // appeal is denied and nothing is slashed (the requester's already-
    // computed appealFeeRequired was the real cost of a frivolous
    // appeal).
    if (
      dispute.previousRuling &&
      dispute.previousRuling !== ruling &&
      dispute.previousArbiterId &&
      this.arbitrationProvider.slash
    ) {
      await this.arbitrationProvider.slash(dispute.previousArbiterId)
    }

    // RFC-021 D6 — real appeal-fee settlement, closing the "computed and
    // returned but never collected" gap (appeal()'s own doc comment,
    // BACKLOG.md). Only appealed disputes (appealRound > 0) have a fee
    // row to settle at all. Same comparison the slashing check above
    // already makes: the appeal panel reaching the SAME ruling means the
    // appeal was denied (frivolous) — FORFEITED, the real cost this fee
    // exists to impose; a different ruling means the appellant was right
    // to appeal — REFUNDED. Real bookkeeping, not a simulated one — same
    // "computed and persisted, not actually routed on-chain" precedent
    // chargeProtocolFee() (escrow.service.ts) already established for
    // the Protocol Fee itself: no SettlementProvider here has a real
    // configured treasury/arbitrator-reserve address to move anything to.
    if (dispute.appealRound > 0) {
      const outcome = dispute.previousRuling && dispute.previousRuling !== ruling ? 'REFUNDED' : 'FORFEITED'
      await prisma.disputeAppealFee.updateMany({
        where: { disputeId, appealRound: dispute.appealRound, outcome: null },
        data: { outcome, settledAt: new Date() },
      })
    }

    return updated
  }

  /**
   * RFC-021 D6 — reopens a RESOLVED dispute for a new arbiter, drawn from
   * a reputation-weighted appeal panel (assignAppealPanel(), growing with
   * round count). Only meaningful under ARBITRATION_MODE=market — the
   * configured provider must implement assignAppealPanel(); a
   * TrustedArbitratorProvider deployment gets a clear config error
   * instead of a silent no-op.
   */
  async appeal(disputeId: string, requestedBy: string) {
    const dispute = await prisma.dispute.findUnique({ where: { id: disputeId } })
    if (!dispute) throw new NotFoundError('Dispute', disputeId)
    if (dispute.status !== 'RESOLVED') {
      throw new ValidationError(
        `Dispute ${disputeId} cannot be appealed from status ${dispute.status} — only a RESOLVED dispute can be appealed`
      )
    }

    const trade = await prisma.trade.findUnique({ where: { id: dispute.tradeId } })
    if (!trade) throw new NotFoundError('Trade', dispute.tradeId)
    if (requestedBy !== trade.buyerId && requestedBy !== trade.sellerId) {
      throw new ForbiddenError(`${requestedBy} is not a party to trade ${dispute.tradeId}`)
    }

    if (!this.arbitrationProvider.assignAppealPanel) {
      throw new ValidationError(
        `Appeals require ARBITRATION_MODE=market — ${this.arbitrationProvider.name} does not support appeal panels`
      )
    }

    const nextRound = dispute.appealRound + 1
    const newArbiterId = await this.arbitrationProvider.assignAppealPanel(
      disputeId,
      dispute.tradeId,
      nextRound,
      dispute.arbiterId ?? undefined
    )

    const escrow = await prisma.escrow.findUnique({ where: { id: dispute.escrowId } })
    const baseFee = escrow?.feeCharged ? Number(escrow.feeCharged) : 0
    const appealFeeRequired = (baseFee * APPEAL_FEE_MULTIPLIER).toFixed(8)

    // Real charge, not just a computed-and-returned number — closes the
    // gap this file's own header comment on APPEAL_FEE_MULTIPLIER used
    // to disclose ("this service does not itself collect payment").
    // resolveDispute() settles this row's outcome (FORFEITED/REFUNDED)
    // once the appeal panel rules. @@unique([disputeId, appealRound]) on
    // the model means a concurrent double-appeal for the same round
    // fails here with a real P2002 rather than double-charging.
    await prisma.disputeAppealFee.create({
      data: {
        disputeId,
        appealRound: nextRound,
        requestedBy,
        amount: appealFeeRequired,
        asset: (escrow?.asset ?? 'BTC') as AssetType,
      },
    })

    const updated = await prisma.dispute.update({
      where: { id: disputeId },
      data: {
        status: 'APPEALED',
        appealRound: nextRound,
        previousRuling: dispute.ruling,
        previousArbiterId: dispute.arbiterId,
        arbiterId: newArbiterId,
        ruling: null,
        resolvedAt: null,
      },
    })

    await eventBus.emit('dispute.appealed', {
      disputeId,
      settlementId: dispute.escrowId,
      tradeId: dispute.tradeId,
      round: nextRound,
      newArbiterId,
      previousArbiterId: dispute.arbiterId,
      triggeredBy: requestedBy,
    }, dispute.tradeId)

    return { dispute: updated, appealFeeRequired }
  }

  /**
   * RFC-021 D8 — either trade party may attach more evidence to their own
   * open dispute after it's been raised (raiseDispute()'s own `evidence`
   * param only covers what existed at open time). Finally makes
   * `DisputeStatus.EVIDENCE_SUBMITTED` reachable — it has existed in the
   * schema since the Dispute primitive was first built but no code path
   * ever produced it before this. Emits `dispute.evidence_submitted`,
   * which `common/events/handlers.ts` reacts to by attempting a QVAC
   * auto-resolution pass (config-gated, `qvacAutoResolutionEnabled`) —
   * this method itself has no QVAC dependency, matching this codebase's
   * module-boundary convention of reacting to events rather than one
   * module calling into another's service directly.
   */
  async submitEvidence(disputeId: string, submittedBy: string, descriptor: Pick<EvidenceDescriptor, 'type' | 'uri' | 'note'>) {
    const dispute = await prisma.dispute.findUnique({ where: { id: disputeId } })
    if (!dispute) throw new NotFoundError('Dispute', disputeId)

    const trade = await prisma.trade.findUnique({ where: { id: dispute.tradeId } })
    if (!trade) throw new NotFoundError('Trade', dispute.tradeId)
    if (submittedBy !== trade.buyerId && submittedBy !== trade.sellerId) {
      throw new ForbiddenError(`${submittedBy} is not a party to trade ${dispute.tradeId}`)
    }

    if (dispute.status !== 'OPENED' && dispute.status !== 'EVIDENCE_SUBMITTED') {
      throw new ValidationError(`Dispute ${disputeId} cannot accept new evidence from status ${dispute.status}`)
    }

    const entry: EvidenceDescriptor = { ...descriptor, submittedBy, submittedAt: new Date().toISOString() }
    const existing = Array.isArray(dispute.evidence) ? (dispute.evidence as unknown as EvidenceDescriptor[]) : []

    const updated = await prisma.dispute.update({
      where: { id: disputeId },
      data: { evidence: [...existing, entry] as unknown as object, status: 'EVIDENCE_SUBMITTED' },
    })

    await eventBus.emit('dispute.evidence_submitted', {
      disputeId,
      settlementId: dispute.escrowId,
      tradeId: dispute.tradeId,
      triggeredBy: submittedBy,
    }, dispute.tradeId)

    return updated
  }

  /**
   * RFC-021 D8 — called by the `dispute.evidence_submitted` event handler
   * once QVAC has produced a confident recommendation. Never called with
   * `recommendation: 'INCONCLUSIVE'` or below-threshold confidence — the
   * event handler filters those out before reaching here, so a dispute
   * simply stays on its normal human-arbiter path with no trace of a
   * failed automation attempt. The atomic claim below (same idiom
   * escrow.service.ts's lockFunds() established) means a human arbiter
   * who already resolved or appealed this dispute always wins the race —
   * this never overwrites a real decision, it can only ever act on a
   * dispute still genuinely open.
   */
  async proposeAutoResolution(disputeId: string, recommendation: 'RELEASE' | 'REFUND', confidence: number, reasoning: string) {
    const dispute = await prisma.dispute.findUnique({ where: { id: disputeId } })
    if (!dispute) throw new NotFoundError('Dispute', disputeId)

    const deadline = new Date(Date.now() + config.settlement.qvacAutoResolutionWindowHours * 3600 * 1000)

    const claim = await prisma.dispute.updateMany({
      where: { id: disputeId, status: { in: ['OPENED', 'EVIDENCE_SUBMITTED'] }, ruling: null },
      data: {
        status: 'AUTO_PROPOSED',
        autoResolutionRecommendation: recommendation,
        autoResolutionConfidence: confidence,
        autoResolutionReasoning: reasoning,
        autoResolutionDeadline: deadline,
      },
    })
    if (claim.count === 0) return null // lost the race to a real human decision — not an error

    await eventBus.emit('dispute.auto_resolution_proposed', {
      disputeId,
      settlementId: dispute.escrowId,
      tradeId: dispute.tradeId,
      recommendation,
      confidence,
      deadline: deadline.toISOString(),
      triggeredBy: 'qvac-auto',
    }, dispute.tradeId)

    return prisma.dispute.findUnique({ where: { id: disputeId } })
  }

  /**
   * RFC-021 D8 — either trade party can reject a proposed automated
   * ruling at any point before its deadline, forcing the dispute back
   * onto its already-assigned human arbiter (assigned back at
   * raiseDispute() time and never touched by the auto-resolution
   * attempt) — no new arbiter assignment needed, matching D1's "the
   * market/parties decide, not software unilaterally" framing.
   */
  async contestAutoResolution(disputeId: string, contestedBy: string) {
    const dispute = await prisma.dispute.findUnique({ where: { id: disputeId } })
    if (!dispute) throw new NotFoundError('Dispute', disputeId)

    const trade = await prisma.trade.findUnique({ where: { id: dispute.tradeId } })
    if (!trade) throw new NotFoundError('Trade', dispute.tradeId)
    if (contestedBy !== trade.buyerId && contestedBy !== trade.sellerId) {
      throw new ForbiddenError(`${contestedBy} is not a party to trade ${dispute.tradeId}`)
    }

    if (dispute.status !== 'AUTO_PROPOSED') {
      throw new ValidationError(`Dispute ${disputeId} has no pending automated resolution to contest (status: ${dispute.status})`)
    }
    if (dispute.autoResolutionDeadline && dispute.autoResolutionDeadline.getTime() < Date.now()) {
      throw new ValidationError(`Dispute ${disputeId}'s contest window has already closed`)
    }

    const updated = await prisma.dispute.update({
      where: { id: disputeId },
      data: {
        status: 'EVIDENCE_SUBMITTED',
        autoResolutionRecommendation: null,
        autoResolutionConfidence: null,
        autoResolutionReasoning: null,
        autoResolutionDeadline: null,
      },
    })

    await eventBus.emit('dispute.auto_resolution_contested', {
      disputeId,
      settlementId: dispute.escrowId,
      tradeId: dispute.tradeId,
      contestedBy,
      triggeredBy: contestedBy,
    }, dispute.tradeId)

    return updated
  }

  /**
   * RFC-021 D8 — the background sweep (app.ts, DISPUTE_AUTO_RESOLUTION_SWEEPER,
   * same pattern escrow.service.ts's sweepExpiredEscrows() established):
   * applies every AUTO_PROPOSED dispute's recommendation once its contest
   * window has closed uncontested. `triggeredBy` for the resulting
   * releaseFunds()/refundFunds() call is the dispute's own already-assigned
   * `arbiterId` — the SAME identity raiseDispute() assigned at open time —
   * so escrow.service.ts's isSellerOrAssignedArbiter() check is completely
   * untouched by this feature: no new kind of caller ever gains authority
   * to move funds, an already-authorized arbiter's slot is just exercised
   * automatically when they don't need to personally act. `autoResolved`
   * flags the row so the audit trail always shows whether the assigned
   * arbiter ruled personally or their slot auto-resolved. Deliberately does
   * NOT call recordRuling()/slash() (RFC-021 D3/D4) — those track a human
   * arbiter's own decision-making track record, which is not what happened
   * here.
   */
  async sweepExpiredAutoResolutions(): Promise<{ resolved: string[]; failed: Array<{ disputeId: string; error: string }> }> {
    const expired = await prisma.dispute.findMany({
      where: { status: 'AUTO_PROPOSED', autoResolutionDeadline: { lt: new Date() } },
    })

    const resolved: string[] = []
    const failed: Array<{ disputeId: string; error: string }> = []
    for (const dispute of expired) {
      try {
        if (!dispute.arbiterId) throw new ValidationError(`Dispute ${dispute.id} has an auto-proposed resolution but no assigned arbiterId`)
        if (!dispute.autoResolutionRecommendation) throw new ValidationError(`Dispute ${dispute.id} is AUTO_PROPOSED with no recommendation recorded`)

        // RELEASE needs a real crypto payout address, same disclosed gap
        // resolveDispute()'s own doc comment states: no field in this
        // schema stores a participant's payout address, so a human
        // arbiter calling resolveDispute() directly must be supplied one
        // externally (by the route caller/UI). There is no such caller
        // here — this sweep runs with nobody to ask — so a RELEASE
        // recommendation cannot be safely auto-applied yet. Thrown as a
        // real, visible failure (not silently skipped, not fabricated
        // from a participant id, which is NOT a crypto address) so it
        // surfaces in this method's own `failed` list and the dispute
        // stays AUTO_PROPOSED for its already-assigned human arbiter to
        // resolve normally. REFUND has no such gap — refundFunds()
        // returns collateral to the seller's own escrow, no external
        // address input needed.
        if (dispute.autoResolutionRecommendation === 'RELEASE') {
          throw new ValidationError(
            `Dispute ${dispute.id}: auto-applying a RELEASE recommendation needs a real payout address this system ` +
            'does not yet store for any participant — falling through to the assigned human arbiter instead of guessing one.'
          )
        }

        await this.applyRuling(dispute, dispute.autoResolutionRecommendation, undefined, dispute.arbiterId)
        await prisma.dispute.update({ where: { id: dispute.id }, data: { autoResolved: true } })
        resolved.push(dispute.id)
      } catch (err) {
        failed.push({ disputeId: dispute.id, error: err instanceof Error ? err.message : String(err) })
      }
    }
    return { resolved, failed }
  }
}

// Lazy singleton — constructed on first use, not at module load, so a
// deployment with neither arbitration mode configured can still boot and
// serve every other route/handler; only dispute-touching code paths fail,
// with a clear config error instead of the whole process refusing to
// start. Moved here (2026-08-02, RFC-021 D8) from settlement.routes.ts,
// which held the only previous copy — common/events/handlers.ts's new
// dispute.evidence_submitted reaction and app.ts's new sweeper interval
// both need the exact same instance a route handler would get, not a
// second, independently-constructed one.
//
// RFC-021 D2 — config.settlement.arbitrationMode picks between the two
// real ArbitrationProvider implementations: 'trusted-list' (RFC-007 D4's
// original, curated TRUSTED_ARBITRATORS allowlist) and 'market' (RFC-021's
// permissionless, collateral-and-reputation-weighted registry).
let disputeServiceInstance: DisputeService | null = null
export function getDisputeService(): DisputeService {
  if (!disputeServiceInstance) {
    if (config.settlement.arbitrationMode === 'market') {
      disputeServiceInstance = new DisputeService(marketArbitrationProvider)
    } else {
      if (config.settlement.trustedArbitrators.length === 0) {
        throw new ValidationError('No trusted arbitrators configured — set TRUSTED_ARBITRATORS (RFC-007 D4)')
      }
      disputeServiceInstance = new DisputeService(new TrustedArbitratorProvider(config.settlement.trustedArbitrators))
    }
  }
  return disputeServiceInstance
}
