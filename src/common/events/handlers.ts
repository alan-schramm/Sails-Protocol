import { prisma } from '../database'
import { eventBus } from './event-bus'
import { reconciliationService } from '../../modules/open-p2p/reconciliation.service'
import { reputationService } from '../../modules/open-reputation/reputation.service'
import { broadcastToTrade } from '../../modules/open-p2p/chat-room-registry'
import { executeSettlement } from '../../modules/open-settlement/settlement-orchestrator'
import { wdkSettlementProvider, buyerIndexFor } from '../../modules/open-settlement/wdk-settlement.provider'
import { config } from '../../config'

/**
 * Sails Protocol — Coordination Protocol (Event Handlers)
 *
 * This file is the ONLY place where cross-module reactions happen.
 * No module ever imports another module's service directly — they only
 * emit events (see event-bus.ts) and this dispatcher reacts to them.
 *
 * Ownership map (who reacts to what, and why):
 *   - settlement.escrow.locked    → OpenP2P reacts (Trade.status = ACTIVE)
 *   - settlement.escrow.released  → OpenP2P reacts (Trade.status = COMPLETED)
 *                                   OpenReputation reacts (increment stats,
 *                                   recordOutcome() — dispute-aware, see below)
 *   - settlement.escrow.disputed  → OpenP2P reacts (Trade.status = DISPUTED)
 *   - settlement.escrow.refunded  → OpenP2P reacts (Trade.status = CANCELLED)
 *                                   OpenReputation reacts (recordOutcome() —
 *                                   dispute-aware, see below)
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

export function registerEventHandlers(): void {
  // ── Sails OpenP2P reacts to settlement state changes ────────────────────────
  eventBus.on('settlement.escrow.locked', async (payload) => {
    await prisma.trade.update({
      where: { id: payload.tradeId },
      data: { status: 'ACTIVE' },
    })
  })

  eventBus.on('settlement.escrow.released', async (payload) => {
    const trade = await prisma.trade.update({
      where: { id: payload.tradeId },
      data: { status: 'COMPLETED', completedAt: new Date() },
    })

    // ── Sails OpenReputation reacts to a completed trade ──────────────────────
    await prisma.user.update({
      where: { id: trade.buyerId },
      data: { totalTrades: { increment: 1 }, totalVolumeBtc: { increment: trade.amount } },
    })
    await prisma.user.update({
      where: { id: trade.sellerId },
      data: { totalTrades: { increment: 1 }, totalVolumeBtc: { increment: trade.amount } },
    })

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
    const resolvedRelease = await prisma.dispute.findFirst({
      where: { tradeId: payload.tradeId, status: 'RESOLVED', ruling: 'RELEASE' },
    })
    if (resolvedRelease) {
      await reputationService.recordOutcome(payload.tradeId, trade.buyerId, 'POSITIVE')
      await reputationService.recordOutcome(payload.tradeId, trade.sellerId, 'NEGATIVE')
    } else {
      await reputationService.recordOutcome(payload.tradeId, trade.buyerId, 'POSITIVE')
      await reputationService.recordOutcome(payload.tradeId, trade.sellerId, 'POSITIVE')
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

    // Same dispute-aware check as settlement.escrow.released above. A
    // REFUND ruling means the seller won and the buyer lost; a plain
    // refund with no dispute ever raised is a mutual cancellation —
    // RFC-007 D9's rule: always Neutral, never Negative, for either party.
    const resolvedRefund = await prisma.dispute.findFirst({
      where: { tradeId: payload.tradeId, status: 'RESOLVED', ruling: 'REFUND' },
    })
    if (resolvedRefund) {
      await reputationService.recordOutcome(payload.tradeId, trade.sellerId, 'POSITIVE')
      await reputationService.recordOutcome(payload.tradeId, trade.buyerId, 'NEGATIVE')
    } else {
      await reputationService.recordOutcome(payload.tradeId, trade.buyerId, 'NEUTRAL')
      await reputationService.recordOutcome(payload.tradeId, trade.sellerId, 'NEUTRAL')
    }
  })

  // ── Sails OpenReputation reacts to disputes (penalize dispute count) ───────
  eventBus.on('openp2p.trade.disputed', async (payload) => {
    const trade = await prisma.trade.findUnique({ where: { id: payload.tradeId } })
    if (!trade) return
    await prisma.user.update({
      where: { id: trade.buyerId },
      data: { disputeCount: { increment: 1 } },
    })
    await prisma.user.update({
      where: { id: trade.sellerId },
      data: { disputeCount: { increment: 1 } },
    })
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
