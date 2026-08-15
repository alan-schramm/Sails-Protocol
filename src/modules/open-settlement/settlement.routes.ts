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
import { getDisputeService } from './dispute.service'
import { marketArbitrationProvider } from './market-arbitration.provider'
import { paymentAccountService } from './payment-account.service'
import { payoutAddressService } from './payout-address.service'
import { requireAuth } from '../../common/middleware/auth'
import type { AuthenticatedRequest } from '../../common/middleware/auth'
import { config } from '../../config'
import { docsOnlySchema } from '../../common/openapi'
import { MAX_PAGE_LIMIT } from '../../common/pagination'
import { positiveDecimalString } from '../../common/validation'

// CTO_DUE_DILIGENCE_REPORT.md A-SEC-05, closed 2026-08-08 — see
// config/index.ts's own comment on `rateLimit.criticalMax` for the full
// reasoning. Shared object (not inlined per route) so all four
// dispute/arbitration-adjacent routes below stay in sync if this is ever
// tuned.
const criticalRateLimit = { max: config.rateLimit.criticalMax, timeWindow: config.rateLimit.criticalTimeWindow }

// ─── Schemas ───────────────────────────────────────────────────────────────────
// One zod schema per distinct request body shape — kept inline rather than
// extracted to a shared file because every schema is consumed by exactly one
// route, and the zod error shape already includes the path/field the caller
// failed on (the same shape `src/app.ts`'s setErrorHandler turns into a 400
// VALIDATION_ERROR).

const createEscrowSchema = z.object({
  tradeId: z.string().min(1),
  // WDK_USDT_EVM and SAFE_GUARD_EVM were both real, registered providers
  // (escrow.service.ts's PROVIDERS map) missing from this validator —
  // WDK_USDT_EVM was a pre-existing gap found while adding SAFE_GUARD_EVM
  // (RFC-020), fixed here rather than left alongside the new one.
  type: z.enum(['MULTISIG', 'LIGHTNING_HODL', 'LIQUID_COVENANT', 'WDK_USDT_EVM', 'SAFE_GUARD_EVM', 'MOCK']).optional(),
  // 2026-08-15 security review — was z.string().min(1) (non-empty only,
  // no positive/finite check); see common/validation.ts's own header
  // comment for why that's the exact Bisq-incident bug class.
  lockedAmount: positiveDecimalString('lockedAmount'),
  asset: z.enum(['BTC', 'USDT_ERC20', 'USDT_TRC20', 'USDT_LIQUID', 'USDT_LIGHTNING', 'LN_BTC', 'LIQUID_BTC', 'SPARK', 'STACKS', 'RSK_BTC']),
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
// buildUnsignedRelease()/buildUnsignedRefund() emit and @satsails/p2p-trading-sdk's
// signEscrowPsbt() returns.
const submitTransactionSignatureSchema = z.object({
  signedPsbtBase64: z.string().min(1),
})

const disputeSchema = z.object({
  reason: z.string().min(1),
  evidence: z.array(z.object({
    type: z.string().min(1),
    uri: z.string().optional(),
    note: z.string().optional(),
  })).optional(),
})

const resolveSchema = z.object({
  ruling: z.enum(['RELEASE', 'REFUND', 'SPLIT']),
  releaseToAddress: z.string().optional(),
  // RFC-021 D9 (2026-08-02) — SPLIT-only: seller's payout address and the
  // buyer's share in basis points (0-10000, exclusive of both ends — a
  // real split, not an all-or-nothing RELEASE/REFUND in disguise).
  refundToAddress: z.string().optional(),
  splitBuyerBps: z.number().int().min(1).max(9999).optional(),
})

// RFC-021 D8
const submitEvidenceSchema = z.object({
  type: z.string().min(1),
  uri: z.string().optional(),
  note: z.string().optional(),
})

// RFC-021 D2 — permissionless arbiter registration.
const registerArbiterSchema = z.object({
  monetaryCollateral: z.string().min(1),
  collateralAsset: z.string().optional(),
})

// RFC-021 D5 — accountHash is computed client-side (@satsails/p2p-trading-sdk's
// hashPaymentAccount()) — the raw PIX key/bank account number is never
// sent here, only its hash.
const registerPaymentAccountSchema = z.object({
  accountHash: z.string().min(1),
  paymentMethod: z.enum(['PIX', 'TED', 'BANK_TRANSFER', 'CRYPTO_DIRECT', 'LIGHTNING_DIRECT', 'CASH', 'OTHER']),
})

// BACKLOG.md's own "Participant payout address" gap, closed 2026-08-04 —
// see payout-address.service.ts's own header comment for the full
// rationale. `asset` intentionally not validated against a stricter
// per-network address format here — that check already lives at the
// point of actual use (multisig.provider.ts's own address parsing,
// wdk-settlement.provider.ts's ethers address validation), not
// duplicated here against a value this route never spends.
const setPayoutAddressSchema = z.object({
  asset: z.string().min(1),
  address: z.string().min(1),
})

// Bounds match dispute.service.ts's listForArbiter() clamp (MAX_PAGE_LIMIT)
// exactly — until this fix, this was the only paginated list endpoint in
// the codebase relying on a service-layer clamp instead of route-level
// zod validation, so an out-of-range limit was silently coerced instead
// of returning 400 VALIDATION_ERROR like every sibling list endpoint
// (trade/reputation/chat/liquidity) already does.
const disputeListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_LIMIT).optional(),
  offset: z.coerce.number().int().min(0).optional(),
})

const arbiterProfileParamsSchema = z.object({ participantId: z.string().min(1) })

const accountHashParamsSchema = z.object({ accountHash: z.string().min(1) })

const payoutAddressParamsSchema = z.object({
  participantId: z.string().min(1),
  asset: z.string().min(1),
})

// ─── Helpers ────────────────────────────────────────────────────────────────────
// Extracted from the original inline blocks to cut ~30 occurrences of the same
// 3-line pattern (`z.object({ id: ... }).parse(...)`, `participantId as string`,
// `reply.code(N).send({ success, data })`). Each is a one-liner with a single
// responsibility — exactly the shape SDK_GUIDE.md and CONTRIBUTING.md ask every
// other route file in this codebase to follow.

/** Path-param schema used by every escrow/dispute/arbitration route below. */
const idParam = z.object({ id: z.string().min(1) })

/** Pulls the authenticated participantId off the request, set by
 *  requireAuth's preHandler. Cast to string per the same pattern every other
 *  route in src/ uses (typed as `unknown` on the request object itself). */
function participantId(request: unknown): string {
  return (request as { participantId: string }).participantId
}

/** Standard success envelope — every route returns this shape. The real
 *  HTTP status code (201 Created / 200 OK) stays explicit at each call
 *  site via reply.code(); PRODUCTION_READINESS_FIXES.md P0, closed
 *  2026-08-08 — this used to also duplicate it inside the JSON body
 *  (`{ success, data, status }`), which was both redundant and
 *  confusing (a client reading body.status could easily mistake it for
 *  a domain status field, e.g. Escrow.status). */
function success<T>(data: T) {
  return { success: true as const, data }
}

export async function settlementRoutes(app: FastifyInstance): Promise<void> {
  app.post('/v1/settlement/escrow', {
    preHandler: requireAuth,
    ...docsOnlySchema({ tags: ['open-settlement'], body: createEscrowSchema }),
  }, async (request, reply) => {
    const body = createEscrowSchema.parse(request.body)
    const participantId = (request as AuthenticatedRequest).participantId
    const escrow = await escrowService.createEscrow(body as any, participantId)
    return reply.code(201).send(success(escrow))
  })

  app.get('/v1/settlement/escrow/:id', {
    ...docsOnlySchema({ tags: ['open-settlement'], params: idParam }),
  }, async (request, reply) => {
    const { id } = idParam.parse(request.params)
    const escrow = await escrowService.getEscrow(id)
    return reply.code(200).send(success(escrow))
  })

  app.post('/v1/settlement/escrow/:id/lock', {
    preHandler: requireAuth,
    ...docsOnlySchema({ tags: ['open-settlement'], params: idParam }),
  }, async (request, reply) => {
    const { id } = idParam.parse(request.params)
    const escrow = await escrowService.lockFunds(id, participantId(request))
    return reply.code(200).send(success(escrow))
  })

  // Client-held-keys write path (2026-07-27) — buyer or seller submits
  // only their own public key, generated client-side (@satsails/p2p-trading-sdk's
  // escrow-key module); see escrow.service.ts's submitParticipantKey()
  // and multisig.provider.ts's/lightning-hodl.provider.ts's own header
  // comments for the full custody-model disclosure. Only meaningful for
  // MULTISIG/LIGHTNING_HODL escrows — submitParticipantKey() itself
  // rejects any other type.
  app.post('/v1/settlement/escrow/:id/submit-key', {
    preHandler: requireAuth,
    ...docsOnlySchema({ tags: ['open-settlement'], params: idParam, body: submitKeySchema }),
  }, async (request, reply) => {
    const { id } = idParam.parse(request.params)
    const body = submitKeySchema.parse(request.body)
    const result = await escrowService.submitParticipantKey(id, participantId(request), body.pubkey)
    return reply.code(200).send(success(result))
  })

  app.post('/v1/settlement/escrow/:id/payment-sent', {
    preHandler: requireAuth,
    ...docsOnlySchema({ tags: ['open-settlement'], params: idParam }),
  }, async (request, reply) => {
    const { id } = idParam.parse(request.params)
    const escrow = await escrowService.markPaymentSent(id, participantId(request))
    return reply.code(200).send(success(escrow))
  })

  app.post('/v1/settlement/escrow/:id/release', {
    preHandler: requireAuth,
    ...docsOnlySchema({ tags: ['open-settlement'], params: idParam, body: releaseSchema }),
  }, async (request, reply) => {
    const { id } = idParam.parse(request.params)
    const body = releaseSchema.parse(request.body)
    const escrow = await escrowService.releaseFunds(id, body.toAddress, participantId(request))
    return reply.code(200).send(success(escrow))
  })

  // Phase 2 client-signature-collection flow (2026-07-27) — real for
  // MULTISIG only; escrowService.initiateRelease() itself rejects any
  // other escrow type with a clear error pointing back to the direct
  // /release route. See escrow.service.ts's own header comment on this
  // method for the full flow.
  app.post('/v1/settlement/escrow/:id/initiate-release', {
    preHandler: requireAuth,
    ...docsOnlySchema({ tags: ['open-settlement'], params: idParam, body: initiateReleaseSchema }),
  }, async (request, reply) => {
    const { id } = idParam.parse(request.params)
    const body = initiateReleaseSchema.parse(request.body)
    const pending = await escrowService.initiateRelease(id, body.toAddress, participantId(request))
    return reply.code(201).send(success(pending))
  })

  // Mirror of initiate-release above, for refund.
  app.post('/v1/settlement/escrow/:id/initiate-refund', {
    preHandler: requireAuth,
    ...docsOnlySchema({ tags: ['open-settlement'], params: idParam }),
  }, async (request, reply) => {
    const { id } = idParam.parse(request.params)
    const pending = await escrowService.initiateRefund(id, participantId(request))
    return reply.code(201).send(success(pending))
  })

  // Each required signer (EscrowPendingTransaction.requiredSigners) calls
  // this once with their own independently-signed copy of the unsigned
  // PSBT. Once every required signer has submitted, the response's
  // `data.complete` flips to true and the escrow has actually transitioned
  // (COMPLETED/REFUNDED) with a real txReleaseId.
  app.post('/v1/settlement/escrow/:id/submit-transaction-signature', {
    preHandler: requireAuth,
    ...docsOnlySchema({ tags: ['open-settlement'], params: idParam, body: submitTransactionSignatureSchema }),
  }, async (request, reply) => {
    const { id } = idParam.parse(request.params)
    const body = submitTransactionSignatureSchema.parse(request.body)
    const result = await escrowService.submitTransactionSignature(id, participantId(request), body.signedPsbtBase64)
    return reply.code(200).send(success(result))
  })

  app.get('/v1/settlement/escrow/:id/pending-transaction', {
    ...docsOnlySchema({ tags: ['open-settlement'], params: idParam }),
  }, async (request, reply) => {
    const { id } = idParam.parse(request.params)
    const pending = await escrowService.getPendingTransaction(id)
    return reply.code(200).send(success(pending))
  })

  // RFC-015 — two-person control. Records the calling participant's
  // approval; releaseFunds() above checks escrowService.hasDualApproval()
  // itself (gated behind config.features.requireDualApprovalForRelease)
  // rather than this route enforcing anything directly — this route's
  // only job is recording "who approved," not deciding when release is
  // allowed to proceed.
  app.post('/v1/settlement/escrow/:id/approve-release', {
    preHandler: requireAuth,
    ...docsOnlySchema({ tags: ['open-settlement'], params: idParam }),
  }, async (request, reply) => {
    const { id } = idParam.parse(request.params)
    const approval = await escrowService.approveRelease(id, participantId(request))
    const readyToRelease = await escrowService.hasDualApproval(id)
    return reply.code(200).send(success({ ...approval, readyToRelease }))
  })

  app.get('/v1/settlement/escrow/:id/release-approvals', {
    ...docsOnlySchema({ tags: ['open-settlement'], params: idParam }),
  }, async (request, reply) => {
    const { id } = idParam.parse(request.params)
    const approvals = await escrowService.getReleaseApprovals(id)
    const readyToRelease = await escrowService.hasDualApproval(id)
    return reply.code(200).send(success({ approvals, readyToRelease }))
  })

  // Delegates to dispute.service.ts's raiseDispute (persists a Dispute
  // row + assigns an arbiter + notifies), not escrowService.openDispute
  // directly — that's the lower-level state transition raiseDispute
  // itself calls as its first step.
  app.post('/v1/settlement/escrow/:id/dispute', {
    preHandler: requireAuth,
    config: { rateLimit: criticalRateLimit },
    ...docsOnlySchema({ tags: ['open-settlement'], params: idParam, body: disputeSchema }),
  }, async (request, reply) => {
    const { id } = idParam.parse(request.params)
    const body = disputeSchema.parse(request.body)
    const escrow = await escrowService.getEscrow(id)
    const dispute = await getDisputeService().raiseDispute(escrow.tradeId, participantId(request), body.reason, body.evidence as any)
    return reply.code(200).send(success(dispute))
  })

  app.post('/v1/settlement/escrow/:id/refund', {
    preHandler: requireAuth,
    ...docsOnlySchema({ tags: ['open-settlement'], params: idParam }),
  }, async (request, reply) => {
    const { id } = idParam.parse(request.params)
    const escrow = await escrowService.refundFunds(id, participantId(request))
    return reply.code(200).send(success(escrow))
  })

  // UI-audit gap (2026-08-03) — the operator/arbiter console had every
  // dispute *action* (resolve/appeal/evidence/contest, all below) but no
  // way to discover a disputeId to call them with. Scoped to the calling
  // participant's own arbiterId — see dispute.service.ts's
  // listForArbiter() for why this ignores any client-supplied arbiterId
  // rather than trusting a query param.
  app.get('/v1/settlement/disputes', {
    preHandler: requireAuth,
    ...docsOnlySchema({ tags: ['open-settlement'], querystring: disputeListQuerySchema }),
  }, async (request, reply) => {
    const { limit, offset } = disputeListQuerySchema.parse(request.query)
    const result = await getDisputeService().listForArbiter(participantId(request), { limit, offset })
    return reply.code(200).send(success(result))
  })

  // Public read, same as GET /v1/settlement/escrow/:id above — no
  // participant-scoping on a fetch-by-id (only the write actions below
  // enforce who may act on a dispute).
  app.get('/v1/settlement/disputes/:id', {
    ...docsOnlySchema({ tags: ['open-settlement'], params: idParam }),
  }, async (request, reply) => {
    const { id } = idParam.parse(request.params)
    const dispute = await getDisputeService().getDispute(id)
    return reply.code(200).send(success(dispute))
  })

  // Not yet in API_REFERENCE.md's section 4 table — added alongside this
  // file's own doc update. Only the assigned arbiter may call this
  // (enforced in dispute.service.ts's resolveDispute).
  app.post('/v1/settlement/disputes/:id/resolve', {
    preHandler: requireAuth,
    config: { rateLimit: criticalRateLimit },
    ...docsOnlySchema({ tags: ['open-settlement'], params: idParam, body: resolveSchema }),
  }, async (request, reply) => {
    const { id } = idParam.parse(request.params)
    const body = resolveSchema.parse(request.body)
    const dispute = await getDisputeService().resolveDispute(id, participantId(request), body.ruling, body.releaseToAddress, body.refundToAddress, body.splitBuyerBps)
    return reply.code(200).send(success(dispute))
  })

  // RFC-021 D6 — only a party to the trade may appeal; only meaningful
  // under ARBITRATION_MODE=market (dispute.service.ts's appeal() surfaces
  // a clear config error otherwise, not a crash).
  app.post('/v1/settlement/disputes/:id/appeal', {
    preHandler: requireAuth,
    config: { rateLimit: criticalRateLimit },
    ...docsOnlySchema({ tags: ['open-settlement'], params: idParam }),
  }, async (request, reply) => {
    const { id } = idParam.parse(request.params)
    const result = await getDisputeService().appeal(id, participantId(request))
    return reply.code(200).send(success(result))
  })

  // RFC-021 D8 — either trade party may attach more evidence to their own
  // open dispute. Triggers a QVAC auto-resolution attempt (config-gated)
  // via the dispute.evidence_submitted event, not directly from this route.
  app.post('/v1/settlement/disputes/:id/evidence', {
    preHandler: requireAuth,
    ...docsOnlySchema({ tags: ['open-settlement'], params: idParam, body: submitEvidenceSchema }),
  }, async (request, reply) => {
    const { id } = idParam.parse(request.params)
    const body = submitEvidenceSchema.parse(request.body)
    const result = await getDisputeService().submitEvidence(id, participantId(request), body)
    return reply.code(200).send(success(result))
  })

  // RFC-021 D8 — either trade party can reject a proposed automated
  // ruling before its deadline, forcing the dispute back onto its
  // already-assigned human arbiter. No new arbiter assignment happens
  // here — one was already assigned at raiseDispute() time.
  app.post('/v1/settlement/disputes/:id/contest', {
    preHandler: requireAuth,
    ...docsOnlySchema({ tags: ['open-settlement'], params: idParam }),
  }, async (request, reply) => {
    const { id } = idParam.parse(request.params)
    const result = await getDisputeService().contestAutoResolution(id, participantId(request))
    return reply.code(200).send(success(result))
  })

  // RFC-021 D2 — permissionless arbiter registration. No approval step:
  // the caller registers themselves, matching MarketArbitrationProvider's
  // own real logic. Works regardless of config.settlement.arbitrationMode
  // (a participant can register collateral/reputation ahead of a
  // deployment switching modes) — only assign() itself is mode-gated.
  app.post('/v1/settlement/arbitration/register', {
    preHandler: requireAuth,
    ...docsOnlySchema({ tags: ['open-settlement'], body: registerArbiterSchema }),
  }, async (request, reply) => {
    const body = registerArbiterSchema.parse(request.body)
    const profile = await marketArbitrationProvider.register(participantId(request), body.monetaryCollateral, body.collateralAsset)
    return reply.code(201).send(success(profile))
  })

  app.get('/v1/settlement/arbitration/profile/:participantId', {
    ...docsOnlySchema({ tags: ['open-settlement'], params: arbiterProfileParamsSchema }),
  }, async (request, reply) => {
    const { participantId: targetId } = arbiterProfileParamsSchema.parse(request.params)
    const profile = await marketArbitrationProvider.getProfile(targetId)
    if (!profile) {
      return reply.code(404).send({
        success: false,
        error: 'NOT_FOUND',
        message: `No ArbiterProfile for ${targetId}`,
        details: [],
      })
    }
    return reply.code(200).send(success(profile))
  })

  // RFC-021 D5 — payment-account trust ramp. Idempotent: registering an
  // already-known accountHash just returns the existing row.
  app.post('/v1/settlement/payment-accounts', {
    preHandler: requireAuth,
    ...docsOnlySchema({ tags: ['open-settlement'], body: registerPaymentAccountSchema }),
  }, async (request, reply) => {
    const body = registerPaymentAccountSchema.parse(request.body)
    const account = await paymentAccountService.getOrCreate(participantId(request), body.accountHash, body.paymentMethod)
    return reply.code(201).send(success(account))
  })

  app.get('/v1/settlement/payment-accounts/:accountHash', {
    ...docsOnlySchema({ tags: ['open-settlement'], params: accountHashParamsSchema }),
  }, async (request, reply) => {
    const { accountHash } = accountHashParamsSchema.parse(request.params)
    const account = await paymentAccountService.getByHash(accountHash)
    const tradeLimit = await paymentAccountService.getTradeLimit(accountHash)
    return reply.code(200).send(success({ ...account, tradeLimit }))
  })

  // RFC-021 D1's narrow-attestation framing: the caller attests a
  // specific completed trade, not the account owner's general
  // trustworthiness.
  app.post('/v1/settlement/payment-accounts/:accountHash/sign', {
    preHandler: requireAuth,
    ...docsOnlySchema({ tags: ['open-settlement'], params: accountHashParamsSchema }),
  }, async (request, reply) => {
    const { accountHash } = accountHashParamsSchema.parse(request.params)
    const account = await paymentAccountService.signPaymentAccount(accountHash, participantId(request))
    return reply.code(200).send(success(account))
  })

  // BACKLOG.md's own "Participant payout address" gap, closed 2026-08-04
  // — see payout-address.service.ts's own header comment for the full
  // rationale. Scoped to the caller's own participantId, never a
  // client-supplied one — same convention every self-service write route
  // in this file already follows.
  app.post('/v1/settlement/payout-addresses', {
    preHandler: requireAuth,
    ...docsOnlySchema({ tags: ['open-settlement'], body: setPayoutAddressSchema }),
  }, async (request, reply) => {
    const body = setPayoutAddressSchema.parse(request.body)
    const record = await payoutAddressService.setPayoutAddress(participantId(request), body.asset as any, body.address)
    return reply.code(201).send(success(record))
  })

  // Public read — same "read by id needs no auth" precedent as
  // GET /v1/settlement/escrow/:id — scoped by :participantId/:asset in
  // the path rather than the caller's own identity, since a counterparty
  // legitimately needs to look up who they're paying (e.g. a seller
  // building a manual release outside escrowService's own fallback).
  app.get('/v1/settlement/payout-addresses/:participantId/:asset', {
    ...docsOnlySchema({ tags: ['open-settlement'], params: payoutAddressParamsSchema }),
  }, async (request, reply) => {
    const { participantId: targetId, asset } = payoutAddressParamsSchema.parse(request.params)
    const record = await payoutAddressService.getPayoutAddress(targetId, asset as any)
    if (!record) {
      return reply.code(404).send({ success: false, error: 'NOT_FOUND', message: `No PayoutAddress for ${targetId}/${asset}`, details: [] })
    }
    return reply.code(200).send(success(record))
  })
}
