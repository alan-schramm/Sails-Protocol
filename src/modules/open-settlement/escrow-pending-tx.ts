import { prisma } from '../../common/database'
import { NotFoundError, EscrowError, ForbiddenError, ValidationError } from '../../common/errors'
import { config } from '../../config'
import { capabilityRegistry, CAPABILITY_IMPLEMENTATIONS } from '../../core/capability-registry'
import { SIGNATURE_COLLECTION_PROVIDERS } from './escrow-providers'
import {
  assertEscrowTransition,
  isSellerOrAssignedArbiter,
  loadParticipantPubkeys,
  claimEscrowTransition,
  revertEscrowStatus,
  emitEscrowTransition,
  resolvePayoutAddress,
} from './escrow-lifecycle'
import { hasDualApproval } from './escrow-dual-approval'
import { escrowRepository } from './escrow-repository'
import { tradeRepository } from '../open-p2p/trade-repository'

/**
 * Sails OpenSettlement — client-signature-collection pending-transaction
 * flow (ARCHITECTURE_AUDIT_REPORT.md §2's escrow.service.ts finding,
 * recommendation #1, closed 2026-08-08 — see escrow-providers.ts's
 * identical header comment for the full context).
 *
 * Moved verbatim from escrow.service.ts's initiateRelease()/
 * initiateRefund()/initiateSplit()/submitTransactionSignature()/
 * getPendingTransaction() (no behavior change) — the "assemble an
 * unsigned PSBT, collect required signatures, finalize + broadcast"
 * concern for SIGNATURE_COLLECTION_PROVIDERS (MULTISIG/LIGHTNING_HODL/
 * SAFE_GUARD_EVM), genuinely separate from the direct-call
 * releaseFunds()/refundFunds()/splitFunds() path escrow.service.ts still
 * owns for providers that move funds synchronously in one call (MOCK,
 * WDK_USDT_EVM).
 */

// Phase 2 client-signature-collection flow (2026-07-27) — the real
// replacement for the direct releaseFunds() call in escrow.service.ts,
// for providers in SIGNATURE_COLLECTION_PROVIDERS (MULTISIG only this
// pass). Runs the exact same ownership/capability/dual-approval checks
// releaseFunds() already has, but does NOT transition escrow.status or
// write txReleaseId itself — it only builds and persists an unsigned
// PSBT for the required parties to sign. The real transition happens
// inside submitTransactionSignature() below, once every required
// signature has arrived.
// ─── Shared skeleton for initiateRelease/Refund/Split ──────────────────────
// These three functions are 90% identical (~90 lines each). Extracted the
// shared validation + provider lookup + pending-transaction-create skeleton
// into this private helper to eliminate ~180 lines of duplication. Each
// public function only adds its own specific pre-checks (capability,
// dual-approval, buyerBps validation) and provider call.
async function initiateSignatureCollectionCore(
  escrowId: string,
  kind: 'release' | 'refund' | 'split',
  targetStatus: string,
  triggeredBy: string,
  buildProvider: (provider: any, escrowRecord: any) => Promise<{ psbtBase64: string; requiredSigners: string[]; toAddress?: string; toAddressSecondary?: string }>,
  extraData?: Record<string, unknown>
) {
  const escrow = await escrowRepository.findById(escrowId)
  if (!escrow) throw new NotFoundError('Escrow', escrowId)

  const provider = SIGNATURE_COLLECTION_PROVIDERS[escrow.type]
  if (!provider) {
    throw new EscrowError(
      `Escrow type '${escrow.type}' does not use the client-signature-collection ${kind} flow`
    )
  }
  assertEscrowTransition(escrow.status, targetStatus as any)

  const trade = await tradeRepository.findById(escrow.tradeId)
  if (!trade) throw new NotFoundError('Trade', escrow.tradeId)
  if (!(await isSellerOrAssignedArbiter(trade.id, trade.sellerId, triggeredBy))) {
    throw new ForbiddenError(`${triggeredBy} is neither the seller of trade ${trade.id} nor its assigned dispute arbiter`)
  }

  const existingPending = await prisma.escrowPendingTransaction.findUnique({ where: { escrowId } })
  if (existingPending) {
    throw new EscrowError(`Escrow ${escrowId} already has a pending ${existingPending.kind} transaction awaiting signatures`)
  }

  const { buyerPubkey, sellerPubkey } = await loadParticipantPubkeys(escrowId)
  const escrowRecord = { ...escrow, buyerId: trade.buyerId, sellerId: trade.sellerId, buyerPubkey, sellerPubkey }

  const result = await buildProvider(provider, escrowRecord)

  try {
    return await prisma.escrowPendingTransaction.create({
      data: {
        escrowId,
        kind,
        toAddress: result.toAddress!,
        ...(result.toAddressSecondary ? { toAddressSecondary: result.toAddressSecondary } : {}),
        unsignedPsbtBase64: result.psbtBase64,
        requiredSigners: result.requiredSigners,
        triggeredBy,
        ...extraData,
      },
    })
  } catch (err: any) {
    if (err?.code === 'P2002') {
      throw new EscrowError(`Escrow ${escrowId} already has a pending transaction awaiting signatures (concurrent initiate)`)
    }
    throw err
  }
}

export async function initiateRelease(escrowId: string, toAddress: string | undefined, triggeredBy: string) {
  // Capability check — only release has this (RFC-014).
  if (config.features.enforceCapabilities) {
    const capabilityName = CAPABILITY_IMPLEMENTATIONS.opensettlement
    const allowed = await capabilityRegistry.check(triggeredBy, capabilityName, 'settlement.escrow.released')
    if (!allowed) {
      throw new ForbiddenError(
        `${triggeredBy} has no active '${capabilityName}' capability grant covering 'settlement.escrow.released'`
      )
    }
  }
  // Dual-approval check — only release has this (RFC-015).
  const escrow = await escrowRepository.findById(escrowId)
  if (!escrow) throw new NotFoundError('Escrow', escrowId)
  if (config.features.requireDualApprovalForRelease && escrow.status === 'PAYMENT_PENDING') {
    const dual = await hasDualApproval(escrowId)
    if (!dual) {
      throw new EscrowError(
        `Release blocked: both counterparties must call POST /v1/settlement/escrow/${escrowId}/approve-release ` +
        'before funds can be released (RFC-015 two-person control).'
      )
    }
  }
  const trade = await tradeRepository.findById(escrow.tradeId)
  if (!trade) throw new NotFoundError('Trade', escrow.tradeId)
  const resolvedToAddress = await resolvePayoutAddress(toAddress, trade.buyerId, escrow.asset)

  return initiateSignatureCollectionCore(
    escrowId, 'release', 'COMPLETED', triggeredBy,
    (provider, record) => provider.buildUnsignedRelease(record, resolvedToAddress).then((r: any) => ({ ...r, toAddress: resolvedToAddress }))
  )
}

export async function initiateRefund(escrowId: string, triggeredBy: string) {
  return initiateSignatureCollectionCore(
    escrowId, 'refund', 'REFUNDED', triggeredBy,
    (provider, record) => provider.buildUnsignedRefund(record)
  )
}

export async function initiateSplit(escrowId: string, buyerAddress: string | undefined, sellerAddress: string | undefined, buyerBps: number, triggeredBy: string) {
  if (!(buyerBps > 0 && buyerBps < 10000)) {
    throw new ValidationError('buyerBps must be strictly between 0 and 10000 for a real split — use release/refund for an all-or-nothing outcome')
  }
  const escrow = await escrowRepository.findById(escrowId)
  if (!escrow) throw new NotFoundError('Escrow', escrowId)
  const trade = await tradeRepository.findById(escrow.tradeId)
  if (!trade) throw new NotFoundError('Trade', escrow.tradeId)
  const resolvedBuyerAddress = await resolvePayoutAddress(buyerAddress, trade.buyerId, escrow.asset)
  const resolvedSellerAddress = await resolvePayoutAddress(sellerAddress, trade.sellerId, escrow.asset)

  return initiateSignatureCollectionCore(
    escrowId, 'split', 'SPLIT', triggeredBy,
    (provider, record) => {
      if (!provider.buildUnsignedSplit) {
        throw new EscrowError(
          `Escrow type '${record.type}' does not support a SPLIT settlement action — see that provider's own buildUnsignedSplit() comment for the specific reason (contract/protocol limitation, not a missing wire-up).`
        )
      }
      return provider.buildUnsignedSplit(record, resolvedBuyerAddress, resolvedSellerAddress, buyerBps).then((r: any) => ({ ...r, toAddress: resolvedBuyerAddress, toAddressSecondary: resolvedSellerAddress }))
    }
  )
}

// The signature-collection write path — each required signer (from
// EscrowPendingTransaction.requiredSigners) calls this once, submitting
// their own independently-signed copy of the unsigned PSBT
// (`@satsails/p2p-trading-sdk`'s signEscrowPsbt()). Upsert-idempotent per participant,
// same shape as submitParticipantKey()/approveRelease() (escrow.service.ts/
// escrow-dual-approval.ts). Once every required signer has submitted,
// combines + broadcasts for real (provider.finalizeRelease()/
// finalizeRefund()) and performs the same atomic status-claim
// releaseFunds()/refundFunds() already do, so the race protection those
// methods have is preserved here too.
export async function submitTransactionSignature(escrowId: string, participantId: string, signedPsbtBase64: string) {
  const escrow = await escrowRepository.findById(escrowId)
  if (!escrow) throw new NotFoundError('Escrow', escrowId)

  const pending = await prisma.escrowPendingTransaction.findUnique({ where: { escrowId } })
  if (!pending) {
    throw new EscrowError(`Escrow ${escrowId} has no pending transaction awaiting signatures — call initiate-release/initiate-refund (or, for a dispute SPLIT ruling, resolveDispute()) first`)
  }
  if (!pending.requiredSigners.includes(participantId)) {
    throw new ForbiddenError(
      `${participantId} is not one of the required signers (${pending.requiredSigners.join(', ')}) for escrow ${escrowId}'s pending ${pending.kind}`
    )
  }

  await prisma.escrowTransactionSignature.upsert({
    where: { pendingTxId_participantId: { pendingTxId: pending.id, participantId } },
    update: { signedPsbtBase64 },
    create: { pendingTxId: pending.id, participantId, signedPsbtBase64 },
  })

  const signatures = await prisma.escrowTransactionSignature.findMany({ where: { pendingTxId: pending.id } })
  const submittedIds = new Set(signatures.map((s: { participantId: string }) => s.participantId))
  const allSubmitted = pending.requiredSigners.every((id: string) => submittedIds.has(id))

  if (!allSubmitted) {
    return { pendingTransaction: pending, complete: false, submittedCount: signatures.length, requiredCount: pending.requiredSigners.length }
  }

  const provider = SIGNATURE_COLLECTION_PROVIDERS[escrow.type]
  if (!provider) {
    // Cannot happen in practice — a pending row only exists for a type
    // registered in SIGNATURE_COLLECTION_PROVIDERS — but stated loudly
    // rather than silently, consistent with getSettlementProvider()'s own comment.
    throw new EscrowError(`Escrow type '${escrow.type}' has a pending transaction but no registered SignatureCollectionProvider`)
  }
  const targetStatus = pending.kind === 'release' ? 'COMPLETED' : pending.kind === 'refund' ? 'REFUNDED' : 'SPLIT'

  // Validate that the provider supports the required finalization method
  if (pending.kind === 'split' && !provider.finalizeSplit) {
    throw new EscrowError(`Escrow type '${escrow.type}' does not support split finalization — buildUnsignedSplit was allowed but finalizeSplit is not implemented`)
  }

  // Atomic claim before ever calling the real, side-effecting provider —
  // same idiom as releaseFunds()/refundFunds() (escrow.service.ts).
  await claimEscrowTransition(escrowId, escrow.status, targetStatus)

  try {
    const signedList = pending.requiredSigners.map(
      (id: string) => signatures.find((s: { participantId: string; signedPsbtBase64: string }) => s.participantId === id)!.signedPsbtBase64
    )
    const result = pending.kind === 'release'
      ? await provider.finalizeRelease(escrow, pending.unsignedPsbtBase64, signedList)
      : pending.kind === 'refund'
      ? await provider.finalizeRefund(escrow, pending.unsignedPsbtBase64, signedList)
      : await provider.finalizeSplit!(escrow, pending.unsignedPsbtBase64, signedList)

    const updateData = pending.kind === 'refund'
      ? { txReleaseId: result.txId }
      : { txReleaseId: result.txId, releasedAt: new Date() }
    const updated = await escrowRepository.updateSignatureCollectionResult(escrowId, updateData)

    const eventName = pending.kind === 'release'
      ? 'settlement.escrow.released'
      : pending.kind === 'refund'
      ? 'settlement.escrow.refunded'
      : 'settlement.escrow.split'
    await emitEscrowTransition(escrowId, escrow.tradeId, escrow.status, targetStatus, pending.triggeredBy, eventName, {
      txId: result.txId,
    })

    // Cascade-deletes its EscrowTransactionSignature rows (schema.prisma's
    // onDelete: Cascade) — a completed round leaves no pending row behind.
    await prisma.escrowPendingTransaction.delete({ where: { id: pending.id } }).catch(() => {})

    return { escrow: updated, complete: true }
  } catch (err) {
    // Revert the claim — see releaseFunds()'s identical comment. The
    // pending row and its signatures are left in place on failure so the
    // caller can retry submitTransactionSignature() (idempotent upsert)
    // without needing to re-collect signatures already submitted.
    await revertEscrowStatus(escrowId, escrow.status)
    throw err
  }
}

export async function getPendingTransaction(escrowId: string) {
  const pending = await prisma.escrowPendingTransaction.findUnique({
    where: { escrowId },
    include: { signatures: true },
  })
  if (!pending) throw new NotFoundError('Pending transaction for this escrow', escrowId)
  return pending
}
