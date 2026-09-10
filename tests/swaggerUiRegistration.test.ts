/**
 * Technical Debt #57 bounded remediation (2026-09-10).
 *
 * No existing test in this repository ever asserted that `/docs`
 * (Swagger UI) is actually served — every reference to swagger-ui
 * elsewhere was about its registration *cost*, never its own behavior.
 * This file closes that real, pre-existing coverage gap and proves the
 * new `buildApp({ registerSwaggerUi: false })` option is scoped
 * correctly: it removes only Swagger UI's own served page, changes
 * nothing about OpenAPI spec generation (`@fastify/swagger`, never
 * gated by this option) or any other route.
 */
import { FastifyInstance } from 'fastify'

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

import { buildApp } from '../src/app'

describe('Swagger UI registration (Technical Debt #57 bounded remediation)', () => {
  it('default buildApp() (registerSwaggerUi unset) serves /docs outside production', async () => {
    const app: FastifyInstance = await buildApp()
    try {
      const res = await app.inject({ method: 'GET', url: '/docs' })
      // @fastify/swagger-ui redirects bare /docs to /docs/static/index.html
      // (or serves it directly) — either way it must not 404.
      expect(res.statusCode).not.toBe(404)

      const root = await app.inject({ method: 'GET', url: '/' })
      expect(JSON.parse(root.body).docs).toBe('/docs')
    } finally {
      await app.close()
    }
  })

  it('buildApp({ registerSwaggerUi: false }) does not register /docs', async () => {
    const app: FastifyInstance = await buildApp({ registerSwaggerUi: false })
    try {
      const res = await app.inject({ method: 'GET', url: '/docs' })
      expect(res.statusCode).toBe(404)

      const root = await app.inject({ method: 'GET', url: '/' })
      expect(JSON.parse(root.body).docs).toBeNull()
    } finally {
      await app.close()
    }
  })

  it('buildApp({ registerSwaggerUi: false }) still generates the OpenAPI spec (@fastify/swagger, never gated by this option) and other routes remain available', async () => {
    const app: FastifyInstance = await buildApp({ registerSwaggerUi: false })
    try {
      // .swagger() requires the instance to be ready (all plugins/encapsulation
      // resolved) — same requirement as any other post-boot introspection.
      await app.ready()
      // @fastify/swagger's own spec route lives under swaggerUi's routePrefix
      // by convention (/docs/json), but the *generator* itself
      // (app.swagger()) is registered unconditionally in app.ts — assert
      // the generator directly rather than depend on swagger-ui's own
      // routing to expose it.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const spec = (app as any).swagger()
      expect(spec.openapi).toBe('3.0.3')
      expect(spec.info.title).toBe('Sails Protocol — Satsails Reference Implementation')

      const health = await app.inject({ method: 'GET', url: '/health' })
      expect(health.statusCode).toBe(200)
    } finally {
      await app.close()
    }
  })
})
