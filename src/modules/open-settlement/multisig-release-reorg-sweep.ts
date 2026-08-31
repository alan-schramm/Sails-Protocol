/**
 * MultisigReleaseReorgSweep — Sails Core Implementation Program M9-F
 * (Release-Leg Finality & Reorg Closure).
 *
 * Closes C18, the one recovery gap M9-R's own final report explicitly
 * disclosed rather than silently claimed closed: a previously observed/
 * confirmed main MULTISIG payout transaction (Escrow.txReleaseId — the
 * RELEASE/REFUND/SPLIT buyer/seller leg, not the fee sub-output) can
 * later disappear from the canonical Bitcoin chain because of a reorg,
 * with nothing in this codebase ever noticing. `multisig-fee-reorg-sweep.ts`
 * only monitors the FEE sub-output (via FeeCollectionEvidence, itself
 * keyed off a real fee collection actually happening) — a REFUND (never
 * has a fee output at all) or a fee-waived RELEASE/SPLIT had, and until
 * this file, still has, zero reorg coverage for their own main payout.
 *
 * OBSERVATION ≠ FINALITY (mission §3): this sweep NEVER mutates or
 * deletes a prior EscrowReleaseEvidence row. A reorg is always recorded
 * as a NEW fact ("this txid was later found gone"), never a correction
 * of the historical "T was observed confirmed at height H" fact. It also
 * NEVER touches CorrespondenceEvaluation — a correspondence result that
 * was MATCH when evaluated against the real, decoded transaction bytes
 * stays MATCH; this sweep answers a different, later question (is that
 * same execution still canonically included) that correspondence was
 * never designed to re-answer.
 *
 * REORG ≠ DIVERGENCE (mission §4): nothing here ever writes DIVERGENT,
 * reinterprets the Outcome, or claims the destination/authority became
 * invalid. A reorg changes the current ledger-inclusion status of an
 * already-authorized, already-correspondence-evaluated execution — never
 * its economic meaning.
 *
 * CHAIN TRUTH DOMINATES (mission §5, reusing the M9-R rule): this sweep
 * never trusts a cached "it was CONFIRMED at recognition time" belief —
 * every run re-asks the real explorer (fetchTransactionExistence for the
 * release txid itself, fetchOutpointSpendStatus for the ORIGINAL funding
 * outpoint when the release txid is no longer found).
 *
 * WHAT THIS SWEEP DOES NOT DO (deliberately, disclosed in the mission's
 * own final report, not silently omitted): it does NOT automatically
 * rebroadcast a replacement transaction when the confirmed release
 * disappears and the funding outpoint is found still unspent (World C).
 * Doing so safely would require replaying the EXACT, byte-identical
 * historically-broadcast transaction (mission §10's own "RECOVERY
 * REPLAYS AUTHORIZED EXECUTION, RECOVERY DOES NOT REAUTHORIZE ECONOMIC
 * INTENT") — but the raw finalized transaction bytes are NOT durably
 * persisted anywhere past `EscrowPendingTransaction`'s own cleanup
 * (deleted the moment the settlement completes, by
 * `applyDownstreamCompletionEffects()`/`submitTransactionSignature()`).
 * Reconstructing a NEW transaction from current state (current
 * PayoutAddress, current fee config) would not be "replaying T" — it
 * would be authorizing a new, merely semantically-equivalent execution,
 * which this program's own constitutional boundary (mission §20)
 * forbids without a genuinely new authority decision. World C is
 * therefore recorded and flagged for MANUAL review, identically to
 * World D (conflict) — a real, bounded residual, not a silently
 * papered-over one. See this mission's own final report §10/§33/§34.
 */
import { prisma } from '../../common/database'
import { config } from '../../config'
import { childLogger } from '../../common/logger'
import { escrowReleaseEvidenceRepository } from './escrow-release-evidence-repository'
import { fetchTransactionExistence, fetchTransactionConfirmationStatus, fetchChainTipHeight, fetchOutpointSpendStatus } from './multisig.provider'

const log = childLogger('multisig-release-reorg-sweep')

const TERMINAL_STATUSES = ['COMPLETED', 'REFUNDED', 'SPLIT'] as const

export interface ReleaseReorgSweepResult {
  observedBaseline: string[]
  reconfirmed: string[]
  stillGood: string[]
  stillPending: string[]
  buriedEnough: string[]
  requiresManualReview: Array<{ escrowId: string; reason: string }>
  failed: Array<{ escrowId: string; error: string }>
}

export async function sweepMultisigReleaseReorgs(): Promise<ReleaseReorgSweepResult> {
  const result: ReleaseReorgSweepResult = {
    observedBaseline: [], reconfirmed: [], stillGood: [], stillPending: [], buriedEnough: [], requiresManualReview: [], failed: [],
  }

  const escrows = await prisma.escrow.findMany({
    where: { type: 'MULTISIG', status: { in: [...TERMINAL_STATUSES] }, txReleaseId: { not: null } },
  })

  if (escrows.length === 0) return result

  for (const escrow of escrows) {
    const txReleaseId = escrow.txReleaseId! // query guarantees non-null
    try {
      const history = await escrowReleaseEvidenceRepository.listForEscrow(escrow.id)
      const last = history[history.length - 1]

      // Depth-window gate — same reasoning multisig-fee-reorg-sweep.ts's
      // own header already establishes: once a confirmed observation is
      // buried deep enough, a further reorg is not a real operational
      // concern this sweep needs to keep re-checking forever. Unlike the
      // FUNDING sweep (whose candidate set naturally shrinks — an escrow
      // leaves FUNDS_LOCKED once payment progresses), a TERMINAL escrow
      // stays a candidate forever, so this gate is what keeps the sweep's
      // own cost bounded, exactly like the fee sweep already needs.
      const trustworthyBaseline = last && (last.kind === 'OBSERVED_CONFIRMED' || last.kind === 'RECONFIRMED') && last.observedAtHeight !== null
      if (trustworthyBaseline) {
        const tipHeight = await fetchChainTipHeight()
        const depth = tipHeight - last!.observedAtHeight! + 1
        if (depth > config.trade.multisigReorgSafetyWindowBlocks) {
          result.buriedEnough.push(escrow.id)
          continue
        }
      }

      const existence = await fetchTransactionExistence(txReleaseId)
      if (existence.exists) {
        if (!existence.confirmed) {
          // World B — mempool-only. Not yet a reorg concern (nothing was
          // ever confirmed to reorg away); nothing to record yet.
          result.stillPending.push(escrow.id)
          continue
        }
        // World A — canonical and confirmed.
        if (!last) {
          // First-ever observation for this escrow's release leg — unlike
          // FUNDING (whose lockFunds() already performs a real,
          // depth-gated confirmation check at the moment of the ORIGINAL
          // observation), nothing in the release/refund/split dispatch
          // path waits for or records confirmation depth at broadcast
          // time (by design — settlement completion does not block on
          // confirmations). This sweep is therefore the FIRST real
          // observer for this leg — recording a baseline now is an
          // honest, contemporaneous observation, never a fabricated
          // retroactive one.
          const status = await fetchTransactionConfirmationStatus(txReleaseId)
          const tipHeight = await fetchChainTipHeight()
          await escrowReleaseEvidenceRepository.record({
            escrowId: escrow.id, kind: 'OBSERVED_CONFIRMED', txid: txReleaseId,
            ...(status.blockHeight !== null ? { observedAtHeight: status.blockHeight } : {}),
            tipHeightAtObservation: tipHeight,
          })
          result.observedBaseline.push(escrow.id)
        } else if (last.kind === 'REORGED_INVALIDATED' || last.kind === 'AMBIGUOUS') {
          // The SAME (or, per World F, a re-appeared) txid is confirmed
          // again after previously being flagged — a real, new fact,
          // never a silent correction of the REORGED_INVALIDATED row.
          const status = await fetchTransactionConfirmationStatus(txReleaseId)
          const tipHeight = await fetchChainTipHeight()
          await escrowReleaseEvidenceRepository.record({
            escrowId: escrow.id, kind: 'RECONFIRMED', txid: txReleaseId,
            ...(status.blockHeight !== null ? { observedAtHeight: status.blockHeight } : {}),
            tipHeightAtObservation: tipHeight,
          })
          result.reconfirmed.push(escrow.id)
        } else {
          result.stillGood.push(escrow.id)
        }
        continue
      }

      // existence.exists === false — genuinely absent from the network
      // (fetchTransactionExistence distinguishes a real 404 from every
      // other failure mode, which throws instead — see that function's
      // own header). World C or World D — determined by asking the
      // ORIGINAL funding outpoint's own current spend status, a durable
      // fact (Escrow.txLockId/txLockVout) that never changes regardless
      // of what happened to the release transaction itself.
      if (escrow.txLockId === null || escrow.txLockVout === null) {
        // Legacy escrow with no recorded vout — never guess which output
        // to check. Fails closed, exactly this codebase's own established
        // discipline for an unresolvable outpoint identity.
        result.requiresManualReview.push({ escrowId: escrow.id, reason: `Release txid ${txReleaseId} is no longer observed on chain, but this escrow has no recorded funding vout to check for a conflicting spend — cannot safely classify.` })
        continue
      }

      const outspend = await fetchOutpointSpendStatus(escrow.txLockId, escrow.txLockVout)
      if (!outspend.spent) {
        // World C — funding outpoint still unspent. The confirmed release
        // genuinely disappeared. Recorded and flagged — NOT auto-
        // rebroadcast (see this file's own header for why: the raw
        // finalized transaction bytes do not survive past pending-row
        // cleanup, so there is no exact T left to safely replay).
        await escrowReleaseEvidenceRepository.record({
          escrowId: escrow.id, kind: 'REORGED_INVALIDATED', txid: txReleaseId,
          note: 'Release transaction no longer observed on chain and its funding outpoint is unspent — exact rebroadcast is not possible (raw finalized transaction bytes are not durably persisted past settlement completion). Manual review required.',
        })
        result.requiresManualReview.push({ escrowId: escrow.id, reason: `Release transaction ${txReleaseId} disappeared (reorg) and funding outpoint ${escrow.txLockId}:${escrow.txLockVout} is unspent — cannot safely auto-recover; see recorded evidence.` })
      } else if (outspend.spendingTxid === txReleaseId) {
        // Explorer inconsistency (existence check 404'd, outspend lookup
        // confirms the SAME txid actually did spend it) — a transient
        // indexing lag, not a genuine reorg. Converges without recording
        // a spurious REORGED_INVALIDATED fact.
        result.stillGood.push(escrow.id)
      } else {
        // World D — the funding outpoint was spent by something OTHER
        // than the escrow's own authorized release transaction. A real
        // conflict — never silently reinterpreted as success, never
        // auto-resolved.
        await escrowReleaseEvidenceRepository.record({
          escrowId: escrow.id, kind: 'AMBIGUOUS', txid: outspend.spendingTxid ?? undefined,
          note: `Funding outpoint ${escrow.txLockId}:${escrow.txLockVout} was spent by ${outspend.spendingTxid ?? '(unknown txid)'}, not the escrow's own authorized release transaction ${txReleaseId}. Manual review required.`,
        })
        result.requiresManualReview.push({ escrowId: escrow.id, reason: `Funding outpoint spent by an unexpected transaction (${outspend.spendingTxid ?? 'unknown'}), not the authorized release ${txReleaseId}.` })
      }
    } catch (err) {
      // World E (explorer UNKNOWN/unavailable) lands here via the thrown
      // EscrowError every fetch* helper raises on a non-404 failure —
      // never coerced into "absent," never silently retried as success.
      result.failed.push({ escrowId: escrow.id, error: err instanceof Error ? err.message : String(err) })
    }
  }

  if (result.requiresManualReview.length || result.reconfirmed.length || result.failed.length) {
    log.info({
      msg: 'MULTISIG release-leg reorg sweep completed',
      observedBaseline: result.observedBaseline.length,
      reconfirmed: result.reconfirmed.length,
      stillGood: result.stillGood.length,
      stillPending: result.stillPending.length,
      buriedEnough: result.buriedEnough.length,
      requiresManualReview: result.requiresManualReview.length,
      failed: result.failed.length,
    })
  }

  return result
}
