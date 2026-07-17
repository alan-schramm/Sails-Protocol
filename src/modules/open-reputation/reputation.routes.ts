/**
 * Sails OpenReputation routes — API_REFERENCE.md section 6.
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { reputationService } from './reputation.service'
import { requireAuth } from '../../common/middleware/auth'

const rateSchema = z.object({
  tradeId: z.string().min(1),
  ratedId: z.string().min(1),
  score: z.number().int().min(1).max(5),
  comment: z.string().optional(),
})

export async function reputationRoutes(app: FastifyInstance): Promise<void> {
  // Registered before the :participantId route below — Fastify's router
  // matches static routes ahead of parametric ones regardless of
  // registration order, but this ordering keeps the intent obvious.
  app.get('/v1/reputation/leaderboard', {
    schema: { tags: ['open-reputation'] },
  }, async (request, reply) => {
    const { limit } = z.object({ limit: z.coerce.number().int().min(1).max(100).optional() }).parse(request.query)
    const leaderboard = await reputationService.getLeaderboard(limit)
    return reply.code(200).send({ success: true, data: leaderboard })
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
    const raterId = (request as any).participantId as string
    const event = await reputationService.rate(body.tradeId, raterId, body.ratedId, body.score, body.comment)
    return reply.code(201).send({ success: true, data: event })
  })
}
