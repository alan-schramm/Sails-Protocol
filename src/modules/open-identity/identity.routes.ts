/**
 * Sails OpenIdentity routes — API_REFERENCE.md section 2.
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { identityService } from './identity.service'
import { issueChallenge, verifySignedChallenge, requireAuth, issueWsTicket, issueRegistrationChallenge, revokeCurrentSession } from '../../common/middleware/auth'
import type { AuthenticatedRequest } from '../../common/middleware/auth'
import { createSharedRateLimit } from '../../common/middleware/redis-rate-limit'
import { config } from '../../config'
import { docsOnlySchema } from '../../common/openapi'

const authRateLimit = createSharedRateLimit({ max: config.rateLimit.authMax, windowMs: config.rateLimit.authWindowMs, keyPrefix: 'auth' })
const registerSchema = z.object({ publicKey: z.string().regex(/^[0-9a-fA-F]{64}$/, 'Must be a 64-character hex-encoded Ed25519 public key'), signature: z.string().min(1), displayName: z.string().optional() })
const participantIdParamsSchema = z.object({ id: z.string().min(1) })
const challengeSchema = z.object({ publicKey: z.string().regex(/^[0-9a-fA-F]{64}$/, 'Must be a 64-character hex-encoded Ed25519 public key') })
const registerChallengeSchema = z.object({ publicKey: z.string().regex(/^[0-9a-fA-F]{64}$/, 'Must be a 64-character hex-encoded Ed25519 public key') })
const authenticateSchema = z.object({ publicKey: z.string().regex(/^[0-9a-fA-F]{64}$/, 'Must be a 64-character hex-encoded Ed25519 public key'), signature: z.string().min(1) })

export async function identityRoutes(app: FastifyInstance): Promise<void> {
  app.post('/v1/identity/register-challenge', { preHandler: authRateLimit, ...docsOnlySchema({ tags: ['open-identity'], body: registerChallengeSchema }) }, async (request, reply) => {
    const body = registerChallengeSchema.parse(request.body)
    return reply.code(200).send({ success: true, data: await issueRegistrationChallenge(body.publicKey) })
  })

  app.post('/v1/identity/participants', { preHandler: authRateLimit, ...docsOnlySchema({ tags: ['open-identity'], body: registerSchema }) }, async (request, reply) => {
    const body = registerSchema.parse(request.body)
    return reply.code(201).send({ success: true, data: await identityService.register(body) })
  })

  app.get('/v1/identity/participants/:id', { ...docsOnlySchema({ tags: ['open-identity'], params: participantIdParamsSchema }) }, async (request, reply) => {
    const { id } = participantIdParamsSchema.parse(request.params)
    return reply.code(200).send({ success: true, data: await identityService.getPublicView(id) })
  })

  app.post('/v1/identity/challenge', { preHandler: authRateLimit, ...docsOnlySchema({ tags: ['open-identity'], body: challengeSchema }) }, async (request, reply) => {
    const body = challengeSchema.parse(request.body)
    return reply.code(200).send({ success: true, data: await issueChallenge(body.publicKey) })
  })

  app.post('/v1/identity/authenticate', { preHandler: authRateLimit, ...docsOnlySchema({ tags: ['open-identity'], body: authenticateSchema }) }, async (request, reply) => {
    const body = authenticateSchema.parse(request.body)
    const result = await verifySignedChallenge(body.publicKey, body.signature)
    if (!result.verified) return reply.code(401).send({ success: false, error: 'AUTH_ERROR', message: result.reason ?? 'Verification failed', details: [] })
    return reply.code(200).send({ success: true, data: { participantId: result.participantId, sessionToken: result.sessionToken } })
  })

  app.get('/v1/identity/me', { preHandler: requireAuth, schema: { tags: ['open-identity'] } }, async (request, reply) => {
    const participant = await identityService.getParticipant((request as AuthenticatedRequest).participantId)
    return reply.code(200).send({ success: true, data: participant })
  })

  // #312 — revoke only the currently presented bearer session. requireAuth
  // establishes that this exact token is live immediately before deletion.
  // Redis DEL is shared across instances and idempotent at the storage layer.
  app.post('/v1/identity/logout', { preHandler: requireAuth, schema: { tags: ['open-identity'] } }, async (request, reply) => {
    await revokeCurrentSession(request)
    return reply.code(200).send({ success: true, data: { revoked: true } })
  })

  app.post('/v1/identity/ws-ticket', { preHandler: requireAuth, schema: { tags: ['open-identity'] } }, async (request, reply) => {
    const result = await issueWsTicket((request as AuthenticatedRequest).participantId)
    return reply.code(200).send({ success: true, data: result })
  })
}
