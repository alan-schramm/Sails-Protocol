/**
 * TransportProvider — Sails Protocol Infrastructure Layer
 * RFC-002 (rfcs/RFC-002-transport-provider.md), PROTOCOL_SPECIFICATION.md §4B
 *
 * The Core never knows what WebSocket or HyperDHT is — it knows only this
 * interface. `PearsTransportProvider` wraps the existing `pearNodeRegistry`/
 * `PearNode` with zero behavioral change (RFC-002's own Reference
 * Implementation Plan). `FallbackTransportProvider`
 * (03-implementation_plan.md, section 3) composes it with
 * `WebSocketRelayTransportProvider` — Pears first, WebSocket relay only if
 * Pears doesn't connect within a timeout.
 *
 * Reconciled against RFC-002's literal interface in two places, both
 * because the underlying types RFC-002 referenced don't exist as code yet:
 * - `start(participant: Participant)` → `start(participantId: string)`.
 * `Participant` (RFC-001) has no TypeScript interface anywhere in this
 * codebase yet (still doc-only, PROTOCOL_SPECIFICATION.md §1.1) — every
 * other file in this codebase (Intent.participantId, Claim.claimedBy, etc.)
 * already uses a plain string id in its place, per DATABASE.md's own
 * documented convention. Adopting the full `Participant` object here would
 * be inventing a dependency this file alone would need, not applying an
 * existing one.
 * - `PeerHandle` is given a concrete minimal shape (`{ peerId: string }`)
 * since RFC-002 named the return type without defining its fields.
 */
import { pearNodeRegistry } from './pear.service'

export interface PeerHandle {
  peerId: string
}

export interface TransportProvider {
  name: string
  start(participantId: string, secretKeyHex: string): Promise<PeerHandle>
  stop(participantId: string): Promise<void>
  joinTopic(participantId: string, topic: string): Promise<void>
  broadcast(participantId: string, payload: unknown): Promise<number>
  sendToPeer(participantId: string, targetParticipantId: string, payload: unknown): Promise<boolean>
  onMessage(participantId: string, handler: (peerId: string, payload: unknown) => void): void
  isConnected(participantId: string): boolean
}

// ─── PearsTransportProvider — wraps pearNodeRegistry, zero behavioral change ──
export class PearsTransportProvider implements TransportProvider {
  name = 'pears'

  async start(participantId: string, secretKeyHex: string): Promise<PeerHandle> {
    const peerId = await pearNodeRegistry.start(participantId, secretKeyHex)
    return { peerId }
  }

  async stop(participantId: string): Promise<void> {
    await pearNodeRegistry.stop(participantId)
  }

  async joinTopic(participantId: string, topic: string): Promise<void> {
    const node = pearNodeRegistry.get(participantId)
    if (!node) throw new Error(`PearsTransportProvider: no active node for ${participantId} — call start() first`)
    await node.joinTopic(topic)
  }

  async broadcast(participantId: string, payload: unknown): Promise<number> {
    const node = pearNodeRegistry.get(participantId)
    if (!node) return 0
    return node.broadcast(payload as Record<string, unknown>)
  }

  async sendToPeer(participantId: string, targetParticipantId: string, payload: unknown): Promise<boolean> {
    const node = pearNodeRegistry.get(participantId)
    if (!node) return false
    // TransportProvider never assumes continuous connectivity (RFC-002
    // v8.7 amendment) — a `false` return here is a normal, expected
    // outcome, not an error the caller needs to catch.
    return node.sendToPeer(targetParticipantId, payload as Record<string, unknown>)
  }

  onMessage(participantId: string, handler: (peerId: string, payload: unknown) => void): void {
    const node = pearNodeRegistry.get(participantId)
    if (!node) throw new Error(`PearsTransportProvider: no active node for ${participantId} — call start() first`)
    node.on('message', ({ peerId, message }: { peerId: string; message: unknown }) => {
      handler(peerId, message)
    })
  }

  isConnected(participantId: string): boolean {
    return pearNodeRegistry.isRunning(participantId)
  }
}

export const pearsTransportProvider = new PearsTransportProvider()

// ─── FallbackTransportProvider — Pears first, WebSocket relay on timeout ─────
// 03-implementation_plan.md section 3: pear.service gets a connection
// timeout; websocket-relay activates only once that timeout is exhausted.
// Implemented here (racing PearsTransportProvider.start() against a timer)
// rather than inside pear.service.ts's own DHT bootstrap code — same
// user-visible behavior, without touching HyperDHT/Hyperswarm internals
// that have no way to be verified against live network conditions in this
// environment. Core depends on this composite, never on either transport
// directly, per RFC-002.
const DEFAULT_FALLBACK_TIMEOUT_MS = 5000

export class FallbackTransportProvider implements TransportProvider {
  name = 'fallback(pears→websocket-relay)'
  private activeProvider = new Map<string, TransportProvider>()

  constructor(
    private readonly primary: TransportProvider,
    private readonly secondary: TransportProvider,
    private readonly timeoutMs: number = DEFAULT_FALLBACK_TIMEOUT_MS
  ) {}

  async start(participantId: string, secretKeyHex: string): Promise<PeerHandle> {
    try {
      const handle = await this.withTimeout(this.primary.start(participantId, secretKeyHex), this.timeoutMs)
      this.activeProvider.set(participantId, this.primary)
      return handle
    } catch (err) {
      console.warn(
        `[FallbackTransportProvider] ${this.primary.name} did not connect within ${this.timeoutMs}ms for ${participantId} — falling back to ${this.secondary.name}:`,
        err instanceof Error ? err.message : err
      )
      const handle = await this.secondary.start(participantId, secretKeyHex)
      this.activeProvider.set(participantId, this.secondary)
      return handle
    }
  }

  private provider(participantId: string): TransportProvider {
    return this.activeProvider.get(participantId) ?? this.primary
  }

  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms)
      promise.then(
        (value) => { clearTimeout(timer); resolve(value) },
        (err) => { clearTimeout(timer); reject(err) }
      )
    })
  }

  async stop(participantId: string): Promise<void> {
    await this.provider(participantId).stop(participantId)
    this.activeProvider.delete(participantId)
  }

  async joinTopic(participantId: string, topic: string): Promise<void> {
    await this.provider(participantId).joinTopic(participantId, topic)
  }

  async broadcast(participantId: string, payload: unknown): Promise<number> {
    return this.provider(participantId).broadcast(participantId, payload)
  }

  async sendToPeer(participantId: string, targetParticipantId: string, payload: unknown): Promise<boolean> {
    return this.provider(participantId).sendToPeer(participantId, targetParticipantId, payload)
  }

  onMessage(participantId: string, handler: (peerId: string, payload: unknown) => void): void {
    this.provider(participantId).onMessage(participantId, handler)
  }

  isConnected(participantId: string): boolean {
    return this.provider(participantId).isConnected(participantId)
  }
}
