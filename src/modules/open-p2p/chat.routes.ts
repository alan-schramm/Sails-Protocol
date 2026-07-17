/**
 * Sails OpenP2P chat routes — API_REFERENCE.md section 5 (WebSocket
 * protocol) + the message-history GET route.
 *
 * Unified with negotiation.service.ts's HumanChatChannel (the Pears
 * transport) as of the chat-unification pass: this route no longer
 * broadcasts NEW_MESSAGE itself after a SEND_MESSAGE — it only persists
 * the Message and emits openp2p.message.sent, same as HumanChatChannel
 * already did. common/events/handlers.ts's single reaction to that event
 * is what pushes NEW_MESSAGE to every WS-connected room member, so a
 * message sent via Pears (HumanChatChannel) now reaches WS clients
 * watching that trade too — see chat-room-registry.ts's doc comment for
 * what's still one-directional (WS-origin messages aren't relayed onto
 * Pears; that stays HumanChatChannel-only).
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../common/database'
import { NotFoundError, ForbiddenError } from '../../common/errors'
import { eventBus } from '../../common/events/event-bus'
import { redis } from '../../common/redis'
import { requireAuth } from '../../common/middleware/auth'
import { joinRoom, leaveRoom, broadcastToTrade, type RoomMember } from './chat-room-registry'

const SESSION_PREFIX = 'auth:session:'

// Auto-push escrow/trade status changes to whoever's currently watching
// that trade's room — API_REFERENCE.md's TRADE_STATUS_UPDATE/
// ESCROW_STATUS_UPDATE server messages. Registered once at module load,
// not per-connection. (NEW_MESSAGE's equivalent registration lives in
// common/events/handlers.ts now, alongside the rest of the Outcome
// Engine / cross-module reactions, not here — see this file's own doc
// comment above for why.)
eventBus.on('openp2p.trade.status_changed', (payload) => {
  broadcastToTrade(payload.tradeId, { type: 'TRADE_STATUS_UPDATE', payload })
})
eventBus.on('settlement.escrow.locked', (payload) => broadcastToTrade(payload.tradeId, { type: 'ESCROW_STATUS_UPDATE', payload }))
eventBus.on('settlement.escrow.payment_pending', (payload) => broadcastToTrade(payload.tradeId, { type: 'ESCROW_STATUS_UPDATE', payload }))
eventBus.on('settlement.escrow.released', (payload) => broadcastToTrade(payload.tradeId, { type: 'ESCROW_STATUS_UPDATE', payload }))
eventBus.on('settlement.escrow.disputed', (payload) => broadcastToTrade(payload.tradeId, { type: 'ESCROW_STATUS_UPDATE', payload }))
eventBus.on('settlement.escrow.refunded', (payload) => broadcastToTrade(payload.tradeId, { type: 'ESCROW_STATUS_UPDATE', payload }))

async function resolveParticipantFromToken(token: string | undefined): Promise<string | null> {
  if (!token) return null
  return redis.get(`${SESSION_PREFIX}${token}`)
}

const joinTradeSchema = z.object({ tradeId: z.string().min(1) })
const sendMessageSchema = z.object({
  tradeId: z.string().min(1),
  content: z.string().min(1),
  msgType: z.string().default('TEXT'),
})

export async function chatRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/openp2p/chat', { websocket: true }, async (socket, request) => {
    const query = request.query as { token?: string }
    const participantId = await resolveParticipantFromToken(query.token)
    if (!participantId) {
      socket.send(JSON.stringify({ type: 'ERROR', payload: { message: 'Missing or invalid token query param — authenticate via POST /v1/identity/authenticate first' } }))
      socket.close()
      return
    }

    const joined = new Set<string>()

    socket.on('message', async (raw: Buffer) => {
      let msg: { type: string; payload?: unknown }
      try {
        msg = JSON.parse(raw.toString())
      } catch {
        socket.send(JSON.stringify({ type: 'ERROR', payload: { message: 'Malformed JSON' } }))
        return
      }

      try {
        if (msg.type === 'PING') {
          socket.send(JSON.stringify({ type: 'PONG', payload: {} }))
          return
        }

        if (msg.type === 'JOIN_TRADE') {
          const { tradeId } = joinTradeSchema.parse(msg.payload)
          const trade = await prisma.trade.findUnique({ where: { id: tradeId } })
          if (!trade) throw new NotFoundError('Trade', tradeId)
          if (participantId !== trade.buyerId && participantId !== trade.sellerId) {
            throw new ForbiddenError(`${participantId} is not a party to trade ${tradeId}`)
          }

          const member: RoomMember = { socket, participantId }
          joinRoom(tradeId, member)
          joined.add(tradeId)
          broadcastToTrade(tradeId, { type: 'USER_ONLINE', payload: { tradeId, participantId } }, socket)
          return
        }

        if (msg.type === 'LEAVE_TRADE') {
          const { tradeId } = joinTradeSchema.parse(msg.payload)
          leaveRoom(tradeId, socket)
          joined.delete(tradeId)
          broadcastToTrade(tradeId, { type: 'USER_OFFLINE', payload: { tradeId, participantId } })
          return
        }

        if (msg.type === 'SEND_MESSAGE') {
          const body = sendMessageSchema.parse(msg.payload)
          const trade = await prisma.trade.findUnique({ where: { id: body.tradeId } })
          if (!trade) throw new NotFoundError('Trade', body.tradeId)
          if (participantId !== trade.buyerId && participantId !== trade.sellerId) {
            throw new ForbiddenError(`${participantId} is not a party to trade ${body.tradeId}`)
          }

          const message = await prisma.message.create({
            data: {
              tradeId: body.tradeId,
              senderId: participantId,
              content: body.content,
              msgType: body.msgType,
            },
          })

          // No direct broadcastToTrade() call here anymore — handlers.ts's
          // reaction to this same event is now the single place NEW_MESSAGE
          // gets pushed, so a message sent via this route and one sent via
          // HumanChatChannel/Pears both reach WS room members the same way.
          await eventBus.emit('openp2p.message.sent', {
            messageId: message.id,
            tradeId: body.tradeId,
            senderId: participantId,
            content: body.content,
            msgType: body.msgType,
            timestamp: message.createdAt.toISOString(),
          }, body.tradeId)
          return
        }

        socket.send(JSON.stringify({ type: 'ERROR', payload: { message: `Unknown message type: ${msg.type}` } }))
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Internal error'
        socket.send(JSON.stringify({ type: 'ERROR', payload: { message } }))
      }
    })

    socket.on('close', () => {
      for (const tradeId of joined) {
        leaveRoom(tradeId, socket)
        broadcastToTrade(tradeId, { type: 'USER_OFFLINE', payload: { tradeId, participantId } })
      }
    })
  })

  // requireAuth + participant check — found while writing tests for this
  // route: it had no auth at all, while the WS side (JOIN_TRADE/
  // SEND_MESSAGE above) already restricts a trade's room to its two
  // parties. Leaving this REST read open would have made negotiation
  // content readable by anyone who guessed a tradeId.
  app.get('/v1/openp2p/chat/:tradeId/messages', {
    preHandler: requireAuth,
    schema: { tags: ['open-p2p'] },
  }, async (request, reply) => {
    const { tradeId } = z.object({ tradeId: z.string().min(1) }).parse(request.params)
    const participantId = (request as any).participantId as string
    const trade = await prisma.trade.findUnique({ where: { id: tradeId } })
    if (!trade) throw new NotFoundError('Trade', tradeId)
    if (participantId !== trade.buyerId && participantId !== trade.sellerId) {
      throw new ForbiddenError(`${participantId} is not a party to trade ${tradeId}`)
    }
    const messages = await prisma.message.findMany({
      where: { tradeId },
      orderBy: { createdAt: 'asc' },
    })
    return reply.code(200).send({ success: true, data: messages })
  })
}
