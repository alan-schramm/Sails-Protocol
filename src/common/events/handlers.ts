import { prisma } from '../database'
import type { Prisma } from '@prisma/client'
import { eventBus } from './event-bus'
import { reconciliationService } from '../../modules/open-p2p/reconciliation.service'
import { reputationService } from '../../modules/open-reputation/reputation.service'
import { vouchService } from '../../modules/open-reputation/vouch.service'
import { broadcastToTrade } from '../../modules/open-p2p/chat-room-registry'
import { executeSettlement } from '../../modules/open-settlement/settlement-orchestrator'
import { wdkSettlementProvider, buyerIndexFor } from '../../modules/open-settlement/wdk-settlement.provider'
import { intentEngine } from '../../core/intent-engine'
import { config } from '../../config'
import { escrowsCreatedTotal, escrowsReleasedTotal, escrowsRefundedTotal, disputesOpenedTotal } from '../metrics'

// RFC-018 — 'system:trade-lifecycle' for every Intent transition this
// dispatcher drives on a trade's behalf, matching the existing
// 'system:expiry-check' sentinel convention (core/intent-engine.ts's
// own expiry transitions) for system-triggered, non-participant events.
const INTENT_LIFECYCLE_TRIGGER = 'system:trade-lifecycle'

/**
 * Sails Protocol — Coordination Protocol (Event Handlers)
 *
 * This file is the ONLY place where cross-module reactions happen.
 * No module ever imports another module's service directly — they only
 * emit events (see event-bus.ts) and this dispatcher reacts to them.
 *
 * Ownership map (who reacts to what, and why):
 *   - settlement.escrow.created   → OpenP2P reacts (Trade.escrowId = escrow.id
 *                                   — the FK escrow.service.ts's own module-
 *                                   boundary rule forbids it from writing itself)
 *   - settlement.escrow.locked    → OpenP2P reacts (Trade.status = ACTIVE)
 *   - settlement.escrow.released  → OpenP2P reacts (Trade.status = COMPLETED)
 *                                   OpenReputation reacts (increment stats,
 *                                   recordOutcome() — dispute-aware, see below;
 *                                   RFC-021 D7 — burns the losing seller's
 *                                   active vouch, if any, on a dispute loss)
 *   - settlement.escrow.disputed  → OpenP2P reacts (Trade.status = DISPUTED)
 *   - settlement.escrow.refunded  → OpenP2P reacts (Trade.status = CANCELLED)
 *                                   OpenReputation reacts (recordOutcome() —
 *                                   dispute-aware, see below; RFC-021 D7 —
 *                                   same vouch-burn reaction, for the buyer)
 *   - settlement.escrow.split     → OpenP2P reacts (Trade.status = COMPLETED
 *                                   — RFC-021 D9, only ever a dispute
 *                                   outcome, no happy-path equivalent)
 *                                   OpenReputation reacts (recordOutcome()
 *                                   NEUTRAL for both — no vouch burned,
 *                                   see that handler's own comment)
 *   - peer.connected              → OpenP2P reacts (RFC-011: reconcile every
 *                                   active trade shared with the peer that
 *                                   just (re)connected against Postgres, the
 *                                   authoritative source a dropped P2P
 *                                   message never actually lost data from)
 *   - openp2p.message.sent        → OpenP2P reacts (pushes NEW_MESSAGE to
 *                                   every WS-connected chat-room member for
 *                                   that trade — chat-unification pass, see
 *                                   chat-room-registry.ts's doc comment.
 *                                   Both chat.routes.ts's WS route and
 *                                   negotiation.service.ts's HumanChatChannel
 *                                   emit this same event after persisting a
 *                                   Message, so this is the one place either
 *                                   transport's messages reach WS clients)
 *   - openp2p.message.sent        → OpenAgents reacts, ONLY when
 *                                   config.features.socialEngineeringDetection
 *                                   is true (default false — real QVAC call
 *                                   per message, not free): SocialEngineering
 *                                   Agent.evaluate() (RFC-007 D7, real as of
 *                                   RFC-017) scores the message for
 *                                   off_channel_migration/payment_instruction_
 *                                   change; a non-null signal is re-emitted as
 *                                   agents.social_engineering.risk_detected,
 *                                   which chat.routes.ts broadcasts as a
 *                                   RISK_WARNING to the trade's WS room —
 *                                   detection only, never an automatic action.
 *   - openp2p.trade.created        → OpenSettlement reacts, ONLY when
 *                                   config.features.autoSettleOnMatch is
 *                                   true (default false — see config's own
 *                                   comment): calls settlement-orchestrator.ts's
 *                                   executeSettlement(), the real end-to-end
 *                                   escrow-lock -> emulated-PIX-receipt ->
 *                                   signed-WDK-release sequence. This is
 *                                   "the P2P engine giving Match" in this
 *                                   codebase's actually-built code — the
 *                                   Intent Engine's own MATCHED state has
 *                                   no real matching engine wired to it yet.
 *
 * RFC-007 D8/D9's Outcome Engine, applied at the settlement.escrow.released/
 * refunded handlers below: the same fund movement (release or refund) means
 * something different depending on how the trade got there. A plain happy-
 * path completion/cancellation is Positive/Neutral for both parties; a
 * dispute RELEASE/REFUND ruling means one party won and the other lost —
 * checked here via a resolved Dispute row for the trade, since the escrow
 * event payload itself doesn't carry that context.
 *
 * NOTE: In this reference implementation, OpenP2P's Trade-status writes
 * below still happen directly in this dispatcher rather than through a
 * `tradeService.markActive()`-style call — trade.service.ts (added in the
 * route-restoration pass) owns Trade *creation*, not yet these reactive
 * status transitions. Moving them there is a clean, low-risk follow-up,
 * not done in this pass to keep the diff scoped to what OpenReputation
 * actually needed.
 */

// ─── Shared helpers ─────────────────────────────────────────────────────────────
// Extracted from the inline blocks below (escrow.released/refunded both ran
// the same 2x user.update for totalTrades/totalVolumeBtc; both ran the same
// `if (resolved) X else Y` dispute-aware branch; both ran the same final
// intent transition walk). One source of truth keeps each behavior consistent
// and lets the "did this settlement come from a dispute?" rule evolve in one
// place — the same Outcome Engine concept RFC-007 D8/D9 introduces for the
// reputation side.

/** Increments totalTrades + totalVolumeBtc for both sides — used by every
 *  trade-completion path (release, split, and any future non-disputed
 *  settlement). trade.amount is already a Prisma.Decimal.
 *
 *  Deliberately sequential (await + await, not Promise.all) — the existing
 *  test suite in tests/reputationOutcome.test.ts asserts on call order via
 *  `mockUserUpdate.mock.calls.filter(...)`, and matching the original
 *  implementation's call sequence keeps that contract visible. With one
 *  real DB query per side this isn't a hot enough path to need parallelism. */
async function recordTradeCompletion(buyerId: string, sellerId: string, amount: Prisma.Decimal): Promise<void> {
  await prisma.user.update({
    where: { id: buyerId },
    data: { totalTrades: { increment: 1 }, totalVolumeBtc: { increment: amount } },
  })
  await prisma.user.update({
    where: { id: sellerId },
    data: { totalTrades: { increment: 1 }, totalVolumeBtc: { increment: amount } },
  })
}

/** Walks a successful Intent through SETTLING → FULFILLED in one place.
 *  Idempotent against both legs — a re-delivered durable event hits a
 *  state-machine guard inside intent-engine.ts and no-ops, so this
 *  helper is safe to call from every completion path without a
 *  per-handler try/catch dance. */
async function fulfillIntent(intentId: string, escrowId: string, outcome: 'RELEASED' | 'SPLIT'): Promise<void> {
  await intentEngine.transition(
    intentId, 'SETTLING', INTENT_LIFECYCLE_TRIGGER, 'intent.settling',
    { intentId, settlementId: escrowId }
  )
  await intentEngine.transition(
    intentId, 'FULFILLED', INTENT_LIFECYCLE_TRIGGER, 'intent.fulfilled',
    { intentId, settlementId: escrowId, outcome }
  )
}

/** RFC-021 D4, Phase 3 — split the cost-to-fabricate-reputation floor
 *  between both parties whenever the protocol fee was actually charged.
 *  No-op when feeCharged is null/0 (the bootstrap-phase default).
 *
 *  Sequential, not Promise.all, for the same call-order contract
 *  recordTradeCompletion()'s own comment explains. */
async function accrueFeeFloor(buyerId: string, sellerId: string, feeCharged: Prisma.Decimal | null | undefined): Promise<void> {
  if (!feeCharged) return
  await prisma.user.update({
    where: { id: buyerId },
    data: { cumulativeFeesObserved: { increment: feeCharged } },
  })
  await prisma.user.update({
    where: { id: sellerId },
    data: { cumulativeFeesObserved: { increment: feeCharged } },
  })
}

/** Outcome Engine for the released path (RFC-007 D8): a RELEASE ruling means
 *  the buyer won and the seller lost; a plain release (no dispute) means
 *  both parties completed cleanly. RFC-021 D7 — the losing seller's active
 *  vouches (if any) get burned via vouchService, applying the same
 *  "skin-in-the-game" reasoning D3 uses for arbiters to peer vouches. */
async function applyReleaseOutcomes(tradeId: string, buyerId: string, sellerId: string): Promise<void> {
  const resolvedRelease = await prisma.dispute.findFirst({
    where: { tradeId, status: 'RESOLVED', ruling: 'RELEASE' },
  })
  if (resolvedRelease) {
    await reputationService.recordOutcome(tradeId, buyerId, 'POSITIVE')
    await reputationService.recordOutcome(tradeId, sellerId, 'NEGATIVE')
    // RFC-021 D7 — the seller lost this dispute; if a peer vouched for
    // them and that vouch is still active (their first-ever trade), the
    // trust was misplaced and the voucher's own reputation takes the
    // real hit this file's own vouch.service.ts import exists for.
    await vouchService.burnVouchesFor(sellerId)
  } else {
    await reputationService.recordOutcome(tradeId, buyerId, 'POSITIVE')
    await reputationService.recordOutcome(tradeId, sellerId, 'POSITIVE')
  }
}

/** Outcome Engine for the refunded path (RFC-007 D9): a REFUND ruling means
 *  the seller won and the buyer lost; a plain refund with no dispute ever
 *  raised is a mutual cancellation — always Neutral, never Negative, for
 *  either party. RFC-021 D7 — same vouch-burn reasoning as released, for
 *  the buyer instead of the seller.
 *
 *  Returns the resolved Dispute row (or null) so the caller can branch on
 *  "did this come from a dispute ruling?" for the Intent FAILED transition's
 *  `reason` field — same as the original inline implementation did. */
async function applyRefundOutcomes(tradeId: string, buyerId: string, sellerId: string): Promise<{ id: string } | null> {
  const resolvedRefund = await prisma.dispute.findFirst({
    where: { tradeId, status: 'RESOLVED', ruling: 'REFUND' },
  })
  if (resolvedRefund) {
    await reputationService.recordOutcome(tradeId, sellerId, 'POSITIVE')
    await reputationService.recordOutcome(tradeId, buyerId, 'NEGATIVE')
    // RFC-021 D7 — same reasoning as settlement.escrow.released above, for the buyer.
    await vouchService.burnVouchesFor(buyerId)
  } else {
    await reputationService.recordOutcome(tradeId, buyerId, 'NEUTRAL')
    await reputationService.recordOutcome(tradeId, sellerId, 'NEUTRAL')
  }
  return resolvedRefund
}

export function registerEventHandlers(): void {
  // ── Sails OpenP2P reacts to settlement state changes ────────────────────────

  // Gap found while investigating a CTO-role follow-up ("disputa durante
  // negociação" — RFC-018 failure-scenario coverage): escrow.service.ts's
  // createEscrow() emits settlement.escrow.created but, per this file's own
  // module-boundary rule (OpenSettlement may read Trade, never write it),
  // never sets Trade.escrowId itself — and nothing else did either. That
  // left Trade.escrowId permanently null in the real (non-mocked) flow,
  // which meant dispute.service.ts's raiseDispute() guard
  // (`if (!trade.escrowId) throw ...`) rejected every dispute unconditionally,
  // for a trade in any status. Not merely "disputes during negotiation are
  // blocked" — disputes were blocked, period. This handler is the missing
  // reaction, matching the same pattern as settlement.escrow.locked below.
  eventBus.on('settlement.escrow.created', async (payload) => {
    await prisma.trade.update({
      where: { id: payload.tradeId },
      data: { escrowId: payload.escrowId },
    })
    escrowsCreatedTotal.inc()
  })

  // CTO_DUE_DILIGENCE_REPORT.md B-OPS-01 — the business-counter half of
  // metrics.ts's own comment: a real dispute count over time, independent
  // of whatever HTTP route happened to trigger it.
  eventBus.on('dispute.opened', async () => {
    disputesOpenedTotal.inc()
  })

  eventBus.on('settlement.escrow.locked', async (payload) => {
    const trade = await prisma.trade.update({
      where: { id: payload.tradeId },
      data: { status: 'ACTIVE' },
    })

    // RFC-018 — "05 ESCROW LOCKED" is PROTOCOL_SPECIFICATION.md §3.1's
    // own mapping for the Intent Engine's COMMITTED state ("terms
    // agreed, settlement requested"), not trade creation itself —
    // trade.service.ts's createTrade() only walks the Intent to
    // NEGOTIATING; escrow actually locking is what "terms agreed,
    // settlement requested" means for OpenP2P. Skipped for any Trade
    // created before this RFC landed (intentId null). `terms: null` —
    // AgreedTerms (PROTOCOL_SPECIFICATION.md §1.4) lives only in
    // negotiation.service.ts's in-memory state today, not persisted
    // anywhere this handler can read; not fabricated here.
    if (trade.intentId) {
      await intentEngine.transition(
        trade.intentId, 'COMMITTED', INTENT_LIFECYCLE_TRIGGER, 'intent.committed',
        { intentId: trade.intentId, settlementId: payload.escrowId, terms: null }
      )
    }
  })

  eventBus.on('settlement.escrow.released', async (payload) => {
    const trade = await prisma.trade.update({
      where: { id: payload.tradeId },
      data: { status: 'COMPLETED', completedAt: new Date() },
    })

    escrowsReleasedTotal.inc()

    // ── Sails OpenReputation reacts to a completed trade ──────────────────────
    await recordTradeCompletion(trade.buyerId, trade.sellerId, trade.amount)

    // RFC-021 D4, Phase 3 — the cost-to-fabricate-reputation floor.
    const releasedEscrow = await prisma.escrow.findUnique({ where: { id: payload.escrowId } })
    await accrueFeeFloor(trade.buyerId, trade.sellerId, releasedEscrow?.feeCharged)

    await eventBus.emit('openp2p.trade.completed', {
      tradeId: payload.tradeId,
      from: 'ACTIVE',
      to: 'COMPLETED',
      triggeredBy: payload.triggeredBy,
    }, payload.tradeId)   // correlationId (RFC-010)

    // RFC-007 D8 Outcome Engine — dispute-aware, per this file's own doc
    // comment above. A RELEASE ruling means the buyer won and the seller
    // lost, even though funds moved the exact same way a happy-path
    // completion does.
    await applyReleaseOutcomes(payload.tradeId, trade.buyerId, trade.sellerId)

    // RFC-018 — "released" always means the buyer got the asset, whether
    // via the happy path or a dispute RELEASE ruling; from the Intent's
    // own perspective (did this Intent's goal get fulfilled?) that's
    // always a success, independent of who Reputation credits/penalizes
    // above. SETTLING is walked through immediately before FULFILLED
    // rather than at markPaymentSent() time — a real, scoped
    // refinement, not this pass's scope (see RFC-018's own
    // Implementation Impact).
    if (trade.intentId) {
      await fulfillIntent(trade.intentId, payload.escrowId, 'RELEASED')
    }
  })

  eventBus.on('settlement.escrow.disputed', async (payload) => {
    await prisma.trade.update({
      where: { id: payload.tradeId },
      data: { status: 'DISPUTED' },
    })

    await eventBus.emit('openp2p.trade.disputed', {
      tradeId: payload.tradeId,
      from: 'ACTIVE',
      to: 'DISPUTED',
      triggeredBy: payload.triggeredBy,
    }, payload.tradeId)   // correlationId (RFC-010)
  })

  eventBus.on('settlement.escrow.refunded', async (payload) => {
    const trade = await prisma.trade.update({
      where: { id: payload.tradeId },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    })

    escrowsRefundedTotal.inc()

    // Same dispute-aware check as settlement.escrow.released above. A
    // REFUND ruling means the seller won and the buyer lost; a plain
    // refund with no dispute ever raised is a mutual cancellation —
    // RFC-007 D9's rule: always Neutral, never Negative, for either party.
    // The helper resolves the Dispute once and owns the per-outcome branch
    // (including the vouch-burn on a real dispute) — see its own doc.
    const resolvedRefund = await applyRefundOutcomes(payload.tradeId, trade.buyerId, trade.sellerId)

    // RFC-018 — a refund, disputed or not, means the buyer never got the
    // asset: the Intent's own goal was not fulfilled. FAILED is a valid
    // direct transition from both COMMITTED and SETTLING
    // (core/state-machine.ts), so this doesn't need to know which one
    // the Intent is currently in.
    if (trade.intentId) {
      await intentEngine.transition(
        trade.intentId, 'FAILED', INTENT_LIFECYCLE_TRIGGER, 'intent.failed',
        { intentId: trade.intentId, reason: resolvedRefund ? 'Escrow refunded per dispute ruling' : 'Escrow refunded' }
      )
    }
  })

  // RFC-021 D9 (2026-08-02) — SPLIT only ever reaches an escrow via a
  // dispute ruling (§1.9's third option), unlike released/refunded above
  // which each also have a happy, non-disputed path — so there's no
  // "was this actually disputed?" branch to make here, and no clean
  // winner/loser to score: the arbiter decided both parties share the
  // outcome, not that one of them lost. Reputation is NEUTRAL for both
  // (same "always Neutral, never Negative" precedent RFC-007 D9 already
  // sets for a plain refund) and no vouch is burned on either side —
  // burning one would misapply RFC-021 D7's "the vouched-for party
  // clearly lost" reasoning to an outcome that isn't a clear loss.
  // Trade/Intent classification (a real, disclosed judgment call, made
  // with the project owner 2026-08-02 — TradeStatus/IntentStatus only
  // have binary terminal states, no partial-outcome value exists):
  // COMPLETED/FULFILLED, since real funds did leave the escrow via a
  // real settlement action, the same trigger released's own COMPLETED/
  // FULFILLED classification rests on.
  eventBus.on('settlement.escrow.split', async (payload) => {
    const trade = await prisma.trade.update({
      where: { id: payload.tradeId },
      data: { status: 'COMPLETED', completedAt: new Date() },
    })

    await recordTradeCompletion(trade.buyerId, trade.sellerId, trade.amount)

    await reputationService.recordOutcome(payload.tradeId, trade.buyerId, 'NEUTRAL')
    await reputationService.recordOutcome(payload.tradeId, trade.sellerId, 'NEUTRAL')

    await eventBus.emit('openp2p.trade.completed', {
      tradeId: payload.tradeId,
      from: 'DISPUTED',
      to: 'COMPLETED',
      triggeredBy: payload.triggeredBy,
    }, payload.tradeId)

    if (trade.intentId) {
      await fulfillIntent(trade.intentId, payload.escrowId, 'SPLIT')
    }
  })

  // ── Sails OpenReputation reacts to disputes (penalize dispute count) ───────
  eventBus.on('openp2p.trade.disputed', async (payload) => {
    const trade = await prisma.trade.findUnique({ where: { id: payload.tradeId } })
    if (!trade) return
    // Sequential for the same call-order contract the helpers above
    // preserve — tests/reputationOutcome.test.ts and tests/routes.test.ts
    // both filter mockUserUpdate.mock.calls in the order they fire.
    await prisma.user.update({
      where: { id: trade.buyerId },
      data: { disputeCount: { increment: 1 } },
    })
    await prisma.user.update({
      where: { id: trade.sellerId },
      data: { disputeCount: { increment: 1 } },
    })
  })

  // ── Sails OpenSettlement: QVAC-assisted dispute auto-resolution (RFC-021 D8) ──
  // Off by default (config.settlement.qvacAutoResolutionEnabled) — a real
  // QVAC call per evidence submission is real latency and real
  // model-inference cost, same reasoning socialEngineeringDetection's own
  // handler above already established. Uses onDurable() for the same
  // reason that handler does: this must survive a process restart between
  // evidence being submitted and QVAC finishing its analysis, not be lost
  // if it raced a redeploy. qvac-agent.provider.ts and dispute.service.ts
  // are both required lazily, after the flag check — the QVAC one
  // transitively imports the real @qvac/sdk (ESM-only), the same "don't
  // make every test mock this" reasoning the social-engineering handler's
  // own comment explains.
  //
  // Deliberately payment-method-agnostic (project owner, 2026-08-02): the
  // trade's own real PaymentMethod is passed through as-is, never assumed
  // to be any specific rail.
  eventBus.onDurable('dispute.evidence_submitted', async (event) => {
    if (!config.settlement.qvacAutoResolutionEnabled) return

    try {
      const payload = event.payload as { disputeId: string; tradeId: string }
      const dispute = await prisma.dispute.findUnique({ where: { id: payload.disputeId } })
      if (!dispute || dispute.status === 'RESOLVED' || dispute.status === 'AUTO_PROPOSED' || dispute.status === 'APPEALED') return

      // paymentMethod lives on Offer, not Trade — Trade only copies
      // asset/amount at creation time (this model's own field list).
      const trade = await prisma.trade.findUnique({ where: { id: payload.tradeId }, include: { offer: true } })
      if (!trade) return

      const evidence = Array.isArray(dispute.evidence) ? (dispute.evidence as unknown as Array<{ type: string; note?: string; submittedBy: string }>) : []
      if (evidence.length === 0) return // nothing for QVAC to assess yet

      const { qvacAgentProvider } = require('../../modules/open-agents/qvac-agent.provider') // eslint-disable-line @typescript-eslint/no-var-requires
      const assessment = await qvacAgentProvider.assessDisputeEvidence({
        paymentMethod: trade.offer.paymentMethod,
        asset: trade.asset,
        amount: trade.amount.toString(),
        reason: dispute.reason,
        evidence: evidence.map((e) => ({
          type: e.type,
          note: e.note,
          submittedBy: e.submittedBy === trade.buyerId ? 'buyer' as const : 'seller' as const,
        })),
      })

      if (
        assessment.recommendation === 'INCONCLUSIVE' ||
        assessment.confidence < config.settlement.qvacAutoResolutionConfidenceThreshold
      ) {
        return // falls straight through to the already-assigned human arbiter, unchanged
      }

      const { getDisputeService } = require('../../modules/open-settlement/dispute.service') // eslint-disable-line @typescript-eslint/no-var-requires
      await getDisputeService().proposeAutoResolution(
        payload.disputeId,
        assessment.recommendation,
        assessment.confidence,
        assessment.reasoning
      )
    } catch (err) {
      console.error(`[handlers] qvacAutoResolution failed for dispute event ${event.eventId}:`, err instanceof Error ? err.message : err)
    }
  })

  // ── Sails OpenP2P reacts to a peer reconnecting (RFC-011) ──────────────────
  eventBus.on('peer.connected', async (payload) => {
    // Only a real two-party handshake (pear.service.ts's handleNewConnection)
    // carries localUserId — the self-node-start peer.connected has no
    // counterparty to reconcile against.
    if (!payload.localUserId) return

    const results = await reconciliationService.reconcilePeerPair(payload.localUserId, payload.userId)
    for (const result of results) {
      await eventBus.emit('negotiation.reconciled', {
        tradeId: result.tradeId,
        currentTradeStatus: result.currentTradeStatus,
        currentEscrowStatus: result.currentEscrowStatus,
        missedMessageCount: result.missedMessages.length,
      }, result.tradeId)   // correlationId (RFC-010)
    }
  })

  // ── Sails OpenP2P: chat transport unification ──────────────────────────────
  // The single place NEW_MESSAGE reaches WS-connected clients, regardless of
  // whether the message was sent via chat.routes.ts's WS route or via
  // negotiation.service.ts's HumanChatChannel over Pears — both emit this
  // same event after persisting to Message. See chat-room-registry.ts's doc
  // comment for what this does NOT cover (WS-origin messages aren't relayed
  // onto Pears — that direction stays HumanChatChannel-only).
  eventBus.on('openp2p.message.sent', (payload) => {
    broadcastToTrade(payload.tradeId, { type: 'NEW_MESSAGE', payload })
  })

  // ── Sails OpenAgents: Social Engineering Agent (RFC-007 D7 / RFC-017) ──────
  // Off by default (config.features.socialEngineeringDetection) — a real
  // QVAC call per chat message is real latency and real model-inference
  // cost, not something every deployment should pay for unconditionally.
  // Uses onDurable() (not on()) because evaluate() needs the message's
  // real eventId/publishedAt to build a TimelineEntry, per D7's own
  // interface — never awaited into whatever triggered the message send,
  // same "a detection failure must not break the thing it's watching"
  // philosophy as autoSettleOnMatch's handler below.
  //
  // social-engineering-agent.ts is required lazily, after the flag check,
  // not imported at the top of this file — it transitively imports the
  // real @qvac/sdk (ESM-only), which every test that imports app.ts would
  // otherwise need to mock (tests/walletAgents.test.ts's own jest.mock
  // is why that pattern exists at all). This way @qvac/sdk is only ever
  // touched when the feature is actually turned on.
  eventBus.onDurable('openp2p.message.sent', async (event) => {
    if (!config.features.socialEngineeringDetection) return

    try {
      const { socialEngineeringAgent } = require('../../modules/open-agents/social-engineering-agent') // eslint-disable-line @typescript-eslint/no-var-requires
      const signal = await socialEngineeringAgent.evaluate({
        eventId: event.eventId,
        eventType: event.eventName,
        occurredAt: event.publishedAt,
        payload: event.payload,
      })
      if (!signal) return

      await eventBus.emit('agents.social_engineering.risk_detected', {
        tradeId: signal.correlationId,
        pattern: signal.pattern,
        riskScore: signal.riskScore,
        reasoning: signal.reasoning,
        sourceEventId: signal.sourceEventId,
        detectedAt: signal.detectedAt,
      }, signal.correlationId)   // correlationId (RFC-010) = tradeId
    } catch (err) {
      console.error(`[handlers] socialEngineeringDetection failed for message ${event.eventId}:`, err instanceof Error ? err.message : err)
    }
  })

  // ── Sails OpenSettlement reacts to a Match (openp2p.trade.created) ────────
  // Off by default (config.features.autoSettleOnMatch) — this event fires
  // for every real trade in this codebase, not only agent-driven demo
  // trades, so unconditional auto-release would silently bypass the
  // negotiation/dispute-window design (Escrow.timelockHours). Deliberately
  // not awaited into the emit() call site in trade.service.ts — a
  // settlement failure here must not make Trade creation itself fail.
  eventBus.on('openp2p.trade.created', async (payload) => {
    if (!config.features.autoSettleOnMatch) return

    try {
      const buyerAddress = await wdkSettlementProvider.getAccountAddress(buyerIndexFor(payload.buyerId))
      await executeSettlement({ tradeId: payload.tradeId, buyerReceivingAddress: buyerAddress })
    } catch (err) {
      console.error(`[handlers] autoSettleOnMatch failed for trade ${payload.tradeId}:`, err instanceof Error ? err.message : err)
    }
  })
}
