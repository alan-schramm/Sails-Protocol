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
import { marketArbitrationProvider } from './market-arbitration.provider'
import { ValidationError } from '../../common/errors'
import { config } from '../../config'
import { requireAuth } from '../../common/middleware/auth'

// Lazy singleton — constructed on first use, not at module load, so a
// deployment with neither arbitration mode configured can still boot and
// serve every other route; only the dispute routes below fail, with a
// clear config error instead of the whole process refusing to start.
//
// RFC-021 D2 — config.settlement.arbitrationMode picks between the two
// real ArbitrationProvider implementations: 'trusted-list' (RFC-007 D4's
// original, curated TRUSTED_ARBITRATORS allowlist — still the right
// choice for a closed/regulated deployment) and 'market' (RFC-021's
// permissionless, collateral-and-reputation-weighted registry). Default
// 'trusted-list' — changing this is a deliberate operator decision, not
// an automatic upgrade, since 'market' requires arbiters to have
// actually registered via MarketArbitrationProvider.register() first.
let disputeServiceInstance: DisputeService | null = null
function getDisputeService(): DisputeService {
  if (!disputeServiceInstance) {
    if (config.settlement.arbitrationMode === 'market') {
      disputeServiceInstance = new DisputeService(marketArbitrationProvider)
    } else {
      if (config.settlement.trustedArbitrators.length === 0) {
        throw new ValidationError('No trusted arbitrators configured — set TRUSTED_ARBITRATORS (RFC-007 D4)')
      }
      disputeServiceInstance = new DisputeService(new TrustedArbitratorProvider(config.settlement.trustedArbitrators))
    }
  }
  return disputeServiceInstance
}

const createEscrowSchema = z.object({
  tradeId: z.string().min(1),
  // WDK_USDT_EVM and SAFE_GUARD_EVM were both real, registered providers
  // (escrow.service.ts's PROVIDERS map) missing from this validator —
  // WDK_USDT_EVM was a pre-existing gap found while adding SAFE_GUARD_EVM
  // (RFC-020), fixed here rather than left alongside the new one.
  type: z.enum(['MULTISIG', 'LIGHTNING_HODL', 'LIQUID_COVENANT', 'WDK_USDT_EVM', 'SAFE_GUARD_EVM', 'MOCK']).optional(),
  lockedAmount: z.string().min(1),
  asset: z.string().min(1),
  network: z.string().optional(),
  timelockHours: z.number().optional(),
})

const releaseSchema = z.object({
  toAddress: z.string().min(1),
})

// 33-byte compressed secp256k1 pubkey, hex — same pattern
// escrow.service.ts's submitParticipantKey() validates against.
const submitKeySchema = z.object({
  pubkey: z.string().regex(/^0[23][0-9a-fA-F]{64}$/, 'must be a 33-byte compressed secp256k1 public key, hex-encoded'),
})

const initiateReleaseSchema = z.object({
  toAddress: z.string().min(1),
})

// PSBT, base64-encoded — same format multisig.provider.ts's
// buildUnsignedRelease()/buildUnsignedRefund() emit and @sails/sdk's
// signEscrowPsbt() returns.
const submitTransactionSignatureSchema = z.object({
  signedPsbtBase64: z.string().min(1),
})

const disputeSchema = z.object({
  reason: z.string().min(1),
  evidence: z.array(z.any()).optional(),
})

const resolveSchema = z.object({
  ruling: z.enum(['RELEASE', 'REFUND', 'SPLIT']),
  releaseToAddress: z.string().optional(),
})

// RFC-021 D2 — permissionless arbiter registration.
const registerArbiterSchema = z.object({
  monetaryCollateral: z.string().min(1),
  collateralAsset: z.string().optional(),
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

  // Client-held-keys write path (2026-07-27) — buyer or seller submits
  // only their own public key, generated client-side (@sails/sdk's
  // escrow-key module); see escrow.service.ts's submitParticipantKey()
  // and multisig.provider.ts's/lightning-hodl.provider.ts's own header
  // comments for the full custody-model disclosure. Only meaningful for
  // MULTISIG/LIGHTNING_HODL escrows — submitParticipantKey() itself
  // rejects any other type.
  app.post('/v1/settlement/escrow/:id/submit-key', {
    preHandler: requireAuth,
    schema: { tags: ['open-settlement'] },
  }, async (request, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params)
    const body = submitKeySchema.parse(request.body)
    const participantId = (request as any).participantId as string
    const result = await escrowService.submitParticipantKey(id, participantId, body.pubkey)
    return reply.code(200).send({ success: true, data: result })
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

  // Phase 2 client-signature-collection flow (2026-07-27) — real for
  // MULTISIG only; escrowService.initiateRelease() itself rejects any
  // other escrow type with a clear error pointing back to the direct
  // /release route. See escrow.service.ts's own header comment on this
  // method for the full flow.
  app.post('/v1/settlement/escrow/:id/initiate-release', {
    preHandler: requireAuth,
    schema: { tags: ['open-settlement'] },
  }, async (request, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params)
    const body = initiateReleaseSchema.parse(request.body)
    const participantId = (request as any).participantId as string
    const pending = await escrowService.initiateRelease(id, body.toAddress, participantId)
    return reply.code(201).send({ success: true, data: pending })
  })

  // Mirror of initiate-release above, for refund.
  app.post('/v1/settlement/escrow/:id/initiate-refund', {
    preHandler: requireAuth,
    schema: { tags: ['open-settlement'] },
  }, async (request, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params)
    const participantId = (request as any).participantId as string
    const pending = await escrowService.initiateRefund(id, participantId)
    return reply.code(201).send({ success: true, data: pending })
  })

  // Each required signer (EscrowPendingTransaction.requiredSigners) calls
  // this once with their own independently-signed copy of the unsigned
  // PSBT. Once every required signer has submitted, the response's
  // `data.complete` flips to true and the escrow has actually transitioned
  // (COMPLETED/REFUNDED) with a real txReleaseId.
  app.post('/v1/settlement/escrow/:id/submit-transaction-signature', {
    preHandler: requireAuth,
    schema: { tags: ['open-settlement'] },
  }, async (request, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params)
    const body = submitTransactionSignatureSchema.parse(request.body)
    const participantId = (request as any).participantId as string
    const result = await escrowService.submitTransactionSignature(id, participantId, body.signedPsbtBase64)
    return reply.code(200).send({ success: true, data: result })
  })

  app.get('/v1/settlement/escrow/:id/pending-transaction', {
    schema: { tags: ['open-settlement'] },
  }, async (request, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params)
    const pending = await escrowService.getPendingTransaction(id)
    return reply.code(200).send({ success: true, data: pending })
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

  // RFC-021 D2 — permissionless arbiter registration. No approval step:
  // the caller registers themselves, matching MarketArbitrationProvider's
  // own real logic. Works regardless of config.settlement.arbitrationMode
  // (a participant can register collateral/reputation ahead of a
  // deployment switching modes) — only assign() itself is mode-gated.
  app.post('/v1/settlement/arbitration/register', {
    preHandler: requireAuth,
    schema: { tags: ['open-settlement'] },
  }, async (request, reply) => {
    const body = registerArbiterSchema.parse(request.body)
    const participantId = (request as any).participantId as string
    const profile = await marketArbitrationProvider.register(participantId, body.monetaryCollateral, body.collateralAsset)
    return reply.code(201).send({ success: true, data: profile })
  })

  app.get('/v1/settlement/arbitration/profile/:participantId', {
    schema: { tags: ['open-settlement'] },
  }, async (request, reply) => {
    const { participantId } = z.object({ participantId: z.string().min(1) }).parse(request.params)
    const profile = await marketArbitrationProvider.getProfile(participantId)
    if (!profile) {
      return reply.code(404).send({ success: false, error: 'NOT_FOUND', message: `No ArbiterProfile for ${participantId}` })
    }
    return reply.code(200).send({ success: true, data: profile })
  })
}
