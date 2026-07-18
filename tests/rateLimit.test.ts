/**
 * @fastify/rate-limit — verifies the plugin is actually wired in and
 * enforcing both tiers (global default, tighter auth-route override),
 * not just that config fields exist. Own isolated `buildApp()` instance
 * (not shared with routes.test.ts) so this file's deliberately-exceeded
 * limits never pollute that file's shared rate-limit counter — both
 * count against the same in-memory store, keyed by IP, for every request
 * within one app instance.
 *
 * Env vars are set before any src/ import so config/index.ts (a
 * module-level singleton, computed once on first import) picks up these
 * low, fast-to-hit values instead of the real defaults.
 */
process.env.RATE_LIMIT_MAX = '5'
process.env.RATE_LIMIT_WINDOW = '1 minute'
process.env.RATE_LIMIT_AUTH_MAX = '2'
process.env.RATE_LIMIT_AUTH_WINDOW = '1 minute'

import type { FastifyInstance } from 'fastify'

jest.mock('../src/common/database', () => ({
  prisma: {
    user: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
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
  eventBus: { emit: jest.fn().mockResolvedValue(undefined), on: jest.fn() },
}))

jest.mock('../src/infrastructure/p2p/pear.service', () => ({
  pearNodeRegistry: { start: jest.fn(), stop: jest.fn(), get: jest.fn(), getStatus: jest.fn() },
}))

jest.mock('@tetherto/wdk-wallet-evm', () => ({
  __esModule: true,
  default: class FakeWalletManagerEvm {},
}))

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { buildApp } = require('../src/app')

describe('Rate limiting (@fastify/rate-limit, RATE_LIMIT_MAX=5, RATE_LIMIT_AUTH_MAX=2 for this suite)', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildApp()
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  it('allows requests under the auth-specific limit on /v1/identity/challenge', async () => {
    const res1 = await app.inject({ method: 'POST', url: '/v1/identity/challenge', payload: { publicKey: 'a'.repeat(64) } })
    expect(res1.statusCode).toBe(200)
  })

  it('returns a real 429 (not a flattened 500) once the auth-specific limit (2/window) is exceeded', async () => {
    // @fastify/rate-limit tracks each route's own config.rateLimit
    // override independently (per route, per IP) — it does not pool
    // /challenge and /authenticate into one shared budget unless a
    // custom keyGenerator/store is configured to do that, which this
    // pass deliberately doesn't add (kept simple; still a real
    // improvement over no rate limiting at all — see app.ts's comment
    // on the plugin registration). So this exercises /challenge's own
    // counter: the previous test already used 1 of its 2 allowed
    // requests; one more should still succeed, the third should be
    // rejected with the app's own error shape, not a generic 500 (a
    // real bug found and fixed in app.ts's error handler while writing
    // this test — it previously flattened every non-ZodError/non-AppError
    // to 500 regardless of the underlying error's own statusCode).
    const res2 = await app.inject({ method: 'POST', url: '/v1/identity/challenge', payload: { publicKey: 'b'.repeat(64) } })
    expect(res2.statusCode).toBe(200)

    const res3 = await app.inject({ method: 'POST', url: '/v1/identity/challenge', payload: { publicKey: 'c'.repeat(64) } })
    expect(res3.statusCode).toBe(429)
    const body = JSON.parse(res3.body)
    expect(body.success).toBe(false)
    expect(body.error).toBe('RATE_LIMIT_EXCEEDED')
    expect(body.message).toMatch(/rate limit/i)
  })

  it('/v1/identity/authenticate has its own independent 2-request budget, unaffected by /challenge being exhausted', async () => {
    const res1 = await app.inject({ method: 'POST', url: '/v1/identity/authenticate', payload: { publicKey: 'd'.repeat(64), signature: 'x' } })
    expect(res1.statusCode).toBe(401) // real auth failure, not rate-limited — /challenge's exhaustion above doesn't leak here

    const res2 = await app.inject({ method: 'POST', url: '/v1/identity/authenticate', payload: { publicKey: 'e'.repeat(64), signature: 'x' } })
    expect(res2.statusCode).toBe(401)

    const res3 = await app.inject({ method: 'POST', url: '/v1/identity/authenticate', payload: { publicKey: 'f'.repeat(64), signature: 'x' } })
    expect(res3.statusCode).toBe(429) // now its own 2-request budget is exhausted
  })

  it('leaves a non-auth route on the more permissive global limit, unaffected by the auth tier being exhausted', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' })
    expect(res.statusCode).toBe(200)
  })
})
