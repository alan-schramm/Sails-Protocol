/**
 * Covers the gap chat.routes.ts's own header comment used to flag:
 * `HumanChatChannel.onEvent()` was defined but never called anywhere, so
 * inbound Pears negotiation events had no consumer. Exercises
 * `wireInboundNegotiationChannel()` (negotiation.service.ts) against a
 * mocked PearNode — a live two-node Pears/HyperDHT setup is still needed
 * to verify the real wire round trip end-to-end (same limitation
 * `PearsTransportProvider`'s own tests already decline to fake).
 *
 * Three things this suite checks, matching the three real risks the
 * implementation comments call out:
 *   1. A spoofed `peerId` (claims to be `remoteUserId` but didn't
 *      handshake as them) must not reach the handler.
 *   2. Re-wiring the same (participant, trade) pair against the *same*
 *      PearNode instance must not stack duplicate listeners / double-
 *      persist one inbound event.
 *   3. Re-wiring against a *new* PearNode instance for the same trade
 *      (a stop()/start() restart) must still wire — not be silently
 *      skipped as "already wired" against an instance nothing points to
 *      anymore.
 */
export {} // see chatUnification.test.ts's header comment for why this is needed

const mockMessageCreate = jest.fn().mockResolvedValue({ id: 'msg-1', createdAt: new Date('2026-01-01T00:00:00Z') })

jest.mock('../src/common/database', () => ({
  prisma: {
    message: { create: (...args: unknown[]) => mockMessageCreate(...args) },
  },
}))

jest.mock('../src/common/events/event-bus', () => ({
  eventBus: {
    emit: jest.fn().mockResolvedValue(undefined),
  },
}))

import { EventEmitter } from 'events'

// A minimal stand-in for the real PearNode (src/infrastructure/p2p/pear.service.ts)
// — only the surface wireInboundNegotiationChannel()/HumanChatChannel actually
// use: EventEmitter's `on`/`emit`, plus `getConnectedPeerId()`.
class FakeNode extends EventEmitter {
  private connected = new Map<string, string>()

  setConnectedPeer(userId: string, peerId: string) {
    this.connected.set(userId, peerId)
  }

  getConnectedPeerId(userId: string): string | undefined {
    return this.connected.get(userId)
  }
}

const registryNodes = new Map<string, FakeNode>()
jest.mock('../src/infrastructure/p2p/pear.service', () => ({
  pearNodeRegistry: {
    get: (userId: string) => registryNodes.get(userId),
  },
}))

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { wireInboundNegotiationChannel } = require('../src/modules/open-p2p/negotiation.service')

function inboundMessage(tradeId: string, by: string, content: string) {
  return {
    kind: 'negotiation_event',
    tradeId,
    event: { type: 'MESSAGE_EXCHANGED', by, content, at: new Date().toISOString() },
  }
}

describe('wireInboundNegotiationChannel (inbound Pears negotiation events)', () => {
  beforeEach(() => {
    registryNodes.clear()
  })

  it('does nothing when the participant has no local PearNode', () => {
    expect(() => wireInboundNegotiationChannel('buyer-1', 'seller-1', 'trade-1')).not.toThrow()
    expect(mockMessageCreate).not.toHaveBeenCalled()
  })

  it('persists an inbound event whose peerId matches the counterparty\'s verified handshake', async () => {
    const node = new FakeNode()
    node.setConnectedPeer('seller-1', 'peer-abc')
    registryNodes.set('buyer-1', node)

    wireInboundNegotiationChannel('buyer-1', 'seller-1', 'trade-1')
    node.emit('message', { peerId: 'peer-abc', message: inboundMessage('trade-1', 'seller-1', 'ok, sending now') })

    await Promise.resolve()
    await Promise.resolve()

    expect(mockMessageCreate).toHaveBeenCalledTimes(1)
    expect(mockMessageCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ tradeId: 'trade-1', senderId: 'seller-1', content: 'ok, sending now' }),
    })
  })

  it('ignores an event whose claimed sender does not match the connection\'s actual handshake-verified peerId (spoofed sender)', async () => {
    const node = new FakeNode()
    node.setConnectedPeer('seller-1', 'peer-abc')
    registryNodes.set('buyer-1', node)

    wireInboundNegotiationChannel('buyer-1', 'seller-1', 'trade-1')
    // Same message payload, but arriving over a connection that isn't
    // seller-1's verified handshake peerId — e.g. some other peer trying
    // to inject a negotiation event claiming to be seller-1.
    node.emit('message', { peerId: 'peer-attacker', message: inboundMessage('trade-1', 'seller-1', 'spoofed') })

    await Promise.resolve()
    await Promise.resolve()

    expect(mockMessageCreate).not.toHaveBeenCalled()
  })

  it('does not double-persist when wired twice against the same PearNode instance for the same trade', async () => {
    const node = new FakeNode()
    node.setConnectedPeer('seller-1', 'peer-abc')
    registryNodes.set('buyer-1', node)

    wireInboundNegotiationChannel('buyer-1', 'seller-1', 'trade-1')
    wireInboundNegotiationChannel('buyer-1', 'seller-1', 'trade-1') // e.g. a WS reconnect re-running JOIN_TRADE

    node.emit('message', { peerId: 'peer-abc', message: inboundMessage('trade-1', 'seller-1', 'once please') })

    await Promise.resolve()
    await Promise.resolve()

    expect(mockMessageCreate).toHaveBeenCalledTimes(1)
  })

  it('re-wires against a new PearNode instance for the same trade (e.g. after a stop()/start() restart)', async () => {
    const firstNode = new FakeNode()
    firstNode.setConnectedPeer('seller-1', 'peer-abc')
    registryNodes.set('buyer-1', firstNode)
    wireInboundNegotiationChannel('buyer-1', 'seller-1', 'trade-1')

    const secondNode = new FakeNode()
    secondNode.setConnectedPeer('seller-1', 'peer-def')
    registryNodes.set('buyer-1', secondNode)
    wireInboundNegotiationChannel('buyer-1', 'seller-1', 'trade-1')

    secondNode.emit('message', { peerId: 'peer-def', message: inboundMessage('trade-1', 'seller-1', 'after restart') })

    await Promise.resolve()
    await Promise.resolve()

    expect(mockMessageCreate).toHaveBeenCalledTimes(1)
  })

  it('does not persist the inbound copy when the counterparty also has a node in this same registry (their own sendEvent() already persisted it)', async () => {
    const node = new FakeNode()
    node.setConnectedPeer('seller-1', 'peer-abc')
    registryNodes.set('buyer-1', node)
    registryNodes.set('seller-1', new FakeNode()) // counterparty is also local to this process

    wireInboundNegotiationChannel('buyer-1', 'seller-1', 'trade-1')
    node.emit('message', { peerId: 'peer-abc', message: inboundMessage('trade-1', 'seller-1', 'both local') })

    await Promise.resolve()
    await Promise.resolve()

    expect(mockMessageCreate).not.toHaveBeenCalled()
  })

  it('ignores messages for a different trade or a different message kind', async () => {
    const node = new FakeNode()
    node.setConnectedPeer('seller-1', 'peer-abc')
    registryNodes.set('buyer-1', node)

    wireInboundNegotiationChannel('buyer-1', 'seller-1', 'trade-1')
    node.emit('message', { peerId: 'peer-abc', message: inboundMessage('trade-OTHER', 'seller-1', 'wrong trade') })
    node.emit('message', { peerId: 'peer-abc', message: { kind: 'handshake_or_something_else', tradeId: 'trade-1' } })

    await Promise.resolve()
    await Promise.resolve()

    expect(mockMessageCreate).not.toHaveBeenCalled()
  })
})
