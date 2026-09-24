/**
 * Issue #306 — production observability authority is not public protocol authority.
 *
 * These regression tests pin the remaining Day-0 production contract:
 * - liveness stays public and useful to an orchestrator;
 * - /health must not disclose runtime feature posture in production;
 * - /metrics must fail closed in production instead of relying solely on an
 *   external security-group/reverse-proxy rule being configured correctly.
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

function mockProductionConfig() {
  jest.doMock('../src/config', () => {
    const actual = jest.requireActual('../src/config') as typeof import('../src/config')
    return {
      ...actual,
      config: {
        ...actual.config,
        isProduction: true,
        app: { ...actual.config.app, env: 'production' },
        // Deliberately make the values distinguishable. The assertion is not
        // that mocks are enabled in production; it is that a public endpoint
        // cannot be used as a live feature-posture oracle.
        features: { ...actual.config.features, mockEscrow: true, mockSettlement: true },
      },
    }
  })
}

afterEach(() => {
  jest.resetModules()
  jest.clearAllMocks()
})

describe('production observability boundary (#306)', () => {
  jest.setTimeout(30_000)

  it('keeps /health/live public while removing feature posture from /health', async () => {
    mockProductionConfig()
    jest.doMock('../src/common/database', () => ({ prisma: { $queryRaw: jest.fn() } }))
    jest.doMock('../src/common/redis', () => ({ redis: { ping: jest.fn() } }))

    const { buildApp } = require('../src/app')
    const app = await buildApp({ registerSwaggerUi: false })
    try {
      const live = await app.inject({ method: 'GET', url: '/health/live' })
      expect(live.statusCode).toBe(200)
      expect(JSON.parse(live.body).status).toBe('ok')

      const health = await app.inject({ method: 'GET', url: '/health' })
      expect(health.statusCode).toBe(200)
      const body = JSON.parse(health.body)
      expect(body.status).toBe('ok')
      expect(body.features).toBeUndefined()
      expect(health.body).not.toContain('mockEscrow')
      expect(health.body).not.toContain('mockSettlement')
    } finally {
      await app.close()
    }
  })

  it('does not expose /metrics from the public production listener', async () => {
    mockProductionConfig()
    jest.doMock('../src/common/database', () => ({ prisma: { $queryRaw: jest.fn() } }))
    jest.doMock('../src/common/redis', () => ({ redis: { ping: jest.fn() } }))

    const { buildApp } = require('../src/app')
    const app = await buildApp({ registerSwaggerUi: false })
    try {
      const res = await app.inject({ method: 'GET', url: '/metrics' })
      expect(res.statusCode).toBe(404)
      expect(res.body).not.toContain('http_requests_total')
      expect(res.body).not.toContain('process_')
    } finally {
      await app.close()
    }
  })
})
