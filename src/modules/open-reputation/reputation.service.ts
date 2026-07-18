/**
 * Sails OpenReputation — Reference Implementation
 *
 * The last module TODO.md's route-restoration pass left genuinely
 * unbuilt — unlike open-identity/open-p2p/open-settlement/open-liquidity,
 * this one had no service layer at all, not just missing routes.
 *
 * RFC-007 D8/D9's rule, enforced structurally here, not just by
 * convention: `recordOutcome()` is the *sole* input to
 * `User.reputationScore`. `rate()` (star ratings) is informational
 * feedback only — persisted, displayed, never mixed into the score. A
 * trade cancelled by mutual agreement (no dispute ever raised) always
 * classifies Neutral, never Negative — see `recordOutcome`'s callers in
 * `common/events/handlers.ts` for how that's actually decided.
 *
 * Known simplification (documented, not hidden — same discipline
 * `DATABASE.md` uses for `Offer.intentType` standing in for
 * `TradeIntent`): `SDK_GUIDE.md`'s `ReputationScore` interface specifies
 * a `{ total, tradeScore, volumeScore, settlementScore, disputeRate }`
 * breakdown. `User.reputationScore` is a single `Float` today — this
 * service computes `total` and `disputeRate` for real, and reports the
 * rest of the shape as zero rather than fabricating sub-scores nothing
 * in this codebase actually tracks separately yet.
 */
import { prisma } from '../../common/database'
import { NotFoundError, ValidationError, ForbiddenError } from '../../common/errors'
import { eventBus } from '../../common/events/event-bus'

export type ReputationOutcome = 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL'

export class ReputationService {
  // Asymmetric by design: a disputed loss should cost more than a clean
  // trade earns, otherwise a participant can "wash" one bad outcome with
  // one good one — the same asymmetry RED_TEAM_REVIEW.md's Sybil/wash-
  // trading findings assume reputation scoring needs.
  private readonly POSITIVE_DELTA = 2
  private readonly NEGATIVE_DELTA = -5

  async recordOutcome(tradeId: string, participantId: string, outcome: ReputationOutcome) {
    const delta = outcome === 'POSITIVE' ? this.POSITIVE_DELTA : outcome === 'NEGATIVE' ? this.NEGATIVE_DELTA : 0

    const user = await prisma.user.update({
      where: { id: participantId },
      data: { reputationScore: { increment: delta } },
    })

    await eventBus.emit('reputation.score.updated', {
      userId: participantId,
      newScore: user.reputationScore,
      totalTrades: user.totalTrades,
      tradeId,
      ratingGiven: 0, // outcome-based update, not a rate() star rating — see rate() below
    }, tradeId)

    return user
  }

  // Informational only (RFC-007 D8/D9) — does not touch reputationScore.
  // One rating per (tradeId, raterId), enforced by the schema's
  // @@unique constraint; caught here and surfaced as a clear 400 rather
  // than a raw Prisma error leaking through.
  async rate(tradeId: string, raterId: string, ratedId: string, score: number, comment?: string) {
    if (score < 1 || score > 5) {
      throw new ValidationError(`score must be between 1 and 5, got ${score}`)
    }

    // Gap-audit fix: this previously created a ReputationEvent for any
    // (tradeId, raterId, ratedId) triple with no check that either
    // party was actually involved in that trade — an authenticated
    // participant could rate a trade they had nothing to do with, or
    // attribute a rating to an arbitrary ratedId. Lower severity than
    // the escrow/Intent findings (this is informational only, per this
    // file's own header comment — it never touches reputationScore),
    // but still a real spam/abuse vector worth closing.
    const trade = await prisma.trade.findUnique({ where: { id: tradeId } })
    if (!trade) throw new NotFoundError('Trade', tradeId)
    if (raterId !== trade.buyerId && raterId !== trade.sellerId) {
      throw new ForbiddenError(`${raterId} is not a party to trade ${tradeId}`)
    }
    const expectedRatedId = raterId === trade.buyerId ? trade.sellerId : trade.buyerId
    if (ratedId !== expectedRatedId) {
      throw new ValidationError(`ratedId must be the other party to trade ${tradeId} (expected ${expectedRatedId})`)
    }

    try {
      return await prisma.reputationEvent.create({
        data: { tradeId, raterId, ratedId, score, comment },
      })
    } catch (err: any) {
      if (err?.code === 'P2002') {
        throw new ValidationError(`${raterId} has already rated trade ${tradeId}`)
      }
      throw err
    }
  }

  async getScore(participantId: string) {
    const user = await prisma.user.findUnique({ where: { id: participantId } })
    if (!user) throw new NotFoundError('Participant', participantId)

    return {
      participantId: user.id,
      total: user.reputationScore,
      tradeScore: 0,       // not yet tracked separately — see class doc comment
      volumeScore: 0,      // not yet tracked separately — see class doc comment
      settlementScore: 0,  // not yet tracked separately — see class doc comment
      disputeRate: user.totalTrades > 0 ? user.disputeCount / user.totalTrades : 0,
      totalTrades: user.totalTrades,
    }
  }

  // RFC-013 (rfcs/RFC-013-capability-registry-and-wallet-adapter.md) —
  // reputation addressable by a participant's portable Pears identity
  // (User.peerId, set the first time their PearNode starts), not only
  // the internal participantId. No new scoring logic: this resolves
  // peerId -> participantId, then delegates to the same getScore() path
  // above — the correction that RFC establishes is that Pears provides
  // the portable identity substrate, not the reputation computation
  // itself, which stays exclusively this service's job.
  async getScoreByPeerId(peerId: string) {
    const user = await prisma.user.findUnique({ where: { peerId } })
    if (!user) throw new NotFoundError('Participant with peerId', peerId)
    return this.getScore(user.id)
  }

  async getLeaderboard(limit = 20) {
    return prisma.user.findMany({
      orderBy: { reputationScore: 'desc' },
      take: limit,
      select: { id: true, displayName: true, reputationScore: true, totalTrades: true },
    })
  }
}

export const reputationService = new ReputationService()
