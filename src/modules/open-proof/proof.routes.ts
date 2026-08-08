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
import type { AuthenticatedRequest } from '../../common/middleware/auth'
import { docsOnlySchema } from '../../common/openapi'

const assertClaimSchema = z.object({
  claimType: z.string().min(1),
  assertion: z.unknown(),
  tradeId: z.string().optional(), // RFC-007 D6 — scopes this Claim into a trade's EvidenceBundle
})

// RFC-007 D2 — media as base64 (this codebase's established JSON-body
// convention, same as every other route here — no multipart upload
// machinery introduced for this one route). signature is hex-encoded,
// verified server-side against the caller's own registered public key
// (proof.service.ts's attachEvidence()) — never trusted as-is.
const attachEvidenceSchema = z.object({
  mediaBase64: z.string().min(1),
  mimeType: z.enum(['image', 'video', 'document', 'ocr', 'external_reference']),
  signatureHex: z.string().min(1),
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

const idParamsSchema = z.object({ id: z.string().min(1) })

const tradeIdParamsSchema = z.object({ tradeId: z.string().min(1) })

export async function proofRoutes(app: FastifyInstance): Promise<void> {
  app.post('/v1/proof/claims', {
    preHandler: requireAuth,
    ...docsOnlySchema({ tags: ['open-proof'], body: assertClaimSchema }),
  }, async (request, reply) => {
    const body = assertClaimSchema.parse(request.body)
    const participantId = (request as AuthenticatedRequest).participantId
    const claim = await proofService.assertClaim({
      claimedBy: participantId,
      claimType: body.claimType,
      assertion: body.assertion,
      tradeId: body.tradeId,
    })
    return reply.code(201).send({ success: true, data: claim })
  })

  app.post('/v1/proof/proofs', {
    preHandler: requireAuth,
    ...docsOnlySchema({ tags: ['open-proof'], body: submitProofSchema }),
  }, async (request, reply) => {
    const body = submitProofSchema.parse(request.body)
    const participantId = (request as AuthenticatedRequest).participantId
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
    ...docsOnlySchema({ tags: ['open-proof'], params: idParamsSchema }),
  }, async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params)
    const result = await proofService.issueVerificationNonce(id)
    return reply.code(200).send({ success: true, data: result })
  })

  app.post('/v1/proof/proofs/:id/verify', {
    preHandler: requireAuth,
    ...docsOnlySchema({ tags: ['open-proof'], params: idParamsSchema, body: verifyProofSchema }),
  }, async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params)
    const body = verifyProofSchema.parse(request.body)
    const participantId = (request as AuthenticatedRequest).participantId
    const verification = await proofService.verifyProof(id, participantId, body.verdict, body.nonce, body.reason)
    return reply.code(201).send({ success: true, data: verification })
  })

  app.get('/v1/proof/claims/:id/bundle', {
    preHandler: requireAuth,
    ...docsOnlySchema({ tags: ['open-proof'], params: idParamsSchema }),
  }, async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params)
    const bundle = await proofService.getEvidenceBundle(id)
    return reply.code(200).send({ success: true, data: bundle })
  })

  // RFC-007 D2, closed 2026-08-04. participantId comes from the session
  // (RT-002 boundary, same as every other mutating route above) — the
  // caller cannot attach evidence "as" someone else even if they
  // supplied a signature that happens to verify (attachEvidence()'s own
  // check ties the signature to the AUTHENTICATED caller's public key,
  // not to a client-supplied participantId).
  app.post('/v1/proof/proofs/:id/evidence', {
    preHandler: requireAuth,
    ...docsOnlySchema({ tags: ['open-proof'], params: idParamsSchema, body: attachEvidenceSchema }),
  }, async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params)
    const body = attachEvidenceSchema.parse(request.body)
    const participantId = (request as AuthenticatedRequest).participantId
    const media = Buffer.from(body.mediaBase64, 'base64')
    const reference = await proofService.attachEvidence(id, media, body.mimeType, participantId, body.signatureHex)
    return reply.code(201).send({ success: true, data: reference })
  })

  // RFC-008 D1, closed 2026-08-04. Real submission to a live
  // OpenTimestamps calendar server — a genuine network call and cost, so
  // this stays an explicit, separate call rather than automatic on every
  // attachEvidence() (Policy Engine's own job to decide when it's
  // warranted, per that RFC's own D1).
  app.post('/v1/proof/evidence/:id/anchor', {
    preHandler: requireAuth,
    ...docsOnlySchema({ tags: ['open-proof'], params: idParamsSchema }),
  }, async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params)
    const reference = await proofService.anchorEvidence(id)
    return reply.code(200).send({ success: true, data: reference })
  })

  // RFC-007 D6, closed 2026-08-04 — public read, no session required,
  // same "read by id needs no auth" precedent GET /v1/settlement/escrow/:id
  // and GET /v1/settlement/disputes/:id already established.
  app.get('/v1/proof/trades/:tradeId/bundle', {
    ...docsOnlySchema({ tags: ['open-proof'], params: tradeIdParamsSchema }),
  }, async (request, reply) => {
    const { tradeId } = tradeIdParamsSchema.parse(request.params)
    const bundle = await proofService.getEvidenceBundleForTrade(tradeId)
    return reply.code(200).send({ success: true, data: bundle })
  })
}
