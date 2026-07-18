/**
 * Sails OpenAgents — Capability routes
 * rfcs/RFC-013-capability-registry-and-wallet-adapter.md
 *
 * First real routes for this module. Capability declaration/grant maps
 * onto `agent-delegation` in RFC-005's module<->Capability table
 * (`core/capability-registry.ts`'s `CAPABILITY_IMPLEMENTATIONS`), the
 * closest existing owner — a wallet or agent declaring "I can do X"
 * before being trusted to act is the same shape as an Agent being
 * delegated a capability.
 *
 * Self-issued grants only for this pass (`issuedBy = grantedTo` — the
 * caller grants themselves scope over their own declared capabilities).
 * A real multi-party issuance flow (a module operator granting scope to
 * an agent it doesn't control) is real, separate follow-up work
 * (RFC-013's Reference Implementation Plan §5), not claimed done here.
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { capabilityRegistry } from '../../core/capability-registry'
import { requireAuth } from '../../common/middleware/auth'

const registerSchema = z.object({
  capabilityName: z.string().min(1),
  scope: z.array(z.string().min(1)).min(1),
  constraints: z.record(z.unknown()).optional(),
})

export async function capabilityRoutes(app: FastifyInstance): Promise<void> {
  app.post('/v1/capabilities/register', {
    preHandler: requireAuth,
    schema: { tags: ['open-agents'] },
  }, async (request, reply) => {
    const body = registerSchema.parse(request.body)
    const participantId = (request as any).participantId as string

    const grant = await capabilityRegistry.grant({
      grantedTo: participantId,
      capabilityName: body.capabilityName,
      scope: body.scope,
      constraints: body.constraints,
      issuedBy: participantId,
    })

    return reply.code(201).send({ success: true, data: grant })
  })

  app.get('/v1/capabilities/:participantId', {
    schema: { tags: ['open-agents'] },
  }, async (request, reply) => {
    const { participantId } = z.object({ participantId: z.string().min(1) }).parse(request.params)
    const grants = await capabilityRegistry.listGrants(participantId)
    return reply.code(200).send({ success: true, data: grants })
  })

  app.post('/v1/capabilities/:grantId/revoke', {
    preHandler: requireAuth,
    schema: { tags: ['open-agents'] },
  }, async (request, reply) => {
    const { grantId } = z.object({ grantId: z.string().min(1) }).parse(request.params)
    const participantId = (request as any).participantId as string
    await capabilityRegistry.revoke(grantId, participantId)
    return reply.code(200).send({ success: true })
  })
}
