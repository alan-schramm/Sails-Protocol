/**
 * Sails Protocol — Infrastructure Layer: P2P Transport (Pears / HyperDHT)
 *
 * MOVED from src/modules/identity/pear.service.ts (see prior review pass
 * for the Domain/Infrastructure boundary fix).
 *
 * DECISION RESOLVED (this pass): the previous version had `PearPeerManager`
 * as a single process-wide singleton, but `start(userId, ...)` implied
 * multi-user support — a second call silently clobbered the first user's
 * node. Fixed by splitting responsibilities:
 *
 *   PearNode           → one DHT node for ONE user (was PearPeerManager).
 *                        Pure instance, no static/singleton state.
 *   PearNodeRegistry   → owns a Map<userId, PearNode>. This is the
 *                        singleton — there's exactly one registry per
 *                        server process, and it hands out/reuses one
 *                        PearNode per active user.
 *
 * Route handlers should depend on `pearNodeRegistry`, never construct a
 * `PearNode` directly. This makes "one DHT identity per user, N users per
 * process" the enforced shape instead of an accidental one.
 */

import HyperDHT from 'hyperdht'
import Hyperswarm from 'hyperswarm'
import b4a from 'b4a'
import { createHash } from 'crypto'
import { EventEmitter } from 'events'
import { eventBus } from '../../common/events/event-bus'
import { prisma } from '../../common/database'
import { config } from '../../config'

// ─── Types ────────────────────────────────────────────────────────────────────
export interface PearPeer {
  userId: string
  publicKey: string
  peerId: string
  connection?: unknown
  connectedAt: Date
}

// ─── Topic derivation ─────────────────────────────────────────────────────────
export function deriveTopic(name: string): Buffer {
  return createHash('sha256').update(`sails:v1:${name}`).digest()
}

export const TOPICS = {
  marketplace: deriveTopic('marketplace'),
  btc: deriveTopic('offers:BTC'),
  lnBtc: deriveTopic('offers:LN_BTC'),
  liquidBtc: deriveTopic('offers:LIQUID_BTC'),
  usdtErc20: deriveTopic('offers:USDT_ERC20'),
  usdtLiquid: deriveTopic('offers:USDT_LIQUID'),
  trade: (tradeId: string) => deriveTopic(`trade:${tradeId}`),
} as const

// ─── PearNode — one DHT node for ONE user. No singleton state. ────────────────
export class PearNode extends EventEmitter {
  private dht: InstanceType<typeof HyperDHT> | null = null
  private swarm: InstanceType<typeof Hyperswarm> | null = null
  private peers = new Map<string, PearPeer>()
  private userPeerMap = new Map<string, string>()
  private topicAnnouncements = new Set<string>()
  private keyPair: { publicKey: Buffer; secretKey: Buffer } | null = null
  private isStarted = false

  constructor(private readonly ownerUserId: string) {
    super()
  }

  async start(secretKeyHex: string): Promise<string> {
    if (this.isStarted) return this.keyPair!.publicKey.toString('hex')

    const secretKey = Buffer.from(secretKeyHex, 'base64')
    const publicKey = secretKey.slice(32)
    this.keyPair = { publicKey, secretKey: secretKey.slice(0, 32) }

    this.dht = new HyperDHT({
      keyPair: this.keyPair,
      bootstrap:
        config.pear.bootstrapNodes.length > 0
          ? config.pear.bootstrapNodes.map((addr) => {
              const [host, port] = addr.split(':')
              return { host, port: parseInt(port || '49737') }
            })
          : undefined,
    })

    this.swarm = new Hyperswarm({ dht: this.dht, keyPair: this.keyPair })
    this.swarm.on('connection', (conn: unknown, info: unknown) => {
      this.handleNewConnection(conn, info)
    })

    this.isStarted = true
    const peerId = publicKey.toString('hex')

    await prisma.user.update({ where: { id: this.ownerUserId }, data: { peerId } })
    await this.joinTopic('marketplace')

    // correlationId = userId (RFC-010) — no trade to correlate a connectivity
    // event to; userId is the most specific trace identifier available.
    await eventBus.emit('peer.connected', { userId: this.ownerUserId, peerId, publicKey: peerId }, this.ownerUserId)
    console.log(`[Pear:${this.ownerUserId.slice(0, 8)}] Node started. PeerId: ${peerId.slice(0, 16)}...`)
    return peerId
  }

  async stop(): Promise<void> {
    if (!this.isStarted) return

    await this.swarm?.destroy()
    await this.dht?.destroy()

    this.isStarted = false
    this.peers.clear()
    this.topicAnnouncements.clear()

    await eventBus.emit('peer.disconnected', {
      userId: this.ownerUserId,
      peerId: this.keyPair?.publicKey.toString('hex') ?? '',
    }, this.ownerUserId)   // correlationId = userId (RFC-010)
    console.log(`[Pear:${this.ownerUserId.slice(0, 8)}] Node stopped`)
  }

  async joinTopic(topicName: string): Promise<void> {
    if (!this.swarm) throw new Error('Swarm not started')
    if (this.topicAnnouncements.has(topicName)) return

    const topicKey = TOPICS[topicName as keyof typeof TOPICS]
    if (!topicKey || typeof topicKey === 'function') {
      throw new Error(`Unknown static topic: ${topicName}`)
    }

    const discovery = this.swarm.join(topicKey as Buffer, { server: true, client: true })
    await discovery.flushed()
    this.topicAnnouncements.add(topicName)
    console.log(`[Pear:${this.ownerUserId.slice(0, 8)}] Joined topic "${topicName}" — ${this.peers.size} peers so far`)
  }

  async joinTradeTopic(tradeId: string): Promise<void> {
    if (!this.swarm) throw new Error('Swarm not started')
    const topicKey = TOPICS.trade(tradeId)
    const topicName = `trade:${tradeId}`
    if (this.topicAnnouncements.has(topicName)) return

    const discovery = this.swarm.join(topicKey, { server: true, client: true })
    await discovery.flushed()
    this.topicAnnouncements.add(topicName)
    console.log(`[Pear:${this.ownerUserId.slice(0, 8)}] Joined trade topic ${tradeId.slice(0, 8)}`)
  }

  async leaveTradeTopic(tradeId: string): Promise<void> {
    if (!this.swarm) return
    await this.swarm.leave(TOPICS.trade(tradeId))
    this.topicAnnouncements.delete(`trade:${tradeId}`)
  }

  // Only handles the generic HANDSHAKE (peer identification). Higher-level
  // message types (chat/negotiation, offer announcements) are the
  // responsibility of OpenP2P / OpenLiquidity — they subscribe via the
  // `message` event this class emits, rather than this class special-casing
  // their payload shapes.
  private handleNewConnection(conn: unknown, info: unknown) {
    const socket = conn as any
    const peerInfo = info as any
    const remotePeerId: string = peerInfo?.publicKey ? b4a.toString(peerInfo.publicKey, 'hex') : 'unknown'

    console.log(`[Pear:${this.ownerUserId.slice(0, 8)}] New connection from peer ${remotePeerId.slice(0, 16)}`)
    socket.write(JSON.stringify({ type: 'HANDSHAKE', userId: this.ownerUserId }))

    socket.on('data', (data: Buffer) => {
      let msg: any
      try {
        msg = JSON.parse(data.toString())
      } catch {
        return
      }

      if (msg.type === 'HANDSHAKE') {
        const peer: PearPeer = {
          userId: msg.userId,
          publicKey: remotePeerId,
          peerId: remotePeerId,
          connection: conn,
          connectedAt: new Date(),
        }
        this.peers.set(remotePeerId, peer)
        this.userPeerMap.set(msg.userId, remotePeerId)
        console.log(`[Pear:${this.ownerUserId.slice(0, 8)}] Peer identified: user ${msg.userId.slice(0, 8)} → ${remotePeerId.slice(0, 16)}`)
        // correlationId = userId (RFC-010). Not awaited — this is a plain
        // (non-async) socket callback, matching the fire-and-forget pattern
        // eventBus.on() already uses for its own async listener errors.
        eventBus.emit('peer.connected', { userId: msg.userId, peerId: remotePeerId, publicKey: remotePeerId }, msg.userId)
          .catch((err) => console.error('[Pear] Failed to publish peer.connected:', err))
        return
      }

      // Negotiation messages (chat, payment proof, offer announcements) are
      // forwarded here — OpenP2P's chat module and OpenLiquidity's discovery
      // module attach listeners to this instance instead of this class
      // knowing their payload shapes.
      this.emit('message', { peerId: remotePeerId, message: msg })
    })

    socket.on('close', () => {
      const peer = this.peers.get(remotePeerId)
      if (peer) {
        this.peers.delete(remotePeerId)
        this.userPeerMap.delete(peer.userId)
        eventBus.emit('peer.disconnected', { userId: peer.userId, peerId: remotePeerId }, peer.userId)   // correlationId = userId (RFC-010)
          .catch((err) => console.error('[Pear] Failed to publish peer.disconnected:', err))
      }
    })

    socket.on('error', (err: Error) => {
      console.error(`[Pear:${this.ownerUserId.slice(0, 8)}] Connection error from ${remotePeerId.slice(0, 16)}:`, err.message)
    })
  }

  broadcast(payload: Record<string, unknown>): number {
    if (!this.isStarted) return 0
    const msg = JSON.stringify(payload)
    let sent = 0
    for (const [, peer] of this.peers) {
      try {
        const socket = peer.connection as any
        if (socket?.writable) {
          socket.write(msg)
          sent++
        }
      } catch {
        // skip dead connections
      }
    }
    return sent
  }

  sendToPeer(userId: string, payload: Record<string, unknown>): boolean {
    const peerId = this.userPeerMap.get(userId)
    if (!peerId) return false
    const peer = this.peers.get(peerId)
    if (!peer) return false

    try {
      ;(peer.connection as any).write(JSON.stringify(payload))
      return true
    } catch {
      return false
    }
  }

  getStatus() {
    return {
      userId: this.ownerUserId,
      started: this.isStarted,
      peerId: this.keyPair?.publicKey.toString('hex') ?? null,
      connectedPeers: this.peers.size,
      activeTopics: Array.from(this.topicAnnouncements),
      peers: Array.from(this.peers.values()).map((p) => ({
        userId: p.userId,
        peerId: p.peerId.slice(0, 16) + '...',
        connectedAt: p.connectedAt,
      })),
    }
  }

  isRunning(): boolean {
    return this.isStarted
  }
}

// ─── PearNodeRegistry — the ONE process-wide singleton ────────────────────────
// Owns exactly one PearNode per active userId. This is what makes "many
// users, one server process" correct: two users calling start() concurrently
// get two independent DHT nodes instead of clobbering a shared one.
class PearNodeRegistry {
  private nodes = new Map<string, PearNode>()

  async start(userId: string, secretKeyHex: string): Promise<string> {
    let node = this.nodes.get(userId)
    if (!node) {
      node = new PearNode(userId)
      this.nodes.set(userId, node)
    }
    return node.start(secretKeyHex)
  }

  async stop(userId: string): Promise<void> {
    const node = this.nodes.get(userId)
    if (!node) return
    await node.stop()
    this.nodes.delete(userId)
  }

  async stopAll(): Promise<void> {
    await Promise.all(Array.from(this.nodes.values()).map((n) => n.stop()))
    this.nodes.clear()
  }

  get(userId: string): PearNode | undefined {
    return this.nodes.get(userId)
  }

  isRunning(userId: string): boolean {
    return this.nodes.get(userId)?.isRunning() ?? false
  }

  getStatus(userId: string) {
    return (
      this.nodes.get(userId)?.getStatus() ?? {
        userId,
        started: false,
        peerId: null,
        connectedPeers: 0,
        activeTopics: [],
        peers: [],
      }
    )
  }

  activeCount(): number {
    return this.nodes.size
  }
}

// Singleton — exactly one registry per server process. Route handlers import
// this, never PearNode directly.
export const pearNodeRegistry = new PearNodeRegistry()
