/**
 * Sails OpenP2P — Reconciliation Service (RFC-011,
 * rfcs/RFC-011-p2p-reconciliation.md)
 *
 * The CISO audit's finding: HyperDHT/Pears (src/infrastructure/p2p) can
 * drop or delay messages, but Postgres already recorded the authoritative
 * state — every HumanChatChannel.sendEvent() call persists to `Message`
 * regardless of whether the P2P send actually reached the counterparty
 * (negotiation.service.ts's own comment already documents this: "a failed
 * send is persisted for redelivery — not silently dropped"). What was
 * missing was the redelivery itself: nothing re-synced a client's view
 * once the P2P connection that dropped a message came back.
 *
 * This service is the source of that catch-up. It does not replay over
 * P2P — it reads the same Postgres tables the HTTP API already exposes
 * (Trade, Escrow, Message), which is deliberately the same authoritative
 * source both trade counterparties' clients already depend on, not a
 * second copy of the truth.
 */
import { prisma } from '../../common/database'
import { NotFoundError } from '../../common/errors'

export interface ReconciliationResult {
  tradeId: string
  currentTradeStatus: string
  currentEscrowStatus: string | null
  missedMessages: Array<{
    id: string
    senderId: string
    content: string
    msgType: string
    createdAt: Date
  }>
}

// Trades still in a live negotiation/settlement window — reconciling a
// COMPLETED/DISPUTED/CANCELLED trade has nothing left to catch up on.
const ACTIVE_TRADE_STATUSES = ['PENDING', 'ACTIVE'] as const

export class ReconciliationService {
  // sinceMessageCreatedAt is optional and unused by the automatic
  // peer.connected trigger below (the server doesn't know what a client
  // already cached) — it exists for a future HTTP endpoint
  // (POST /v1/openp2p/trades/:id/reconcile) where the client supplies its
  // own last-seen cursor and gets back only the true delta.
  async reconcileTrade(tradeId: string, sinceMessageCreatedAt: Date | null = null): Promise<ReconciliationResult> {
    const trade = await prisma.trade.findUnique({
      where: { id: tradeId },
      include: { escrow: true },
    })
    if (!trade) throw new NotFoundError('Trade', tradeId)

    const missedMessages = await prisma.message.findMany({
      where: {
        tradeId,
        ...(sinceMessageCreatedAt ? { createdAt: { gt: sinceMessageCreatedAt } } : {}),
      },
      orderBy: { createdAt: 'asc' },
      take: 100, // defensive bound — mirrors liquidity.service.ts's take: 10 pattern
    })

    return {
      tradeId,
      currentTradeStatus: trade.status,
      currentEscrowStatus: trade.escrow?.status ?? null,
      missedMessages: missedMessages.map((m) => ({
        id: m.id,
        senderId: m.senderId,
        content: m.content,
        msgType: m.msgType,
        createdAt: m.createdAt,
      })),
    }
  }

  // Called when two users' P2P connection comes back (pear.service.ts's
  // peer.connected, localUserId+userId both known) — finds every trade
  // still active between them and reconciles each one.
  async reconcilePeerPair(localUserId: string, remoteUserId: string): Promise<ReconciliationResult[]> {
    const trades = await prisma.trade.findMany({
      where: {
        status: { in: [...ACTIVE_TRADE_STATUSES] },
        OR: [
          { buyerId: localUserId, sellerId: remoteUserId },
          { buyerId: remoteUserId, sellerId: localUserId },
        ],
      },
      select: { id: true },
    })

    const results: ReconciliationResult[] = []
    for (const trade of trades) {
      results.push(await this.reconcileTrade(trade.id))
    }
    return results
  }
}

export const reconciliationService = new ReconciliationService()
