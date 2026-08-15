/**
 * Real app.inject() round-trips against app.ts's onResponse hook +
 * GET /metrics — same style and same mock set as tests/metrics.test.ts
 * (this file only adds the suspicious-activity assertions; the detector's
 * own counting logic is covered in isolation by
 * tests/suspiciousActivity.test.ts).
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

describe('Suspicious-activity detection (real onResponse hook + /metrics)', () => {
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

  it('exposes sails_suspicious_activity_total on GET /metrics', async () => {
    const res = await app.inject({ method: 'GET', url: '/metrics' })
    expect(res.body).toContain('# HELP sails_suspicious_activity_total')
  })

  it('flags NOT_FOUND_CLUSTER once the default threshold (15 within 5 minutes) is crossed for one IP', async () => {
    // Default config.suspiciousActivity.notFoundClusterMax — real value,
    // not mocked, so this also proves the config wiring end to end.
    for (let i = 0; i < 15; i++) {
      const res = await app.inject({ method: 'GET', url: `/v1/this-route-does-not-exist-${i}` })
      expect(res.statusCode).toBe(404)
    }

    const metrics = await app.inject({ method: 'GET', url: '/metrics' })
    expect(metrics.body).toMatch(/sails_suspicious_activity_total\{kind="NOT_FOUND_CLUSTER"\} \d+/)
  })
})
