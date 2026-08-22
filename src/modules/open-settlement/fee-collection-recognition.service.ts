/**
 * FeeCollectionRecognitionService — Missão 11 Fase 5.
 *
 * Closes the gap between "the settlement transaction contains a real
 * Sails Protocol Fee output" and "the Sails accounting system has
 * recognized that fee as actually collected" (Fase 4.2's own Activation
 * Blocker A). Rail-agnostic by design — it only ever writes
 * FeeCollectionEvidence rows and drives FeeObligation.collectionStatus
 * through the existing Fase 2.1 transition graph
 * (PENDING_COLLECTION -> IN_PROGRESS -> COLLECTED, with COLLECTED ->
 * IN_PROGRESS as the one automatic backward edge, for a pre-distribution
 * reorg). Every rail-specific concern — deciding WHICH output is the fee,
 * querying a chain explorer for confirmation depth — lives in the calling
 * rail's own provider (multisig.provider.ts's identifyFeeOutput()/
 * fetchTransactionConfirmationStatus() for MULTISIG) and is never
 * duplicated here.
 *
 * The core invariant this service exists to enforce structurally:
 * NO ON-CHAIN COLLECTION EVIDENCE -> NO COLLECTED REVENUE. Every method
 * below either records real evidence tied to a real txid/output, or
 * refuses.
 */
import { Prisma } from '@prisma/client'
import { EscrowError } from '../../common/errors'
import { childLogger } from '../../common/logger'
import { feeObligationRepository, type FeeObligationRepository } from './fee-obligation-repository'
import { feeCollectionEvidenceRepository, type FeeCollectionEvidenceRepository } from './fee-collection-evidence-repository'
import { feeObligationService, FeeObligationService } from './fee-obligation.service'

const log = childLogger('fee-collection-recognition')

export interface BroadcastEvidenceInput {
  txid: string
  vout: number
  scriptPubKey: string
  amountSats: number
}

export class FeeCollectionRecognitionService {
  constructor(
    private readonly obligationRepo: FeeObligationRepository = feeObligationRepository,
    private readonly evidenceRepo: FeeCollectionEvidenceRepository = feeCollectionEvidenceRepository,
    private readonly obligationService: FeeObligationService = feeObligationService
  ) {}

  /**
   * §6 — a fee-bearing settlement transaction was successfully broadcast.
   * Records append-only BROADCAST evidence tied to the real txid/output
   * the caller already deterministically identified (never re-derived
   * here), then transitions PENDING_COLLECTION -> IN_PROGRESS.
   *
   * Broadcast success != confirmed revenue — this method NEVER, under any
   * circumstance, transitions an obligation to COLLECTED. Callers must
   * never invoke this for a waived, refund, or legacy outcome (there is
   * no fee output to have evidence for in any of those cases) — the one
   * real call site (escrow-pending-tx.ts) only reaches this method when a
   * real, non-waived Sails output was actually constructed.
   */
  async recordBroadcastAndAdvance(feeObligationId: string, evidence: BroadcastEvidenceInput): Promise<void> {
    await this.evidenceRepo.record({
      feeObligationId,
      kind: 'BROADCAST',
      txid: evidence.txid,
      vout: evidence.vout,
      scriptPubKey: evidence.scriptPubKey,
      amount: new Prisma.Decimal(evidence.amountSats).dividedBy(1e8),
    })
    await this.obligationService.transitionCollectionStatus(feeObligationId, 'PENDING_COLLECTION', 'IN_PROGRESS')
  }

  /**
   * §7 — the confirmation-depth rule (FeePolicyVersion.requiredConfirmations)
   * has been satisfied for this obligation's broadcast transaction.
   * Re-verifies before recognizing anything: the obligation must actually
   * be IN_PROGRESS (never recognizes a confirmation for one that isn't
   * awaiting one), and `txid` must match this obligation's own most
   * recent BROADCAST evidence exactly — never trusts a caller-supplied
   * txid on faith, even from a trusted internal caller. Only after both
   * checks pass does this record CONFIRMED evidence and transition
   * IN_PROGRESS -> COLLECTED. This is the ONLY place in the codebase that
   * may ever make that transition — the fee becomes Protocol Revenue
   * here, nowhere else.
   */
  async recognizeConfirmation(feeObligationId: string, txid: string, confirmedAtHeight: number): Promise<void> {
    const obligation = await this.obligationRepo.findById(feeObligationId)
    if (!obligation) {
      throw new EscrowError(`recognizeConfirmation: FeeObligation ${feeObligationId} not found`)
    }
    if (obligation.collectionStatus !== 'IN_PROGRESS') {
      throw new EscrowError(
        `recognizeConfirmation: FeeObligation ${feeObligationId} is not IN_PROGRESS (currently ${obligation.collectionStatus}) — refusing to recognize a confirmation for an obligation that isn't awaiting one`
      )
    }
    const evidence = await this.evidenceRepo.listForObligation(feeObligationId)
    const lastBroadcast = [...evidence].reverse().find((e) => e.kind === 'BROADCAST')
    if (!lastBroadcast || lastBroadcast.txid !== txid) {
      throw new EscrowError(
        `recognizeConfirmation: txid '${txid}' does not match this obligation's own recorded BROADCAST evidence (${lastBroadcast?.txid ?? 'none recorded'}) — refusing to recognize confirmation for an unrecognized transaction`
      )
    }

    await this.evidenceRepo.record({
      feeObligationId,
      kind: 'CONFIRMED',
      txid,
      vout: lastBroadcast.vout ?? undefined,
      scriptPubKey: lastBroadcast.scriptPubKey ?? undefined,
      amount: lastBroadcast.amount ?? undefined,
      confirmedAtHeight,
    })
    await this.obligationService.transitionCollectionStatus(feeObligationId, 'IN_PROGRESS', 'COLLECTED')
  }

  /**
   * §8 RBF/replacement — the old transaction's evidence is preserved
   * append-only (never edited, never deleted); this records the
   * replacement relation as a new REPLACED row. The obligation itself
   * stays IN_PROGRESS (or wherever it already was) — a later, genuine
   * broadcast of the replacement transaction is its own separate
   * recordBroadcastAndAdvance()-equivalent call by the caller, using the
   * NEW txid; this method's only job is to make the old evidence's fate
   * auditable, never to advance status on the caller's behalf.
   */
  async recordReplacement(feeObligationId: string, oldTxid: string, newTxid: string): Promise<void> {
    await this.evidenceRepo.record({
      feeObligationId,
      kind: 'REPLACED',
      txid: oldTxid,
      note: `Replaced by ${newTxid}`,
    })
  }

  /**
   * §8 dropped/unconfirmed transaction — an IN_PROGRESS obligation whose
   * broadcast transaction disappeared from the mempool with no
   * replacement observed. Records DROPPED evidence. Deliberately does
   * NOT itself revert collectionStatus — an obligation left IN_PROGRESS
   * (never revenue, per the core invariant) is already safe; whether to
   * revert further (e.g. back toward PENDING_COLLECTION, implying the
   * seller's reserve needs re-collection via a fresh settlement) is a
   * judgment call for the caller/reconciliation, not this append-only
   * evidence writer.
   */
  async recordDropped(feeObligationId: string, txid: string, note?: string): Promise<void> {
    await this.evidenceRepo.record({ feeObligationId, kind: 'DROPPED', txid, note })
  }

  /**
   * §8 reorg — a previously-CONFIRMED transaction is no longer in the
   * best chain. Fase 2.1's own design principle: collection state may
   * need to move back to IN_PROGRESS before distribution ever treats it
   * as final — this method performs exactly that automatic backward
   * transition (COLLECTED -> IN_PROGRESS, already a legal edge in
   * VALID_COLLECTION_TRANSITIONS). If the obligation has ALREADY been
   * DISTRIBUTED, this deliberately refuses to auto-revert — Fase 5 §8's
   * own explicit instruction: "do not improvise automatic financial
   * reversal unless the architecture already supports it... detect and
   * surface as an exceptional reconciliation condition." A logged error
   * (not a throw — the reorg is a real chain event that already
   * happened; refusing to even record it would be worse) is that surface
   * today; a real remediation workflow for this specific case is
   * explicitly out of this phase's scope.
   */
  async recordReorgAndRevert(feeObligationId: string, txid: string): Promise<{ reverted: boolean }> {
    const obligation = await this.obligationRepo.findById(feeObligationId)
    if (!obligation) {
      throw new EscrowError(`recordReorgAndRevert: FeeObligation ${feeObligationId} not found`)
    }
    await this.evidenceRepo.record({ feeObligationId, kind: 'REORGED_OUT', txid })

    if (obligation.collectionStatus === 'DISTRIBUTED') {
      log.error({
        msg: 'Reorg detected on an ALREADY-DISTRIBUTED FeeObligation — NOT auto-reverting (would require improvising a financial reversal this architecture does not support). Flagging as an exceptional reconciliation condition requiring manual review.',
        feeObligationId, txid,
      })
      return { reverted: false }
    }
    if (obligation.collectionStatus === 'COLLECTED') {
      await this.obligationService.transitionCollectionStatus(feeObligationId, 'COLLECTED', 'IN_PROGRESS')
      return { reverted: true }
    }
    // Already IN_PROGRESS (or earlier) — evidence recorded for the
    // forensic trail, nothing to revert since it was never COLLECTED.
    return { reverted: false }
  }
}

export const feeCollectionRecognitionService = new FeeCollectionRecognitionService()
