/**
 * WebSocket relay route — `/ws/relay`. Gives `WebSocketRelayTransportProvider`
 * (websocket-relay.service.ts) a real socket to register against.
 *
 * Until this file existed, `WebSocketRelayTransportProvider` and
 * `FallbackTransportProvider` (transport-provider.ts) were real and
 * unit-tested in isolation (transportFallback.test.ts, with fake
 * TransportProvider/socket doubles) but had no live wiring — a class
 * comment in websocket-relay.service.ts referenced "app.ts's `/ws/relay`
 * route" that did not exist anywhere in this codebase. A fallback to a
 * relay that no client can ever reach is not a fallback; this is the
 * missing piece that makes it real.
 *
 * Auth follows chat.routes.ts's exact pattern (`?token=` query param,
 * resolved against the same Redis session store `requireAuth` uses) —
 * not `requireAuth`'s Authorization-header check, because a WebSocket
 * upgrade request from a browser client can't set arbitrary headers, the
 * same constraint that route already documents.
 *
 * Scope, stated plainly: this makes `start()`/`sendToPeer()` degrade
 * gracefully when Pears/HyperDHT hole-punching doesn't complete in time
 * (restrictive NAT, corporate firewall — transportFallback.test.ts's
 * timeout/reject cases). It does NOT give the relay a DHT-topic
 * equivalent — `/v1/peers/join-trade` and `/v1/peers/broadcast-offer`
 * still require a real PearNode and will 409 for a participant who fell
 * back to the relay. That is a structural limit of a point-to-point
 * relay, not an oversight (see transport-provider.ts's `FallbackTransportProvider`
 * class comment).
 */
import type { FastifyInstance } from 'fastify'
import { resolveParticipantFromToken } from '../../common/middleware/ws-auth'
import { webSocketRelayTransportProvider } from './websocket-relay.service'

export async function relayRoutes(app: FastifyInstance): Promise<void> {
  app.get('/ws/relay', { websocket: true }, async (socket, request) => {
    const query = request.query as { token?: string }
    const participantId = await resolveParticipantFromToken(query.token)
    if (!participantId) {
      socket.send(JSON.stringify({ type: 'ERROR', payload: { message: 'Missing or invalid token query param — authenticate via POST /v1/identity/authenticate first' } }))
      socket.close()
      return
    }

    webSocketRelayTransportProvider.registerSocket(participantId, socket)

    socket.on('message', (raw: Buffer) => {
      // Blind forward, same rule sendToPeer() follows (CISO Privacy Rule,
      // "Blind Relay") — this route never parses the frame, it only hands
      // the raw bytes to whichever onMessage() handler the participant
      // registered via the TransportProvider interface.
      webSocketRelayTransportProvider.dispatchIncoming(participantId, raw.toString())
    })

    socket.on('close', () => {
      webSocketRelayTransportProvider.unregisterSocket(participantId)
    })
  })
}
