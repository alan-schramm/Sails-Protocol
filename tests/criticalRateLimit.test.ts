/**
 * Critical-route rate limiting (@fastify/rate-limit) — CTO_DUE_DILIGENCE_REPORT.md
 * A-SEC-05, closed 2026-08-08. Verifies `/v1/capabilities/:grantId/revoke`
 * (a real authority-change action, not a read) has its own tighter,
 * independently-tracked ceiling — same pattern tests/rateLimit.test.ts
 * already established for the auth tier, applied here to the critical tier.
 *
 * Env vars set before any src/ import so config/index.ts (a module-level
 * singleton) picks up these low, fast-to-hit values.
 */
process.env.RATE_LIMIT_MAX = '100'
process.env.RATE_LIMIT_CRITICAL_MAX = '2'
process.env.RATE_LIMIT_CRITICAL_WINDOW = '1 minute'

import type { FastifyInstance } from 'fastify'

jest.mock('../src/common/database', () => ({
  prisma: {
    user: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
    capabilityGrant: {
      findUnique: jest.fn().mockResolvedValue({ id: 'grant-1', grantedTo: 'user-1' }),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
    },
  },
}))

const SESSION_TOKEN = 'test-session-token'
const redisStore = new Map<string, string>([[`auth:session:${SESSION_TOKEN}`, 'user-1']])
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

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { buildApp } = require('../src/app')

describe('Critical-route rate limiting (RATE_LIMIT_CRITICAL_MAX=2 for this suite)', () => {
  jest.setTimeout(30_000) // real buildApp() registers @fastify/swagger-ui — see tests/cors.test.ts's identical comment

  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildApp()
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  const revokeRequest = () =>
    app.inject({
      method: 'POST',
      url: '/v1/capabilities/grant-1/revoke',
      headers: { authorization: `Bearer ${SESSION_TOKEN}` },
    })

  it('allows requests under the critical limit (2/window)', async () => {
    const res1 = await revokeRequest()
    expect(res1.statusCode).toBe(200)

    const res2 = await revokeRequest()
    expect(res2.statusCode).toBe(200)
  })

  it('returns a real 429 once the critical limit is exceeded, tracked independently from the global tier', async () => {
    const res3 = await revokeRequest()
    expect(res3.statusCode).toBe(429)
    const body = JSON.parse(res3.body)
    expect(body.error).toBe('RATE_LIMIT_EXCEEDED')
  })

  it('leaves a non-critical route (GET /v1/capabilities/:participantId) on the global limit, unaffected by the critical tier being exhausted', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/capabilities/user-1' })
    expect(res.statusCode).toBe(200)
  })
})
