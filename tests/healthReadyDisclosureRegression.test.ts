/**
 * Day-0 security regression for #306.
 *
 * Readiness may expose dependency availability, but must not expose raw
 * provider/network exception text to an unauthenticated caller. Detailed
 * failure information belongs in server logs.
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

afterEach(() => {
  jest.resetModules()
})

describe('/health/ready disclosure boundary (#306)', () => {
  jest.setTimeout(30_000)

  it('reports dependency unavailable without returning raw Redis exception text', async () => {
    const secretBearingError = 'ECONNREFUSED redis.internal.example:6379 provider=private-redis'
    jest.doMock('../src/common/database', () => ({
      prisma: { $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]) },
    }))
    jest.doMock('../src/common/redis', () => ({
      redis: { ping: jest.fn().mockRejectedValue(new Error(secretBearingError)) },
    }))

    const { buildApp } = require('../src/app')
    const app = await buildApp({ registerSwaggerUi: false })
    try {
      const res = await app.inject({ method: 'GET', url: '/health/ready' })
      expect(res.statusCode).toBe(503)
      const body = JSON.parse(res.body)
      expect(body.status).toBe('not_ready')
      expect(body.checks.postgres.ok).toBe(true)
      expect(body.checks.redis.ok).toBe(false)
      expect(res.body).not.toContain(secretBearingError)
      expect(res.body).not.toContain('redis.internal.example')
      expect(res.body).not.toContain('private-redis')
    } finally {
      await app.close()
    }
  })

  it('does not return unexpected Redis PING contents', async () => {
    const unexpectedReply = 'INTERNAL_PROVIDER_DETAIL'
    jest.doMock('../src/common/database', () => ({
      prisma: { $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]) },
    }))
    jest.doMock('../src/common/redis', () => ({
      redis: { ping: jest.fn().mockResolvedValue(unexpectedReply) },
    }))

    const { buildApp } = require('../src/app')
    const app = await buildApp({ registerSwaggerUi: false })
    try {
      const res = await app.inject({ method: 'GET', url: '/health/ready' })
      expect(res.statusCode).toBe(503)
      const body = JSON.parse(res.body)
      expect(body.status).toBe('not_ready')
      expect(body.checks.redis.ok).toBe(false)
      expect(res.body).not.toContain(unexpectedReply)
    } finally {
      await app.close()
    }
  })
})
