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
import type { IntentType, TradeIntentPayload } from '../common/types/intent'

const tradeIntentPayloadSchema = z.object({
  asset: z.string().min(1),
  side: z.enum(['BUY', 'SELL']),
  maxValue: z.string().optional(),
  minValue: z.string().optional(),
  currency: z.string().optional(),
  fiatMethod: z.string().optional(),
  network: z.string().optional(),
  slippageTolerance: z.number().optional(),
})

const createIntentSchema = z.object({
  type: z.literal('TradeIntent'), // only IntentType with a registered handler today (§2.3)
  payload: tradeIntentPayloadSchema,
  participantId: z.string().min(1),
})

export async function intentRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/v1/intents', {
    schema: {
      tags: ['intent'],
      body: {
        type: 'object',
        required: ['type', 'payload', 'participantId'],
        properties: {
          type: { type: 'string' },
          payload: { type: 'object' },
          participantId: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const body = createIntentSchema.parse(request.body)
    const intent = await intentEngine.create<TradeIntentPayload>(
      body.type as IntentType,
      body.payload,
      body.participantId
    )
    return reply.code(201).send({ success: true, data: intent })
  })

  app.delete('/api/v1/intents/:id', {
    schema: { tags: ['intent'], params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } } },
  }, async (request, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params)
    await intentEngine.cancel(id)
    return reply.code(200).send({ success: true })
  })
}
