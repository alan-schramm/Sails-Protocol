/**
 * Sails OpenProof routes — PROTOCOL_SPECIFICATION.md §1.8. Every mutating
 * route derives its identity field from the authenticated session
 * (`req.participantId`, `requireAuth`), never a bare id in the body — the
 * same RT-002-class boundary every other mutating route in this codebase
 * already relies on.
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { proofService } from './proof.service'
import { requireAuth } from '../../common/middleware/auth'

const assertClaimSchema = z.object({
  claimType: z.string().min(1),
  assertion: z.unknown(),
})

const submitProofSchema = z.object({
  claimId: z.string().min(1),
  evidence: z.unknown(),
  claimedHash: z.string().optional(),
})

const verifyProofSchema = z.object({
  verdict: z.enum(['ACCEPTED', 'REJECTED']),
  nonce: z.string().min(1),
  reason: z.string().optional(),
})

export async function proofRoutes(app: FastifyInstance): Promise<void> {
  app.post('/v1/proof/claims', {
    preHandler: requireAuth,
    schema: { tags: ['open-proof'] },
  }, async (request, reply) => {
    const body = assertClaimSchema.parse(request.body)
    const participantId = (request as any).participantId as string
    const claim = await proofService.assertClaim({
      claimedBy: participantId,
      claimType: body.claimType,
      assertion: body.assertion,
    })
    return reply.code(201).send({ success: true, data: claim })
  })

  app.post('/v1/proof/proofs', {
    preHandler: requireAuth,
    schema: { tags: ['open-proof'] },
  }, async (request, reply) => {
    const body = submitProofSchema.parse(request.body)
    const participantId = (request as any).participantId as string
    const proof = await proofService.submitProof({
      claimId: body.claimId,
      evidence: body.evidence,
      submittedBy: participantId,
      claimedHash: body.claimedHash,
    })
    return reply.code(201).send({ success: true, data: proof })
  })

  app.post('/v1/proof/proofs/:id/verify-nonce', {
    preHandler: requireAuth,
    schema: { tags: ['open-proof'] },
  }, async (request, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params)
    const result = await proofService.issueVerificationNonce(id)
    return reply.code(200).send({ success: true, data: result })
  })

  app.post('/v1/proof/proofs/:id/verify', {
    preHandler: requireAuth,
    schema: { tags: ['open-proof'] },
  }, async (request, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params)
    const body = verifyProofSchema.parse(request.body)
    const participantId = (request as any).participantId as string
    const verification = await proofService.verifyProof(id, participantId, body.verdict, body.nonce, body.reason)
    return reply.code(201).send({ success: true, data: verification })
  })

  app.get('/v1/proof/claims/:id/bundle', {
    preHandler: requireAuth,
    schema: { tags: ['open-proof'] },
  }, async (request, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params)
    const bundle = await proofService.getEvidenceBundle(id)
    return reply.code(200).send({ success: true, data: bundle })
  })
}
