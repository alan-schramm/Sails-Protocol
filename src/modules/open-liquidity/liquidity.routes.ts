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
import type { AuthenticatedRequest } from '../../common/middleware/auth'
import type { AssetType, PaymentMethod } from '../../common/types'
import { docsOnlySchema } from '../../common/openapi'

const assetSideQuerySchema = z.object({
  asset: z.string().min(1),
  side: z.enum(['BUY', 'SELL']),
  // Pagination (docs/TODO.md §25) — both optional, clamped again in
  // liquidity.service.ts's getOffers() (limit: 1-50, default 10) so a
  // second caller of that method directly is protected even if it
  // bypasses this route's own validation.
  limit: z.coerce.number().int().min(1).max(50).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  // Real filters (Production Readiness Audit, 2026-08-09) — decimal
  // strings for price, same RFC-009 convention as every other
  // amount/price field in this API.
  paymentMethod: z.string().min(1).optional(),
  priceMin: z.string().min(1).optional(),
  priceMax: z.string().min(1).optional(),
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
})

const offerIdParamsSchema = z.object({ id: z.string().min(1) })

const assetParamsSchema = z.object({ asset: z.string().min(1) })

const updateStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED']),
})

const matchSchema = z.object({
  asset: z.string().min(1),
  side: z.enum(['BUY', 'SELL']),
  amount: z.string().min(1),
})

export async function liquidityRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/liquidity/offers', {
    ...docsOnlySchema({ tags: ['open-liquidity'], querystring: assetSideQuerySchema }),
  }, async (request, reply) => {
    const query = assetSideQuerySchema.parse(request.query)
    const result = await liquidityRouter.getAggregatedOffers(
      query.asset as AssetType,
      query.side,
      { limit: query.limit, offset: query.offset },
      {
        paymentMethod: query.paymentMethod as PaymentMethod | undefined,
        priceMin: query.priceMin,
        priceMax: query.priceMax,
      }
    )
    return reply.code(200).send({ success: true, data: result })
  })

  app.post('/v1/liquidity/offers', {
    preHandler: requireAuth,
    ...docsOnlySchema({ tags: ['open-liquidity'], body: createOfferSchema }),
  }, async (request, reply) => {
    const body = createOfferSchema.parse(request.body)
    const participantId = (request as AuthenticatedRequest).participantId
    const offer = await liquidityRouter.createOffer({ ...body, userId: participantId } as any)
    return reply.code(201).send({ success: true, data: offer })
  })

  // Single-offer lookup, including the seller's real public profile
  // fields — see liquidity.service.ts's getOffer() doc comment for why
  // this was missing (discover()/book() only return an aggregation
  // summary, never enough for a real offer-detail screen).
  //
  // PRODUCTION_READINESS_FIXES.md P1 item 12, closed 2026-08-08 — was
  // `/offers/id/:id` (redundant `id` segment, the only route in this
  // file shaped that way). Fastify/find-my-way always prefers an exact
  // static match over a parametric one at the same path depth, so this
  // rename doesn't shadow the sibling static routes `/offers/mine` or
  // `/offers/:asset/book` (that one has an extra segment anyway) —
  // verified with a real app.inject() round-trip against both
  // `/offers/mine` and `/offers/:id`, not just reasoned about
  // (tests/liquidityOfferRouteCollision.test.ts).
  app.get('/v1/liquidity/offers/:id', {
    ...docsOnlySchema({ tags: ['open-liquidity'], params: offerIdParamsSchema }),
  }, async (request, reply) => {
    const { id } = offerIdParamsSchema.parse(request.params)
    const offer = await liquidityRouter.getOffer(id)
    return reply.code(200).send({ success: true, data: offer })
  })

  app.get('/v1/liquidity/offers/:asset/book', {
    ...docsOnlySchema({ tags: ['open-liquidity'], params: assetParamsSchema }),
  }, async (request, reply) => {
    const { asset } = assetParamsSchema.parse(request.params)
    const book = await liquidityRouter.getOrderBook(asset as AssetType)
    return reply.code(200).send({ success: true, data: book })
  })

  // A participant's own offers, including non-ACTIVE ones (paused/
  // completed/cancelled) — never derived from a query param, always from
  // the authenticated session, same INV-OP-6 discipline every other
  // participant-scoped route in this codebase already follows. Real gap
  // found auditing packages/sails-ui's Profile screen (2026-08-01) —
  // see liquidity.service.ts's getOffersByUser() doc comment.
  app.get('/v1/liquidity/offers/mine', {
    preHandler: requireAuth,
    schema: { tags: ['open-liquidity'] },
  }, async (request, reply) => {
    const participantId = (request as AuthenticatedRequest).participantId
    const offers = await liquidityRouter.getOffersByUser(participantId)
    return reply.code(200).send({ success: true, data: offers })
  })

  app.patch('/v1/liquidity/offers/:id/status', {
    preHandler: requireAuth,
    ...docsOnlySchema({ tags: ['open-liquidity'], params: offerIdParamsSchema, body: updateStatusSchema }),
  }, async (request, reply) => {
    const { id } = offerIdParamsSchema.parse(request.params)
    const body = updateStatusSchema.parse(request.body)
    const participantId = (request as AuthenticatedRequest).participantId
    const offer = await liquidityRouter.updateOfferStatus(id, body.status, participantId)
    return reply.code(200).send({ success: true, data: offer })
  })

  app.post('/v1/liquidity/match', {
    ...docsOnlySchema({ tags: ['open-liquidity'], body: matchSchema }),
  }, async (request, reply) => {
    const body = matchSchema.parse(request.body)
    const match = await liquidityRouter.findBestMatch(body.asset as AssetType, body.side, body.amount)
    return reply.code(200).send({ success: true, data: match })
  })
}
