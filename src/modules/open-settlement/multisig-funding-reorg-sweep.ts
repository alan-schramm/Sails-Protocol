/**
 * MultisigFundingReorgSweep — Missão 11 Fase 9.1 §1/§3 (supersedes the
 * Fase 8.1 LB-08(A) log-only version).
 *
 * Phase 8.1 deliberately implemented detection + structured logging only,
 * per the CTO's own explicit stop condition ("if correct semantics require
 * a schema migration or a new economic state, STOP and report the
 * proposed invariant to the CTO — do not unilaterally redesign economic
 * history"). Phase 9.0's own audit named this gap explicitly (INV-07F,
 * DP-03, DP-05, DP-07), and Phase 9.1 authorizes closing it with the
 * smallest existing pattern: EscrowFundingEvidence, an append-only
 * ledger mirroring FeeCollectionEvidence's own proven shape exactly.
 *
 * Still does NOT mutate Escrow.status — the historical fact "FUNDS_LOCKED
 * was reached under evidence X at time T" is never rewritten. What
 * changed since Fase 8.1: a later reorg (or reconfirmation, or
 * replacement) is now a durable, queryable, append-only fact instead of
 * a log line that vanishes with log rotation.
 *
 * State machine (one evidence row per real change, never a duplicate for
 * an unchanged observation — see the inline comments below for exactly
 * which comparison decides each branch):
 *
 *   trustworthy (OBSERVED_CONFIRMED/RECONFIRMED, same txid, still deep enough)
 *     -> no write (nothing changed)
 *   uncertain, same txid now deep enough again
 *     -> RECONFIRMED
 *   any state, a DIFFERENT txid now satisfies the exact funding-matching
 *   rule at sufficient depth
 *     -> REPLACEMENT_OBSERVED (deliberately NOT auto-promoted to
 *        trustworthy on first sight — requires being seen again, deep
 *        enough, on a LATER tick before RECONFIRMED is recorded; see
 *        escrow-funding-evidence.service.ts's own header comment for why
 *        "do not manufacture certainty" applies here too)
 *   a confirmed-but-not-yet-deep-enough candidate exists, previous state
 *   was trustworthy
 *     -> REORGED_INVALIDATED (a real regression from trusted to uncertain)
 *   nothing at all found, previous state was not already REORGED_INVALIDATED
 *     -> REORGED_INVALIDATED
 *   nothing at all found, previous state already REORGED_INVALIDATED
 *     -> no write (avoid duplicate spam for an unresolved, unchanged loss)
 *   an escrow with NO recorded evidence at all (pre-Fase-9.1, or never
 *   swept before)
 *     -> skipped entirely; this sweep never invents a retroactive
 *        baseline for history it didn't itself observe
 */
import { prisma } from '../../common/database'
import { config } from '../../config'
import { childLogger } from '../../common/logger'
import { escrowFundingEvidenceRepository } from './escrow-funding-evidence-repository'
import { multisigProvider, type MultisigEscrowInput } from './multisig.provider'
import { loadParticipantPubkeys } from './escrow-lifecycle'

const log = childLogger('multisig-funding-reorg-sweep')

export interface FundingReorgSweepResult {
  reconfirmed: string[]
  replacementObserved: string[]
  reverted: string[]
  stillGood: string[]
  stillPending: string[]
  skippedNoBaseline: string[]
  failed: Array<{ escrowId: string; error: string }>
}

export async function sweepMultisigFundingReorgs(): Promise<FundingReorgSweepResult> {
  const result: FundingReorgSweepResult = {
    reconfirmed: [], replacementObserved: [], reverted: [], stillGood: [], stillPending: [], skippedNoBaseline: [], failed: [],
  }

  const escrows = await prisma.escrow.findMany({
    where: { type: 'MULTISIG', status: 'FUNDS_LOCKED', txLockId: { not: null } },
  })

  if (escrows.length === 0) return result

  const required = config.multisig.requiredConfirmations

  for (const escrow of escrows) {
    try {
      const history = await escrowFundingEvidenceRepository.listForEscrow(escrow.id)
      const last = history[history.length - 1]
      if (!last) {
        // No baseline this sweep itself ever recorded (a pre-Fase-9.1
        // escrow, or a MULTISIG escrow whose lockFunds() ran before this
        // repository existed). Never invent a retroactive OBSERVED_CONFIRMED
        // row for history this sweep didn't witness — skip, disclosed.
        result.skippedNoBaseline.push(escrow.id)
        continue
      }

      const { buyerPubkey, sellerPubkey, arbiterPubkey } = await loadParticipantPubkeys(escrow.id)
      const input: MultisigEscrowInput = {
        tradeId: escrow.tradeId, lockedAmount: escrow.lockedAmount.toString(),
        buyerPubkey, sellerPubkey, arbiterPubkey,
        feePolicyVersionId: escrow.feePolicyVersionId,
        snapshotProtocolFeeRate: escrow.snapshotProtocolFeeRate?.toString() ?? null,
        snapshotFeeCollectionAddress: escrow.snapshotFeeCollectionAddress,
        snapshotFeeCollectionWaivedPreFunding: escrow.snapshotFeeCollectionWaivedPreFunding,
      }

      const scan = await multisigProvider.rescanFunding(input)
      const trustworthy = last.kind === 'OBSERVED_CONFIRMED' || last.kind === 'RECONFIRMED'

      if (scan && scan.depth >= required) {
        if (last.txid === scan.txId) {
          if (trustworthy) {
            result.stillGood.push(escrow.id)
          } else {
            await escrowFundingEvidenceRepository.record({
              escrowId: escrow.id, kind: 'RECONFIRMED', txid: scan.txId, vout: scan.vout,
              ...(scan.confirmedAtHeight !== null ? { observedAtHeight: scan.confirmedAtHeight } : {}),
              ...(scan.tipHeightAtObservation !== null ? { tipHeightAtObservation: scan.tipHeightAtObservation } : {}),
            })
            result.reconfirmed.push(escrow.id)
          }
        } else {
          // A different txid than whatever we last knew about — record
          // once per distinct new candidate, never re-record the same one.
          if (!(last.kind === 'REPLACEMENT_OBSERVED' && last.txid === scan.txId)) {
            await escrowFundingEvidenceRepository.record({
              escrowId: escrow.id, kind: 'REPLACEMENT_OBSERVED', txid: scan.txId, vout: scan.vout,
              ...(scan.confirmedAtHeight !== null ? { observedAtHeight: scan.confirmedAtHeight } : {}),
              ...(scan.tipHeightAtObservation !== null ? { tipHeightAtObservation: scan.tipHeightAtObservation } : {}),
              note: `Replaces previously observed ${last.txid ?? 'unknown'}`,
            })
            result.replacementObserved.push(escrow.id)
          } else {
            result.stillPending.push(escrow.id)
          }
        }
        continue
      }

      if (scan && scan.depth < required) {
        // A confirmed-but-shallow candidate exists — not yet trustworthy.
        if (trustworthy) {
          await escrowFundingEvidenceRepository.record({
            escrowId: escrow.id, kind: 'REORGED_INVALIDATED', txid: last.txid ?? undefined,
            note: `Confirmation depth dropped: only ${scan.depth} of ${required} required at this observation`,
          })
          result.reverted.push(escrow.id)
        } else {
          result.stillPending.push(escrow.id)
        }
        continue
      }

      // Nothing found at all.
      if (last.kind !== 'REORGED_INVALIDATED') {
        await escrowFundingEvidenceRepository.record({
          escrowId: escrow.id, kind: 'REORGED_INVALIDATED', txid: last.txid ?? undefined,
          note: 'No confirmed UTXO matching the required funding criteria found at this observation',
        })
        result.reverted.push(escrow.id)
      } else {
        result.stillPending.push(escrow.id)
      }
    } catch (err) {
      result.failed.push({ escrowId: escrow.id, error: err instanceof Error ? err.message : String(err) })
    }
  }

  if (result.reverted.length || result.reconfirmed.length || result.replacementObserved.length || result.failed.length) {
    log.info({
      msg: 'MULTISIG funding reorg sweep completed',
      reverted: result.reverted.length,
      reconfirmed: result.reconfirmed.length,
      replacementObserved: result.replacementObserved.length,
      stillGood: result.stillGood.length,
      stillPending: result.stillPending.length,
      skippedNoBaseline: result.skippedNoBaseline.length,
      failed: result.failed.length,
    })
  }

  return result
}
