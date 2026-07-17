/**
 * @sails/sdk — P2P Transport module (Pears/HyperDHT — verified against
 * src/infrastructure/p2p/pear.routes.ts directly).
 *
 * Not part of SDK_GUIDE.md's original `SailsClient` interface (that
 * document predates the route-restoration pass that made these real,
 * `API_REFERENCE.md` section 7's own routes) — added here because a
 * wallet integrating this SDK needs a way to actually start its own
 * HyperDHT node to participate in P2P discovery/negotiation at all
 * (PROJECT_CONTEXT.md's developer diagram: "the one thing a wallet
 * imports to get every module below it"). Flagged for SDK_GUIDE.md to
 * formally adopt, not silently added as if it had always been there.
 */
import type { SailsTransport } from '../transport'
import type { PeerStatus } from '../types'

const STATIC_TOPICS = ['marketplace', 'btc', 'lnBtc', 'liquidBtc', 'usdtErc20', 'usdtLiquid'] as const
export type StaticTopic = (typeof STATIC_TOPICS)[number]

export class SailsPeersModule {
  constructor(private readonly transport: SailsTransport) {}

  /** Requires an active session. `secretKeyHex` is a base64-encoded 64-byte Ed25519 secret key (see pear.service.ts's PearNode.start() — same convention HyperDHT.keyPair() produces). */
  async start(secretKeyBase64: string): Promise<{ peerId: string }> {
    return this.transport.post<{ peerId: string }>('/v1/peers/start', { secretKey: secretKeyBase64 }, true)
  }

  /** Requires an active session. */
  async stop(): Promise<void> {
    await this.transport.post('/v1/peers/stop', undefined, true)
  }

  /** Requires an active session. */
  async status(): Promise<PeerStatus> {
    return this.transport.get<PeerStatus>('/v1/peers/status', undefined, true)
  }

  /** Requires an active session and an active node (call start() first). */
  async joinTopic(topic: StaticTopic): Promise<void> {
    await this.transport.post('/v1/peers/join-topic', { topic }, true)
  }

  /** Requires an active session and an active node. */
  async joinTrade(tradeId: string): Promise<void> {
    await this.transport.post('/v1/peers/join-trade', { tradeId }, true)
  }

  /** Requires an active session and an active node. */
  async broadcastOffer(input: { offerId: string; asset: string; side: 'BUY' | 'SELL'; priceUsd: string }): Promise<{ deliveredTo: number }> {
    return this.transport.post<{ deliveredTo: number }>('/v1/peers/broadcast-offer', input, true)
  }
}
