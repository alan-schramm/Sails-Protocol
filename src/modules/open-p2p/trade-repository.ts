/**
 * TradeRepository — Sails OpenP2P Component
 *
 * ARCHITECTURE_AUDIT_REPORT.md recommendation #3 ("... TradeRepository,
 * EscrowRepository — dependência via injeção no construtor"), step 3 of
 * the incremental rollout (step 1: CapabilityGrantRepository, step 2:
 * IntentRepository, both in src/core/). Unlike those two, Trade is not a
 * core-protocol entity — every consumer (trade.service.ts,
 * negotiation.service.ts, reconciliation.service.ts, trade.routes.ts,
 * chat.routes.ts) lives under modules/open-p2p, so this is co-located
 * here rather than in src/core/ — the same "module-owned DI interface
 * next to the service that uses it" precedent
 * modules/open-settlement/arbitration-provider.ts already established
 * for DisputeService's own constructor-injected dependency.
 *
 * Every method here is a verbatim move of an existing Prisma query — no
 * behavior change. findOfferById() bundles the one prisma.offer.* read
 * createTrade() needs alongside prisma.trade.*, the same "one repository
 * per *consumer*, not strictly one per table" precedent IntentRepository
 * already set by bundling prisma.intentEvent.* alongside prisma.intent.*.
 *
 * findById() (bare row, no relations) is the one shared shape behind
 * updateStatus()'s own ownership-check read, negotiationService.open()'s
 * existence check, and TradeService.assertParticipant() — itself the one
 * implementation behind 4 lightweight authorization-gate call sites this
 * step also closes (trade.routes.ts's /reconcile handler,
 * chat.routes.ts's JOIN_TRADE/SEND_MESSAGE/GET messages).
 * findByIdWithDetails()/findByIntentId()/findByIdWithEscrow() are three
 * DIFFERENT include shapes for "by id" — getTrade() needs
 * escrow+messages+offer, getTradeByIntentId() needs only escrow+offer,
 * reconciliationService.reconcileTrade() needs only escrow — collapsing
 * these into one over-fetching method would be exactly the
 * "getTrade() over-fetches for what's just an authorization gate"
 * problem assertParticipant() itself exists to avoid, just moved one
 * level down.
 *
 * negotiation.service.ts's open() and reconciliation.service.ts's
 * reconcileTrade()/reconcilePeerPair() also moved onto this repository
 * (findById/findByIdWithEscrow/findActiveTradeIdsBetween) even though
 * the audit doc's own operative rollout section named only
 * trade.service.ts/trade.routes.ts/chat.routes.ts — both files are
 * same-module (open-p2p) direct Trade access, the exact pattern this
 * repository exists to close, per escrow.service.ts's own header
 * comment: "cross-module read is fine, cross-module write requires the
 * owning module's abstraction" applied evenly to same-module reads too.
 */
import { prisma } from '../../common/database'
import type { Prisma } from '@prisma/client'
import type { AssetType, TradeStatus } from '../../common/types'

type TradeRow = NonNullable<Awaited<ReturnType<typeof prisma.trade.findUnique>>>
type OfferRow = NonNullable<Awaited<ReturnType<typeof prisma.offer.findUnique>>>
type TradeWithEscrowRow = Prisma.TradeGetPayload<{ include: { escrow: true } }>
type TradeWithEscrowAndOfferRow = Prisma.TradeGetPayload<{ include: { escrow: true; offer: true } }>
type TradeWithDetailsRow = Prisma.TradeGetPayload<{
  include: { escrow: true; messages: true; offer: true }
}>

export interface CreateTradeData {
  offerId: string
  buyerId: string
  sellerId: string
  asset: AssetType
  amount: string
  priceUsd: Prisma.Decimal | string
  totalUsd: string
  network: string | null
  intentId: string | null
}

export interface TradeRepository {
  /** createTrade()'s own Offer existence check — see this file's header comment for why an Offer read lives on TradeRepository rather than a separate repository. */
  findOfferById(offerId: string): Promise<OfferRow | null>

  create(input: CreateTradeData): Promise<TradeRow>

  /** Bare row, no relations. Shared by updateStatus()'s ownership-check read, negotiationService.open()'s existence check, and TradeService.assertParticipant() — the one shape 4 separate lightweight auth-gate call sites go through. */
  findById(tradeId: string): Promise<TradeRow | null>

  /** escrow + messages(createdAt asc) + offer — getTrade()'s full detail view. */
  findByIdWithDetails(tradeId: string): Promise<TradeWithDetailsRow | null>

  /** escrow + offer, first match on intentId — getTradeByIntentId()'s own shape for @satsails/p2p-trading-sdk's dispute() facade. */
  findByIntentId(intentId: string): Promise<TradeWithEscrowAndOfferRow | null>

  /** escrow only — reconciliationService.reconcileTrade()'s own shape. */
  findByIdWithEscrow(tradeId: string): Promise<TradeWithEscrowRow | null>

  /** Trades where participantId is buyer OR seller, newest first — getTrades()'s page of results. Caller (TradeService) already clamps limit/offset before calling. */
  findManyByParticipant(participantId: string, take: number, skip: number): Promise<TradeWithEscrowRow[]>

  /** Same (buyerId OR sellerId) filter as findManyByParticipant() — kept as its own method (not a combined {trades,total} call) so each method stays a literal 1:1 Prisma-call wrap; TradeService's own Promise.all still does the composition, unchanged from today. */
  countByParticipant(participantId: string): Promise<number>

  /** id-only projection of every still-active (PENDING/ACTIVE) trade between two participants — reconciliationService.reconcilePeerPair()'s own shape. The active-status list moves here from reconciliation.service.ts since it's this query's own where-clause detail, not a general trade-lifecycle constant. */
  findActiveTradeIdsBetween(participantAId: string, participantBId: string): Promise<{ id: string }[]>

  /** updateStatus()'s own write — cancelledAt is the caller's job to compute (status === 'CANCELLED' ? new Date() : undefined), same as today. */
  updateStatus(tradeId: string, status: TradeStatus, cancelledAt: Date | undefined): Promise<TradeRow>
}

const ACTIVE_TRADE_STATUSES = ['PENDING', 'ACTIVE'] as const

class PrismaTradeRepository implements TradeRepository {
  async findOfferById(offerId: string) {
    return prisma.offer.findUnique({ where: { id: offerId } })
  }

  async create(input: CreateTradeData) {
    return prisma.trade.create({
      data: {
        offerId: input.offerId,
        buyerId: input.buyerId,
        sellerId: input.sellerId,
        asset: input.asset,
        amount: input.amount,
        priceUsd: input.priceUsd,
        totalUsd: input.totalUsd,
        network: input.network,
        intentId: input.intentId,
      },
    })
  }

  async findById(tradeId: string) {
    return prisma.trade.findUnique({ where: { id: tradeId } })
  }

  async findByIdWithDetails(tradeId: string) {
    return prisma.trade.findUnique({
      where: { id: tradeId },
      include: { escrow: true, messages: { orderBy: { createdAt: 'asc' } }, offer: true },
    })
  }

  async findByIntentId(intentId: string) {
    return prisma.trade.findFirst({
      where: { intentId },
      include: { escrow: true, offer: true },
    })
  }

  async findByIdWithEscrow(tradeId: string) {
    return prisma.trade.findUnique({ where: { id: tradeId }, include: { escrow: true } })
  }

  async findManyByParticipant(participantId: string, take: number, skip: number) {
    return prisma.trade.findMany({
      where: { OR: [{ buyerId: participantId }, { sellerId: participantId }] },
      orderBy: { createdAt: 'desc' },
      take,
      skip,
      include: { escrow: true },
    })
  }

  async countByParticipant(participantId: string) {
    return prisma.trade.count({
      where: { OR: [{ buyerId: participantId }, { sellerId: participantId }] },
    })
  }

  async findActiveTradeIdsBetween(participantAId: string, participantBId: string) {
    return prisma.trade.findMany({
      where: {
        status: { in: [...ACTIVE_TRADE_STATUSES] },
        OR: [
          { buyerId: participantAId, sellerId: participantBId },
          { buyerId: participantBId, sellerId: participantAId },
        ],
      },
      select: { id: true },
    })
  }

  async updateStatus(tradeId: string, status: TradeStatus, cancelledAt: Date | undefined) {
    return prisma.trade.update({ where: { id: tradeId }, data: { status, cancelledAt } })
  }
}

export const tradeRepository: TradeRepository = new PrismaTradeRepository()
