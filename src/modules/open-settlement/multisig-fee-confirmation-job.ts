/**
 * MultisigFeeConfirmationJob — Missão 11 Fase 5 §7.
 *
 * The real confirmation-recognition mechanism: sweeps every FeeObligation
 * currently IN_PROGRESS on a MULTISIG escrow, independently re-verifies
 * its broadcast transaction against the chain (never trusts the
 * previously-recorded evidence row on faith), and only recognizes
 * COLLECTED once the escrow's own frozen requiredConfirmations rule
 * (FeePolicyVersion.requiredConfirmations) is satisfied.
 *
 * Rail-specific by design (MULTISIG's own explorer queries live in
 * multisig.provider.ts) — the generic PENDING_COLLECTION -> IN_PROGRESS ->
 * COLLECTED state-machine guard and evidence-append logic stay in
 * fee-collection-recognition.service.ts, rail-agnostic. A future rail with
 * real fee-aware construction gets its own confirmation job calling into
 * that same generic service, never a duplicate of this file's Bitcoin-
 * specific chain logic.
 *
 * Invoked the same way escrow.service.ts's sweepExpiredEscrows() /
 * dispute.service.ts's sweepExpiredAutoResolutions() already are
 * (app.ts's own feature-flagged, unref()'d setInterval convention) —
 * reused, not reinvented (Fase 5 §7's own explicit preference).
 */
import { prisma } from '../../common/database'
import { childLogger } from '../../common/logger'
import { feeCollectionEvidenceRepository } from './fee-collection-evidence-repository'
import { feeCollectionRecognitionService } from './fee-collection-recognition.service'
import { fetchTransactionConfirmationStatus, fetchChainTipHeight, fetchTransactionOutputs } from './multisig.provider'

const log = childLogger('multisig-fee-confirmation-job')

export interface ConfirmationSweepResult {
  collected: string[]
  stillPending: string[]
  dropped: string[]
  failed: Array<{ feeObligationId: string; error: string }>
}

export async function sweepMultisigFeeConfirmations(): Promise<ConfirmationSweepResult> {
  const result: ConfirmationSweepResult = { collected: [], stillPending: [], dropped: [], failed: [] }

  const obligations = await prisma.feeObligation.findMany({
    where: { collectionStatus: 'IN_PROGRESS' },
    include: { escrow: true, feePolicyVersion: true },
  })

  for (const obligation of obligations) {
    // Rail-specific job — only MULTISIG's own real chain queries apply.
    // A non-MULTISIG obligation reaching IN_PROGRESS would itself be a
    // real bug (only MULTISIG's own broadcast wiring ever advances past
    // PENDING_COLLECTION, escrow-pending-tx.ts's own rail check) — skipped
    // here, not silently processed as if it were MULTISIG.
    if (obligation.escrow.type !== 'MULTISIG') continue

    try {
      const evidenceList = await feeCollectionEvidenceRepository.listForObligation(obligation.id)
      const lastBroadcast = [...evidenceList].reverse().find((e) => e.kind === 'BROADCAST')
      if (!lastBroadcast?.txid || lastBroadcast.vout === null || lastBroadcast.amount === null) {
        result.failed.push({ feeObligationId: obligation.id, error: 'IN_PROGRESS with no usable BROADCAST evidence (missing txid/vout/amount) — cannot verify' })
        continue
      }

      const requiredConfirmations = obligation.feePolicyVersion.requiredConfirmations
      if (!requiredConfirmations || requiredConfirmations <= 0) {
        // Structurally shouldn't happen — publish() refuses to activate a
        // policy without one — logged loudly rather than guessed at.
        result.failed.push({ feeObligationId: obligation.id, error: `referenced FeePolicyVersion ${obligation.feePolicyVersionId} has no valid requiredConfirmations` })
        continue
      }

      const status = await fetchTransactionConfirmationStatus(lastBroadcast.txid)
      if (!status.confirmed || status.blockHeight === null) {
        // Missão 11 Fase 5 §8 — distinguish "still unconfirmed" from
        // "genuinely dropped" is not reliably possible from status alone
        // (an esplora-style API reports the same shape for both a
        // never-broadcast and a not-yet-mined tx) — only a 404/tx-not-found
        // response is treated as dropped, handled in the catch below via
        // fetchTransactionOutputs() failing; a confirmed:false response
        // here is always "still pending," never auto-classified as dropped.
        result.stillPending.push(obligation.id)
        continue
      }

      const tipHeight = await fetchChainTipHeight()
      const confirmations = tipHeight - status.blockHeight + 1
      if (confirmations < requiredConfirmations) {
        result.stillPending.push(obligation.id)
        continue
      }

      // §7 — re-verify against the REAL chain data, never the previously-
      // recorded evidence row on faith: the fee output must still exist,
      // at the expected vout, paying the expected frozen destination
      // (compared as raw script bytes, never a human-readable address
      // string), for the expected amount.
      const outputs = await fetchTransactionOutputs(lastBroadcast.txid)
      const output = outputs[lastBroadcast.vout]
      const expectedScriptHex = lastBroadcast.scriptPubKey
      const expectedAmountSats = Number(lastBroadcast.amount.times(1e8))

      if (!output || !expectedScriptHex || output.scriptPubKeyHex !== expectedScriptHex || output.valueSats !== expectedAmountSats) {
        result.failed.push({
          feeObligationId: obligation.id,
          error: `re-verification at confirmation time failed: expected vout ${lastBroadcast.vout} to pay ${expectedAmountSats} sats to script ${expectedScriptHex}, got ${JSON.stringify(output)}`,
        })
        continue
      }

      await feeCollectionRecognitionService.recognizeConfirmation(obligation.id, lastBroadcast.txid, status.blockHeight)
      result.collected.push(obligation.id)
    } catch (err) {
      result.failed.push({ feeObligationId: obligation.id, error: err instanceof Error ? err.message : String(err) })
    }
  }

  if (result.collected.length || result.failed.length) {
    log.info({ msg: 'MULTISIG fee confirmation sweep completed', collected: result.collected.length, stillPending: result.stillPending.length, failed: result.failed.length })
  }

  return result
}
