/**
 * dispute-correspondence.ts — M8-R (Live Dispatch Retry) built this
 * module's decode+evaluate CAPABILITY; Sails Core Implementation
 * Program M8.6 (Execution Cost Semantics & Live Correspondence Closure)
 * WIRES it automatically into the real MULTISIG broadcast path
 * (`escrow-pending-tx.ts`'s `submitTransactionSignature()`,
 * discriminated so unrelated/cooperative settlements are never
 * affected — see that file's own call site) and fixes the gap M8-R
 * itself disclosed: a literal, gross-`totalUnits` comparison
 * (`evaluateOutcomeCorrespondence()`, M7) reports DIVERGENT on every
 * real, faithful execution, since a real Bitcoin transaction always
 * deducts a real miner fee. This module now uses
 * `evaluateOutcomeCorrespondenceWithExecutionCost()` (M8.6,
 * economic-outcome.ts) instead, which correctly nets the real delivered
 * total against `execution-cost-policy.ts`'s deterministic, bounded
 * execution-cost model before comparing — a faithful, non-zero-fee
 * execution now legitimately produces MATCH.
 */
import * as bitcoin from 'bitcoinjs-lib'
import { ExecutionObservation, Outcome } from '@sails/core'
import { ArbitrationOutcomeContent, BeneficiaryDestination, evaluateOutcomeCorrespondenceWithExecutionCost } from './economic-outcome'
import type { CorrespondenceResult } from '@sails/core'
import { prisma } from '../../common/database'
import { eventBus } from '../../common/events/event-bus'
import { config } from '../../config'
import { networkFor } from './multisig.provider'
import { loadDisputeRulingRecord, fromDisputeRulingRow } from './dispute-outcome'
import { childLogger } from '../../common/logger'

const log = childLogger('dispute-correspondence')

/**
 * Decodes a finalized (fully-signed, broadcastable or already-broadcast)
 * transaction's real outputs and builds one `ExecutionObservation` per
 * beneficiary named in the Outcome's own destination binding — matching
 * by address, the same technique `dispatch-translation-guard.ts` already
 * uses for the pre-dispatch case. A beneficiary whose bound destination
 * does not appear among the real outputs gets `status: 'IRRESOLVABLE'`
 * (M6's own "evidence arrived but cannot be trusted/resolved" — never
 * silently treated as a match).
 */
export function buildExecutionObservationsFromFinalizedTransaction(
  rawTxHex: string,
  outcome: Outcome<ArbitrationOutcomeContent, readonly BeneficiaryDestination[]>,
  network: bitcoin.Network,
): ReadonlyMap<string, ExecutionObservation<string>> {
  const observations = new Map<string, ExecutionObservation<string>>()
  const destinations = outcome.destinationBinding?.reference ?? []

  let tx: bitcoin.Transaction
  try {
    tx = bitcoin.Transaction.fromHex(rawTxHex)
  } catch {
    for (const d of destinations) observations.set(d.beneficiary, { status: 'IRRESOLVABLE' })
    return observations
  }

  const realOutputs = tx.outs.map((o) => {
    let address: string | undefined
    try {
      address = bitcoin.address.fromOutputScript(o.script, network)
    } catch {
      // non-standard script — left undefined, never matches a real destination
    }
    return { address, value: BigInt(o.value) }
  })

  for (const d of destinations) {
    const match = realOutputs.find((o) => o.address === d.destination)
    observations.set(
      d.beneficiary,
      match ? { status: 'OBSERVED', destinationReference: match.address, amount: match.value.toString(), asset: outcome.content.asset } : { status: 'IRRESOLVABLE' },
    )
  }
  return observations
}

/** Convenience composition of the two steps above — evaluate correspondence directly from a finalized transaction. */
export function evaluateFinalizedTransactionCorrespondence(
  rawTxHex: string,
  outcome: Outcome<ArbitrationOutcomeContent, readonly BeneficiaryDestination[]>,
  network: bitcoin.Network,
): ReadonlyMap<string, CorrespondenceResult> {
  const observations = buildExecutionObservationsFromFinalizedTransaction(rawTxHex, outcome, network)
  return evaluateOutcomeCorrespondenceWithExecutionCost(outcome, observations)
}

/**
 * The live wiring point (mission §24-26). Called from
 * `escrow-pending-tx.ts`'s `submitTransactionSignature()` immediately
 * after a REAL broadcast succeeds — never before. Scoped narrowly so the
 * SHARED signature-submission path (used by every MULTISIG settlement,
 * disputed and cooperative alike) is unaffected for anything this
 * mission does not migrate:
 *
 *  - `escrowType !== 'MULTISIG'` or no `rawTxHex` returned by the
 *    provider (LIGHTNING_HODL/SAFE_GUARD_EVM never populate it) — no-op.
 *  - No RESOLVED Dispute exists for this escrow — this was a cooperative
 *    (non-disputed) MULTISIG release, which never had a Core-
 *    authoritative Outcome to begin with (M8-R's own scope: dispute
 *    settlement only) — no-op, not an error.
 *  - A RESOLVED Dispute exists but no durable `SemanticTransitionRecord`
 *    is found for it (should be structurally impossible for any dispute
 *    resolved through M8-R's `applyRulingCoreAuthoritative()`, but
 *    checked explicitly rather than assumed) — no-op, logged.
 *
 * LOADS THE HISTORICAL OUTCOME FROM THE DATABASE (mission §26) — never
 * request-memory, never anything reconstructed from the pending
 * transaction row or current participant state — the exact same record
 * that governed pre-dispatch translation (`dispute-dispatch.ts`) governs
 * this comparison too, closing the loop with a single source of truth.
 *
 * NEVER ALLOWED TO FAIL THE SETTLEMENT (mission §39/§40's own
 * established idiom, matching this exact file's neighboring
 * fee-collection-evidence block): by the time this runs, funds have
 * ALREADY moved. A correspondence-recording failure is secondary
 * accounting, logged loudly, never thrown — the caller wraps this in
 * its own try/catch as an extra safety net, but this function also
 * never throws on its own.
 *
 * DURABILITY (mission §27): recorded as a durable, correlationId-bound
 * event via the existing EventStore (`eventBus.emit`, RFC-010,
 * INV-OP-8-compliant) — never a new schema column. This is deliberately
 * RECOMPUTABLE, not the sole source of truth: the durable
 * `SemanticTransitionRecord` (Outcome + destinations) plus
 * `Escrow.txReleaseId` (the txid) are already sufficient to
 * independently re-derive the identical result later (by re-fetching
 * the transaction and calling `evaluateFinalizedTransactionCorrespondence()`
 * again) — this event is a durable OBSERVATION of that computation
 * having been made, not a fact this architecture depends on to exist.
 * Emitting it twice for the same execution (idempotency, mission §45) is
 * harmless — two independently-recorded Assertions about the same fact,
 * exactly the Kernel's own Assertion rule already permits, never a
 * double economic effect (no state is mutated here).
 */
export async function recordLiveCorrespondenceIfApplicable(
  escrowId: string,
  tradeId: string,
  escrowType: string,
  rawTxHex: string | undefined,
): Promise<void> {
  if (escrowType !== 'MULTISIG' || !rawTxHex) return

  try {
    const dispute = await prisma.dispute.findFirst({
      where: { escrowId, status: 'RESOLVED' },
      orderBy: { appealRound: 'desc' },
    })
    if (!dispute) return // cooperative (non-disputed) release — out of M8-R/M8.6's own scope, not an error

    const row = await loadDisputeRulingRecord(escrowId, dispute.appealRound)
    if (!row || !row.outcomeContent) {
      log.warn({ msg: 'RESOLVED dispute found but no durable Core-authoritative Outcome record exists for it — skipping live correspondence', escrowId, disputeId: dispute.id })
      return
    }

    const record = fromDisputeRulingRow(row)
    if (!record.outcome) return

    const network = networkFor(config.multisig.network)
    const results = evaluateFinalizedTransactionCorrespondence(rawTxHex, record.outcome, network)

    await eventBus.emit('dispute.settlement.correspondence_evaluated', {
      disputeId: dispute.id,
      settlementId: escrowId,
      triggeredBy: 'system:live-correspondence',
      appealRound: dispute.appealRound,
      results: Object.fromEntries(results) as Record<string, 'MATCH' | 'DIVERGENT' | 'PENDING' | 'UNKNOWN'>,
    }, tradeId)
  } catch (err) {
    // Same established safety pattern as this file's own sibling
    // fee-collection-evidence block in escrow-pending-tx.ts — the real
    // settlement has ALREADY broadcast successfully by this point;
    // correspondence recording is observational, never allowed to
    // un-do or fail it.
    log.error({ msg: 'Live correspondence evaluation/recording failed after a successful settlement — not retried automatically', escrowId, err: err instanceof Error ? err.message : String(err) })
  }
}
