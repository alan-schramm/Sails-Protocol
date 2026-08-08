/**
 * PRODUCTION_READINESS_FIXES.md P1 item 12, closed 2026-08-08 —
 * GET /v1/liquidity/offers/id/:id renamed to GET /v1/liquidity/offers/:id
 * (dropped the redundant `id` segment). The doc's own caution: verify
 * this doesn't shadow the sibling static route GET /v1/liquidity/offers/mine,
 * since both are now 2-segment paths under /offers/. Fastify/find-my-way
 * always prefers an exact static match over a parametric one at the same
 * depth, so this should be safe — verified here with real app.inject()
 * round-trips against both routes in the same running app, not just
 * reasoned about.
 */
jest.mock('../src/common/events/event-bus', () => ({
  eventBus: { emit: jest.fn().mockResolvedValue(undefined), on: jest.fn(), onDurable: jest.fn() },
}))

jest.mock('../src/infrastructure/p2p/pear.service', () => ({
  pearNodeRegistry: { start: jest.fn(), stop: jest.fn(), get: jest.fn(), getStatus: jest.fn() },
}))

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

const mockOfferFindUnique = jest.fn()
const mockOfferFindMany = jest.fn()
jest.mock('../src/common/database', () => ({
  prisma: {
    offer: {
      findUnique: (...args: unknown[]) => mockOfferFindUnique(...args),
      findMany: (...args: unknown[]) => mockOfferFindMany(...args),
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

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { buildApp } = require('../src/app')

describe('GET /v1/liquidity/offers/:id does not shadow GET /v1/liquidity/offers/mine', () => {
  jest.setTimeout(30_000) // real buildApp() registers @fastify/swagger-ui — see tests/cors.test.ts's identical comment

  let app: import('fastify').FastifyInstance

  beforeAll(async () => {
    app = await buildApp()
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  it('GET /v1/liquidity/offers/mine hits getOffersByUser(), not getOffer("mine")', async () => {
    mockOfferFindMany.mockResolvedValueOnce([{ id: 'offer-1', userId: 'user-1', asset: 'BTC' }])
    const token = 'session-user-1'
    redisStore.set(`auth:session:${token}`, 'user-1')

    const res = await app.inject({
      method: 'GET',
      url: '/v1/liquidity/offers/mine',
      headers: { authorization: `Bearer ${token}` },
    })

    expect(res.statusCode).toBe(200)
    expect(mockOfferFindMany).toHaveBeenCalledWith({ where: { userId: 'user-1' }, orderBy: { createdAt: 'desc' } })
    expect(mockOfferFindUnique).not.toHaveBeenCalled() // would fire if 'mine' fell through to :id instead
  })

  it('GET /v1/liquidity/offers/:id (a real id) hits getOffer(), unaffected by the /mine route existing', async () => {
    mockOfferFindUnique.mockResolvedValueOnce({ id: 'offer-42', userId: 'user-1', asset: 'BTC', user: {} })

    const res = await app.inject({ method: 'GET', url: '/v1/liquidity/offers/offer-42' })

    expect(res.statusCode).toBe(200)
    expect(mockOfferFindUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'offer-42' } }))
    const body = JSON.parse(res.body)
    expect(body.data.id).toBe('offer-42')
  })

  it('GET /v1/liquidity/offers/:id returns 404 for a real, non-"mine" id that does not exist', async () => {
    mockOfferFindUnique.mockResolvedValueOnce(null)

    const res = await app.inject({ method: 'GET', url: '/v1/liquidity/offers/nonexistent-id' })

    expect(res.statusCode).toBe(404)
  })
})
