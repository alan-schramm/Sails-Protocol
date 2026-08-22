import { Prisma } from '@prisma/client'
import { createHash } from 'crypto'
import { prisma } from '../../common/database'
import { NotFoundError, EscrowError, ForbiddenError } from '../../common/errors'
import { AssetType } from '../../common/types'
import { config } from '../../config'
import { eventBus } from '../../common/events/event-bus'
import { payoutAddressService } from './payout-address.service'
import { escrowRepository } from './escrow-repository'
import { tradeRepository } from '../open-p2p/trade-repository'
import { assertCircuitClosed, recordEscrowConflict } from './escrow-circuit-breaker'
import { capabilityRegistry, CAPABILITY_IMPLEMENTATIONS } from '../../core/capability-registry'

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

// Missão 06.9 (RFC-014 wiring completion) — RFC-014's own convention
// ("the required scope string is the real event name this action
// produces") already covers refund/split semantically; it was only ever
// wired for release (`escrow.service.ts`'s `releaseFunds()` and
// `escrow-pending-tx.ts`'s `initiateRelease()`). `refundFunds()`,
// `splitFunds()`, `initiateRefund()`, and `initiateSplit()` never called
// it — a real, found-by-audit inconsistency (Missão 06.7), not a
// deliberate design choice; `splitFunds()`'s own comment already claimed
// parity with `releaseFunds()` that didn't actually exist.
//
// A single, tiny helper (not a new service/layer) shared by every direct
// and pending-tx fund-movement call site, specifically so this class of
// drift — one call site gets the check, its siblings quietly don't —
// can't happen again the same way. Checked against `triggeredBy`
// exactly as `releaseFunds()` already did: whoever is actually driving
// the transition (the seller for a normal release/refund, or the
// assigned arbiter for a disputed ruling — `dispute.service.ts`'s
// `applyRuling()` already passes `arbiterId` as `triggeredBy` for every
// ruling type, RELEASE included, so this mirrors release's own existing
// behavior rather than inventing a new distinction between seller and
// arbiter capability). A sweeper-triggered refund (`sweepExpiredEscrows()`)
// is unaffected by this being a "new" check in practice: it already
// passes the trade's real `sellerId` as `triggeredBy` (its own comment:
// "never a fabricated 'system' actor... mirrors settlement-orchestrator.ts's
// own sellerTriggeredBy precedent"), so it is subject to the identical
// capability requirement a manual seller-initiated refund already would
// be — not a new rule, the natural consequence of an existing one.
export async function checkFundMovementCapability(
  triggeredBy: string,
  scope: 'settlement.escrow.released' | 'settlement.escrow.refunded' | 'settlement.escrow.split'
): Promise<void> {
  if (!config.features.enforceCapabilities) return
  const capabilityName = CAPABILITY_IMPLEMENTATIONS.opensettlement
  const allowed = await capabilityRegistry.check(triggeredBy, capabilityName, scope)
  if (!allowed) {
    throw new ForbiddenError(
      `${triggeredBy} has no active '${capabilityName}' capability grant covering '${scope}'`
    )
  }
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

/** Buyer/seller/arbiter pubkeys from EscrowParticipantKey — only the
 *  non-custodial providers consume these. arbiterPubkey is undefined for a
 *  legacy escrow (Missão 11 Fase 5.2 — no role='arbiter' row exists for
 *  one) or for a rail that has never populated one (LIGHTNING_HODL/
 *  SAFE_GUARD_EVM today); MultisigProvider.partiesFor() falls back to live
 *  derivation in that case, unchanged from before this phase. */
export async function loadParticipantPubkeys(escrowId: string): Promise<{ buyerPubkey?: string; sellerPubkey?: string; arbiterPubkey?: string }> {
  const keys = await prisma.escrowParticipantKey.findMany({ where: { escrowId } })
  return {
    buyerPubkey: keys.find((k: { role: string }) => k.role === 'buyer')?.pubkey,
    sellerPubkey: keys.find((k: { role: string }) => k.role === 'seller')?.pubkey,
    arbiterPubkey: keys.find((k: { role: string }) => k.role === 'arbiter')?.pubkey,
  }
}

/** Atomic escrow.status transition — the same conditional updateMany +
 *  count === 0 → throw + revert idiom every mutating method below uses
 *  (the robustness-audit fix from 2026-07-20). */
export async function claimEscrowTransition(escrowId: string, fromStatus: string, toStatus: string): Promise<void> {
  // 2026-08-15 — checked first and cheaply, before any real work: once
  // this escrow's circuit is open, every further attempt should fail
  // fast, not pay for an authorization check + DB round trip first. See
  // escrow-circuit-breaker.ts for why this is scoped per-escrowId.
  assertCircuitClosed(escrowId)

  // Defense in depth — the caller already validated the transition, but
  // re-checking here means a typo or future refactor that bypassed
  // assertEscrowTransition() surfaces as a loud EscrowError, not a silent no-op.
  const allowed = VALID_TRANSITIONS[fromStatus] ?? []
  if (!allowed.includes(toStatus)) {
    throw new EscrowError(`Invalid escrow transition: ${fromStatus} → ${toStatus}. Allowed: ${allowed.join(', ') || 'none'}`)
  }
  const claimedCount = await escrowRepository.claimTransition(escrowId, fromStatus, toStatus)
  if (claimedCount === 0) {
    // A real, concrete anomaly on this specific escrow — not a heuristic
    // guess — so it feeds the circuit breaker directly.
    recordEscrowConflict(escrowId)
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

// RFC-008 D2 amendment (Missão 05.5, 2026-08-15) — EscrowEvent's own hash
// chain, same composition and same reasoning as intent-engine.ts's
// writeIntentEvent(): sha256(fromStatus + toStatus + triggeredBy +
// prevHash). Deliberately excludes `note` and `createdAt` from the hash —
// mirroring IntentEvent's own precedent exactly, not inventing a new
// composition. Exported so verifyEscrowEventChain() below (and its own
// tests) can recompute and compare against the stored entryHash — the
// only way to catch an entry mutated in place, not just prevHash links
// reordered.
export function computeEscrowEventHash(fromStatus: string, toStatus: string, triggeredBy: string, prevHash: string): string {
  return createHash('sha256').update(`${fromStatus}|${toStatus}|${triggeredBy}|${prevHash}`).digest('hex')
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
  // RFC-008 D2 amendment — read-then-write, no explicit DB transaction,
  // the exact same pattern intent-engine.ts's writeIntentEvent() already
  // uses safely. Race-free for the same reason that one is: this function
  // is only ever called after the caller's own claimEscrowTransition()
  // (or openDispute()'s identical atomic claim) has already succeeded for
  // this escrowId — Postgres itself already guaranteed only one request
  // reaches this point per escrowId at a time, so there is no concurrent
  // writer left to race against when reading "the last event" below.
  // entryHash/prevHash are never accepted from a caller — this function's
  // own signature has no such parameters, so they can only ever be what
  // the server itself derives here.
  const last = await prisma.escrowEvent.findFirst({ where: { escrowId }, orderBy: { createdAt: 'desc' } })
  const prevHash = last?.entryHash ?? 'genesis'
  const entryHash = computeEscrowEventHash(from, to, triggeredBy, prevHash)

  await prisma.escrowEvent.create({
    data: { escrowId, fromStatus: from as any, toStatus: to as any, triggeredBy, note, entryHash, prevHash },
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

// RFC-008 D2 amendment — Fase 5's own verification primitive. Same shape
// as core/timeline.ts's Timeline.verifyChain() (explanatory result, not a
// bare boolean): reports the first index where the chain is provably
// wrong and why, so a Dispute UI or ArbitrationProvider can point at
// exactly where tampering occurred.
//
// Historical-row strategy (Fase 6, matches RFC-008 D2's own already-
// specified policy for the identical situation on Timeline/DurableEvent —
// not a new decision invented here): a row with entryHash === null
// predates this migration and is skipped, never treated as a broken
// link. The FIRST row that does have a real entryHash is required to
// have prevHash === 'genesis' regardless of whether older, unchained rows
// exist before it — this is exactly what the write path above already
// produces (`last?.entryHash ?? 'genesis'` evaluates to 'genesis' for a
// row whose most recent predecessor has a null entryHash, the identical
// nullish-coalescing behavior as "no predecessor at all"), so the
// verifier's expectation and the writer's real behavior are provably the
// same rule, not two independently-asserted ones that could drift apart.
export interface EscrowChainVerification {
  valid: boolean
  brokenAtIndex?: number
  reason?: string
}

export async function verifyEscrowEventChain(escrowId: string): Promise<EscrowChainVerification> {
  const events = await prisma.escrowEvent.findMany({ where: { escrowId }, orderBy: { createdAt: 'asc' } })

  let expectedPrevHash = 'genesis'
  let chainStarted = false
  for (let i = 0; i < events.length; i++) {
    const event = events[i]
    if (event.entryHash === null) continue // pre-migration row — unverifiable by construction, not a break

    const storedPrevHash = event.prevHash ?? 'genesis'
    const recomputed = computeEscrowEventHash(event.fromStatus, event.toStatus, event.triggeredBy, storedPrevHash)
    if (event.entryHash !== recomputed) {
      return { valid: false, brokenAtIndex: i, reason: 'entryHash does not match the recomputed hash — this entry was mutated in place after being written' }
    }

    const expected = chainStarted ? expectedPrevHash : 'genesis'
    if (storedPrevHash !== expected) {
      return {
        valid: false, brokenAtIndex: i,
        reason: chainStarted
          ? `prevHash does not match the running chain (expected ${expected}, got ${storedPrevHash}) — an entry was reordered, inserted, or deleted`
          : `the first chained entry's prevHash must be 'genesis', got ${storedPrevHash}`,
      }
    }

    expectedPrevHash = event.entryHash
    chainStarted = true
  }

  return { valid: true }
}

// RFC-021 Phase 0 — real Protocol Fee computation + PROTOCOL_ECONOMY.md
// §6.2's already-decided 35/30/25/10 split (Wallet Rebate/Node Operator/
// Treasury/Arbitrator Reserve — revised 2026-08-11 from the original
// 40/30/20/10; wallets moved to the largest bucket since a partner
// wallet integrating the SDK is the actual acquisition channel), persisted
// as a real FeeDistribution row. Returns null (not 0) when
// protocolFeeRate is 0 (the documented bootstrap default) — see
// Escrow.feeCharged's own schema comment for why that distinction
// matters. Called from releaseFunds() only; PROTOCOL_ECONOMY.md §3 is
// explicit the Protocol Fee "only ever attaches to a completed
// Settlement," never a refund.
//
// Missão 11 Fase 5 §11 — Phase-0/new-mechanism mutual exclusion (Fase 4.2
// Activation Blocker C). An escrow that has opted into the new
// FeePolicyVersion/FeeObligation mechanism (feePolicyVersionId set) never
// gets a Phase-0 FeeDistribution row, regardless of what PROTOCOL_FEE_RATE
// is configured to — this makes coexistence structurally impossible per
// escrow, not merely a runbook rule an operator has to remember. Historical
// FeeDistribution rows (written before this guard existed, or for a
// legacy escrow that never adopted a policy) remain fully readable — this
// is a forward-only guard on NEW writes, never a migration, never a
// deletion. A legacy escrow (feePolicyVersionId === null/undefined) is
// completely unaffected: PROTOCOL_FEE_RATE continues to behave exactly as
// it always has for it.
export async function chargeProtocolFee(escrow: { id: string; lockedAmount: Prisma.Decimal | string; asset: string; feePolicyVersionId?: string | null }): Promise<Prisma.Decimal | null> {
  if (escrow.feePolicyVersionId) return null

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
      nodeOperatorShare: totalFee.times(0.3),
      treasuryShare: totalFee.times(0.25),
      walletRebateShare: totalFee.times(0.35),
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
