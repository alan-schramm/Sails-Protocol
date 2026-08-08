/**
 * Sails OpenReputation routes — API_REFERENCE.md section 6.
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { reputationService } from './reputation.service'
import { vouchService } from './vouch.service'
import { requireAuth } from '../../common/middleware/auth'
import type { AuthenticatedRequest } from '../../common/middleware/auth'

const rateSchema = z.object({
  tradeId: z.string().min(1),
  ratedId: z.string().min(1),
  score: z.number().int().min(1).max(5),
  comment: z.string().optional(),
})

// RFC-021 D7
const vouchSchema = z.object({
  voucheeId: z.string().min(1),
})

export async function reputationRoutes(app: FastifyInstance): Promise<void> {
  // Registered before the :participantId route below — Fastify's router
  // matches static routes ahead of parametric ones regardless of
  // registration order, but this ordering keeps the intent obvious.
  app.get('/v1/reputation/leaderboard', {
    schema: { tags: ['open-reputation'] },
  }, async (request, reply) => {
    const { limit, offset } = z.object({
      limit: z.coerce.number().int().min(1).max(100).optional(),
      offset: z.coerce.number().int().min(0).optional(),
    }).parse(request.query)
    const leaderboard = await reputationService.getLeaderboard(limit, offset)
    return reply.code(200).send({ success: true, data: leaderboard })
  })

  // Registered before /:participantId below — different segment count
  // than that route (two path segments vs. one), so there's no routing
  // ambiguity for Fastify to resolve either way; kept in this order for
  // readability, matching the leaderboard route's own comment above.
  app.get('/v1/reputation/peer/:peerId', {
    schema: { tags: ['open-reputation'] },
  }, async (request, reply) => {
    const { peerId } = z.object({ peerId: z.string().min(1) }).parse(request.params)
    const score = await reputationService.getScoreByPeerId(peerId)
    return reply.code(200).send({ success: true, data: score })
  })

  app.get('/v1/reputation/:participantId', {
    schema: { tags: ['open-reputation'] },
  }, async (request, reply) => {
    const { participantId } = z.object({ participantId: z.string().min(1) }).parse(request.params)
    const score = await reputationService.getScore(participantId)
    return reply.code(200).send({ success: true, data: score })
  })

  app.post('/v1/reputation/rate', {
    preHandler: requireAuth,
    schema: { tags: ['open-reputation'] },
  }, async (request, reply) => {
    const body = rateSchema.parse(request.body)
    const raterId = (request as AuthenticatedRequest).participantId
    const event = await reputationService.rate(body.tradeId, raterId, body.ratedId, body.score, body.comment)
    return reply.code(201).send({ success: true, data: event })
  })

  // RFC-021 D7 — real skin in the game, not a KYC/identity-linking flow:
  // the caller vouches for `voucheeId` with their own reputation on the
  // line. See vouch.service.ts's own header for the full eligibility/
  // burn-on-loss mechanics.
  app.post('/v1/reputation/vouch', {
    preHandler: requireAuth,
    schema: { tags: ['open-reputation'] },
  }, async (request, reply) => {
    const body = vouchSchema.parse(request.body)
    const voucherId = (request as AuthenticatedRequest).participantId
    const vouch = await vouchService.vouchFor(voucherId, body.voucheeId)
    return reply.code(201).send({ success: true, data: vouch })
  })
}
