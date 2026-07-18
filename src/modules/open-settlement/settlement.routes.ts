/**
 * Sails OpenSettlement routes — API_REFERENCE.md section 4 (escrow) plus
 * a dispute-resolve route that section doesn't document yet (added here
 * per CONTRIBUTING.md's rule to document new routes, not just ship them
 * — see the API_REFERENCE.md edit alongside this file).
 *
 * The escrow.service.ts methods this wraps already existed and are
 * complete (BACKLOG.md P2: "most complete module today") — this file is
 * pure HTTP wiring, no new business logic.
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { escrowService } from './escrow.service'
import { DisputeService } from './dispute.service'
import { TrustedArbitratorProvider } from './arbitration-provider'
import { ValidationError } from '../../common/errors'
import { config } from '../../config'
import { requireAuth } from '../../common/middleware/auth'

// Lazy singleton — constructed on first use, not at module load, so a
// deployment with TRUSTED_ARBITRATORS unset can still boot and serve
// every other route; only the dispute routes below fail, with a clear
// config error instead of the whole process refusing to start.
let disputeServiceInstance: DisputeService | null = null
function getDisputeService(): DisputeService {
  if (!disputeServiceInstance) {
    if (config.settlement.trustedArbitrators.length === 0) {
      throw new ValidationError('No trusted arbitrators configured — set TRUSTED_ARBITRATORS (RFC-007 D4)')
    }
    disputeServiceInstance = new DisputeService(new TrustedArbitratorProvider(config.settlement.trustedArbitrators))
  }
  return disputeServiceInstance
}

const createEscrowSchema = z.object({
  tradeId: z.string().min(1),
  type: z.enum(['MULTISIG', 'LIGHTNING_HODL', 'LIQUID_COVENANT', 'MOCK']).optional(),
  lockedAmount: z.string().min(1),
  asset: z.string().min(1),
  network: z.string().optional(),
  timelockHours: z.number().optional(),
})

const releaseSchema = z.object({
  toAddress: z.string().min(1),
})

const disputeSchema = z.object({
  reason: z.string().min(1),
  evidence: z.array(z.any()).optional(),
})

const resolveSchema = z.object({
  ruling: z.enum(['RELEASE', 'REFUND', 'SPLIT']),
  releaseToAddress: z.string().optional(),
})

export async function settlementRoutes(app: FastifyInstance): Promise<void> {
  app.post('/v1/settlement/escrow', {
    preHandler: requireAuth,
    schema: { tags: ['open-settlement'] },
  }, async (request, reply) => {
    const body = createEscrowSchema.parse(request.body)
    const escrow = await escrowService.createEscrow(body as any)
    return reply.code(201).send({ success: true, data: escrow })
  })

  app.get('/v1/settlement/escrow/:id', {
    schema: { tags: ['open-settlement'] },
  }, async (request, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params)
    const escrow = await escrowService.getEscrow(id)
    return reply.code(200).send({ success: true, data: escrow })
  })

  app.post('/v1/settlement/escrow/:id/lock', {
    preHandler: requireAuth,
    schema: { tags: ['open-settlement'] },
  }, async (request, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params)
    const participantId = (request as any).participantId as string
    const escrow = await escrowService.lockFunds(id, participantId)
    return reply.code(200).send({ success: true, data: escrow })
  })

  app.post('/v1/settlement/escrow/:id/payment-sent', {
    preHandler: requireAuth,
    schema: { tags: ['open-settlement'] },
  }, async (request, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params)
    const participantId = (request as any).participantId as string
    const escrow = await escrowService.markPaymentSent(id, participantId)
    return reply.code(200).send({ success: true, data: escrow })
  })

  app.post('/v1/settlement/escrow/:id/release', {
    preHandler: requireAuth,
    schema: { tags: ['open-settlement'] },
  }, async (request, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params)
    const body = releaseSchema.parse(request.body)
    const participantId = (request as any).participantId as string
    const escrow = await escrowService.releaseFunds(id, body.toAddress, participantId)
    return reply.code(200).send({ success: true, data: escrow })
  })

  // RFC-015 — two-person control. Records the calling participant's
  // approval; releaseFunds() above checks escrowService.hasDualApproval()
  // itself (gated behind config.features.requireDualApprovalForRelease)
  // rather than this route enforcing anything directly — this route's
  // only job is recording "who approved," not deciding when release is
  // allowed to proceed.
  app.post('/v1/settlement/escrow/:id/approve-release', {
    preHandler: requireAuth,
    schema: { tags: ['open-settlement'] },
  }, async (request, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params)
    const participantId = (request as any).participantId as string
    const approval = await escrowService.approveRelease(id, participantId)
    const readyToRelease = await escrowService.hasDualApproval(id)
    return reply.code(200).send({ success: true, data: { ...approval, readyToRelease } })
  })

  app.get('/v1/settlement/escrow/:id/release-approvals', {
    schema: { tags: ['open-settlement'] },
  }, async (request, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params)
    const approvals = await escrowService.getReleaseApprovals(id)
    const readyToRelease = await escrowService.hasDualApproval(id)
    return reply.code(200).send({ success: true, data: { approvals, readyToRelease } })
  })

  // Delegates to dispute.service.ts's raiseDispute (persists a Dispute
  // row + assigns an arbiter + notifies), not escrowService.openDispute
  // directly — that's the lower-level state transition raiseDispute
  // itself calls as its first step.
  app.post('/v1/settlement/escrow/:id/dispute', {
    preHandler: requireAuth,
    schema: { tags: ['open-settlement'] },
  }, async (request, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params)
    const body = disputeSchema.parse(request.body)
    const participantId = (request as any).participantId as string
    const escrow = await escrowService.getEscrow(id)
    const dispute = await getDisputeService().raiseDispute(escrow.tradeId, participantId, body.reason, body.evidence as any)
    return reply.code(200).send({ success: true, data: dispute })
  })

  app.post('/v1/settlement/escrow/:id/refund', {
    preHandler: requireAuth,
    schema: { tags: ['open-settlement'] },
  }, async (request, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params)
    const participantId = (request as any).participantId as string
    const escrow = await escrowService.refundFunds(id, participantId)
    return reply.code(200).send({ success: true, data: escrow })
  })

  // Not yet in API_REFERENCE.md's section 4 table — added alongside this
  // file's own doc update. Only the assigned arbiter may call this
  // (enforced in dispute.service.ts's resolveDispute).
  app.post('/v1/settlement/disputes/:id/resolve', {
    preHandler: requireAuth,
    schema: { tags: ['open-settlement'] },
  }, async (request, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params)
    const body = resolveSchema.parse(request.body)
    const participantId = (request as any).participantId as string
    const dispute = await getDisputeService().resolveDispute(id, participantId, body.ruling, body.releaseToAddress)
    return reply.code(200).send({ success: true, data: dispute })
  })
}
