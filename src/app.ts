import Fastify, { FastifyInstance } from 'fastify'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import websocket from '@fastify/websocket'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import { ZodError } from 'zod'

import { config } from './config'
import { connectDatabase } from './common/database'
import { connectRedis } from './common/redis'
import { AppError } from './common/errors'
import { registerEventHandlers } from './common/events/handlers'
import { intentEngine } from './core/intent-engine'
import { OpenP2PTradeIntentHandler } from './modules/open-p2p/intent-handler'
import { intentRoutes } from './routes/intentRoutes'
import { identityRoutes } from './modules/open-identity/identity.routes'
import { liquidityRoutes } from './modules/open-liquidity/liquidity.routes'
import { tradeRoutes } from './modules/open-p2p/trade.routes'
import { chatRoutes } from './modules/open-p2p/chat.routes'
import { settlementRoutes } from './modules/open-settlement/settlement.routes'
import { peerRoutes } from './infrastructure/p2p/pear.routes'
import { relayRoutes } from './infrastructure/p2p/relay.routes'
import { reputationRoutes } from './modules/open-reputation/reputation.routes'
import { capabilityRoutes } from './modules/open-agents/capability.routes'

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.app.logLevel,
      transport:
        config.app.env === 'development'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
    },
  })

  // ── Plugins ────────────────────────────────────────────────────────────────
  await app.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  })

  // THREAT_MODEL.md's previously-unmitigated gap (config's own doc
  // comment has the full reasoning). Global default here; the identity
  // challenge/authenticate routes below layer a much tighter per-route
  // override via `config: { rateLimit: {...} }` — those two are what a
  // credential-stuffing attempt actually hits (RED_TEAM_REVIEW.md RT-002).
  // Each overridden route tracks its own budget independently (verified
  // in tests/rateLimit.test.ts) — /challenge and /authenticate do NOT
  // share one pooled counter, a deliberate simplification for this pass
  // rather than adding a custom shared keyGenerator/store; still a real
  // improvement over no rate limiting at all. Keyed by request.ip by
  // default — a deployment behind a reverse proxy needs Fastify's own
  // `trustProxy` option set separately before that IP reflects the real
  // client, not the proxy.
  await app.register(rateLimit, {
    global: true,
    max: config.rateLimit.max,
    timeWindow: config.rateLimit.timeWindow,
  })

  await app.register(websocket, {
    options: { maxPayload: 1048576 }, // 1MB
  })

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Sails Protocol — Satsails Reference Implementation',
        description: 'Sails OpenP2P module — non-custodial multi-asset P2P marketplace',
        version: '0.1.0',
      },
      tags: [
        { name: 'intent', description: 'Intent Engine — cross-cutting Core, §2' },
        { name: 'open-identity', description: 'Sails OpenIdentity — auth & keypair identity' },
        { name: 'open-liquidity', description: 'Sails OpenLiquidity — offers & discovery' },
        { name: 'open-settlement', description: 'Sails OpenSettlement — escrow state machine' },
        { name: 'open-p2p', description: 'Sails OpenP2P — trades & chat' },
        { name: 'open-reputation', description: 'Sails OpenReputation — reputation system' },
        { name: 'open-agents', description: 'Sails OpenAgents — capability declaration & grants (RFC-013)' },
      ],
    },
  })

  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: { docExpansion: 'list', deepLinking: false },
  })

  // ── Error Handler ─────────────────────────────────────────────────────────
  app.setErrorHandler((error, _req, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: error.issues, // Zod v4 renamed ZodError.errors -> .issues
      })
    }

    if (error instanceof AppError) {
      // AppError.toResponse() already builds this shape, including
      // `details` — found while testing intentRoutes.ts (this handler
      // reconstructed the response by hand and silently dropped `details`,
      // making ValidationError's whole point of returning *why* a request
      // was rejected invisible to the caller). Not a change in behavior
      // for AppError subclasses that never set `details` (defaults to []
      // either way) — only for the ones that do, like ValidationError.
      return reply.code(error.statusCode).send(error.toResponse())
    }

    // A well-behaved Fastify plugin error (e.g. @fastify/rate-limit's 429)
    // carries its own real statusCode — found while wiring rate limiting:
    // this handler previously flattened every non-ZodError/non-AppError
    // to 500 unconditionally, silently turning a correct 429 into a
    // misleading 500. Only trust statusCodes in the real 4xx/5xx range
    // (guards against a plugin/library setting something nonsensical);
    // anything else still falls through to the generic 500 below.
    const pluginError = error as { statusCode?: unknown; message?: unknown }
    if (typeof pluginError.statusCode === 'number' && pluginError.statusCode >= 400 && pluginError.statusCode < 600) {
      const statusCode = pluginError.statusCode
      app.log.warn(error)
      return reply.code(statusCode).send({
        success: false,
        error: statusCode === 429 ? 'RATE_LIMIT_EXCEEDED' : 'REQUEST_ERROR',
        message: typeof pluginError.message === 'string' ? pluginError.message : 'Request error',
        details: [],
      })
    }

    app.log.error(error)
    const message = error instanceof Error ? error.message : String(error)
    return reply.code(500).send({
      success: false,
      error: 'INTERNAL_ERROR',
      message: config.app.env === 'development' ? message : 'Internal server error',
    })
  })

  // ── Health check ──────────────────────────────────────────────────────────
  app.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '0.1.0',
    protocol: 'Sails Protocol',
    module: 'Sails OpenP2P',
    referenceImplementation: 'Satsails Wallet',
    features: {
      mockEscrow: config.features.mockEscrow,
      mockSettlement: config.features.mockSettlement,
    },
  }))

  app.get('/', async () => ({
    name: 'Sails OpenP2P',
    protocol: 'Sails Protocol — Open Coordination Protocol for Sovereign Finance',
    referenceImplementation: 'Satsails Wallet',
    docs: '/docs',
    ws: '/ws?userId=<uuid>',
    version: '0.1.0',
  }))

  // ── Routes ─────────────────────────────────────────────────────────────────
  await app.register(intentRoutes)
  await app.register(identityRoutes)
  await app.register(peerRoutes)
  await app.register(relayRoutes)
  await app.register(liquidityRoutes)
  await app.register(tradeRoutes)
  await app.register(chatRoutes)
  await app.register(settlementRoutes)
  await app.register(reputationRoutes)
  await app.register(capabilityRoutes)

  // ── Register event handlers (Coordination Protocol) ──────────────────────
  registerEventHandlers()

  // ── Register Intent handlers (Intent Engine plugin pattern, §2.7) ────────
  // RFC-018 Phase 3 — the Core never imports a module; modules register
  // themselves. OpenP2P is the only module with a real IntentHandler today.
  intentEngine.registerHandler(OpenP2PTradeIntentHandler)

  return app
}

export async function startServer() {
  const app = await buildApp()

  // ── Connect dependencies ───────────────────────────────────────────────────
  await connectDatabase()
  await connectRedis()

  // ── Graceful shutdown ──────────────────────────────────────────────────────
  const shutdown = async (signal: string) => {
    console.log(`\n[${signal}] Shutting down gracefully...`)
    await app.close()
    process.exit(0)
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))

  await app.listen({ port: config.app.port, host: config.app.host })
  console.log(`
╔══════════════════════════════════════════════════════╗
║      Sails OpenP2P — Satsails Reference Impl.        ║
╠══════════════════════════════════════════════════════╣
║  HTTP  → http://${config.app.host}:${config.app.port}                   ║
║  WS    → ws://${config.app.host}:${config.app.port}/ws?userId=<uuid>    ║
║  DHT   → POST /peer/start (HyperDHT node)              ║
║  Docs  → http://${config.app.host}:${config.app.port}/docs              ║
╚══════════════════════════════════════════════════════╝
  `)

  // RFC-019 Phase 1 (rfcs/RFC-019-settlement-custody-reference-vs-normative.md)
  // — a loud, impossible-to-miss boot warning whenever the real WDK
  // provider is active. `WdkSettlementProvider.custodyModel` is the
  // introspectable form of this same fact; this is the human-visible
  // one, since a boot log is what someone actually deploying this
  // reference implementation is most likely to see.
  if (!config.features.mockEscrow) {
    console.warn(`
⚠️  WDK_USDT_EVM is a SERVER-CUSTODIAL REFERENCE IMPLEMENTATION.
    One server-held seed (WDK_SEED_PHRASE) signs every escrow
    lock/release — this is NOT the protocol's normative custody model.
    Do NOT use with real value at risk. See CRYPTOGRAPHIC_MODEL.md §5
    and rfcs/RFC-019-settlement-custody-reference-vs-normative.md.
    `)
  }

  return app
}
