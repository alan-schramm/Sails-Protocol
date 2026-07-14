import { prisma } from '../database'
import { eventBus } from './event-bus'

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
 *                                   OpenReputation reacts (increment stats)
 *   - settlement.escrow.disputed  → OpenP2P reacts (Trade.status = DISPUTED)
 *   - settlement.escrow.refunded  → OpenP2P reacts (Trade.status = CANCELLED)
 *
 * NOTE: In this reference implementation, OpenP2P and OpenReputation do not
 * yet have their own dedicated service files in this fragment of the
 * codebase (only OpenSettlement, OpenIdentity/Pears transport and
 * OpenLiquidity are present). The reactions below are written as this
 * dispatcher's own responsibility for now. When trade.service.ts and
 * reputation.service.ts are restored, move the Prisma calls below into
 * those services and have this file call `tradeService.markActive(...)`
 * etc. instead of touching Prisma directly — that is the correct end
 * state per the Protocol Spec vs Reference Implementation separation.
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

    eventBus.emit('openp2p.trade.completed', {
      tradeId: payload.tradeId,
      from: 'ACTIVE',
      to: 'COMPLETED',
      triggeredBy: payload.triggeredBy,
    })
  })

  eventBus.on('settlement.escrow.disputed', async (payload) => {
    await prisma.trade.update({
      where: { id: payload.tradeId },
      data: { status: 'DISPUTED' },
    })

    eventBus.emit('openp2p.trade.disputed', {
      tradeId: payload.tradeId,
      from: 'ACTIVE',
      to: 'DISPUTED',
      triggeredBy: payload.triggeredBy,
    })
  })

  eventBus.on('settlement.escrow.refunded', async (payload) => {
    await prisma.trade.update({
      where: { id: payload.tradeId },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    })
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
}
