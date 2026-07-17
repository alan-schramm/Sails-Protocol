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
import { intentRoutes } from './routes/intentRoutes'
import { identityRoutes } from './modules/open-identity/identity.routes'
import { liquidityRoutes } from './modules/open-liquidity/liquidity.routes'
import { tradeRoutes } from './modules/open-p2p/trade.routes'
import { chatRoutes } from './modules/open-p2p/chat.routes'
import { settlementRoutes } from './modules/open-settlement/settlement.routes'
import { peerRoutes } from './infrastructure/p2p/pear.routes'
import { reputationRoutes } from './modules/open-reputation/reputation.routes'

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
  await app.register(identityRoutes)
  await app.register(peerRoutes)
  await app.register(liquidityRoutes)
  await app.register(tradeRoutes)
  await app.register(chatRoutes)
  await app.register(settlementRoutes)
  await app.register(reputationRoutes)

  // ── Register event handlers (Coordination Protocol) ──────────────────────
  registerEventHandlers()

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
