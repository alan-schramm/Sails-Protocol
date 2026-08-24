/**
 * MultisigFundingReorgSweep — Missão 11 Fase 8.1 LB-08(A).
 *
 * DELIBERATELY SMALLER than the fee-collection reorg sweep
 * (multisig-fee-reorg-sweep.ts) — detection + structured log only, no
 * status mutation, no new persisted evidence row.
 *
 * Why: FeeCollectionEvidence is an append-only ledger purpose-built for
 * exactly this ("record a REORGED_OUT fact without deleting/rewriting
 * history"), and FeeObligation.collectionStatus already has a legal
 * COLLECTED -> IN_PROGRESS backward edge to auto-revert into. Escrow has
 * neither: EscrowEvent is strictly transition-typed (fromStatus/toStatus
 * are real enum values written into a hash chain — there is no
 * FUNDS_LOCKED -> FUNDS_LOCKED "no-op, just flagging an anomaly" shape
 * that wouldn't distort what that chain is supposed to mean), and no
 * "EscrowFundingEvidence"-equivalent append-only table exists.
 *
 * Per Missão 11 Fase 8.1's own instruction ("if correct semantics require
 * a schema migration or a new economic state, STOP BEFORE IMPLEMENTING
 * THAT PORTION and report the proposed invariant to the CTO — do not
 * unilaterally redesign economic history"), this sweep implements only
 * the part that needs no new schema and no status decision: detect a
 * FUNDS_LOCKED MULTISIG escrow whose confirming funding transaction is no
 * longer confirmed, and log it loudly (structured, queryable by
 * escrowId/txLockId) as an exceptional condition requiring manual
 * review — the same posture recordReorgAndRevert() already takes for an
 * already-DISTRIBUTED fee obligation. It does NOT change Escrow.status,
 * does NOT write an EscrowEvent, and does NOT attempt any automatic
 * recovery action. See this Fase's own final report for the open
 * question this leaves for the CTO: what (if anything) the system should
 * do automatically once a FUNDS_LOCKED escrow's funding disappears —
 * revert to a different status, wait, or require pure operator action —
 * is a real state-machine decision, not implemented here.
 */
import { prisma } from '../../common/database'
import { config } from '../../config'
import { childLogger } from '../../common/logger'
import { fetchTransactionConfirmationStatus, fetchChainTipHeight } from './multisig.provider'

const log = childLogger('multisig-funding-reorg-sweep')

export interface FundingReorgSweepResult {
  flagged: string[]
  stillGood: string[]
  buriedEnough: string[]
  failed: Array<{ escrowId: string; error: string }>
}

export async function sweepMultisigFundingReorgs(): Promise<FundingReorgSweepResult> {
  const result: FundingReorgSweepResult = { flagged: [], stillGood: [], buriedEnough: [], failed: [] }

  const escrows = await prisma.escrow.findMany({
    where: { type: 'MULTISIG', status: 'FUNDS_LOCKED', txLockId: { not: null } },
  })

  if (escrows.length === 0) return result

  const tipHeight = await fetchChainTipHeight()

  for (const escrow of escrows) {
    try {
      if (!escrow.txLockId || !escrow.lockedAt) continue // structurally shouldn't happen given the WHERE clause above

      const status = await fetchTransactionConfirmationStatus(escrow.txLockId)
      if (!status.confirmed || status.blockHeight === null) {
        log.error({
          msg: 'Reorg detected on a FUNDS_LOCKED escrow\'s funding transaction — NOT changing escrow status (no designed recovery semantics exist for this case yet). Flagging as an exceptional reconciliation condition requiring manual review.',
          escrowId: escrow.id, txLockId: escrow.txLockId, txLockVout: escrow.txLockVout,
        })
        result.flagged.push(escrow.id)
        continue
      }

      const depthNow = tipHeight - status.blockHeight + 1
      if (depthNow > config.trade.multisigReorgSafetyWindowBlocks) {
        result.buriedEnough.push(escrow.id)
        continue
      }

      result.stillGood.push(escrow.id)
    } catch (err) {
      result.failed.push({ escrowId: escrow.id, error: err instanceof Error ? err.message : String(err) })
    }
  }

  if (result.flagged.length || result.failed.length) {
    log.info({
      msg: 'MULTISIG funding reorg sweep completed',
      flagged: result.flagged.length,
      stillGood: result.stillGood.length,
      buriedEnough: result.buriedEnough.length,
      failed: result.failed.length,
    })
  }

  return result
}
