/**
 * EscrowFundingEvidenceService — Missão 11 Fase 9.1 §1/§2/§3.
 *
 * The single place "is this escrow's funding currently trustworthy"
 * gets decided, from the durable, append-only EscrowFundingEvidence log
 * (escrow-funding-evidence-repository.ts) — never from Escrow.status
 * itself, which this phase deliberately still never mutates for a reorg
 * observation (see multisig-funding-reorg-sweep.ts's own header comment
 * for why: no new status value, no schema change to Escrow, per the
 * CTO's own explicit Phase 8.1 stop condition, now resolved by this
 * separate, additive evidence table instead).
 *
 * Rule (§3 — "one external reality must still converge to one normative
 * funding state"): the LAST recorded evidence row for an escrow decides
 * the current state, in insertion order — a real reorg observation is
 * always superseded by a later, independently-re-verified reconfirmation
 * (never the other way around; nothing here lets an older row overrule a
 * newer one). OBSERVED_CONFIRMED and RECONFIRMED both represent "funding
 * is currently trustworthy"; REORGED_INVALIDATED, REPLACEMENT_OBSERVED
 * (a new candidate that hasn't itself been re-verified yet), and
 * AMBIGUOUS all represent "not currently trustworthy — do not manufacture
 * certainty" (formerly cited as "DP-07," non-canonical — see Missão 11
 * Fase 9.3.3, docs/PROTOCOL_INVARIANTS.md's Level 2 DP-1/DP-2, derived
 * from INV-05/INV-07). An escrow with NO recorded evidence at all is
 * treated as trustworthy — this preserves today's existing behavior for
 * the common case (no reorg ever observed), rather than requiring every
 * historical escrow to be backfilled with a synthetic OBSERVED_CONFIRMED
 * row.
 */
import type { Prisma } from '@prisma/client'
import { escrowFundingEvidenceRepository, type EscrowFundingEvidenceRepository } from './escrow-funding-evidence-repository'

const TRUSTWORTHY_KINDS = new Set(['OBSERVED_CONFIRMED', 'RECONFIRMED'])

export class EscrowFundingEvidenceService {
  constructor(private readonly repo: EscrowFundingEvidenceRepository = escrowFundingEvidenceRepository) {}

  /**
   * §2 — the check every uncertainty-sensitive lifecycle transition
   * (markPaymentSent, initiateRelease, initiateSplit) calls before
   * proceeding. Refund/dispute/expiry/expiry-recovery deliberately do
   * NOT call this — see escrow.service.ts's own comments at each call
   * site for why each of those is a recovery/observation path that must
   * remain available precisely because funding is in question, not
   * despite it (blocking a legitimate recovery path is exactly the
   * "permanent fund denial" this phase was told to avoid creating).
   */
  // Missão 11 Fase 9.3 — optional tx (passed straight to the repository),
  // so an authoritative, lock-protected re-check
  // (escrow-funding-lock.ts's withEscrowFundingLock()) can read through
  // the SAME transaction that holds the per-escrow advisory lock, instead
  // of a separate connection that could observe a stale pre-lock state.
  // Every existing caller omits tx and keeps today's unlocked behavior
  // unchanged — this is additive only.
  async isFundingUncertain(escrowId: string, tx?: Prisma.TransactionClient): Promise<boolean> {
    const evidence = await this.repo.listForEscrow(escrowId, tx)
    if (evidence.length === 0) return false
    const last = evidence[evidence.length - 1]
    return !TRUSTWORTHY_KINDS.has(last.kind)
  }
}

export const escrowFundingEvidenceService = new EscrowFundingEvidenceService()
