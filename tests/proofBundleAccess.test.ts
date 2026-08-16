/**
 * GET /v1/proof/trades/:tradeId/bundle — access control (Missão 06.6).
 *
 * Real HTTP round-trips via app.inject() through the real Fastify route
 * and the real requireAuth middleware — same discipline
 * tests/cors.test.ts/tests/securityHeaders.test.ts already establish for
 * a self-contained app instance, plus tests/routes.test.ts's own
 * redisStore-backed redis mock (the exact same technique its own
 * authedSession() helper uses) so a real session token round-trips
 * through the real requireAuth code path, not a bypassed mock.
 *
 * Deliberately its own isolated file, not added to tests/routes.test.ts's
 * shared app/rate-limit budget — this repo's own established pattern for
 * a self-contained new feature's test matrix (see e.g.
 * tests/tradeUpdateStatus.test.ts's identical reasoning).
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
  eventBus: {
    emit: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
    onDurable: jest.fn(),
    // proof.service.ts's getEvidenceBundleForTrade() reads these three
    // directly, and core/timeline.ts's getTimeline() calls getEvents() —
    // this route's own content doesn't depend on real event history, so
    // an empty timeline is enough to prove the access-control behavior.
    getEvents: jest.fn().mockResolvedValue([]),
    durable: true,
    storeName: 'postgres',
  },
}))

const BUYER_ID = 'buyer-1'
const SELLER_ID = 'seller-1'
const OUTSIDER_ID = 'outsider-1'
const TRADE_ID = 'trade-1'

const TRADE_ROW = { id: TRADE_ID, buyerId: BUYER_ID, sellerId: SELLER_ID, status: 'ACTIVE' }
const CLAIM_ROW = {
  id: 'claim-1', tradeId: TRADE_ID, claimType: 'payment_sent', claimedBy: BUYER_ID, createdAt: new Date(),
  proofs: [],
}

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

jest.mock('../src/common/database', () => ({
  prisma: {
    trade: {
      findUnique: jest.fn(({ where }: any) => Promise.resolve(where.id === TRADE_ID ? TRADE_ROW : null)),
    },
    claim: {
      findMany: jest.fn(({ where }: any) => Promise.resolve(where.tradeId === TRADE_ID ? [CLAIM_ROW] : [])),
    },
  },
}))

async function authedSession(participantId: string): Promise<string> {
  const token = `session-${participantId}`
  redisStore.set(`auth:session:${token}`, participantId)
  return token
}

describe('GET /v1/proof/trades/:tradeId/bundle — access control (Missão 06.6)', () => {
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

  it('a participant (buyer) can fetch the bundle for their own trade — ALLOW', async () => {
    const token = await authedSession(BUYER_ID)
    const res = await app.inject({
      method: 'GET',
      url: `/v1/proof/trades/${TRADE_ID}/bundle`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
  })

  it('a participant (seller) can also fetch the bundle for the same trade — ALLOW', async () => {
    const token = await authedSession(SELLER_ID)
    const res = await app.inject({
      method: 'GET',
      url: `/v1/proof/trades/${TRADE_ID}/bundle`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
  })

  it('an authenticated user who is not a party to the trade is rejected — DENY', async () => {
    const token = await authedSession(OUTSIDER_ID)
    const res = await app.inject({
      method: 'GET',
      url: `/v1/proof/trades/${TRADE_ID}/bundle`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(403)
  })

  it('an unauthenticated request (no Authorization header) is rejected — DENY', async () => {
    const res = await app.inject({ method: 'GET', url: `/v1/proof/trades/${TRADE_ID}/bundle` })
    expect(res.statusCode).toBe(401)
  })

  it('a request with an invalid/expired session token is rejected — DENY', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/proof/trades/${TRADE_ID}/bundle`,
      headers: { authorization: 'Bearer not-a-real-session-token' },
    })
    expect(res.statusCode).toBe(401)
  })

  it("the bundle's own shape for an authorized participant is unchanged — same fields EvidenceBundle always returned", async () => {
    const token = await authedSession(BUYER_ID)
    const res = await app.inject({
      method: 'GET',
      url: `/v1/proof/trades/${TRADE_ID}/bundle`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.success).toBe(true)
    expect(body.data).toMatchObject({
      claims: [expect.objectContaining({ id: 'claim-1', tradeId: TRADE_ID })],
      proofs: [],
      verifications: [],
      externalReferences: [],
      timeline: [],
      timelineDurable: true,
      timelineStore: 'postgres',
    })
  })
})
