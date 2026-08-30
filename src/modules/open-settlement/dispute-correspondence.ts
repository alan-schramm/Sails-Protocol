/**
 * dispute-correspondence.ts — Sails Core Implementation Program M8-R
 * (Live Dispatch Retry), mission §29/§33 (M6 post-execution
 * correspondence for the live slice).
 *
 * DISCLOSED SCOPE: this module provides the CAPABILITY — decode a real,
 * finalized MULTISIG transaction and evaluate it against the
 * authoritative Outcome via M6's already-built, already-conformance-
 * tested evaluator (`evaluateOutcomeCorrespondence()`, M7) — proven
 * correct in isolation (tests/disputeCorrespondence.test.ts). It is NOT
 * automatically wired into `submitTransactionSignature()`'s broadcast
 * path in this pass: that function is shared by every signature-
 * collection settlement (disputed and cooperative alike, across
 * MULTISIG/LIGHTNING_HODL/SAFE_GUARD_EVM), and threading "was this an
 * M8-R Core-authoritative dispute ruling, and at which appealRound"
 * through it cleanly needs its own deliberate design decision (a new
 * link from `EscrowPendingTransaction` to its `SemanticTransitionRecord`,
 * or an equivalent), not a hasty addition at the end of this mission.
 * See this mission's own final report for the disclosed residual gap
 * this leaves (automatic live correspondence recording is deferred; the
 * evaluator itself is real, tested, and callable today).
 */
import * as bitcoin from 'bitcoinjs-lib'
import { ExecutionObservation, Outcome } from '@sails/core'
import { ArbitrationOutcomeContent, BeneficiaryDestination, evaluateOutcomeCorrespondence } from './economic-outcome'
import type { CorrespondenceResult } from '@sails/core'

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
  return evaluateOutcomeCorrespondence(outcome, observations)
}
