/**
 * Intent API routes — 03-implementation_plan.md section 4.
 *
 * Deliberately thin: request-shape validation via zod (already wired into
 * app.ts's error handler — a ZodError here becomes a 400 VALIDATION_ERROR
 * automatically), everything else delegates to core/intent-engine.ts. This
 * route must never re-implement the Byzantine/Economic rules — those live
 * once, in the Core, so every future entry point (SDK, a second HTTP
 * route, an agent calling the engine directly) gets them for free.
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { intentEngine } from '../core/intent-engine'
import { requireAuth } from '../common/middleware/auth'
import type { IntentType, TradeIntentPayload } from '../common/types/intent'

// Fase 1 Red Team finding: currency/fiatMethod were open z.string(),
// letting adversarial free text ride all the way into
// QvacAgentProvider.assessIntentRisk()'s prompt unsanitized
// (tests/qvac-prompt-injection.test.ts confirmed this live, against the
// real model — a fiatMethod containing a fake "SYSTEM OVERRIDE"
// instruction flipped a high-risk/reject assessment to low-risk/proceed
// on an identical trade). Restricted to the same real enums
// common/types/index.ts's FiatCurrency/PaymentMethod already declare —
// closes the vector at the API boundary, not just at the prompt layer
// (see qvac-agent.provider.ts's RISK_SYSTEM_PROMPT for the
// defense-in-depth layer on top of this).
const tradeIntentPayloadSchema = z.object({
  asset: z.string().min(1),
  side: z.enum(['BUY', 'SELL']),
  maxValue: z.string().optional(),
  minValue: z.string().optional(),
  currency: z.enum(['BRL', 'USD', 'EUR', 'GBP', 'ARS', 'MXN', 'NGN', 'INR']).optional(),
  fiatMethod: z.enum(['PIX', 'TED', 'BANK_TRANSFER', 'CRYPTO_DIRECT', 'LIGHTNING_DIRECT', 'CASH', 'OTHER']).optional(),
  network: z.string().optional(),
  slippageTolerance: z.number().optional(),
  // RFC-013 — zod's default z.object() strips unrecognized keys rather
  // than rejecting them, so these need to be listed explicitly here or
  // they'd be silently dropped before ever reaching intent-engine.ts's
  // own bounds check, for every caller of this route (including
  // @sails/sdk's createIntent()).
  minReputationRating: z.number().optional(),
  kycRequired: z.boolean().optional(),
})

const createIntentSchema = z.object({
  type: z.literal('TradeIntent'), // only IntentType with a registered handler today (§2.3)
  payload: tradeIntentPayloadSchema,
  agentId: z.string().optional(),
})

export async function intentRoutes(app: FastifyInstance): Promise<void> {
  // Gap-audit fix: this route previously took `participantId` directly
  // from the request body with no auth at all — the exact RT-002
  // vulnerability auth.ts's own doc comment warns against
  // ("a route that reads req.body.userId directly instead of
  // req.participantId set by this middleware is exactly the RT-002
  // vulnerability again"), reintroduced here specifically. Anyone could
  // previously create a TradeIntent attributed to any participantId with
  // no proof they controlled that identity. participantId is now derived
  // from the authenticated session only, never trusted from the body —
  // same pattern every other mutating route in this codebase already
  // uses (liquidity.routes.ts, trade.routes.ts, settlement.routes.ts).
  app.post('/api/v1/intents', {
    preHandler: requireAuth,
    schema: {
      tags: ['intent'],
      body: {
        type: 'object',
        required: ['type', 'payload'],
        properties: {
          type: { type: 'string' },
          payload: { type: 'object' },
          agentId: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const body = createIntentSchema.parse(request.body)
    const participantId = (request as any).participantId as string
    const intent = await intentEngine.create<TradeIntentPayload>(
      body.type as IntentType,
      body.payload,
      participantId,
      body.agentId
    )
    return reply.code(201).send({ success: true, data: intent })
  })

  // Gap-audit fix: same RT-002-class issue as above, plus no ownership
  // check at all — any caller could cancel any Intent by id.
  // intentEngine.cancel() now requires cancelledBy and verifies it
  // against the Intent's own participantId.
  app.delete('/api/v1/intents/:id', {
    preHandler: requireAuth,
    schema: { tags: ['intent'], params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } } },
  }, async (request, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params)
    const participantId = (request as any).participantId as string
    await intentEngine.cancel(id, participantId)
    return reply.code(200).send({ success: true })
  })
}
