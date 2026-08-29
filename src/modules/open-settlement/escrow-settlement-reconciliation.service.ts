import { prisma } from '../../common/database'
import { config } from '../../config'
import { withEscrowFundingLock, loadParticipantPubkeys, emitEscrowTransition } from './escrow-lifecycle'
import { escrowRepository } from './escrow-repository'
import { tradeRepository } from '../open-p2p/trade-repository'
import { feeObligationService } from './fee-obligation.service'
import { feeCollectionRecognitionService } from './fee-collection-recognition.service'
import { multisigProvider, identifyFeeOutput, networkFor, type MultisigEscrowInput } from './multisig.provider'
import { childLogger } from '../../common/logger'

const log = childLogger('escrow-settlement-reconciliation')

/**
 * Sails OpenSettlement — settlement crash-recovery reconciliation
 * (Missão 11 Fase 9.6, closes Kimi K3 R2's CONC-03, independently
 * confirmed CONFIRMED/P1 during Fase 9.5's triage; extended Missão 11
 * Fase 9.7 to close the "C5" gap the Fase 9.6 report explicitly
 * disclosed rather than silently claimed closed).
 *
 * Two structurally different gaps, two passes:
 *
 * PASS 1 (Fase 9.6) — "did the real fund movement happen at all?"
 * escrow.service.ts's releaseFunds()/refundFunds()/splitFunds() and
 * escrow-pending-tx.ts's submitTransactionSignature() all claim a
 * TERMINAL escrow status BEFORE the real settlement provider call, and
 * only persist `txReleaseId` AFTER it returns. A crash in that window
 * leaves txReleaseId null with no way to know whether the fund movement
 * itself already happened (Estado B) or never did (Estado A) — CTO's
 * own "Regra Zero": never guess. reconcileTxReleaseId() below asks the
 * chain, for MULTISIG only (the only rail with an authoritative,
 * independently-queryable truth source — see multisig.provider.ts's
 * reconcilePendingSettlement()). Every other rail fails closed.
 *
 * PASS 2 (Fase 9.7) — "the fund movement is CONFIRMED (txReleaseId is
 * already set) — did the DOWNSTREAM completion effects (fee obligation,
 * Trade.status, reputation, volume, the settlement.escrow.* event)
 * actually run?" A crash between txReleaseId persistence and
 * emitEscrowTransition() succeeding leaves those effects silently
 * missing — not duplicated, MISSING (Fase 9.7's own audit found several
 * of them — recordTradeCompletion()'s totalTrades/totalVolumeBtc
 * increments, reputationService.recordOutcome()'s reputationScore
 * increment — have no idempotency key of their own, so a NAIVE re-run
 * would risk double-counting; a MISSING run just silently leaves stats
 * wrong forever). This gap is NOT rail-specific — once txReleaseId is
 * confirmed, no further on-chain truth-seeking is needed for ANY rail,
 * only the SAME downstream chain every rail's own normal completion
 * path already runs. reconcileMissingCompletionEffects() below handles
 * this for every rail, gated by emitEscrowTransition()'s own new
 * (escrowId, toStatus) idempotency claim (escrow-lifecycle.ts, Fase
 * 9.7) — the single authoritative "has this already run" signal, not a
 * second one invented here.
 *
 * CTO's own explicit principle for Fase 9.7: not exactly-once delivery
 * — idempotent effects + at-least-once execution + observable
 * convergence, where technically appropriate. That's exactly what both
 * passes now provide: PASS 1 never broadcasts a second real Bitcoin
 * transaction (verified against chain truth first); PASS 2 never
 * double-applies a downstream effect (gated by emitEscrowTransition()'s
 * own atomic per-transition claim) and safely catches up a missing one.
 */

export interface ReconciliationReport {
  recovered: Array<{ escrowId: string; txId: string; outcome: 'ALREADY_BROADCAST' | 'NEWLY_BROADCAST' }>
  completionEffectsRecovered: Array<{ escrowId: string; obligationSkipped: boolean }>
  requiresManualReview: Array<{ escrowId: string; reason: string }>
  failed: Array<{ escrowId: string; error: string }>
}

// The audit-trail "from" state for the reconciliation-driven
// emitEscrowTransition() call below — the escrow's own last recorded
// EscrowEvent.toStatus (i.e., the real state it was actually in right
// before the crashed attempt), not a guess. computeEscrowEventHash()'s
// hash chain stays valid regardless of what `from` is supplied (it only
// ever consumes the previous row's own entryHash), so this is purely for
// a human reading the audit log to see an honest prior state rather than
// a self-referential one — falls back to the escrow's own current
// (terminal) status only in the structurally-impossible case where no
// prior event exists at all.
async function lastKnownStatus(escrowId: string, fallback: string): Promise<string> {
  const last = await prisma.escrowEvent.findFirst({ where: { escrowId }, orderBy: { createdAt: 'desc' } })
  return last?.toStatus ?? fallback
}

type PendingRow = {
  id: string; kind: string
  feeCollectionSats: number | null; feeCollectionWaived: boolean | null
  buyerBps: number | null; unsignedPsbtBase64: string
} | null

// Missão 11 Fase 9.7 — the ONE shared downstream-completion-effects
// implementation, used by BOTH reconciliation passes (and conceptually
// the same sequence escrow-pending-tx.ts's submitTransactionSignature()
// already runs on its own normal, non-crashed path — not a second,
// independently-reimplemented one). recordObligationForEscrowSettlement()
// is itself idempotent (findByEscrowId() check + a DB-unique-constraint
// backstop, confirmed Fase 9.5) — safe to call even if a previous,
// since-crashed attempt partially ran it. emitEscrowTransition() is now
// ALSO idempotent per (escrowId, toStatus) (escrow-lifecycle.ts, Fase
// 9.7) — the actual gate preventing this function from ever double-
// firing the trade-completion/reputation/volume cascade, regardless of
// how many times or from how many concurrent callers this function
// itself gets invoked for the same already-converged escrow.
//
// `pending` is null for a direct-call-rail escrow (MOCK/WDK_USDT_EVM —
// no EscrowPendingTransaction concept exists for them) or for a
// signature-collection escrow whose pending row was already cleaned up
// by an earlier, since-crashed attempt that got far enough to delete it
// (only reachable after emitEscrowTransition() already succeeded once —
// meaning this call would be a safe no-op via the idempotency claim
// anyway). A SPLIT outcome with pending === null cannot recover its
// buyerBps (the direct-call splitFunds() path never persists it
// anywhere durable, unlike EscrowPendingTransaction.buyerBps for the
// signature-collection path) — obligation recording is skipped and
// reported, not guessed.
async function applyDownstreamCompletionEffects(
  escrowId: string,
  tradeId: string,
  targetStatus: 'COMPLETED' | 'REFUNDED' | 'SPLIT',
  triggeredBy: string,
  txId: string,
  escrowRow: NonNullable<Awaited<ReturnType<typeof escrowRepository.findById>>>,
  pending: PendingRow
): Promise<{ obligationSkipped: boolean; emitted: boolean }> {
  const feeOutcome = targetStatus === 'COMPLETED' ? 'RELEASE' as const : targetStatus === 'REFUNDED' ? 'FULL_REFUND' as const : 'SPLIT' as const

  let obligationSkipped = false
  if (targetStatus === 'SPLIT' && !pending) {
    obligationSkipped = true
    log.error({
      msg: 'Reconciliation: SPLIT completion effects recovered, but buyerBps is unrecoverable for a direct-call-rail escrow with no surviving pending-transaction row — fee obligation NOT recorded, flagged for manual review',
      escrowId,
    })
  } else {
    const actualCollection = pending?.feeCollectionSats !== null && pending?.feeCollectionSats !== undefined
      ? { feeSats: pending.feeCollectionSats, waived: pending.feeCollectionWaived ?? false }
      : undefined
    await feeObligationService.recordObligationForEscrowSettlement(escrowRow, feeOutcome, pending?.buyerBps ?? undefined, actualCollection)

    // Same broadcast-evidence recording escrow-pending-tx.ts's own
    // submitTransactionSignature() runs, same non-throwing failure
    // handling — this is strictly secondary accounting, never allowed to
    // undo a settlement whose funds already moved (real, before this
    // module ever ran, in every case this function is called for).
    if (pending && pending.kind !== 'refund' && actualCollection && !actualCollection.waived) {
      try {
        const obligation = await feeObligationService.findByEscrowId(escrowId)
        if (obligation && escrowRow.snapshotFeeCollectionAddress) {
          const network = networkFor(config.multisig.network)
          const evidence = identifyFeeOutput(pending.unsignedPsbtBase64, escrowRow.snapshotFeeCollectionAddress, actualCollection.feeSats, network)
          await feeCollectionRecognitionService.recordBroadcastAndAdvance(obligation.id, {
            txid: txId, vout: evidence.vout, scriptPubKey: evidence.scriptPubKeyHex, amountSats: evidence.amountSats,
          })
        }
      } catch (err) {
        log.error({
          msg: 'Reconciliation: broadcast-evidence recording failed after a successful settlement — FeeObligation remains PENDING_COLLECTION, not silently advanced',
          escrowId, err: err instanceof Error ? err.message : err,
        })
      }
    }
  }

  const eventName = targetStatus === 'COMPLETED' ? 'settlement.escrow.released' as const
    : targetStatus === 'REFUNDED' ? 'settlement.escrow.refunded' as const
    : 'settlement.escrow.split' as const
  const fromStatus = await lastKnownStatus(escrowId, targetStatus)
  const emitted = await emitEscrowTransition(
    escrowId, tradeId, fromStatus, targetStatus, triggeredBy, eventName, { txId },
    'Recovered by settlement reconciliation after a process crash — see escrow-settlement-reconciliation.service.ts'
  )

  if (pending) {
    await prisma.escrowPendingTransaction.delete({ where: { id: pending.id } }).catch(() => {})
  }

  return { obligationSkipped, emitted }
}

// PASS 1 (Fase 9.6) — MULTISIG only. Determines whether the real fund
// movement happened (asking the chain, never guessing — see
// multisig.provider.ts's reconcilePendingSettlement() for the full
// on-chain-truth procedure) and, once known, runs the shared downstream
// completion effects above.
async function reconcileTxReleaseId(escrow: NonNullable<Awaited<ReturnType<typeof escrowRepository.findById>>>, report: ReconciliationReport): Promise<void> {
  if (escrow.type !== 'MULTISIG') {
    // No authoritative-truth primitive exists for this rail in this
    // mission's scope (see this file's own header comment) — fail
    // closed rather than guess. A real operator response requires a
    // human to inspect this escrow's actual provider-side state.
    report.requiresManualReview.push({
      escrowId: escrow.id,
      reason: `Escrow type '${escrow.type}' has no automated crash-recovery reconciliation primitive in this mission's scope — status is '${escrow.status}' with no txReleaseId. Manual review required.`,
    })
    return
  }

  const pending = await prisma.escrowPendingTransaction.findUnique({
    where: { escrowId: escrow.id },
    include: { signatures: true },
  })
  if (!pending) {
    // The pending row (and its signatures) is only ever deleted AFTER
    // a fully-successful convergence completes — if it's already
    // gone but txReleaseId is still null, something outside this
    // module's own model happened. Fail closed.
    report.requiresManualReview.push({
      escrowId: escrow.id,
      reason: `MULTISIG escrow ${escrow.id} is terminal with no txReleaseId, but its EscrowPendingTransaction row no longer exists — nothing to reconstruct from. Manual review required.`,
    })
    return
  }

  const targetStatus = pending.kind === 'release' ? 'COMPLETED' as const
    : pending.kind === 'refund' ? 'REFUNDED' as const
    : 'SPLIT' as const
  if (targetStatus !== escrow.status) {
    // Structurally shouldn't happen (the pending row's own `kind` is
    // set once, matching the exact status submitTransactionSignature()
    // claimed) — fail closed rather than assume which is stale.
    report.requiresManualReview.push({
      escrowId: escrow.id,
      reason: `MULTISIG escrow ${escrow.id} has status '${escrow.status}' but its pending transaction kind ('${pending.kind}') implies '${targetStatus}' — mismatch. Manual review required.`,
    })
    return
  }

  const signedList = pending.requiredSigners.map(
    (id: string) => pending.signatures.find((s: { participantId: string }) => s.participantId === id)?.signedPsbtBase64
  )
  if (signedList.some((s: string | undefined) => s === undefined)) {
    // Not every required signature is present — the escrow could not
    // structurally have reached submitTransactionSignature()'s
    // all-submitted branch (which is the ONLY place a terminal status
    // gets claimed for a signature-collection escrow), so this
    // combination (terminal status, incomplete signatures) should be
    // impossible. Fail closed.
    report.requiresManualReview.push({
      escrowId: escrow.id,
      reason: `MULTISIG escrow ${escrow.id} is terminal ('${escrow.status}') but its pending transaction is missing one or more required signatures — cannot reconstruct. Manual review required.`,
    })
    return
  }

  const trade = await tradeRepository.findById(escrow.tradeId)
  if (!trade) {
    report.requiresManualReview.push({ escrowId: escrow.id, reason: `Trade ${escrow.tradeId} not found.` })
    return
  }

  const { buyerPubkey, sellerPubkey, arbiterPubkey } = await loadParticipantPubkeys(escrow.id)
  const input: MultisigEscrowInput = {
    tradeId: trade.id, lockedAmount: escrow.lockedAmount.toString(),
    buyerId: trade.buyerId, sellerId: trade.sellerId,
    buyerPubkey, sellerPubkey, arbiterPubkey,
    txLockId: escrow.txLockId, txLockVout: escrow.txLockVout,
    status: escrow.status,
  }

  const result = await multisigProvider.reconcilePendingSettlement(input, pending.unsignedPsbtBase64, signedList as string[])

  if (result.outcome === 'ANOMALY') {
    log.error({ msg: 'Reconciliation anomaly — no automated recovery attempted', escrowId: escrow.id, detail: result.detail })
    report.requiresManualReview.push({ escrowId: escrow.id, reason: result.detail })
    return
  }

  // Authoritative re-check, inside the same escrowId-scoped lock the
  // downstream effects step below also uses — a concurrent second
  // reconciliation run (or, structurally impossible but checked
  // anyway, a live request) may have already converged this exact
  // escrow between this module's unlocked chain-truth determination
  // above and this write.
  const wroteTxReleaseId = await withEscrowFundingLock(escrow.id, async (tx) => {
    const fresh = await tx.escrow.findUnique({ where: { id: escrow.id } })
    if (!fresh || fresh.txReleaseId !== null) return false
    const updateData = targetStatus === 'REFUNDED' ? { txReleaseId: result.txId } : { txReleaseId: result.txId, releasedAt: new Date() }
    await tx.escrow.update({ where: { id: escrow.id }, data: updateData })
    return true
  })

  log.info({ msg: 'Reconciliation: convergence path determined', escrowId: escrow.id, outcome: result.outcome, txId: result.txId, detail: result.detail, wroteTxReleaseId })
  // Downstream effects still run even if wroteTxReleaseId is false (a
  // concurrent writer already claimed it) — emitEscrowTransition()'s own
  // (escrowId, toStatus) idempotency claim (Fase 9.7) is what actually
  // prevents a double-fire, not this flag; this call is always safe.
  await applyDownstreamCompletionEffects(escrow.id, escrow.tradeId, targetStatus, pending.triggeredBy, result.txId, escrow, pending)
  report.recovered.push({ escrowId: escrow.id, txId: result.txId, outcome: result.outcome })
}

// PASS 2 (Fase 9.7) — every rail. txReleaseId is already confirmed set
// (the fund movement itself is a settled fact); the only open question
// is whether the downstream completion chain ran. Cheap, unlocked peek
// via EscrowEvent existence — not authoritative on its own (a race is
// still possible between this peek and the actual write), but the
// actual serialization/idempotency guarantee comes from
// emitEscrowTransition()'s own atomic claim inside
// applyDownstreamCompletionEffects(), the same "cheap peek outside,
// authoritative check inside the real write" shape this codebase
// already uses for the funding-reorg sweep.
async function reconcileMissingCompletionEffects(escrow: NonNullable<Awaited<ReturnType<typeof escrowRepository.findById>>>, report: ReconciliationReport): Promise<void> {
  const alreadyEmitted = await prisma.escrowEvent.findFirst({ where: { escrowId: escrow.id, toStatus: escrow.status as any } })
  if (alreadyEmitted) return // nothing missing — the overwhelmingly common case

  const trade = await tradeRepository.findById(escrow.tradeId)
  if (!trade) {
    report.requiresManualReview.push({ escrowId: escrow.id, reason: `Trade ${escrow.tradeId} not found (completion-effects catch-up).` })
    return
  }

  const targetStatus = escrow.status as 'COMPLETED' | 'REFUNDED' | 'SPLIT'
  const pendingRow = await prisma.escrowPendingTransaction.findUnique({
    where: { escrowId: escrow.id },
    select: { id: true, kind: true, feeCollectionSats: true, feeCollectionWaived: true, buyerBps: true, unsignedPsbtBase64: true, triggeredBy: true },
  })
  // triggeredBy fallback: for a direct-call-rail escrow with no pending
  // row, the original triggeredBy was never durably persisted anywhere
  // this module can read back (escrow.service.ts's direct-call
  // releaseFunds()/refundFunds()/splitFunds() don't store it on the
  // Escrow row itself) — the seller is the only party this codebase's
  // own existing precedent (sweepExpiredEscrows()'s own
  // "triggeredBy is always the trade's own sellerId, never a fabricated
  // system actor" comment) already treats as a safe, real stand-in for
  // an escrow-level action, so the same choice is reused here rather
  // than inventing a new one.
  const triggeredBy = pendingRow?.triggeredBy ?? trade.sellerId

  log.info({ msg: 'Reconciliation: recovering missing downstream completion effects (C5)', escrowId: escrow.id, targetStatus })
  const { obligationSkipped } = await applyDownstreamCompletionEffects(
    escrow.id, escrow.tradeId, targetStatus, triggeredBy, escrow.txReleaseId!, escrow, pendingRow ?? null
  )
  report.completionEffectsRecovered.push({ escrowId: escrow.id, obligationSkipped })
}

/**
 * The main entry point — call periodically (same operational shape as
 * sweepExpiredEscrows()/sweepMultisigFundingReorgs(): a plain async
 * function, not wired to an HTTP route, callable from a cron/ops
 * process). Idempotent by construction on both passes: PASS 1 only ever
 * returns an escrow whose txReleaseId is still null (an already-
 * converged escrow is structurally excluded from a later run); PASS 2's
 * actual double-fire protection is emitEscrowTransition()'s own atomic
 * per-transition claim, not this function's own peek.
 */
export async function reconcilePendingSettlements(): Promise<ReconciliationReport> {
  const report: ReconciliationReport = { recovered: [], completionEffectsRecovered: [], requiresManualReview: [], failed: [] }

  const txReleaseIdCandidates = await escrowRepository.findTerminalWithoutTxReleaseId()
  for (const escrow of txReleaseIdCandidates) {
    try {
      await reconcileTxReleaseId(escrow, report)
    } catch (err) {
      report.failed.push({ escrowId: escrow.id, error: err instanceof Error ? err.message : String(err) })
    }
  }

  const completionEffectCandidates = await escrowRepository.findTerminalWithTxReleaseId()
  for (const escrow of completionEffectCandidates) {
    try {
      await reconcileMissingCompletionEffects(escrow, report)
    } catch (err) {
      report.failed.push({ escrowId: escrow.id, error: err instanceof Error ? err.message : String(err) })
    }
  }

  return report
}
