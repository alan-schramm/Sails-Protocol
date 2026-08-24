/**
 * MultisigFeeReorgSweep — Missão 11 Fase 8.1 LB-08.
 *
 * The DETECTION half of fee-collection reorg handling. The REVERT/FLAG
 * logic already existed before this file (fee-collection-recognition.
 * service.ts's recordReorgAndRevert(), written in Fase 5 §8) with exactly
 * the right semantics: auto-revert COLLECTED -> IN_PROGRESS when safe,
 * refuse to auto-revert an already-DISTRIBUTED obligation and flag it as
 * an exceptional reconciliation condition instead. Nothing in the
 * codebase ever called it — this sweep is that missing caller, not a new
 * economic-state design. No schema change, no new FeeObligation status.
 *
 * Re-checks only COLLECTED/DISTRIBUTED MULTISIG obligations whose last
 * CONFIRMED evidence is still within config.trade.multisigReorgSafetyWindowBlocks
 * of the current chain tip — once buried deep enough, a further reorg is
 * not a real operational concern this sweep needs to keep re-checking
 * forever (see that config field's own comment for the 100-block
 * justification).
 *
 * What this sweep intentionally does NOT do: reinterpret DROPPED/REPLACED
 * transactions, attempt to detect a transaction reappearing at a
 * DIFFERENT height (the exact same txid remaining confirmed — even at a
 * shifted height — does not invalidate the output/amount/script already
 * verified against it at recognition time), or improvise any financial
 * reversal beyond the pre-existing COLLECTED -> IN_PROGRESS edge.
 */
import { prisma } from '../../common/database'
import { config } from '../../config'
import { childLogger } from '../../common/logger'
import { feeCollectionEvidenceRepository } from './fee-collection-evidence-repository'
import { feeCollectionRecognitionService } from './fee-collection-recognition.service'
import { fetchTransactionConfirmationStatus, fetchChainTipHeight } from './multisig.provider'

const log = childLogger('multisig-fee-reorg-sweep')

export interface ReorgSweepResult {
  reverted: string[]
  flaggedDistributed: string[]
  stillGood: string[]
  buriedEnough: string[]
  failed: Array<{ feeObligationId: string; error: string }>
}

export async function sweepMultisigFeeReorgs(): Promise<ReorgSweepResult> {
  const result: ReorgSweepResult = { reverted: [], flaggedDistributed: [], stillGood: [], buriedEnough: [], failed: [] }

  const obligations = await prisma.feeObligation.findMany({
    where: { collectionStatus: { in: ['COLLECTED', 'DISTRIBUTED'] }, escrow: { type: 'MULTISIG' } },
  })

  if (obligations.length === 0) return result

  // Fetched once per sweep run, not once per obligation — the chain tip
  // doesn't meaningfully change mid-sweep, and this avoids N redundant
  // explorer calls for a sweep covering many obligations.
  const tipHeight = await fetchChainTipHeight()

  for (const obligation of obligations) {
    try {
      const evidenceList = await feeCollectionEvidenceRepository.listForObligation(obligation.id)
      const lastConfirmed = [...evidenceList].reverse().find((e) => e.kind === 'CONFIRMED')
      if (!lastConfirmed?.txid || lastConfirmed.confirmedAtHeight === null || lastConfirmed.confirmedAtHeight === undefined) {
        // Structurally shouldn't happen — recognizeConfirmation() always
        // writes txid+confirmedAtHeight together in the same transaction
        // that sets COLLECTED. Logged, not silently skipped.
        result.failed.push({ feeObligationId: obligation.id, error: 'COLLECTED/DISTRIBUTED with no usable CONFIRMED evidence (missing txid/confirmedAtHeight)' })
        continue
      }

      const depthNow = tipHeight - lastConfirmed.confirmedAtHeight + 1
      if (depthNow > config.trade.multisigReorgSafetyWindowBlocks) {
        result.buriedEnough.push(obligation.id)
        continue
      }

      const status = await fetchTransactionConfirmationStatus(lastConfirmed.txid)
      if (!status.confirmed) {
        const { reverted } = await feeCollectionRecognitionService.recordReorgAndRevert(obligation.id, lastConfirmed.txid)
        if (reverted) result.reverted.push(obligation.id)
        else result.flaggedDistributed.push(obligation.id)
        continue
      }

      result.stillGood.push(obligation.id)
    } catch (err) {
      result.failed.push({ feeObligationId: obligation.id, error: err instanceof Error ? err.message : String(err) })
    }
  }

  if (result.reverted.length || result.flaggedDistributed.length || result.failed.length) {
    log.info({
      msg: 'MULTISIG fee reorg sweep completed',
      reverted: result.reverted.length,
      flaggedDistributed: result.flaggedDistributed.length,
      stillGood: result.stillGood.length,
      buriedEnough: result.buriedEnough.length,
      failed: result.failed.length,
    })
  }

  return result
}
