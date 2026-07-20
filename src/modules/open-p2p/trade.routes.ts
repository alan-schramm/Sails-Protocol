/**
 * Sails OpenP2P trade routes — API_REFERENCE.md section 5 (trade half;
 * chat.routes.ts has the WebSocket negotiation channel + message history).
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { tradeService } from './trade.service'
import { requireAuth } from '../../common/middleware/auth'

const createTradeSchema = z.object({
  offerId: z.string().min(1),
  amount: z.string().min(1),
})

const updateStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'CANCELLED']),
})

export async function tradeRoutes(app: FastifyInstance): Promise<void> {
  app.post('/v1/openp2p/trades', {
    preHandler: requireAuth,
    schema: { tags: ['open-p2p'] },
  }, async (request, reply) => {
    const body = createTradeSchema.parse(request.body)
    const participantId = (request as any).participantId as string
    const trade = await tradeService.createTrade({
      offerId: body.offerId,
      counterpartyId: participantId,
      amount: body.amount,
    })
    return reply.code(201).send({ success: true, data: trade })
  })

  app.get('/v1/openp2p/trades/:id', {
    schema: { tags: ['open-p2p'] },
  }, async (request, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params)
    const trade = await tradeService.getTrade(id)
    return reply.code(200).send({ success: true, data: trade })
  })

  // Real backing route for @sails/sdk's intent-facade.ts's dispute()
  // (RFC-018's intentId link made this possible — see trade.service.ts's
  // own comment on getTradeByIntentId()). Registered as its own path
  // segment, not a query param on /trades/:id — no collision with that
  // route's :id matcher since find-my-way routes by segment count.
  app.get('/v1/openp2p/trades/by-intent/:intentId', {
    schema: { tags: ['open-p2p'] },
  }, async (request, reply) => {
    const { intentId } = z.object({ intentId: z.string().min(1) }).parse(request.params)
    const trade = await tradeService.getTradeByIntentId(intentId)
    return reply.code(200).send({ success: true, data: trade })
  })

  app.patch('/v1/openp2p/trades/:id/status', {
    preHandler: requireAuth,
    schema: { tags: ['open-p2p'] },
  }, async (request, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params)
    const body = updateStatusSchema.parse(request.body)
    const participantId = (request as any).participantId as string
    const trade = await tradeService.updateStatus(id, body.status, participantId)
    return reply.code(200).send({ success: true, data: trade })
  })
}
