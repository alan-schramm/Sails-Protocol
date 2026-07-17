/**
 * Protocol SDK modules (liquidity, settlement, peers, openp2p) — each
 * test asserts the exact method/path/body the module sends, checked
 * against the verified route inventory (docs/API_REFERENCE.md
 * cross-referenced with each route file directly, not assumed from the
 * aspirational doc alone).
 */
import { SailsTransport } from '../src/transport'
import { SailsLiquidityModule } from '../src/modules/liquidity'
import { SailsSettlementModule } from '../src/modules/settlement'
import { SailsPeersModule } from '../src/modules/peers'
import { SailsOpenP2PModule, WebSocketChannel } from '../src/modules/openp2p'

function fakeFetch(status: number, body: unknown): jest.Mock {
  return jest.fn().mockResolvedValue({ ok: status >= 200 && status < 300, status, json: async () => body })
}

function authedTransport(fetchImpl: jest.Mock): SailsTransport {
  const transport = new SailsTransport({ baseUrl: 'http://localhost:3000', fetchImpl: fetchImpl as unknown as typeof fetch })
  transport.setSessionToken('session-abc')
  return transport
}

describe('SailsLiquidityModule', () => {
  it('discover() hits GET /v1/liquidity/offers with asset+side query only', async () => {
    const fetchImpl = fakeFetch(200, { success: true, data: [] })
    const liquidity = new SailsLiquidityModule(new SailsTransport({ baseUrl: 'http://localhost:3000', fetchImpl: fetchImpl as unknown as typeof fetch }))

    await liquidity.discover({ asset: 'BTC', side: 'BUY' })

    expect(fetchImpl.mock.calls[0][0]).toBe('http://localhost:3000/v1/liquidity/offers?asset=BTC&side=BUY')
  })

  it('publish() posts to /v1/liquidity/offers with auth', async () => {
    const fetchImpl = fakeFetch(201, { success: true, data: { id: 'offer-1' } })
    const liquidity = new SailsLiquidityModule(authedTransport(fetchImpl))

    await liquidity.publish({
      asset: 'BTC', side: 'SELL', priceUsd: '65000', minAmount: '0.01', maxAmount: '0.5', paymentMethod: 'PIX',
    })

    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('http://localhost:3000/v1/liquidity/offers')
    expect(init.headers.authorization).toBe('Bearer session-abc')
  })

  it('match() posts asset/side/amount to /v1/liquidity/match', async () => {
    const fetchImpl = fakeFetch(200, { success: true, data: null })
    const liquidity = new SailsLiquidityModule(new SailsTransport({ baseUrl: 'http://localhost:3000', fetchImpl: fetchImpl as unknown as typeof fetch }))

    const result = await liquidity.match({ asset: 'BTC', side: 'BUY', amount: '0.1' })

    expect(result).toBeNull()
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('http://localhost:3000/v1/liquidity/match')
    expect(JSON.parse(init.body)).toEqual({ asset: 'BTC', side: 'BUY', amount: '0.1' })
  })
})

describe('SailsSettlementModule', () => {
  it('release() posts toAddress to /v1/settlement/escrow/:id/release with auth', async () => {
    const fetchImpl = fakeFetch(200, { success: true, data: { id: 'escrow-1', status: 'COMPLETED' } })
    const settlement = new SailsSettlementModule(authedTransport(fetchImpl))

    const result = await settlement.release('escrow-1', '0xbuyer')

    expect(result.status).toBe('COMPLETED')
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('http://localhost:3000/v1/settlement/escrow/escrow-1/release')
    expect(JSON.parse(init.body)).toEqual({ toAddress: '0xbuyer' })
  })

  it('dispute() posts reason+evidence to /v1/settlement/escrow/:id/dispute', async () => {
    const fetchImpl = fakeFetch(200, { success: true, data: { id: 'dispute-1' } })
    const settlement = new SailsSettlementModule(authedTransport(fetchImpl))

    await settlement.dispute('escrow-1', 'no payment received', ['screenshot.png'])

    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('http://localhost:3000/v1/settlement/escrow/escrow-1/dispute')
    expect(JSON.parse(init.body)).toEqual({ reason: 'no payment received', evidence: ['screenshot.png'] })
  })

  it('resolveDispute() posts ruling+releaseToAddress to /v1/settlement/disputes/:id/resolve', async () => {
    const fetchImpl = fakeFetch(200, { success: true, data: { id: 'dispute-1', ruling: 'RELEASE' } })
    const settlement = new SailsSettlementModule(authedTransport(fetchImpl))

    await settlement.resolveDispute('dispute-1', 'RELEASE', '0xbuyer')

    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('http://localhost:3000/v1/settlement/disputes/dispute-1/resolve')
    expect(JSON.parse(init.body)).toEqual({ ruling: 'RELEASE', releaseToAddress: '0xbuyer' })
  })
})

describe('SailsPeersModule', () => {
  it('start() posts secretKey to /v1/peers/start with auth', async () => {
    const fetchImpl = fakeFetch(200, { success: true, data: { peerId: 'abc123' } })
    const peers = new SailsPeersModule(authedTransport(fetchImpl))

    const result = await peers.start('base64secret==')

    expect(result.peerId).toBe('abc123')
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('http://localhost:3000/v1/peers/start')
    expect(JSON.parse(init.body)).toEqual({ secretKey: 'base64secret==' })
  })

  it('joinTopic() posts to /v1/peers/join-topic', async () => {
    const fetchImpl = fakeFetch(200, { success: true, data: {} })
    const peers = new SailsPeersModule(authedTransport(fetchImpl))

    await peers.joinTopic('marketplace')

    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('http://localhost:3000/v1/peers/join-topic')
    expect(JSON.parse(init.body)).toEqual({ topic: 'marketplace' })
  })
})

describe('SailsOpenP2PModule', () => {
  it('trade() posts offerId+amount to /v1/openp2p/trades (the SDK_GUIDE.md deviation this module documents)', async () => {
    const fetchImpl = fakeFetch(201, { success: true, data: { id: 'trade-1' } })
    const openp2p = new SailsOpenP2PModule(authedTransport(fetchImpl))

    await openp2p.trade('offer-1', '0.1')

    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('http://localhost:3000/v1/openp2p/trades')
    expect(JSON.parse(init.body)).toEqual({ offerId: 'offer-1', amount: '0.1' })
  })

  it('chat() throws if called before authenticate() (no session token)', () => {
    const openp2p = new SailsOpenP2PModule(new SailsTransport({ baseUrl: 'http://localhost:3000', fetchImpl: jest.fn() as unknown as typeof fetch }))
    expect(() => openp2p.chat('trade-1')).toThrow(/active session/)
  })
})

// Minimal fake matching the WebSocket surface WebSocketChannel actually
// uses (addEventListener/send/close) — no real socket/network involved.
class FakeSocket {
  sent: string[] = []
  private listeners: Record<string, Array<(e: any) => void>> = {}
  addEventListener(type: string, handler: (e: any) => void) {
    (this.listeners[type] ??= []).push(handler)
  }
  send(data: string) {
    this.sent.push(data)
  }
  close() {}
  emitOpen() {
    (this.listeners['open'] ?? []).forEach((h) => h({}))
  }
  emitMessage(data: unknown) {
    (this.listeners['message'] ?? []).forEach((h) => h({ data: JSON.stringify(data) }))
  }
}

describe('WebSocketChannel', () => {
  it('auto-joins the trade room as soon as the socket opens', () => {
    const socket = new FakeSocket()
    new WebSocketChannel(socket as unknown as WebSocket, 'trade-1')

    socket.emitOpen()

    expect(JSON.parse(socket.sent[0])).toEqual({ type: 'JOIN_TRADE', payload: { tradeId: 'trade-1' } })
  })

  it('send() wraps content in a SEND_MESSAGE frame scoped to the channel\'s tradeId', () => {
    const socket = new FakeSocket()
    const channel = new WebSocketChannel(socket as unknown as WebSocket, 'trade-1')

    channel.send({ content: 'Sending payment now' })

    expect(JSON.parse(socket.sent[0])).toEqual({
      type: 'SEND_MESSAGE',
      payload: { tradeId: 'trade-1', content: 'Sending payment now', msgType: 'TEXT' },
    })
  })

  it('onMessage() fires only for NEW_MESSAGE frames, onEvent() fires for every frame', () => {
    const socket = new FakeSocket()
    const channel = new WebSocketChannel(socket as unknown as WebSocket, 'trade-1')
    const messages: unknown[] = []
    const events: unknown[] = []
    channel.onMessage((m) => messages.push(m))
    channel.onEvent((e) => events.push(e))

    socket.emitMessage({ type: 'NEW_MESSAGE', payload: { id: 'msg-1', content: 'hi' } })
    socket.emitMessage({ type: 'TRADE_STATUS_UPDATE', payload: { status: 'ACTIVE' } })

    expect(messages).toEqual([{ id: 'msg-1', content: 'hi' }])
    expect(events).toHaveLength(2)
  })
})
