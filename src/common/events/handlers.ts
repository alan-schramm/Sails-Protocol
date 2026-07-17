import { prisma } from '../database'
import { eventBus } from './event-bus'
import { reconciliationService } from '../../modules/open-p2p/reconciliation.service'
import { reputationService } from '../../modules/open-reputation/reputation.service'
import { broadcastToTrade } from '../../modules/open-p2p/chat-room-registry'

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
}
