/**
 * Sails OpenP2P chat routes — API_REFERENCE.md section 5 (WebSocket
 * protocol) + the message-history GET route.
 *
 * Scope decision (documented, not silently narrowed): this is the
 * browser-facing chat channel — a client connects once over WebSocket to
 * this app server and joins/leaves trade rooms over that single
 * connection, per API_REFERENCE.md's protocol. It is a *different*
 * transport path from negotiation.service.ts's HumanChatChannel, which
 * relays over Pears/HyperDHT directly between two peers' own nodes.
 * Both paths persist to the same `Message` table (the shared source of
 * truth, per RFC-011), so a message sent through either transport is
 * visible through the other — but this route does not itself relay onto
 * Pears, and HumanChatChannel does not itself push onto this WS. Unifying
 * the two into one unconditional fan-out is the still-open
 * `FallbackTransportProvider`/`/ws/relay` work BACKLOG.md's P0 already
 * flags as "not yet wired to an actual HTTP/WS route" — a separate task,
 * not silently done here.
 */
import type { FastifyInstance } from 'fastify'
import type { WebSocket } from 'ws'
import { z } from 'zod'
import { prisma } from '../../common/database'
import { NotFoundError, ForbiddenError } from '../../common/errors'
import { eventBus } from '../../common/events/event-bus'
import { redis } from '../../common/redis'

const SESSION_PREFIX = 'auth:session:'

interface RoomMember {
  socket: WebSocket
  participantId: string
}

// Module-scoped room registry — one process's view of who's actively
// watching which trade over this WS transport. Same "in-memory today"
// scope as pearNodeRegistry and EventStore's InMemoryEventStore default;
// a multi-instance deployment needs a shared pub/sub backend for this,
// not yet built (matches the FallbackTransportProvider gap noted above).
const rooms = new Map<string, Set<RoomMember>>()

function broadcastToTrade(tradeId: string, payload: Record<string, unknown>, exclude?: WebSocket) {
  const members = rooms.get(tradeId)
  if (!members) return
  const msg = JSON.stringify(payload)
  for (const member of members) {
    if (member.socket === exclude) continue
    if (member.socket.readyState === member.socket.OPEN) {
      member.socket.send(msg)
    }
  }
}

// Auto-push escrow/trade status changes to whoever's currently watching
// that trade's room — API_REFERENCE.md's TRADE_STATUS_UPDATE/
// ESCROW_STATUS_UPDATE server messages. Registered once at module load,
// not per-connection.
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

          if (!rooms.has(tradeId)) rooms.set(tradeId, new Set())
          const member: RoomMember = { socket, participantId }
          rooms.get(tradeId)!.add(member)
          joined.add(tradeId)
          broadcastToTrade(tradeId, { type: 'USER_ONLINE', payload: { tradeId, participantId } }, socket)
          return
        }

        if (msg.type === 'LEAVE_TRADE') {
          const { tradeId } = joinTradeSchema.parse(msg.payload)
          const members = rooms.get(tradeId)
          if (members) {
            for (const member of members) {
              if (member.socket === socket) members.delete(member)
            }
          }
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

          await eventBus.emit('openp2p.message.sent', {
            messageId: message.id,
            tradeId: body.tradeId,
            senderId: participantId,
            content: body.content,
            msgType: body.msgType,
            timestamp: message.createdAt.toISOString(),
          }, body.tradeId)

          broadcastToTrade(body.tradeId, { type: 'NEW_MESSAGE', payload: message })
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
        const members = rooms.get(tradeId)
        if (!members) continue
        for (const member of members) {
          if (member.socket === socket) members.delete(member)
        }
        broadcastToTrade(tradeId, { type: 'USER_OFFLINE', payload: { tradeId, participantId } })
      }
    })
  })

  app.get('/v1/openp2p/chat/:tradeId/messages', {
    schema: { tags: ['open-p2p'] },
  }, async (request, reply) => {
    const { tradeId } = z.object({ tradeId: z.string().min(1) }).parse(request.params)
    const messages = await prisma.message.findMany({
      where: { tradeId },
      orderBy: { createdAt: 'asc' },
    })
    return reply.code(200).send({ success: true, data: messages })
  })
}
