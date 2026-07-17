/**
 * Sails OpenLiquidity routes — API_REFERENCE.md section 3.
 *
 * Named liquidity.routes.ts (the module's own name), not
 * marketplace.routes.ts as an older app.ts comment called it — matches
 * the official module naming CONTRIBUTING.md section 1 requires.
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { liquidityRouter } from './liquidity.service'
import { requireAuth } from '../../common/middleware/auth'

const assetSideQuerySchema = z.object({
  asset: z.string().min(1),
  side: z.enum(['BUY', 'SELL']),
})

const createOfferSchema = z.object({
  asset: z.string().min(1),
  side: z.enum(['BUY', 'SELL']),
  priceUsd: z.string().min(1),
  priceBrl: z.string().optional(),
  minAmount: z.string().min(1),
  maxAmount: z.string().min(1),
  paymentMethod: z.string().min(1),
  paymentDetails: z.string().optional(),
  network: z.string().optional(),
  description: z.string().optional(),
  requiresKyc: z.boolean().optional(),
})

const updateStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED']),
})

const matchSchema = z.object({
  asset: z.string().min(1),
  side: z.enum(['BUY', 'SELL']),
  amount: z.string().min(1),
})

export async function liquidityRoutes(app: FastifyInstance): Promise<void> {
  // NOTE: filterable by asset+side only today — paymentMethod/price-range
  // filtering from API_REFERENCE.md's description is not yet implemented
  // (liquidityRouter.getAggregatedOffers doesn't support it); documented
  // here rather than silently dropped.
  app.get('/v1/liquidity/offers', {
    schema: { tags: ['open-liquidity'] },
  }, async (request, reply) => {
    const query = assetSideQuerySchema.parse(request.query)
    const result = await liquidityRouter.getAggregatedOffers(query.asset as any, query.side)
    return reply.code(200).send({ success: true, data: result })
  })

  app.post('/v1/liquidity/offers', {
    preHandler: requireAuth,
    schema: { tags: ['open-liquidity'] },
  }, async (request, reply) => {
    const body = createOfferSchema.parse(request.body)
    const participantId = (request as any).participantId as string
    const offer = await liquidityRouter.createOffer({ ...body, userId: participantId } as any)
    return reply.code(201).send({ success: true, data: offer })
  })

  app.get('/v1/liquidity/offers/:asset/book', {
    schema: { tags: ['open-liquidity'] },
  }, async (request, reply) => {
    const { asset } = z.object({ asset: z.string().min(1) }).parse(request.params)
    const book = await liquidityRouter.getOrderBook(asset as any)
    return reply.code(200).send({ success: true, data: book })
  })

  app.patch('/v1/liquidity/offers/:id/status', {
    preHandler: requireAuth,
    schema: { tags: ['open-liquidity'] },
  }, async (request, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params)
    const body = updateStatusSchema.parse(request.body)
    const participantId = (request as any).participantId as string
    const offer = await liquidityRouter.updateOfferStatus(id, body.status, participantId)
    return reply.code(200).send({ success: true, data: offer })
  })

  app.post('/v1/liquidity/match', {
    schema: { tags: ['open-liquidity'] },
  }, async (request, reply) => {
    const body = matchSchema.parse(request.body)
    const match = await liquidityRouter.findBestMatch(body.asset as any, body.side, body.amount)
    return reply.code(200).send({ success: true, data: match })
  })
}
