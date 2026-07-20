/**
 * Route-restoration pass — HTTP round-trip tests through the real
 * Fastify routes (identity, peers, liquidity, trade, chat, settlement),
 * per the same `app.inject()` pattern BACKLOG.md's P0 "Intent Engine"
 * row already established for intentRoutes.ts.
 *
 * No live Postgres/Redis/HyperDHT in this environment — Prisma, Redis,
 * the event bus, and pearNodeRegistry are mocked, same as
 * intentFlow.test.ts/disputeFlow.test.ts's pattern: this verifies real
 * route wiring, zod validation, and requireAuth enforcement, not
 * database behavior. pear.service.ts's real HyperDHT/Hyperswarm classes
 * are never imported here — transportFallback.test.ts's own comment
 * already documents why that can't be verified without a live P2P
 * network in this environment.
 */
import type { FastifyInstance } from 'fastify'

const mockUserFindUnique = jest.fn()
const mockUserCreate = jest.fn()
const mockUserFindMany = jest.fn()
const mockReputationEventCreate = jest.fn()
const mockOfferFindUnique = jest.fn()
const mockOfferFindMany = jest.fn()
const mockOfferCreate = jest.fn()
const mockOfferUpdate = jest.fn()
const mockTradeFindUnique = jest.fn()
const mockTradeFindMany = jest.fn()
const mockTradeCreate = jest.fn()
const mockTradeUpdate = jest.fn()
const mockEscrowFindUnique = jest.fn()
const mockEscrowCreate = jest.fn()
const mockEscrowEventCreate = jest.fn()
const mockMessageFindMany = jest.fn()
const mockDisputeCreate = jest.fn()
const mockDisputeUpdate = jest.fn()
const mockCapabilityGrantCreate = jest.fn()
const mockCapabilityGrantFindMany = jest.fn()
const mockCapabilityGrantFindUnique = jest.fn()
const mockCapabilityGrantUpdate = jest.fn()
const mockIntentCreate = jest.fn()
const mockIntentFindUnique = jest.fn()
// Robustness-audit fix (2026-07-20): intent-engine.ts's transition() now
// reads Intent twice per call (once to claim its atomic updateMany(),
// once to re-fetch the post-claim row — updateMany() doesn't return the
// row the way update() did). Most of the extra re-fetch reads in this
// file aren't behavior-relevant to what these route/wiring tests check —
// this persistent default (mockResolvedValue, not mockResolvedValueOnce,
// so it survives every beforeEach's clearAllMocks() below) covers any
// call a test doesn't explicitly queue a value for, so each test only
// needs to queue the read(s) it actually cares about.
mockIntentFindUnique.mockResolvedValue({ id: 'intent-1', status: 'VALIDATED', moduleId: 'openp2p', payload: {} })
// Same fix, the write side: transition() no longer calls prisma.intent.
// update() at all — its status write is now the atomic updateMany()
// claim below (identical `data: { status: toStatus }` shape, so
// existing assertions on `.data.status` keep working unchanged).
const mockIntentUpdateMany = jest.fn().mockResolvedValue({ count: 1 })
const mockIntentEventCreate = jest.fn()
const mockIntentEventFindFirst = jest.fn()

jest.mock('../src/common/database', () => ({
  prisma: {
    intent: {
      create: (...args: unknown[]) => mockIntentCreate(...args),
      findUnique: (...args: unknown[]) => mockIntentFindUnique(...args),
      updateMany: (...args: unknown[]) => mockIntentUpdateMany(...args),
    },
    intentEvent: {
      create: (...args: unknown[]) => mockIntentEventCreate(...args),
      findFirst: (...args: unknown[]) => mockIntentEventFindFirst(...args),
    },
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
      findMany: (...args: unknown[]) => mockUserFindMany(...args),
      create: (...args: unknown[]) => mockUserCreate(...args),
      update: jest.fn().mockResolvedValue({ id: 'user-1', reputationScore: 2, totalTrades: 1 }),
    },
    reputationEvent: { create: (...args: unknown[]) => mockReputationEventCreate(...args) },
    offer: {
      findUnique: (...args: unknown[]) => mockOfferFindUnique(...args),
      findMany: (...args: unknown[]) => mockOfferFindMany(...args),
      create: (...args: unknown[]) => mockOfferCreate(...args),
      update: (...args: unknown[]) => mockOfferUpdate(...args),
    },
    trade: {
      findUnique: (...args: unknown[]) => mockTradeFindUnique(...args),
      findMany: (...args: unknown[]) => mockTradeFindMany(...args),
      create: (...args: unknown[]) => mockTradeCreate(...args),
      update: (...args: unknown[]) => mockTradeUpdate(...args),
    },
    escrow: {
      findUnique: (...args: unknown[]) => mockEscrowFindUnique(...args),
      create: (...args: unknown[]) => mockEscrowCreate(...args),
      update: jest.fn().mockResolvedValue({}),
      // Robustness-audit fix (2026-07-20) — escrow.service.ts's own
      // comment has the full reasoning; same shape as the intent fix
      // above (a default successful claim is enough for route-level
      // tests, which don't assert the atomicity itself — that's
      // escrowReleaseControls.test.ts's job).
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    escrowEvent: { create: (...args: unknown[]) => mockEscrowEventCreate(...args) },
    message: {
      findMany: (...args: unknown[]) => mockMessageFindMany(...args),
      create: jest.fn().mockResolvedValue({ id: 'msg-1', createdAt: new Date() }),
    },
    dispute: {
      create: (...args: unknown[]) => mockDisputeCreate(...args),
      findUnique: jest.fn(),
      update: (...args: unknown[]) => mockDisputeUpdate(...args),
    },
    capabilityGrant: {
      create: (...args: unknown[]) => mockCapabilityGrantCreate(...args),
      findMany: (...args: unknown[]) => mockCapabilityGrantFindMany(...args),
      findUnique: (...args: unknown[]) => mockCapabilityGrantFindUnique(...args),
      update: (...args: unknown[]) => mockCapabilityGrantUpdate(...args),
    },
  },
}))

const redisStore = new Map<string, string>()
jest.mock('../src/common/redis', () => ({
  redis: {
    get: jest.fn((key: string) => Promise.resolve(redisStore.get(key) ?? null)),
    set: jest.fn((key: string, value: string) => {
      redisStore.set(key, value)
      return Promise.resolve('OK')
    }),
    del: jest.fn((key: string) => {
      redisStore.delete(key)
      return Promise.resolve(1)
    }),
  },
}))

jest.mock('../src/common/events/event-bus', () => ({
  eventBus: {
    emit: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
    onDurable: jest.fn(),
  },
}))

const mockPearNodeGet = jest.fn().mockReturnValue(undefined)
const mockSendToPeer = jest.fn().mockReturnValue(true)
jest.mock('../src/infrastructure/p2p/pear.service', () => ({
  pearNodeRegistry: {
    start: jest.fn().mockResolvedValue('fake-peer-id'),
    stop: jest.fn().mockResolvedValue(undefined),
    get: (...args: unknown[]) => mockPearNodeGet(...args),
    getStatus: jest.fn().mockReturnValue({ userId: 'u', started: false, peerId: null, connectedPeers: 0, activeTopics: [], peers: [] }),
  },
}))

// @tetherto/wdk-wallet-evm ships pure ESM (no CJS build) — Jest's default
// transform doesn't touch node_modules, so requiring it as-is throws
// "Unexpected token 'export'". None of these route tests exercise
// wdk-settlement.provider.ts's real wallet calls (no route triggers
// EscrowType.WDK_USDT_EVM here), so it's mocked out entirely — same
// reasoning as pear.service.ts above (hyperdht/hyperswarm can't be
// verified without a live network either).
jest.mock('@tetherto/wdk-wallet-evm', () => ({
  __esModule: true,
  default: class FakeWalletManagerEvm {},
}))

// Imported after the mocks above so every route file picks up the mocked
// dependencies, not the real Prisma/Redis/eventBus/pearNodeRegistry.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { buildApp } = require('../src/app')

async function authedSession(participantId: string): Promise<string> {
  const token = `session-${participantId}`
  redisStore.set(`auth:session:${token}`, participantId)
  return token
}

describe('Route restoration — HTTP round-trips through the real routes', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildApp()
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => {
    jest.clearAllMocks()
    redisStore.clear()
  })

  describe('open-identity', () => {
    it('registers a participant', async () => {
      mockUserFindUnique.mockResolvedValueOnce(null) // no existing user for this publicKey
      mockUserCreate.mockResolvedValueOnce({ id: 'user-1', publicKey: 'pk-1' })

      const res = await app.inject({
        method: 'POST',
        url: '/v1/identity/participants',
        payload: { publicKey: 'pk-1', displayName: 'Alice' },
      })

      expect(res.statusCode).toBe(201)
      expect(JSON.parse(res.body)).toEqual(expect.objectContaining({ success: true, data: { id: 'user-1', publicKey: 'pk-1' } }))
    })

    it('rejects registering a public key that already has a participant', async () => {
      mockUserFindUnique.mockResolvedValueOnce({ id: 'user-1', publicKey: 'pk-1' })

      const res = await app.inject({
        method: 'POST',
        url: '/v1/identity/participants',
        payload: { publicKey: 'pk-1' },
      })

      expect(res.statusCode).toBe(400)
      expect(JSON.parse(res.body).error).toBe('VALIDATION_ERROR')
    })

    it('issues a challenge', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/identity/challenge',
        payload: { publicKey: 'pk-1' },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.data.challenge).toEqual(expect.any(String))
    })

    it('rejects authenticate with no challenge previously issued', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/identity/authenticate',
        payload: { publicKey: 'pk-never-challenged', signature: 'deadbeef' },
      })

      expect(res.statusCode).toBe(401)
    })

    it('rejects GET /v1/identity/me without a session token — requireAuth is actually enforced', async () => {
      const res = await app.inject({ method: 'GET', url: '/v1/identity/me' })
      expect(res.statusCode).toBe(401)
      expect(JSON.parse(res.body).error).toBe('AUTH_ERROR')
    })

    it('accepts GET /v1/identity/me with a valid session token', async () => {
      const token = await authedSession('user-1')
      mockUserFindUnique.mockResolvedValueOnce({ id: 'user-1', publicKey: 'pk-1' })

      const res = await app.inject({
        method: 'GET',
        url: '/v1/identity/me',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(res.statusCode).toBe(200)
      expect(JSON.parse(res.body).data.id).toBe('user-1')
    })
  })

  describe('peers', () => {
    it('rejects POST /v1/peers/start without auth', async () => {
      const res = await app.inject({ method: 'POST', url: '/v1/peers/start', payload: { secretKey: 'abcd' } })
      expect(res.statusCode).toBe(401)
    })

    it('starts a node for an authenticated caller', async () => {
      const token = await authedSession('user-1')
      const res = await app.inject({
        method: 'POST',
        url: '/v1/peers/start',
        headers: { authorization: `Bearer ${token}` },
        payload: { secretKey: 'abcd' },
      })
      expect(res.statusCode).toBe(200)
      expect(JSON.parse(res.body).data.peerId).toBe('fake-peer-id')
    })
  })

  describe('open-liquidity', () => {
    it('rejects publishing an offer without auth', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/liquidity/offers',
        payload: { asset: 'BTC', side: 'SELL', priceUsd: '65000', minAmount: '0.001', maxAmount: '0.5', paymentMethod: 'PIX' },
      })
      expect(res.statusCode).toBe(401)
    })

    it('publishes an offer for an authenticated caller', async () => {
      const token = await authedSession('user-1')
      // RFC-018 — createOffer() now calls intentEngine.create() first
      // (rfcs/RFC-018-intent-as-canonical-trade-entry-point.md), the
      // same CREATED -> VALIDATED -> COORDINATED chain the Intent API
      // test below already exercises — same mock pattern reused here,
      // not duplicated logic.
      mockIntentEventFindFirst.mockResolvedValue(null)
      mockIntentCreate.mockResolvedValueOnce({
        id: 'intent-1', type: 'TradeIntent', participantId: 'user-1', moduleId: 'openp2p', status: 'CREATED',
      })
      mockIntentFindUnique
        .mockResolvedValueOnce({ id: 'intent-1', status: 'CREATED' })                                          // transition() -> VALIDATED
        .mockResolvedValueOnce({ id: 'intent-1', status: 'VALIDATED', moduleId: 'openp2p', payload: {} })       // coordinationEngine.decide()
        .mockResolvedValueOnce({ id: 'intent-1', status: 'VALIDATED' })                                         // transition() -> COORDINATED
      mockIntentUpdateMany.mockResolvedValue({ id: 'intent-1', status: 'COORDINATED' })
      mockOfferCreate.mockResolvedValueOnce({ id: 'offer-1', userId: 'user-1', asset: 'BTC', side: 'SELL', priceUsd: '65000' })

      const res = await app.inject({
        method: 'POST',
        url: '/v1/liquidity/offers',
        headers: { authorization: `Bearer ${token}` },
        payload: { asset: 'BTC', side: 'SELL', priceUsd: '65000', minAmount: '0.001', maxAmount: '0.5', paymentMethod: 'PIX' },
      })

      expect(res.statusCode).toBe(201)
      expect(mockIntentCreate).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ participantId: 'user-1', type: 'TradeIntent' }) })
      )
      expect(mockOfferCreate).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ userId: 'user-1', asset: 'BTC', intentId: 'intent-1' }) })
      )
    })

    it('lists the order book for an asset', async () => {
      mockOfferFindMany.mockResolvedValue([])
      const res = await app.inject({ method: 'GET', url: '/v1/liquidity/offers/BTC/book' })
      expect(res.statusCode).toBe(200)
      expect(JSON.parse(res.body).data).toEqual(expect.objectContaining({ asset: 'BTC', bids: [], asks: [] }))
    })
  })

  describe('open-p2p — trades', () => {
    it('rejects starting a trade without auth', async () => {
      const res = await app.inject({ method: 'POST', url: '/v1/openp2p/trades', payload: { offerId: 'offer-1', amount: '0.01' } })
      expect(res.statusCode).toBe(401)
    })

    it('404s when the offer does not exist', async () => {
      const token = await authedSession('buyer-1')
      mockOfferFindUnique.mockResolvedValueOnce(null)

      const res = await app.inject({
        method: 'POST',
        url: '/v1/openp2p/trades',
        headers: { authorization: `Bearer ${token}` },
        payload: { offerId: 'missing-offer', amount: '0.01' },
      })

      expect(res.statusCode).toBe(404)
    })

    it('starts a trade from an active offer and opens negotiation', async () => {
      const token = await authedSession('buyer-1')
      mockOfferFindUnique.mockResolvedValueOnce({
        id: 'offer-1', userId: 'seller-1', status: 'ACTIVE', side: 'SELL',
        asset: 'BTC', priceUsd: '65000', network: null,
      })
      mockTradeCreate.mockResolvedValueOnce({
        id: 'trade-1', buyerId: 'buyer-1', sellerId: 'seller-1', status: 'PENDING',
        asset: 'BTC', amount: '0.01', priceUsd: '65000', // Decimal fields — real Prisma rows have .toString(), strings do too
      })
      mockTradeFindUnique.mockResolvedValueOnce({ id: 'trade-1', status: 'PENDING' }) // negotiationService.open()'s own lookup

      const res = await app.inject({
        method: 'POST',
        url: '/v1/openp2p/trades',
        headers: { authorization: `Bearer ${token}` },
        payload: { offerId: 'offer-1', amount: '0.01' },
      })

      expect(res.statusCode).toBe(201)
      expect(mockTradeCreate).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ buyerId: 'buyer-1', sellerId: 'seller-1' }) })
      )
    })

    it('RFC-018: walks the offer\'s Intent through DISCOVERING -> MATCHED -> NEGOTIATING when a trade starts', async () => {
      const token = await authedSession('buyer-1')
      mockOfferFindUnique.mockResolvedValueOnce({
        id: 'offer-1', userId: 'seller-1', status: 'ACTIVE', side: 'SELL',
        asset: 'BTC', priceUsd: '65000', network: null, intentId: 'intent-1',
      })
      mockTradeCreate.mockResolvedValueOnce({
        id: 'trade-1', buyerId: 'buyer-1', sellerId: 'seller-1', status: 'PENDING',
        asset: 'BTC', amount: '0.01', priceUsd: '65000', intentId: 'intent-1',
      })
      mockTradeFindUnique.mockResolvedValueOnce({ id: 'trade-1', status: 'PENDING' })
      mockIntentEventFindFirst.mockResolvedValue(null)
      // Robustness-audit fix (2026-07-20): each of the three transition()
      // calls below now reads Intent twice (claim + re-fetch), not once —
      // 6 queued values total, not 3. Order: DISCOVERING's (read, refetch),
      // MATCHED's (read, refetch), NEGOTIATING's (read, refetch).
      mockIntentFindUnique
        .mockResolvedValueOnce({ id: 'intent-1', status: 'COORDINATED' })  // -> DISCOVERING: read
        .mockResolvedValueOnce({ id: 'intent-1', status: 'DISCOVERING' })  // -> DISCOVERING: refetch
        .mockResolvedValueOnce({ id: 'intent-1', status: 'DISCOVERING' })  // -> MATCHED: read
        .mockResolvedValueOnce({ id: 'intent-1', status: 'MATCHED' })      // -> MATCHED: refetch
        .mockResolvedValueOnce({ id: 'intent-1', status: 'MATCHED' })      // -> NEGOTIATING: read
        .mockResolvedValueOnce({ id: 'intent-1', status: 'NEGOTIATING' }) // -> NEGOTIATING: refetch
      mockIntentUpdateMany.mockResolvedValue({ count: 1 })

      const res = await app.inject({
        method: 'POST',
        url: '/v1/openp2p/trades',
        headers: { authorization: `Bearer ${token}` },
        payload: { offerId: 'offer-1', amount: '0.01' },
      })

      expect(res.statusCode).toBe(201)
      expect(mockTradeCreate).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ intentId: 'intent-1' }) })
      )
      // Three sequential transitions, in order — the actual state-machine
      // edges (core/state-machine.ts) enforce the ordering; this just
      // confirms trade.service.ts actually drives it.
      const toStatuses = mockIntentUpdateMany.mock.calls.map((c) => c[0]?.data?.status)
      expect(toStatuses).toEqual(['DISCOVERING', 'MATCHED', 'NEGOTIATING'])
    })

    // Failure-scenario coverage requested directly in a CTO-role
    // follow-up after RFC-018 Phases 1-2 landed: "garantir que os
    // testes cubram cenários de falha... trade cancelado." Real gap
    // found and fixed in the same pass — updateStatus('CANCELLED')
    // previously never touched the Intent at all, leaving it stuck at
    // NEGOTIATING forever for any trade cancelled before escrow locks.
    it('RFC-018: cancelling a trade before escrow locks transitions its Intent to CANCELLED', async () => {
      const token = await authedSession('buyer-1')
      mockTradeFindUnique.mockResolvedValueOnce({
        id: 'trade-1', buyerId: 'buyer-1', sellerId: 'seller-1', status: 'PENDING', intentId: 'intent-1',
      })
      mockTradeUpdate.mockResolvedValueOnce({ id: 'trade-1', status: 'CANCELLED' })
      mockIntentEventFindFirst.mockResolvedValue(null)
      mockIntentFindUnique.mockResolvedValueOnce({ id: 'intent-1', status: 'NEGOTIATING' })
      mockIntentUpdateMany.mockResolvedValueOnce({ id: 'intent-1', status: 'CANCELLED' })

      const res = await app.inject({
        method: 'PATCH',
        url: '/v1/openp2p/trades/trade-1/status',
        headers: { authorization: `Bearer ${token}` },
        payload: { status: 'CANCELLED' },
      })

      expect(res.statusCode).toBe(200)
      // Robustness-audit fix (2026-07-20): the atomic claim's `where` now
      // includes the expected current status too, not just the id — see
      // intent-engine.ts's own comment.
      expect(mockIntentUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'intent-1', status: 'NEGOTIATING' }, data: { status: 'CANCELLED' } })
      )
    })

    it('RFC-018: cancelling a trade with no Intent behind it (pre-RFC-018 data) still succeeds, no Intent call made', async () => {
      const token = await authedSession('buyer-1')
      mockTradeFindUnique.mockResolvedValueOnce({
        id: 'trade-1', buyerId: 'buyer-1', sellerId: 'seller-1', status: 'PENDING', intentId: null,
      })
      mockTradeUpdate.mockResolvedValueOnce({ id: 'trade-1', status: 'CANCELLED' })

      const res = await app.inject({
        method: 'PATCH',
        url: '/v1/openp2p/trades/trade-1/status',
        headers: { authorization: `Bearer ${token}` },
        payload: { status: 'CANCELLED' },
      })

      expect(res.statusCode).toBe(200)
      expect(mockIntentUpdateMany).not.toHaveBeenCalled()
    })
  })

  describe('open-p2p — chat message history (now requires auth — found and fixed while writing this test)', () => {
    it('rejects fetching message history without auth', async () => {
      const res = await app.inject({ method: 'GET', url: '/v1/openp2p/chat/trade-1/messages' })
      expect(res.statusCode).toBe(401)
    })

    it('rejects a caller who is not a party to the trade', async () => {
      const token = await authedSession('stranger')
      mockTradeFindUnique.mockResolvedValueOnce({ id: 'trade-1', buyerId: 'buyer-1', sellerId: 'seller-1' })

      const res = await app.inject({
        method: 'GET',
        url: '/v1/openp2p/chat/trade-1/messages',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(res.statusCode).toBe(403)
    })

    it('returns message history for a trade participant', async () => {
      const token = await authedSession('buyer-1')
      mockTradeFindUnique.mockResolvedValueOnce({ id: 'trade-1', buyerId: 'buyer-1', sellerId: 'seller-1' })
      mockMessageFindMany.mockResolvedValueOnce([{ id: 'msg-1', content: 'hi' }])

      const res = await app.inject({
        method: 'GET',
        url: '/v1/openp2p/chat/trade-1/messages',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(res.statusCode).toBe(200)
      expect(JSON.parse(res.body).data).toEqual([{ id: 'msg-1', content: 'hi' }])
    })
  })

  describe('open-p2p — chat WS best-effort Pears relay (chat-unification follow-up)', () => {
    it('relays a WS-sent message onto Pears when the sender has an active PearNode', async () => {
      const token = await authedSession('buyer-1')
      mockTradeFindUnique.mockResolvedValueOnce({ id: 'trade-1', buyerId: 'buyer-1', sellerId: 'seller-1' })
      mockPearNodeGet.mockReturnValueOnce({ sendToPeer: mockSendToPeer })

      const ws = await app.injectWS(`/v1/openp2p/chat?token=${token}`)
      ws.send(JSON.stringify({ type: 'SEND_MESSAGE', payload: { tradeId: 'trade-1', content: 'sending payment now' } }))
      await new Promise((resolve) => setTimeout(resolve, 50))
      ws.terminate()

      expect(mockSendToPeer).toHaveBeenCalledWith(
        'seller-1',
        expect.objectContaining({
          kind: 'negotiation_event',
          tradeId: 'trade-1',
          event: expect.objectContaining({ type: 'MESSAGE_EXCHANGED', by: 'buyer-1', content: 'sending payment now' }),
        })
      )
    })

    it('attempts no relay when the sender has no active PearNode (nothing to relay from)', async () => {
      const token = await authedSession('buyer-1')
      mockTradeFindUnique.mockResolvedValueOnce({ id: 'trade-1', buyerId: 'buyer-1', sellerId: 'seller-1' })
      // mockPearNodeGet's default (no active node) applies — no override here.

      const ws = await app.injectWS(`/v1/openp2p/chat?token=${token}`)
      ws.send(JSON.stringify({ type: 'SEND_MESSAGE', payload: { tradeId: 'trade-1', content: 'hi' } }))
      await new Promise((resolve) => setTimeout(resolve, 50))
      ws.terminate()

      expect(mockSendToPeer).not.toHaveBeenCalled()
    })
  })

  describe('open-settlement', () => {
    it('rejects creating an escrow without auth', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/settlement/escrow',
        payload: { tradeId: 'trade-1', lockedAmount: '0.01', asset: 'BTC' },
      })
      expect(res.statusCode).toBe(401)
    })

    it('creates an escrow for an authenticated caller', async () => {
      const token = await authedSession('buyer-1')
      mockTradeFindUnique.mockResolvedValueOnce({ id: 'trade-1', escrowId: null })
      mockEscrowCreate.mockResolvedValueOnce({
        id: 'escrow-1', tradeId: 'trade-1', status: 'CREATED',
        type: 'MOCK', lockedAmount: '0.01', asset: 'BTC', // Decimal fields — same .toString() note as above
      })

      const res = await app.inject({
        method: 'POST',
        url: '/v1/settlement/escrow',
        headers: { authorization: `Bearer ${token}` },
        payload: { tradeId: 'trade-1', lockedAmount: '0.01', asset: 'BTC' },
      })

      expect(res.statusCode).toBe(201)
      expect(JSON.parse(res.body).data.id).toBe('escrow-1')
    })

    it('surfaces a clear config error when disputing with no TRUSTED_ARBITRATORS configured (not a crash)', async () => {
      const token = await authedSession('buyer-1')
      mockEscrowFindUnique.mockResolvedValueOnce({ id: 'escrow-1', tradeId: 'trade-1' })

      const res = await app.inject({
        method: 'POST',
        url: '/v1/settlement/escrow/escrow-1/dispute',
        headers: { authorization: `Bearer ${token}` },
        payload: { reason: 'no payment received' },
      })

      expect(res.statusCode).toBe(400)
      expect(JSON.parse(res.body).message).toMatch(/TRUSTED_ARBITRATORS/)
    })
  })

  describe('open-reputation', () => {
    it('returns a score breakdown for an existing participant', async () => {
      mockUserFindUnique.mockResolvedValueOnce({ id: 'user-1', reputationScore: 7, totalTrades: 4, disputeCount: 1 })

      const res = await app.inject({ method: 'GET', url: '/v1/reputation/user-1' })

      expect(res.statusCode).toBe(200)
      expect(JSON.parse(res.body).data).toEqual(
        expect.objectContaining({ participantId: 'user-1', total: 7, disputeRate: 0.25 })
      )
    })

    it('404s for a participant that does not exist', async () => {
      mockUserFindUnique.mockResolvedValueOnce(null)
      const res = await app.inject({ method: 'GET', url: '/v1/reputation/nobody' })
      expect(res.statusCode).toBe(404)
    })

    it('resolves a score by peerId (RFC-013 — Pears identity is the portable substrate, not a reputation source itself)', async () => {
      mockUserFindUnique
        .mockResolvedValueOnce({ id: 'user-1', peerId: 'abc123peer' }) // peerId -> user lookup
        .mockResolvedValueOnce({ id: 'user-1', reputationScore: 7, totalTrades: 4, disputeCount: 1 }) // getScore's own lookup

      const res = await app.inject({ method: 'GET', url: '/v1/reputation/peer/abc123peer' })

      expect(res.statusCode).toBe(200)
      expect(JSON.parse(res.body).data).toEqual(
        expect.objectContaining({ participantId: 'user-1', total: 7 })
      )
      expect(mockUserFindUnique).toHaveBeenNthCalledWith(1, { where: { peerId: 'abc123peer' } })
    })

    it('404s a peerId with no registered participant', async () => {
      mockUserFindUnique.mockResolvedValueOnce(null)
      const res = await app.inject({ method: 'GET', url: '/v1/reputation/peer/nobody-peer' })
      expect(res.statusCode).toBe(404)
    })

    it('returns the leaderboard (static route matches ahead of :participantId)', async () => {
      mockUserFindMany.mockResolvedValueOnce([{ id: 'user-1', reputationScore: 9, totalTrades: 5 }])
      const res = await app.inject({ method: 'GET', url: '/v1/reputation/leaderboard' })
      expect(res.statusCode).toBe(200)
      expect(JSON.parse(res.body).data).toEqual([{ id: 'user-1', reputationScore: 9, totalTrades: 5 }])
    })

    it('rejects rating without auth', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/reputation/rate',
        payload: { tradeId: 'trade-1', ratedId: 'seller-1', score: 5 },
      })
      expect(res.statusCode).toBe(401)
    })

    it('records a star rating for an authenticated caller — informational only, never touches reputationScore', async () => {
      const token = await authedSession('buyer-1')
      // Gap-audit fix: rate() now verifies raterId/ratedId are the
      // trade's own two counterparties before persisting.
      mockTradeFindUnique.mockResolvedValueOnce({ id: 'trade-1', buyerId: 'buyer-1', sellerId: 'seller-1' })
      mockReputationEventCreate.mockResolvedValueOnce({ id: 'rep-event-1', tradeId: 'trade-1', raterId: 'buyer-1', ratedId: 'seller-1', score: 5 })

      const res = await app.inject({
        method: 'POST',
        url: '/v1/reputation/rate',
        headers: { authorization: `Bearer ${token}` },
        payload: { tradeId: 'trade-1', ratedId: 'seller-1', score: 5 },
      })

      expect(res.statusCode).toBe(201)
      expect(mockReputationEventCreate).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ raterId: 'buyer-1', ratedId: 'seller-1', score: 5 }) })
      )
      // The only prisma.user.update in this whole test run is the module-
      // wide default mock (never called with a reputationScore change) —
      // rate() itself must never call it.
    })

    it('rejects a duplicate rating on the same trade by the same rater (P2002 -> clear 400, not a raw DB error)', async () => {
      const token = await authedSession('buyer-1')
      mockTradeFindUnique.mockResolvedValueOnce({ id: 'trade-1', buyerId: 'buyer-1', sellerId: 'seller-1' })
      mockReputationEventCreate.mockRejectedValueOnce({ code: 'P2002' })

      const res = await app.inject({
        method: 'POST',
        url: '/v1/reputation/rate',
        headers: { authorization: `Bearer ${token}` },
        payload: { tradeId: 'trade-1', ratedId: 'seller-1', score: 4 },
      })

      expect(res.statusCode).toBe(400)
      expect(JSON.parse(res.body).message).toMatch(/already rated/)
    })
  })

  describe('open-agents — capabilities (RFC-013)', () => {
    it('rejects registration without auth', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/capabilities/register',
        payload: { capabilityName: 'trade-coordination', scope: ['openp2p.trade.created'] },
      })
      expect(res.statusCode).toBe(401)
    })

    it('registers a self-issued capability grant for an authenticated caller', async () => {
      const token = await authedSession('buyer-1')
      mockCapabilityGrantCreate.mockResolvedValueOnce({
        id: 'grant-1',
        grantedTo: 'buyer-1',
        capabilityName: 'trade-coordination',
        scope: ['openp2p.trade.created'],
        constraints: null,
        issuedBy: 'buyer-1',
      })

      const res = await app.inject({
        method: 'POST',
        url: '/v1/capabilities/register',
        headers: { authorization: `Bearer ${token}` },
        payload: { capabilityName: 'trade-coordination', scope: ['openp2p.trade.created'] },
      })

      expect(res.statusCode).toBe(201)
      expect(JSON.parse(res.body).data).toEqual(
        expect.objectContaining({ grantId: 'grant-1', grantedTo: 'buyer-1', issuedBy: 'buyer-1' })
      )
      expect(mockCapabilityGrantCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ grantedTo: 'buyer-1', issuedBy: 'buyer-1', capabilityName: 'trade-coordination' }),
        })
      )
    })

    it('lists active grants for a participant, no auth required', async () => {
      mockCapabilityGrantFindMany.mockResolvedValueOnce([
        { id: 'grant-1', grantedTo: 'buyer-1', capabilityName: 'trade-coordination', scope: ['a'], constraints: null, issuedBy: 'buyer-1' },
      ])

      const res = await app.inject({ method: 'GET', url: '/v1/capabilities/buyer-1' })

      expect(res.statusCode).toBe(200)
      expect(JSON.parse(res.body).data).toHaveLength(1)
    })

    it('rejects revoke without auth', async () => {
      const res = await app.inject({ method: 'POST', url: '/v1/capabilities/grant-1/revoke' })
      expect(res.statusCode).toBe(401)
    })

    it('revokes a grant for an authenticated caller', async () => {
      const token = await authedSession('buyer-1')
      mockCapabilityGrantFindUnique.mockResolvedValueOnce({ id: 'grant-1', grantedTo: 'buyer-1' })
      mockCapabilityGrantUpdate.mockResolvedValueOnce({})

      const res = await app.inject({
        method: 'POST',
        url: '/v1/capabilities/grant-1/revoke',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(res.statusCode).toBe(200)
      expect(mockCapabilityGrantUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'grant-1' } })
      )
    })

    it('rejects revoking a grant that belongs to someone else (gap-audit fix)', async () => {
      const token = await authedSession('buyer-1')
      mockCapabilityGrantFindUnique.mockResolvedValueOnce({ id: 'grant-1', grantedTo: 'someone-else' })

      const res = await app.inject({
        method: 'POST',
        url: '/v1/capabilities/grant-1/revoke',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(res.statusCode).toBe(403)
      expect(mockCapabilityGrantUpdate).not.toHaveBeenCalled()
    })

    it('404s revoking a grant that does not exist', async () => {
      const token = await authedSession('buyer-1')
      mockCapabilityGrantFindUnique.mockResolvedValueOnce(null)

      const res = await app.inject({
        method: 'POST',
        url: '/v1/capabilities/nope/revoke',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(res.statusCode).toBe(404)
    })
  })

  // Gap-audit fix: POST /api/v1/intents and DELETE /api/v1/intents/:id
  // previously had NO auth at all — participantId came straight from the
  // request body, the exact RT-002 vulnerability auth.ts's own doc
  // comment warns against. Never had HTTP-level test coverage before —
  // only intentEngine.create() itself was tested directly
  // (tests/intentFlow.test.ts), which is why this went unnoticed.
  describe('Intent API (gap-audit fix — requireAuth added)', () => {
    const payload = { asset: 'BTC', side: 'BUY' as const, maxValue: '0.5', minValue: '0.01' }

    it('rejects creating an Intent without auth', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/intents',
        payload: { type: 'TradeIntent', payload },
      })
      expect(res.statusCode).toBe(401)
    })

    it('creates an Intent for the authenticated caller, deriving participantId from the session — a body-supplied participantId is ignored', async () => {
      const token = await authedSession('buyer-1')
      mockIntentEventFindFirst.mockResolvedValue(null)
      mockIntentCreate.mockResolvedValueOnce({
        id: 'intent-1', type: 'TradeIntent', participantId: 'buyer-1', moduleId: 'openp2p', status: 'CREATED', payload,
      })
      mockIntentFindUnique
        .mockResolvedValueOnce({ id: 'intent-1', status: 'CREATED', moduleId: 'openp2p', payload })
        .mockResolvedValueOnce({ id: 'intent-1', status: 'VALIDATED', moduleId: 'openp2p', payload })
        .mockResolvedValueOnce({ id: 'intent-1', status: 'VALIDATED', moduleId: 'openp2p', payload })
      mockIntentUpdateMany.mockResolvedValueOnce({ id: 'intent-1', status: 'COORDINATED' })

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/intents',
        headers: { authorization: `Bearer ${token}` },
        // A malicious/stale caller-supplied participantId in the body is
        // exactly what the fix ignores — the real check is that
        // mockIntentCreate below was called with 'buyer-1' (the session),
        // not 'someone-else'.
        payload: { type: 'TradeIntent', payload, participantId: 'someone-else' },
      })

      expect(res.statusCode).toBe(201)
      expect(mockIntentCreate).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ participantId: 'buyer-1' }) })
      )
    })

    it('rejects cancelling an Intent without auth', async () => {
      const res = await app.inject({ method: 'DELETE', url: '/api/v1/intents/intent-1' })
      expect(res.statusCode).toBe(401)
    })

    it('rejects cancelling an Intent that belongs to someone else', async () => {
      const token = await authedSession('buyer-1')
      mockIntentFindUnique.mockResolvedValueOnce({ id: 'intent-1', status: 'CREATED', participantId: 'someone-else', expiresAt: null })

      const res = await app.inject({
        method: 'DELETE',
        url: '/api/v1/intents/intent-1',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(res.statusCode).toBe(403)
      expect(mockIntentUpdateMany).not.toHaveBeenCalled()
    })

    it("cancels the caller's own Intent", async () => {
      const token = await authedSession('buyer-1')
      // Two resolved values: cancel()'s own ownership-check fetch, then
      // transition()'s separate internal re-fetch of the same Intent.
      mockIntentFindUnique
        .mockResolvedValueOnce({ id: 'intent-1', status: 'CREATED', participantId: 'buyer-1', expiresAt: null })
        .mockResolvedValueOnce({ id: 'intent-1', status: 'CREATED', participantId: 'buyer-1', expiresAt: null })
      mockIntentEventFindFirst.mockResolvedValueOnce(null)
      mockIntentUpdateMany.mockResolvedValueOnce({ id: 'intent-1', status: 'CANCELLED' })

      const res = await app.inject({
        method: 'DELETE',
        url: '/api/v1/intents/intent-1',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(res.statusCode).toBe(200)
    })
  })
})
