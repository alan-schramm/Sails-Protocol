import { Prisma } from '@prisma/client'
import { prisma } from '../../common/database'
import { NotFoundError, EscrowError, ForbiddenError } from '../../common/errors'
import { AssetType } from '../../common/types'
import { config } from '../../config'
import { eventBus } from '../../common/events/event-bus'
import { payoutAddressService } from './payout-address.service'
import { escrowRepository } from './escrow-repository'
import { tradeRepository } from '../open-p2p/trade-repository'

/**
 * Sails OpenSettlement — Escrow lifecycle shared helpers
 * (ARCHITECTURE_AUDIT_REPORT.md §2's escrow.service.ts finding,
 * recommendation #1, closed 2026-08-08 — see escrow-providers.ts's
 * identical header comment for the full context).
 *
 * Everything in this file was previously module-scope free functions or
 * private EscrowService methods in escrow.service.ts, moved verbatim (no
 * behavior change). None of it holds instance state — EscrowService
 * itself is a stateless orchestrator, so converting "class method using
 * `this.otherMethod()`" into "free function importing `otherFunction()`"
 * changes nothing observable.
 */

export const VALID_TRANSITIONS: Record<string, string[]> = {
  CREATED: ['FUNDS_LOCKED', 'REFUNDED'],
  FUNDS_LOCKED: ['PAYMENT_PENDING', 'DISPUTED', 'REFUNDED'],
  PAYMENT_PENDING: ['COMPLETED', 'DISPUTED'],
  COMPLETED: [],
  // RFC-021 D9 — SPLIT only ever reaches an escrow via a dispute ruling
  // (§1.9's third option has no non-disputed equivalent, unlike
  // RELEASE/REFUND which both also have a normal happy-path route here).
  DISPUTED: ['COMPLETED', 'REFUNDED', 'SPLIT'],
  REFUNDED: [],
  SPLIT: [],
}

// Found during a general gap audit (not tied to any single RFC): none of
// this class's mutating methods verified `triggeredBy` was actually a
// party to the trade before this fix — any authenticated participant on
// the platform could lock/confirm/release/refund/dispute *any* other
// trade's escrow, not just their own (an IDOR, the same class of bug
// RT-002 already fixed once for raw-userId-in-body — this was the same
// gap one layer deeper, at the service boundary rather than the auth
// boundary). `triggeredBy` may be a participant's own id, or an agent
// acting on their behalf (`agent:{label}:{participantId}`,
// `wallet-agent.ts`) — that string shape only ever originates from
// trusted internal callers (settlement-orchestrator.ts), never from an
// HTTP request body, so accepting it here doesn't reopen the hole this
// fix closes.
export function isPartyOrAgent(triggeredBy: string, participantId: string): boolean {
  return triggeredBy === participantId || new RegExp(`^agent:[^:]+:${participantId}$`).test(triggeredBy)
}

// Shared by releaseFunds()/refundFunds() (escrow.service.ts) — both are
// legitimately triggered by either the seller (the normal path) or the
// arbiter assigned to an open dispute on this trade (dispute.service.ts's
// resolveDispute(), which validates the arbiter match itself *before*
// calling into this class — this is a second, defense-in-depth check,
// not the only one). Only queries Dispute when the cheaper seller check
// already failed. Exported as a free function (was EscrowService's
// public isSellerOrAssignedArbiter() method) — no instance state was
// ever involved, so callers use the same call surface either way.
export async function isSellerOrAssignedArbiter(tradeId: string, sellerId: string, triggeredBy: string): Promise<boolean> {
  if (isPartyOrAgent(triggeredBy, sellerId)) return true
  const dispute = await escrowRepository.findDisputeByTradeAndArbiter(tradeId, triggeredBy)
  return dispute !== null
}

/** Loads an escrow + its trade + verifies the seller-or-arbiter authorization
 *  every state transition from PAYMENT_PENDING/DISPUTED requires. */
export async function loadEscrowWithAuthorization(
  escrowId: string,
  triggeredBy: string
): Promise<{ escrow: NonNullable<Awaited<ReturnType<typeof escrowRepository.findById>>>; trade: NonNullable<Awaited<ReturnType<typeof tradeRepository.findById>>> }> {
  const escrow = await escrowRepository.findById(escrowId)
  if (!escrow) throw new NotFoundError('Escrow', escrowId)
  const trade = await tradeRepository.findById(escrow.tradeId)
  if (!trade) throw new NotFoundError('Trade', escrow.tradeId)
  if (!(await isSellerOrAssignedArbiter(trade.id, trade.sellerId, triggeredBy))) {
    throw new ForbiddenError(`${triggeredBy} is neither the seller of trade ${trade.id} nor its assigned dispute arbiter`)
  }
  return { escrow, trade }
}

/** Buyer/seller pubkeys from EscrowParticipantKey — only the non-custodial
 *  providers consume these. */
export async function loadParticipantPubkeys(escrowId: string): Promise<{ buyerPubkey?: string; sellerPubkey?: string }> {
  const keys = await prisma.escrowParticipantKey.findMany({ where: { escrowId } })
  return {
    buyerPubkey: keys.find((k: { role: string }) => k.role === 'buyer')?.pubkey,
    sellerPubkey: keys.find((k: { role: string }) => k.role === 'seller')?.pubkey,
  }
}

/** Atomic escrow.status transition — the same conditional updateMany +
 *  count === 0 → throw + revert idiom every mutating method below uses
 *  (the robustness-audit fix from 2026-07-20). */
export async function claimEscrowTransition(escrowId: string, fromStatus: string, toStatus: string): Promise<void> {
  // Defense in depth — the caller already validated the transition, but
  // re-checking here means a typo or future refactor that bypassed
  // assertEscrowTransition() surfaces as a loud EscrowError, not a silent no-op.
  const allowed = VALID_TRANSITIONS[fromStatus] ?? []
  if (!allowed.includes(toStatus)) {
    throw new EscrowError(`Invalid escrow transition: ${fromStatus} → ${toStatus}. Allowed: ${allowed.join(', ') || 'none'}`)
  }
  const claimedCount = await escrowRepository.claimTransition(escrowId, fromStatus, toStatus)
  if (claimedCount === 0) {
    throw new EscrowError(`Escrow ${escrowId} was already transitioned by a concurrent request`)
  }
}

/** Revert-on-failure boilerplate — every provider call in this class wraps
 *  the same try/catch so a partial transition can never leave an escrow
 *  "claiming COMPLETED with no funds behind it." The .catch(() => {}) on
 *  the revert swallows the unlikely double-fault so the original provider
 *  error reaches the caller — they already saw the problem, a "revert
 *  also failed" chain would just bury the real failure. */
export async function revertEscrowStatus(escrowId: string, status: string): Promise<void> {
  await escrowRepository.revertStatus(escrowId, status).catch(() => {})
}

export function assertEscrowTransition(current: string, next: string) {
  const allowed = VALID_TRANSITIONS[current] ?? []
  if (!allowed.includes(next)) {
    throw new EscrowError(
      `Invalid escrow transition: ${current} → ${next}. Allowed: ${allowed.join(', ') || 'none'}`
    )
  }
}

export async function emitEscrowTransition(
  escrowId: string,
  tradeId: string,
  from: string,
  to: string,
  triggeredBy: string,
  eventName: Parameters<typeof eventBus.emit>[0],
  eventExtra: Record<string, unknown> = {},
  note?: string
) {
  await prisma.escrowEvent.create({
    data: { escrowId, fromStatus: from as any, toStatus: to as any, triggeredBy, note },
  })
  // correlationId = tradeId (RFC-010) — stand-in for intentId until Intent
  // persistence exists; Trade already IS the concrete TradeIntent (§2.3).
  await eventBus.emit(eventName as any, {
    escrowId,
    tradeId,
    from,
    to,
    triggeredBy,
    ...eventExtra,
  }, tradeId)
}

// RFC-021 Phase 0 — real Protocol Fee computation + PROTOCOL_ECONOMY.md
// §6.2's already-decided 40/30/20/10 split, persisted as a real
// FeeDistribution row. Returns null (not 0) when protocolFeeRate is 0
// (the documented bootstrap default) — see Escrow.feeCharged's own
// schema comment for why that distinction matters. Called from
// releaseFunds() only; PROTOCOL_ECONOMY.md §3 is explicit the Protocol
// Fee "only ever attaches to a completed Settlement," never a refund.
export async function chargeProtocolFee(escrow: { id: string; lockedAmount: Prisma.Decimal | string; asset: string }): Promise<Prisma.Decimal | null> {
  const rate = config.settlement.protocolFeeRate
  if (!rate || rate <= 0) return null

  // Normalize: production always hands this a real Prisma.Decimal (the
  // raw prisma.escrow.findUnique() result), but tests mock the DB layer
  // with plain decimal strings (RFC-009 convention) — this must work
  // for both without asserting the type away.
  const lockedAmount = new Prisma.Decimal(escrow.lockedAmount)
  const totalFee = lockedAmount.times(rate)

  await prisma.feeDistribution.create({
    data: {
      escrowId: escrow.id,
      totalFee,
      asset: escrow.asset as AssetType,
      nodeOperatorShare: totalFee.times(0.4),
      treasuryShare: totalFee.times(0.3),
      walletRebateShare: totalFee.times(0.2),
      arbitratorReserveShare: totalFee.times(0.1),
    },
  })

  return totalFee
}

// BACKLOG.md's own "Participant payout address" gap, closed 2026-08-04
// — see payout-address.service.ts's own header comment for the full
// rationale. Never fabricates a value (CODE_STYLE.md §2): an explicit
// address always wins; absent that, falls back to the participant's
// own registered PayoutAddress for this escrow's asset; absent BOTH,
// throws a clear, specific error naming exactly what's missing rather
// than guessing.
export async function resolvePayoutAddress(explicitAddress: string | undefined, participantId: string, asset: AssetType): Promise<string> {
  if (explicitAddress) return explicitAddress
  const registered = await payoutAddressService.getPayoutAddress(participantId, asset)
  if (!registered) {
    throw new EscrowError(
      `No payout address provided for participant ${participantId} (asset ${asset}), and none is registered — ` +
      'register one via POST /v1/settlement/payout-addresses first, or pass an explicit address to this call.'
    )
  }
  return registered.address
}
