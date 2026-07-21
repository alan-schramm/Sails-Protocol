/**
 * P2P Transport routes — API_REFERENCE.md section 7. Infrastructure
 * layer (not a module) — these wrap `pearNodeRegistry` only, per that
 * doc's implementation note: never instantiate `PearNode` directly.
 *
 * Every route requires auth — a caller can only start/stop/broadcast on
 * their own node (`req.participantId` from the session, never a bare
 * `userId` in the body).
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { pearNodeRegistry } from './pear.service'
import { fallbackTransportProvider } from './transport-provider'
import { requireAuth } from '../../common/middleware/auth'

const startSchema = z.object({
  secretKey: z.string().min(1), // base64 — see pear.service.ts's PearNode.start()
})

const joinTopicSchema = z.object({
  topic: z.enum(['marketplace', 'btc', 'lnBtc', 'liquidBtc', 'usdtErc20', 'usdtLiquid']),
})

const joinTradeSchema = z.object({
  tradeId: z.string().min(1),
})

const broadcastOfferSchema = z.object({
  offerId: z.string().min(1),
  asset: z.string().min(1),
  side: z.enum(['BUY', 'SELL']),
  priceUsd: z.string().min(1),
})

export async function peerRoutes(app: FastifyInstance): Promise<void> {
  app.post('/v1/peers/start', {
    preHandler: requireAuth,
    schema: { tags: ['peers'] },
  }, async (request, reply) => {
    const body = startSchema.parse(request.body)
    const participantId = (request as any).participantId as string
    // Pears first, WebSocket relay (`/ws/relay`) only if Pears doesn't
    // connect within the timeout — see transport-provider.ts's
    // FallbackTransportProvider. `transport` tells the caller which one
    // actually won, so a client can show a degraded-connectivity state:
    // a participant on 'websocket-relay' can still start()/sendToPeer(),
    // but /v1/peers/join-trade and /v1/peers/broadcast-offer below still
    // require a real PearNode and will 409 for them — a relay has no DHT
    // topic to join.
    const { peerId } = await fallbackTransportProvider.start(participantId, body.secretKey)
    const transport = fallbackTransportProvider.activeTransportName(participantId)
    return reply.code(200).send({ success: true, data: { peerId, transport } })
  })

  app.post('/v1/peers/stop', {
    preHandler: requireAuth,
    schema: { tags: ['peers'] },
  }, async (request, reply) => {
    const participantId = (request as any).participantId as string
    await pearNodeRegistry.stop(participantId)
    return reply.code(200).send({ success: true })
  })

  app.get('/v1/peers/status', {
    preHandler: requireAuth,
    schema: { tags: ['peers'] },
  }, async (request, reply) => {
    const participantId = (request as any).participantId as string
    const status = pearNodeRegistry.getStatus(participantId)
    return reply.code(200).send({ success: true, data: status })
  })

  app.post('/v1/peers/join-topic', {
    preHandler: requireAuth,
    schema: { tags: ['peers'] },
  }, async (request, reply) => {
    const body = joinTopicSchema.parse(request.body)
    const participantId = (request as any).participantId as string
    const node = pearNodeRegistry.get(participantId)
    if (!node) {
      return reply.code(409).send({ success: false, error: 'NOT_FOUND', message: 'No active node — call POST /v1/peers/start first', details: [] })
    }
    await node.joinTopic(body.topic)
    return reply.code(200).send({ success: true })
  })

  app.post('/v1/peers/join-trade', {
    preHandler: requireAuth,
    schema: { tags: ['peers'] },
  }, async (request, reply) => {
    const body = joinTradeSchema.parse(request.body)
    const participantId = (request as any).participantId as string
    const node = pearNodeRegistry.get(participantId)
    if (!node) {
      return reply.code(409).send({ success: false, error: 'NOT_FOUND', message: 'No active node — call POST /v1/peers/start first', details: [] })
    }
    await node.joinTradeTopic(body.tradeId)
    return reply.code(200).send({ success: true })
  })

  app.post('/v1/peers/broadcast-offer', {
    preHandler: requireAuth,
    schema: { tags: ['peers'] },
  }, async (request, reply) => {
    const body = broadcastOfferSchema.parse(request.body)
    const participantId = (request as any).participantId as string
    const node = pearNodeRegistry.get(participantId)
    if (!node) {
      return reply.code(409).send({ success: false, error: 'NOT_FOUND', message: 'No active node — call POST /v1/peers/start first', details: [] })
    }
    const sent = node.broadcast({ kind: 'offer_announce', ...body })
    return reply.code(200).send({ success: true, data: { deliveredTo: sent } })
  })
}
