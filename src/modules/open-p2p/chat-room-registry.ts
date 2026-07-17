/**
 * WS chat room registry — extracted out of chat.routes.ts so it can be
 * shared with common/events/handlers.ts. This is the piece that makes
 * the unification below possible: a message persisted via *either*
 * transport (this WS route, or negotiation.service.ts's HumanChatChannel
 * over Pears) ends up going through the same eventBus.emit
 * ('openp2p.message.sent', ...) call, and handlers.ts's single reaction
 * to that event is what pushes NEW_MESSAGE to every WS-connected room
 * member — regardless of which transport the message actually arrived
 * on. See handlers.ts's own comment for the part this doesn't cover
 * (Pears doesn't get pushed messages that originated from this WS route
 * — real-time delivery to a raw Pears client stays HumanChatChannel's
 * job, since SDK_GUIDE.md's own reference usage treats this WS channel
 * as the primary integrator-facing surface, not Pears directly).
 *
 * Module-scoped, in-memory — one process's view of who's watching which
 * trade. Same scope as pearNodeRegistry and EventStore's
 * InMemoryEventStore default; a multi-instance deployment needs a shared
 * pub/sub backend for this, not yet built.
 */
import type { WebSocket } from 'ws'

export interface RoomMember {
  socket: WebSocket
  participantId: string
}

const rooms = new Map<string, Set<RoomMember>>()

export function joinRoom(tradeId: string, member: RoomMember): void {
  if (!rooms.has(tradeId)) rooms.set(tradeId, new Set())
  rooms.get(tradeId)!.add(member)
}

export function leaveRoom(tradeId: string, socket: WebSocket): void {
  const members = rooms.get(tradeId)
  if (!members) return
  for (const member of members) {
    if (member.socket === socket) members.delete(member)
  }
}

export function broadcastToTrade(tradeId: string, payload: Record<string, unknown>, exclude?: WebSocket): void {
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
