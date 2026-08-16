/**
 * GET /v1/liquidity/offers — pagination on a "dirty marketplace" (Missão
 * 07.1, Golden Path audit Fase 1). Real, previously-disclosed bug:
 * collectFromProviders() (liquidity.service.ts) used to call every
 * provider's getOffers() with pagination: undefined, silently capping
 * each provider's fetch at DEFAULT_PAGE_LIMIT (10) regardless of what
 * page was actually requested — any offset past the 10th offer for a
 * given asset/side, or a request that would reach past it, produced a
 * wrong (short/empty) page with a total/hasMore that lied (both computed
 * from the capped 10-row window's size, not the real result set). This
 * is exactly the case tests/routes.test.ts's own "lists aggregated
 * offers" test never exercised (only ever 3 offers, offset 0).
 *
 * Also covers the invalid-`asset` validation gap found in the same
 * Missão 07.2 cold-start audit: `createOfferSchema`/`assetSideQuerySchema`
 * validated `asset` as a bare non-empty string, not the real AssetType
 * enum (unlike every other route that takes one) — an invalid value sailed
 * through and crashed inside Prisma, leaking a raw stack trace (internal
 * file paths, source lines, the caller's own field values) back to the
 * caller instead of a clean 400. Confirmed live against a real running
 * node before the fix, not assumed.
 *
 * Isolated file, own app/rate-limit budget — same reason
 * tests/settlementReadAccess.test.ts and tests/proofBundleAccess.test.ts
 * stay out of tests/routes.test.ts's shared one (confirmed twice now:
 * routes.test.ts's own shared budget flaked from adding requests there).
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

jest.mock('../src/infrastructure/p2p/pear.service', () => ({
  pearNodeRegistry: { start: jest.fn(), stop: jest.fn(), get: jest.fn(), getStatus: jest.fn() },
}))

jest.mock('../src/common/events/event-bus', () => ({
  eventBus: { emit: jest.fn().mockResolvedValue(undefined), on: jest.fn(), onDurable: jest.fn() },
}))

// buildApp() needs a real-shaped redis client regardless of which routes a
// test exercises (session store, rate limiting) — without this, ioredis
// tries a real TCP connection and hangs indefinitely in an environment with
// no Redis reachable, same Map-backed fake tests/settlementReadAccess.test.ts
// and tests/joinTradeAuthorization.test.ts already use.
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

const mockOfferFindMany = jest.fn()
const mockOfferCount = jest.fn()
const mockOfferCreate = jest.fn()
jest.mock('../src/common/database', () => ({
  prisma: {
    offer: {
      findMany: (...args: unknown[]) => mockOfferFindMany(...args),
      count: (...args: unknown[]) => mockOfferCount(...args),
      create: (...args: unknown[]) => mockOfferCreate(...args),
    },
  },
}))

describe('GET /v1/liquidity/offers — pagination on a marketplace with >10 offers (Missão 07.1)', () => {
  jest.setTimeout(30_000) // real buildApp() registers @fastify/swagger-ui — see tests/cors.test.ts's identical comment
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

  it('correctly pages past the old 10-row cap on a marketplace with 15 offers', async () => {
    const fifteenOffers = Array.from({ length: 15 }, (_, i) => ({
      id: `offer-${i}`, userId: `user-${i}`, asset: 'BTC', side: 'SELL',
      priceUsd: String(60000 + i * 100), priceBrl: null, minAmount: '0.001', maxAmount: '0.5',
      paymentMethod: 'PIX', status: 'ACTIVE', user: { reputationScore: 50 },
    }))
    // findMany() is asked for offset(10)+limit(5)=15 rows starting at 0
    // (the fix) — this mock returns exactly what a real
    // ORDER BY priceUsd ASC LIMIT 15 OFFSET 0 query would for this dataset.
    mockOfferFindMany.mockResolvedValueOnce(fifteenOffers)
    mockOfferCount.mockResolvedValueOnce(15)

    const res = await app.inject({ method: 'GET', url: '/v1/liquidity/offers?asset=BTC&side=SELL&limit=5&offset=10' })

    expect(res.statusCode).toBe(200)
    const data = JSON.parse(res.body).data
    // Before the fix: findMany() would have returned only offers 0-9
    // (silently capped at DEFAULT_PAGE_LIMIT=10), so slicing [10, 15) out
    // of that 10-row array would be empty, and total would read 10, not 15.
    expect(data.offers).toHaveLength(5)
    expect(data.offers.map((o: { id: string }) => o.id)).toEqual(['offer-10', 'offer-11', 'offer-12', 'offer-13', 'offer-14'])
    expect(data.total).toBe(15) // real COUNT, not the capped page's length
    expect(data.hasMore).toBe(false) // offset(10) + limit(5) === total(15)
    expect(mockOfferFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 15, skip: 0 }) // offset+limit forwarded to the provider, not the old fixed 10
    )
  })

  it('total/hasMore stay correct even when the requested page is entirely empty past the real total', async () => {
    // 15 real offers exist, but this request asks for offset=20 (past
    // all of them) — must report total=15, hasMore=false, offers=[], not
    // silently misreport based on whatever the capped fetch returned.
    mockOfferFindMany.mockResolvedValueOnce([])
    mockOfferCount.mockResolvedValueOnce(15)

    const res = await app.inject({ method: 'GET', url: '/v1/liquidity/offers?asset=BTC&side=SELL&limit=5&offset=20' })

    expect(res.statusCode).toBe(200)
    const data = JSON.parse(res.body).data
    expect(data.offers).toHaveLength(0)
    expect(data.total).toBe(15)
    expect(data.hasMore).toBe(false)
  })

  describe('invalid `asset` — clean 400, not a leaked Prisma stack trace (Missão 07.2)', () => {
    it('GET /v1/liquidity/offers with an invalid asset — 400, not 500', async () => {
      const res = await app.inject({ method: 'GET', url: '/v1/liquidity/offers?asset=NOT_A_REAL_ASSET&side=SELL' })
      expect(res.statusCode).toBe(400)
      expect(mockOfferFindMany).not.toHaveBeenCalled()
    })

    it('POST /v1/liquidity/offers with an invalid asset — 400, no leaked internal detail', async () => {
      const token = await authedSession('user-1')
      const res = await app.inject({
        method: 'POST',
        url: '/v1/liquidity/offers',
        headers: { authorization: `Bearer ${token}` },
        payload: { asset: 'NOT_A_REAL_ASSET', side: 'SELL', priceUsd: '65000', minAmount: '0.001', maxAmount: '0.5', paymentMethod: 'PIX' },
      })
      expect(res.statusCode).toBe(400)
      expect(mockOfferCreate).not.toHaveBeenCalled()
      const body = JSON.parse(res.body)
      expect(body.success).toBe(false)
      expect(JSON.stringify(body)).not.toMatch(/liquidity\.service\.js|prisma\.offer\.create/)
    })
  })
})
