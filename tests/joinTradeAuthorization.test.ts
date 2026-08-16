/**
 * POST /v1/peers/join-trade — access control (Missão 06.10, Achado #2 of
 * Missão 06.7's route-authorization audit).
 *
 * Before this pass, any authenticated participant could join any trade's
 * DHT topic just by supplying its tradeId — no check that they were
 * actually the buyer or seller. The fix moved this route from
 * infrastructure/p2p/pear.routes.ts to modules/open-p2p/trade.routes.ts
 * (same URL) specifically so it could reuse tradeService.assertParticipant()
 * — a Domain decision infrastructure/p2p/ structurally cannot make without
 * importing modules/open-p2p/, a dependency direction that stays rejected
 * (see trade.routes.ts's own header comment and RFC-002's dated amendment).
 *
 * Real HTTP round-trips via app.inject() through the real Fastify route
 * and the real requireAuth + tradeService.assertParticipant() code paths
 * — same redisStore-backed session pattern tests/settlementReadAccess.test.ts
 * and tests/proofBundleAccess.test.ts already established. pearNodeRegistry
 * is the one thing mocked, specifically so this file can assert exactly
 * when (or whether) it's ever touched — the mission's own "no P2P
 * infrastructure effect before authorization" requirement.
 */
import type { FastifyInstance } from 'fastify'

jest.mock('@tetherto/wdk-wallet-evm', () => ({
  __esModule: true,
  default: class FakeWalletManagerEvm {},
}))

jest.mock('@arkade-os/sdk', () => ({
  SeedIdentity: { fromSeed: jest.fn() },
  MultisigTapscript: { encode: jest.fn() },
  CSVMultisigTapscript: { encode: jest.fn() },
  VtxoScript: class FakeVtxoScript {},
  RestArkProvider: class FakeRestArkProvider {},
  RestIndexerProvider: class FakeRestIndexerProvider {},
  buildOffchainTx: jest.fn(),
  combineTapscriptSigs: jest.fn(),
  verifyTapscriptSignatures: jest.fn(),
}))

jest.mock('@scure/btc-signer', () => ({ Transaction: { fromPSBT: jest.fn() } }))

const BUYER_ID = 'buyer-1'
const SELLER_ID = 'seller-1'
const OUTSIDER_ID = 'outsider-1'
const TRADE_ID = 'trade-1'
const NONEXISTENT_TRADE_ID = 'trade-does-not-exist'

const TRADE_ROW = { id: TRADE_ID, buyerId: BUYER_ID, sellerId: SELLER_ID, status: 'ACTIVE', escrowId: null }

jest.mock('../src/common/database', () => ({
  prisma: {
    trade: {
      findUnique: jest.fn(({ where }: any) => Promise.resolve(where.id === TRADE_ID ? TRADE_ROW : null)),
    },
  },
}))

jest.mock('../src/common/events/event-bus', () => ({
  eventBus: { emit: jest.fn().mockResolvedValue(undefined), on: jest.fn(), onDurable: jest.fn() },
}))

// The one mock this file actually cares about: pearNodeRegistry.get()'s
// call timing is exactly what proves (or disproves) "outsider DENY happens
// before any P2P infrastructure effect" — a real PearNode never gets
// touched here, not just "the DHT call happened to fail silently."
const mockNodeGet = jest.fn()
const mockJoinTradeTopic = jest.fn().mockResolvedValue(undefined)
jest.mock('../src/infrastructure/p2p/pear.service', () => ({
  pearNodeRegistry: {
    start: jest.fn(),
    stop: jest.fn(),
    get: (...args: unknown[]) => mockNodeGet(...args),
    getStatus: jest.fn(),
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
    ping: jest.fn().mockResolvedValue('PONG'),
  },
}))

async function authedSession(participantId: string): Promise<string> {
  const token = `session-${participantId}`
  redisStore.set(`auth:session:${token}`, participantId)
  return token
}

describe('POST /v1/peers/join-trade — access control (Missão 06.10)', () => {
  jest.setTimeout(30_000)
  let app: FastifyInstance

  beforeAll(async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { buildApp } = require('../src/app')
    app = await buildApp()
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => {
    mockNodeGet.mockReset()
    mockJoinTradeTopic.mockClear()
    mockNodeGet.mockReturnValue({ joinTradeTopic: mockJoinTradeTopic })
  })

  it('1. buyer authenticated — join ALLOW', async () => {
    const token = await authedSession(BUYER_ID)
    const res = await app.inject({
      method: 'POST', url: '/v1/peers/join-trade',
      headers: { authorization: `Bearer ${token}` }, payload: { tradeId: TRADE_ID },
    })
    expect(res.statusCode).toBe(200)
  })

  it('2. seller authenticated — join ALLOW', async () => {
    const token = await authedSession(SELLER_ID)
    const res = await app.inject({
      method: 'POST', url: '/v1/peers/join-trade',
      headers: { authorization: `Bearer ${token}` }, payload: { tradeId: TRADE_ID },
    })
    expect(res.statusCode).toBe(200)
  })

  it('3. outsider authenticated — join DENY', async () => {
    const token = await authedSession(OUTSIDER_ID)
    const res = await app.inject({
      method: 'POST', url: '/v1/peers/join-trade',
      headers: { authorization: `Bearer ${token}` }, payload: { tradeId: TRADE_ID },
    })
    expect(res.statusCode).toBe(403)
  })

  it('4. unauthenticated request — DENY', async () => {
    const res = await app.inject({ method: 'POST', url: '/v1/peers/join-trade', payload: { tradeId: TRADE_ID } })
    expect(res.statusCode).toBe(401)
  })

  it('5. invalid session token — DENY', async () => {
    const res = await app.inject({
      method: 'POST', url: '/v1/peers/join-trade',
      headers: { authorization: 'Bearer not-a-real-token' }, payload: { tradeId: TRADE_ID },
    })
    expect(res.statusCode).toBe(401)
  })

  it('6. a spoofed participantId in the body does not override the real session actor', async () => {
    // OUTSIDER authenticates for real, but tries to claim BUYER's identity
    // in the body. The route never reads participantId from the body at
    // all (only tradeId is even in the schema) — the real session actor
    // (outsider) is what gets checked, so this still DENYs.
    const token = await authedSession(OUTSIDER_ID)
    const res = await app.inject({
      method: 'POST', url: '/v1/peers/join-trade',
      headers: { authorization: `Bearer ${token}` },
      payload: { tradeId: TRADE_ID, participantId: BUYER_ID },
    })
    expect(res.statusCode).toBe(403)
    expect(mockNodeGet).not.toHaveBeenCalled()
  })

  it('7. a nonexistent trade — safe response, no info leak about tradeId validity vs. authorization', async () => {
    const token = await authedSession(BUYER_ID)
    const res = await app.inject({
      method: 'POST', url: '/v1/peers/join-trade',
      headers: { authorization: `Bearer ${token}` }, payload: { tradeId: NONEXISTENT_TRADE_ID },
    })
    expect(res.statusCode).toBe(404)
    expect(mockNodeGet).not.toHaveBeenCalled()
  })

  it('8. outsider DENY happens before any Pear/P2P infrastructure call', async () => {
    const token = await authedSession(OUTSIDER_ID)
    const res = await app.inject({
      method: 'POST', url: '/v1/peers/join-trade',
      headers: { authorization: `Bearer ${token}` }, payload: { tradeId: TRADE_ID },
    })
    expect(res.statusCode).toBe(403)
    expect(mockNodeGet).not.toHaveBeenCalled()
    expect(mockJoinTradeTopic).not.toHaveBeenCalled()
  })

  it('9. a valid buyer really delegates the join to pearNodeRegistry/PearNode', async () => {
    const token = await authedSession(BUYER_ID)
    const res = await app.inject({
      method: 'POST', url: '/v1/peers/join-trade',
      headers: { authorization: `Bearer ${token}` }, payload: { tradeId: TRADE_ID },
    })
    expect(res.statusCode).toBe(200)
    expect(mockNodeGet).toHaveBeenCalledWith(BUYER_ID)
    expect(mockJoinTradeTopic).toHaveBeenCalledWith(TRADE_ID)
  })

  it('10. a valid seller really delegates the join to pearNodeRegistry/PearNode', async () => {
    const token = await authedSession(SELLER_ID)
    const res = await app.inject({
      method: 'POST', url: '/v1/peers/join-trade',
      headers: { authorization: `Bearer ${token}` }, payload: { tradeId: TRADE_ID },
    })
    expect(res.statusCode).toBe(200)
    expect(mockNodeGet).toHaveBeenCalledWith(SELLER_ID)
    expect(mockJoinTradeTopic).toHaveBeenCalledWith(TRADE_ID)
  })

  it('returns 409 (not 403/500) when an authorized party has no active PearNode yet', async () => {
    mockNodeGet.mockReturnValue(undefined)
    const token = await authedSession(BUYER_ID)
    const res = await app.inject({
      method: 'POST', url: '/v1/peers/join-trade',
      headers: { authorization: `Bearer ${token}` }, payload: { tradeId: TRADE_ID },
    })
    expect(res.statusCode).toBe(409)
  })
})
