/**
 * Sails OpenAgents — Agent routes
 *
 * First HTTP surface for `QvacAgentProvider`'s structured-generation/risk
 * capabilities (`qvac-agent.provider.ts`) — previously only reachable
 * from `BuyerAgent`/`SellerAgent` (`wallet-agent.ts`) and
 * `src/demo/pix-to-usdt-flow.ts`, never over HTTP. `packages/sails-ui`'s
 * "AI Negotiator" panel and `AgentRiskCard` have been running a
 * client-side simulation of these exact three calls (disclosed as such
 * in the UI), waiting on this route to exist so they can swap in the
 * real thing without touching their own call sites
 * (`packages/sails-ui/src/lib/qvacAgent.ts`'s own header comment).
 *
 * Each call runs a real local LLM inference (LLAMA_3_2_1B_INST_Q4_0,
 * llama.cpp, no cloud dependency) — genuine CPU/GPU cost even though no
 * cloud bill is involved. `requireAuth` here isn't about scoping data to
 * a participant (none of these three calls read or write anything
 * participant-specific) — it's purely a cost/DoS gate on a route that's
 * meaningfully more expensive per-call than a typical read or write,
 * same rate-limit tier `capability.routes.ts`'s revoke route already
 * uses for its own different reason (real-authority actions there; real
 * compute cost here).
 *
 * `qvacAgentProvider` is required lazily inside each handler below, not
 * imported statically at the top — same pattern
 * `common/events/handlers.ts`'s dispute-auto-resolution listener already
 * uses for the same import. `@qvac/sdk`'s real dist build contains
 * `import.meta`, valid only in genuine ESM; a static top-level import
 * here would make `app.ts` (which registers this file unconditionally)
 * eagerly load it too, breaking every test file that builds the app
 * without itself mocking `@qvac/sdk` first — found the hard way,
 * confirmed by making this file lazy the same way handlers.ts already
 * is and watching the previously-failing suites pass again.
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { QvacAgentProvider } from './qvac-agent.provider'
import { requireAuth } from '../../common/middleware/auth'
import { config } from '../../config'
import { docsOnlySchema } from '../../common/openapi'

function getQvacAgentProvider(): QvacAgentProvider {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('./qvac-agent.provider').qvacAgentProvider
}

const goalSchema = z.object({
  goal: z.string().min(1).max(2000),
})

// Mirrors routes/intentRoutes.ts's tradeIntentPayloadSchema's restricted
// enums exactly (reused, not reinvented) — the same Fase 1 Red Team pass
// that closed the prompt-injection vector on this shape
// (qvac-agent.provider.ts's AssessableIntent doc comment,
// tests/qvac-prompt-injection.test.ts) already hardened it.
const assessIntentRiskSchema = z.object({
  asset: z.enum(['BTC', 'USDT_ERC20', 'USDT_TRC20', 'USDT_LIQUID', 'USDT_LIGHTNING', 'LN_BTC', 'LIQUID_BTC', 'SPARK', 'STACKS', 'RSK_BTC']),
  side: z.enum(['BUY', 'SELL']),
  maxValue: z.string().optional(),
  minValue: z.string().optional(),
  currency: z.enum(['BRL', 'USD', 'EUR', 'GBP', 'ARS', 'MXN', 'NGN', 'INR']).optional(),
  fiatMethod: z.enum(['PIX', 'TED', 'BANK_TRANSFER', 'CRYPTO_DIRECT', 'LIGHTNING_DIRECT', 'CASH', 'OTHER']).optional(),
})

export async function agentRoutes(app: FastifyInstance): Promise<void> {
  const rateLimitConfig = { rateLimit: { max: config.rateLimit.criticalMax, timeWindow: config.rateLimit.criticalTimeWindow } }

  app.post('/v1/agents/generate-trade-intent', {
    preHandler: requireAuth,
    config: rateLimitConfig,
    ...docsOnlySchema({ tags: ['open-agents'], body: goalSchema }),
  }, async (request, reply) => {
    const { goal } = goalSchema.parse(request.body)
    const intent = await getQvacAgentProvider().generateTradeIntent(goal)
    return reply.code(200).send({ success: true, data: intent })
  })

  app.post('/v1/agents/generate-offer-intent', {
    preHandler: requireAuth,
    config: rateLimitConfig,
    ...docsOnlySchema({ tags: ['open-agents'], body: goalSchema }),
  }, async (request, reply) => {
    const { goal } = goalSchema.parse(request.body)
    const intent = await getQvacAgentProvider().generateOfferIntent(goal)
    return reply.code(200).send({ success: true, data: intent })
  })

  app.post('/v1/agents/assess-intent-risk', {
    preHandler: requireAuth,
    config: rateLimitConfig,
    ...docsOnlySchema({ tags: ['open-agents'], body: assessIntentRiskSchema }),
  }, async (request, reply) => {
    const intent = assessIntentRiskSchema.parse(request.body)
    const assessment = await getQvacAgentProvider().assessIntentRisk(intent)
    return reply.code(200).send({ success: true, data: assessment })
  })
}
