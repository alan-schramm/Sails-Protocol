/**
 * Sails OpenP2P trade routes — API_REFERENCE.md section 5 (trade half;
 * chat.routes.ts has the WebSocket negotiation channel + message history).
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { tradeService } from './trade.service'
import { reconciliationService } from './reconciliation.service'
import { requireAuth } from '../../common/middleware/auth'
import { prisma } from '../../common/database'
import { NotFoundError, ForbiddenError } from '../../common/errors'

const createTradeSchema = z.object({
  offerId: z.string().min(1),
  amount: z.string().min(1),
})

const updateStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'CANCELLED']),
})

const listTradesSchema = z.object({
  limit: z.coerce.number().int().optional(),
  offset: z.coerce.number().int().optional(),
})

const reconcileSchema = z.object({
  sinceMessageCreatedAt: z.coerce.date().optional(),
})

export async function tradeRoutes(app: FastifyInstance): Promise<void> {
  // Fase 2 (SDK React) — see trade.service.ts's getTrades() comment for
  // why this didn't exist before. requireAuth because this is inherently
  // caller-scoped (a participant's own trade history), unlike
  // getTrade()/getTradeByIntentId() below which read a single trade by
  // an unguessable id and have never required auth.
  app.get('/v1/openp2p/trades', {
    preHandler: requireAuth,
    schema: { tags: ['open-p2p'] },
  }, async (request, reply) => {
    const query = listTradesSchema.parse(request.query)
    const participantId = (request as any).participantId as string
    const result = await tradeService.getTrades(participantId, query)
    return reply.code(200).send({ success: true, data: result })
  })

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

  // RFC-011's own "Reference Implementation Plan" and
  // reconciliation.service.ts's own doc comment both named this exact
  // path as the real endpoint that didn't exist yet — the automatic
  // peer.connected trigger (pear.service.ts) already calls
  // reconcileTrade() server-side, but a client had no way to ask for its
  // own delta directly (e.g. after a k6/load-test-style forced
  // reconnect, or a mobile client resuming from background). Wired here
  // (Fase 4 follow-up) rather than left as an aspirational comment.
  //
  // requireAuth + participant check — same reasoning and same pattern as
  // chat.routes.ts's getMessages(): this returns the same missed-message
  // content, so it needs the identical ownership boundary, not a laxer
  // one just because it's a "reconciliation" endpoint.
  app.post('/v1/openp2p/trades/:id/reconcile', {
    preHandler: requireAuth,
    schema: { tags: ['open-p2p'] },
  }, async (request, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params)
    const body = reconcileSchema.parse(request.body ?? {})
    const participantId = (request as any).participantId as string

    const trade = await prisma.trade.findUnique({ where: { id } })
    if (!trade) throw new NotFoundError('Trade', id)
    if (participantId !== trade.buyerId && participantId !== trade.sellerId) {
      throw new ForbiddenError(`${participantId} is not a party to trade ${id}`)
    }

    const result = await reconciliationService.reconcileTrade(id, body.sinceMessageCreatedAt ?? null)
    return reply.code(200).send({ success: true, data: result })
  })
}
