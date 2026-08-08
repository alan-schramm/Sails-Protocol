/**
 * HTTP-level metrics — CTO_DUE_DILIGENCE_REPORT.md B-OPS-01, closed
 * 2026-08-08. Real `app.inject()` round-trips against the `onResponse`
 * hook + GET /metrics, same style as tests/cors.test.ts. Business
 * counters (escrows/disputes) are covered separately in
 * tests/metricsBusinessCounters.test.ts, which needs the REAL event bus
 * running — event-bus stays mocked here, same as every other route test
 * in this repo, since these tests don't exercise handlers.ts at all.
 */
import type { FastifyInstance } from 'fastify'

jest.mock('../src/common/database', () => ({
  prisma: {
    user: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
  },
}))

jest.mock('../src/common/redis', () => ({
  redis: {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    ping: jest.fn().mockResolvedValue('PONG'),
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

describe('HTTP metrics (GET /metrics, real app.inject round-trips)', () => {
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

  it('exposes Prometheus-format text on GET /metrics', async () => {
    const res = await app.inject({ method: 'GET', url: '/metrics' })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toMatch(/text\/plain/)
    expect(res.body).toContain('# HELP sails_http_requests_total')
    expect(res.body).toContain('# HELP sails_http_request_duration_seconds')
  })

  it('records a real request against its route PATTERN, not the raw URL (no per-id cardinality blowup)', async () => {
    await app.inject({ method: 'GET', url: '/health' })
    const res = await app.inject({ method: 'GET', url: '/metrics' })
    expect(res.body).toMatch(/sails_http_requests_total\{method="GET",route="\/health",status_code="200"\} \d+/)
  })
})
