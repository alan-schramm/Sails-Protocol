/**
 * Protocol SDK modules (liquidity, settlement, peers, openp2p) — each
 * test asserts the exact method/path/body the module sends, checked
 * against the verified route inventory (docs/API_REFERENCE.md
 * cross-referenced with each route file directly, not assumed from the
 * aspirational doc alone).
 */
import { SailsTransport } from '../src/transport'
import { SailsLiquidityModule } from '../src/modules/liquidity'
import { SailsSettlementModule, recommendedEscrowType, parseSafeGuardBundle } from '../src/modules/settlement'
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
  it('discover() hits GET /v1/liquidity/offers with asset+side query only, and returns the real { offers, sources } shape', async () => {
    // Real bug found and fixed wiring the first real caller
    // (packages/sails-ui): this method's return type used to claim a
    // bare Offer[] — the live route (liquidity.routes.ts ->
    // getAggregatedOffers()) actually returns { offers, sources }, each
    // offer a LiquidityOfferSummary, not a persisted Offer. Confirmed
    // against the real server, not assumed.
    const fetchImpl = fakeFetch(200, { success: true, data: { offers: [], sources: ['internal'] } })
    const liquidity = new SailsLiquidityModule(new SailsTransport({ baseUrl: 'http://localhost:3000', fetchImpl: fetchImpl as unknown as typeof fetch }))

    const result = await liquidity.discover({ asset: 'BTC', side: 'BUY' })

    expect(fetchImpl.mock.calls[0][0]).toBe('http://localhost:3000/v1/liquidity/offers?asset=BTC&side=BUY')
    expect(result).toEqual({ offers: [], sources: ['internal'] })
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
  it('create() resolves an omitted type via recommendedEscrowType and sends it to the server', async () => {
    const fetchImpl = fakeFetch(201, { success: true, data: { id: 'escrow-1', type: 'MULTISIG' } })
    const settlement = new SailsSettlementModule(authedTransport(fetchImpl))

    await settlement.create({ tradeId: 'trade-1', lockedAmount: '0.001', asset: 'BTC' })

    const [, init] = fetchImpl.mock.calls[0]
    expect(JSON.parse(init.body)).toEqual({ tradeId: 'trade-1', lockedAmount: '0.001', asset: 'BTC', type: 'MULTISIG' })
  })

  it('create() never overrides an explicitly passed type, even for an asset with a different recommendation', async () => {
    const fetchImpl = fakeFetch(201, { success: true, data: { id: 'escrow-1', type: 'MOCK' } })
    const settlement = new SailsSettlementModule(authedTransport(fetchImpl))

    await settlement.create({ tradeId: 'trade-1', lockedAmount: '0.001', asset: 'BTC', type: 'MOCK' })

    const [, init] = fetchImpl.mock.calls[0]
    expect(JSON.parse(init.body).type).toBe('MOCK')
  })

  it('create() throws client-side, before any network call, for an asset with no real SettlementProvider yet', async () => {
    const fetchImpl = fakeFetch(201, { success: true, data: {} })
    const settlement = new SailsSettlementModule(authedTransport(fetchImpl))

    await expect(settlement.create({ tradeId: 'trade-1', lockedAmount: '10', asset: 'SPARK' as any })).rejects.toThrow(
      "no real SettlementProvider exists yet for asset 'SPARK'"
    )
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('recommendedEscrowType() matches the real backend mapping for BTC/LN_BTC/USDT_ERC20, undefined otherwise', () => {
    expect(recommendedEscrowType('BTC')).toBe('MULTISIG')
    expect(recommendedEscrowType('LN_BTC')).toBe('LIGHTNING_HODL')
    expect(recommendedEscrowType('USDT_ERC20')).toBe('WDK_USDT_EVM')
    expect(recommendedEscrowType('SPARK' as any)).toBeUndefined()
  })

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

describe('parseSafeGuardBundle() — the SAFE_GUARD_EVM guard-deployment gap closed 2026-08-02', () => {
  const realBundle = JSON.stringify({
    path: 'COOPERATIVE',
    userOpHash: 'abc123',
    toAddress: '0x' + '22'.repeat(20),
    guardAddress: '0x' + '33'.repeat(20),
    guardDeployment: { to: '0x4e59b44847b379578588920ca78fbf26c0b4956c', data: '0xdeadbeef' },
    userOp: { sender: '0x' + '11'.repeat(20) },
  })

  it('parses a real SAFE_GUARD_EVM bundle into its structured shape', () => {
    const parsed = parseSafeGuardBundle(realBundle)
    expect(parsed.guardAddress).toBe('0x' + '33'.repeat(20))
    expect(parsed.guardDeployment).toEqual({ to: '0x4e59b44847b379578588920ca78fbf26c0b4956c', data: '0xdeadbeef' })
    expect(parsed.toAddress).toBe('0x' + '22'.repeat(20))
  })

  it('rejects a MULTISIG-shaped PSBT (a literal base64 string, not JSON) with a clear error, not a garbage parse', () => {
    expect(() => parseSafeGuardBundle('cHNidP8BAHECAAAAAA==')).toThrow(/not valid JSON/)
  })

  it('rejects valid JSON that is missing guardAddress/guardDeployment (e.g. a different escrow type\'s bundle shape)', () => {
    const notASafeGuardBundle = JSON.stringify({ path: 'COOPERATIVE', userOpHash: 'abc', toAddress: '0x123' })
    expect(() => parseSafeGuardBundle(notASafeGuardBundle)).toThrow(/not a SAFE_GUARD_EVM bundle/)
  })

  it('rejects a bundle with guardAddress but no guardDeployment (malformed, not a real case, but must fail loudly)', () => {
    const malformed = JSON.stringify({ guardAddress: '0x' + '33'.repeat(20) })
    expect(() => parseSafeGuardBundle(malformed)).toThrow(/not a SAFE_GUARD_EVM bundle/)
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

  // Fase 2 (SDK React) — GET /v1/openp2p/trades didn't exist before
  // useSailsTrades() needed a real list endpoint (trade.routes.ts's own
  // comment has the full story). Requires auth, unlike getTrade()/
  // getTradeByIntent() above.
  it('getTrades() hits GET /v1/openp2p/trades with auth, passing limit/offset as query params', async () => {
    const fetchImpl = fakeFetch(200, { success: true, data: { trades: [], total: 0, hasMore: false } })
    const openp2p = new SailsOpenP2PModule(authedTransport(fetchImpl))

    const result = await openp2p.getTrades({ limit: 20, offset: 40 })

    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('http://localhost:3000/v1/openp2p/trades?limit=20&offset=40')
    expect(init.headers.authorization).toBe('Bearer session-abc')
    expect(result).toEqual({ trades: [], total: 0, hasMore: false })
  })

  it('getTrades() omits limit/offset from the query string when called with no arguments', async () => {
    const fetchImpl = fakeFetch(200, { success: true, data: { trades: [], total: 0, hasMore: false } })
    const openp2p = new SailsOpenP2PModule(authedTransport(fetchImpl))

    await openp2p.getTrades()

    expect(fetchImpl.mock.calls[0][0]).toBe('http://localhost:3000/v1/openp2p/trades')
  })

  it('getTrades() throws if called before authenticate() (no session token) — matches every other auth-required call in this module', async () => {
    const openp2p = new SailsOpenP2PModule(new SailsTransport({ baseUrl: 'http://localhost:3000', fetchImpl: jest.fn() as unknown as typeof fetch }))
    await expect(openp2p.getTrades()).rejects.toThrow(/requires authentication/)
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
