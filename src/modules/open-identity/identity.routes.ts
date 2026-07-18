/**
 * Sails OpenIdentity routes — API_REFERENCE.md section 2.
 *
 * Thin HTTP wiring only — registration delegates to identity.service.ts,
 * challenge/authenticate delegate to common/middleware/auth.ts (RT-002's
 * fix). No route here reads a bare `userId`/`participantId` from the
 * request body as an identity claim — that was exactly the vulnerability
 * this module exists to close.
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { identityService } from './identity.service'
import { issueChallenge, verifySignedChallenge, requireAuth } from '../../common/middleware/auth'
import { config } from '../../config'

const registerSchema = z.object({
  publicKey: z.string().min(1),
  displayName: z.string().optional(),
})

const challengeSchema = z.object({
  publicKey: z.string().min(1),
})

const authenticateSchema = z.object({
  publicKey: z.string().min(1),
  signature: z.string().min(1),
})

export async function identityRoutes(app: FastifyInstance): Promise<void> {
  app.post('/v1/identity/participants', {
    schema: { tags: ['open-identity'] },
  }, async (request, reply) => {
    const body = registerSchema.parse(request.body)
    const participant = await identityService.register(body)
    return reply.code(201).send({ success: true, data: participant })
  })

  app.get('/v1/identity/participants/:id', {
    schema: { tags: ['open-identity'] },
  }, async (request, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params)
    const participant = await identityService.getParticipant(id)
    return reply.code(200).send({ success: true, data: participant })
  })

  // Tighter, dedicated limit than the global default (app.ts) — these two
  // routes are exactly what a credential-stuffing/brute-force attempt
  // would hit (RED_TEAM_REVIEW.md RT-002), so they get their own ceiling
  // rather than sharing the general API's more permissive ones.
  app.post('/v1/identity/challenge', {
    config: { rateLimit: { max: config.rateLimit.authMax, timeWindow: config.rateLimit.authTimeWindow } },
    schema: { tags: ['open-identity'] },
  }, async (request, reply) => {
    const body = challengeSchema.parse(request.body)
    const result = await issueChallenge(body.publicKey)
    return reply.code(200).send({ success: true, data: result })
  })

  app.post('/v1/identity/authenticate', {
    config: { rateLimit: { max: config.rateLimit.authMax, timeWindow: config.rateLimit.authTimeWindow } },
    schema: { tags: ['open-identity'] },
  }, async (request, reply) => {
    const body = authenticateSchema.parse(request.body)
    const result = await verifySignedChallenge(body.publicKey, body.signature)
    if (!result.verified) {
      return reply.code(401).send({ success: false, error: 'AUTH_ERROR', message: result.reason ?? 'Verification failed', details: [] })
    }
    return reply.code(200).send({
      success: true,
      data: { participantId: result.participantId, sessionToken: result.sessionToken },
    })
  })

  // Dev-only introspection of the caller's own session — nothing in
  // API_REFERENCE.md requires this, but every other route in this pass
  // needs at least one example of requireAuth actually gating a route
  // (TODO.md §3's "still open" half of this item) rather than the
  // middleware existing unused.
  app.get('/v1/identity/me', {
    preHandler: requireAuth,
    schema: { tags: ['open-identity'] },
  }, async (request, reply) => {
    const participant = await identityService.getParticipant((request as any).participantId)
    return reply.code(200).send({ success: true, data: participant })
  })
}
