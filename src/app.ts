import Fastify, { FastifyInstance } from 'fastify'
import cors from '@fastify/cors'
import websocket from '@fastify/websocket'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import { ZodError } from 'zod'

import { config } from './config'
import { connectDatabase } from './common/database'
import { connectRedis } from './common/redis'
import { AppError } from './common/errors'
import { registerEventHandlers } from './common/events/handlers'
import { registerLightsparkHandlers } from './modules/open-settlement/lightspark.service'
import { intentRoutes } from './routes/intentRoutes'

// ── NOTE (code review, this pass) ──────────────────────────────────────────
// Only the routes/services below have corresponding files in this snapshot
// of the codebase: open-settlement (escrow), open-liquidity (routing).
// identity.routes, pear.routes, marketplace.routes, chat.routes and
// reputation.routes are referenced by the ORIGINAL app.ts but their source
// files are not present in this environment — they exist in an earlier,
// inaccessible session (per Context Document v6, section 8, these describe
// 35+ endpoints across 6 modules). Do not assume they still match this
// file's structure without re-reading them first. Imports below are
// commented out rather than deleted, so restoring them is a one-line
// uncomment once those files are recovered — and each will need the same
// open-{module} rename + event-namespace fixes applied in this pass.
//
// import { identityRoutes } from './modules/open-identity/identity.routes'
// import { marketplaceRoutes } from './modules/open-liquidity/marketplace.routes'
// import { chatRoutes } from './modules/open-p2p/chat.routes'
// import { reputationRoutes } from './modules/open-reputation/reputation.routes'
// import { pearNodeRegistry } from './infrastructure/p2p/pear.service'
// ^ not imported directly here — it will be used once pear.routes.ts
//   (POST /peer/start, /peer/stop, /peer/status) is recovered/rewritten
//   against the new PearNodeRegistry API. Importing it unused here would
//   just be a different flavor of the same "pretend it's wired up" problem
//   this review was asked to fix.

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
        details: error.errors,
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

  // ── Register event handlers (Coordination Protocol) ──────────────────────
  registerEventHandlers()
  registerLightsparkHandlers()

  // NOTE: route registration for identity/marketplace/chat/reputation is
  // intentionally omitted here — see the import comment above. Registering
  // routes for files that do not exist in this snapshot would make `buildApp`
  // throw at startup, which is worse than an honest gap. Restore these lines
  // once the corresponding *.routes.ts files are recovered:
  //   await app.register(identityRoutes)
  //   await app.register(marketplaceRoutes)
  //   await app.register(chatRoutes)
  //   await app.register(reputationRoutes)

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

  return app
}
