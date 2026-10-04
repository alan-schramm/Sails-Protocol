/**
 * Issue #239 - the one definition of which pending signing round a dispute ruling's dispatch may
 * supersede. Dependency-free on purpose: the live dispatch gate (dispute-dispatch.ts), C4 recovery
 * (dispute-dispatch-recovery.ts) and the supersession itself (escrow-pending-tx.ts) all decide by it.
 *
 * Meaningful only for an escrow under dispute, which is the only place a ruling dispatch happens. There,
 * a cooperative round (no ruling provenance) can never execute: the Economic Disposition Commit Gate
 * refuses it (ADR-005, economic-disposition-authority.ts). And a round still missing a required signature
 * has provably never reached execution, which requires every one (submitTransactionSignature()). Such a
 * round is dead and is not a dispatch. A ruling's own round, or any fully signed round (it may already
 * have been submitted - an UNKNOWN outcome), is never superseded.
 *
 * A row without a recorded `disputeId` field at all (not null) is treated as not supersedable.
 */
export interface RoundSupersessionFacts {
  disputeId?: string | null
  requiredSigners: string[]
  signatures?: Array<{ participantId: string }>
}

export function isSupersedableByRuling(round: RoundSupersessionFacts): boolean {
  if (round.disputeId !== null) return false
  // Never decide "not fully signed" from signatures that were simply not loaded.
  if (!round.signatures) throw new Error('isSupersedableByRuling(): the round must be read with its signatures')
  const signed = new Set(round.signatures.map((s) => s.participantId))
  return !round.requiredSigners.every((id) => signed.has(id))
}
