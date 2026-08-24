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
import { escrowFundingEvidenceService } from './escrow-funding-evidence.service'

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
  // Missão 11 Fase 7.3.3 §B — EXPIRED is reached ONLY from FUNDS_LOCKED,
  // by the existing timelock sweeper, for a signature-collection type
  // whose cooperative refund cannot succeed (see escrow.service.ts's
  // sweepExpiredEscrows()). PAYMENT_PENDING is deliberately NOT given
  // this same expiry path — a buyer who has already claimed payment is a
  // genuine payment dispute, not a timelock-expiry scenario, and already
  // has its own real resolution path (raiseDispute() from PAYMENT_PENDING,
  // unchanged) — conflating the two would apply seller-only expiry-recovery
  // authority to a state where the buyer may have the stronger claim.
  FUNDS_LOCKED: ['PAYMENT_PENDING', 'DISPUTED', 'REFUNDED', 'EXPIRED'],
  PAYMENT_PENDING: ['COMPLETED', 'DISPUTED'],
  COMPLETED: [],
  // RFC-021 D9 — SPLIT only ever reaches an escrow via a dispute ruling
  // (§1.9's third option has no non-disputed equivalent, unlike
  // RELEASE/REFUND which both also have a normal happy-path route here).
  DISPUTED: ['COMPLETED', 'REFUNDED', 'SPLIT'],
  REFUNDED: [],
  SPLIT: [],
  // Missão 11 Fase 7.3.3 §B/§C — from EXPIRED, either a real dispute is
  // raised (the seller's own authorized recovery path,
  // dispute.service.ts's initiateExpiryRecovery(), or the general
  // raiseDispute() itself, unchanged) or — if the counterparty actually
  // returns — a genuinely cooperative refund remains possible (§C's own
  // "cooperative signatures still possible" answer: yes, nothing about
  // entering EXPIRED forecloses this). Never COMPLETED/SPLIT directly —
  // those still require a real dispute ruling first, same as today.
  EXPIRED: ['DISPUTED', 'REFUNDED'],
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

// Missão 11 Fase 9.1 §2 — closes the Phase 9.0 audit's own DP-05/DP-07
// finding: nothing previously stopped a trade from advancing past
// funding evidence a reorg sweep had already determined was false.
//
// Deliberately narrow: called ONLY from markPaymentSent(), initiateRelease(),
// and initiateSplit() (see each call site's own comment for why) — never
// from refund initiation, dispute raising, the EXPIRED transition, or
// expiry-recovery. Those four are recovery/observation paths, and
// blocking a legitimate recovery path is exactly the "permanent fund
// denial" this phase was explicitly told not to create — refund returns
// collateral to the party who originally funded it (not a new
// false-positive risk the way crediting the buyer or collecting a fee
// would be), and a dispute/recovery action is precisely how a party
// should be able to respond to a funding problem, not something that
// problem should block.
//
// Only meaningful for MULTISIG (the only rail with a real funding-reorg
// concept today) — a no-op for every other escrow type, matching the
// same "MULTISIG today" scoping multisig-funding-reorg-sweep.ts itself
// already uses.
export async function assertFundingNotUncertain(escrowId: string, escrowType: string): Promise<void> {
  if (escrowType !== 'MULTISIG') return
  const uncertain = await escrowFundingEvidenceService.isFundingUncertain(escrowId)
  if (uncertain) {
    throw new EscrowError(
      `Escrow ${escrowId}'s funding evidence is currently uncertain — a background reorg check found the previously-accepted funding transaction ` +
      'no longer confirmed on the best chain, and it has not yet been reconfirmed or replaced by a re-verified transaction. Refusing to proceed ' +
      'rather than manufacture certainty the chain does not currently support. Refunding, raising a dispute, or waiting for reconfirmation remain available.'
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

// RFC-021 Phase 0's chargeProtocolFee() (the original 35/30/25/10-shaped
// real-fee computation, persisted as a FeeDistribution row) lived here
// from PROTOCOL_ECONOMY.md §6.2's first draft until Missão 11 Fase 6.5.2,
// which removed it as part of the CTO-authorized single-economic-authority
// cutover: FeeCollectionEvidence(CONFIRMED) -> FeeObligation -> a frozen
// DistributionPolicyVersion -> EntitlementLedgerEntry is now the only
// normative source of a future economic entitlement (see
// entitlement-allocation.service.ts). It had exactly one caller
// (escrow.service.ts's releaseFunds()) and was already permanently inert
// in every environment this repository evidences — PROTOCOL_FEE_RATE has
// never been set above 0. Removed rather than left as unreachable dead
// code (CODE_STYLE.md's "no commented-out/dead code" discipline) once
// Fase 6.5.1's audit confirmed zero other production call sites existed
// anywhere in the repository. Historical `fee_distributions` rows are
// untouched and remain readable; the table itself is now write-frozen at
// the database level (prisma/migrations/20260823020000_legacy_fee_distribution_write_freeze) —
// see docs/DATABASE.md's own entry for that table for the full historical
// account.

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
