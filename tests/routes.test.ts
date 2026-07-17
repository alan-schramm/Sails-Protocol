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

jest.mock('../src/common/database', () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
      create: (...args: unknown[]) => mockUserCreate(...args),
      update: jest.fn().mockResolvedValue({}),
    },
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
  },
}))

jest.mock('../src/infrastructure/p2p/pear.service', () => ({
  pearNodeRegistry: {
    start: jest.fn().mockResolvedValue('fake-peer-id'),
    stop: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockReturnValue(undefined),
    getStatus: jest.fn().mockReturnValue({ userId: 'u', started: false, peerId: null, connectedPeers: 0, activeTopics: [], peers: [] }),
  },
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
      mockOfferCreate.mockResolvedValueOnce({ id: 'offer-1', userId: 'user-1', asset: 'BTC', side: 'SELL', priceUsd: '65000' })

      const res = await app.inject({
        method: 'POST',
        url: '/v1/liquidity/offers',
        headers: { authorization: `Bearer ${token}` },
        payload: { asset: 'BTC', side: 'SELL', priceUsd: '65000', minAmount: '0.001', maxAmount: '0.5', paymentMethod: 'PIX' },
      })

      expect(res.statusCode).toBe(201)
      expect(mockOfferCreate).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ userId: 'user-1', asset: 'BTC' }) })
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
})
