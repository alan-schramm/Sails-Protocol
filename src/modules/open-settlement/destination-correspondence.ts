/**
 * destination-correspondence.ts — Sails Core Implementation Program M6
 * (Correspondence + Destination Binding). Runtime-layer adapter for
 * `@sails/core`'s correspondence primitive
 * (`packages/sails-core/src/correspondence.ts`).
 *
 * NOT WIRED INTO ANY LIVE PATH. `dispute.service.ts`'s `resolveDispute()`/
 * `applyRuling()` are completely untouched by this mission — see
 * `discretionary-authority.ts`'s own header for the M5 precedent this
 * follows, and `docs/CORE_TRANSITION_RECORD.md`-style reasoning applied
 * to a new dimension.
 *
 * CENTRAL, CONCRETE RESIDUAL THIS FILE DEMONSTRATES CLOSING (never
 * retrofitted onto the live path — that is M7): today,
 * `resolveDispute(disputeId, arbiterId, ruling, releaseToAddress,
 * refundToAddress, splitBuyerBps, authoritySignature, authorityIssuedAt)`
 * — `src/modules/open-settlement/dispute.service.ts` — passes
 * `releaseToAddress`/`refundToAddress` as plain, UNSIGNED parameters,
 * never inside `AuthorityDecisionPayload` (`arbitration-authority.ts`'s
 * own field list: `disputeId, escrowId, appealRound, authorityId,
 * outcome, buyerBps, issuedAt` — no destination field at all). A server
 * that also controls one participant's cooperation could therefore
 * construct a cryptographically valid settlement transaction to a
 * DIFFERENT address than what the signed decision's own economic intent
 * implies — exactly `arbitration-authority.ts`'s own disclosed "Target
 * 1, never Target 2" residual, restated in destination terms. This file
 * proves the Core mechanism that WOULD close it, using this exact real
 * field shape as its adversarial reference, without changing a single
 * line of the live settlement path.
 *
 * RUNTIME RESPONSIBILITY DEMONSTRATED HERE (never Core's):
 *   - resolving what destination a signed decision's own economic
 *     intent actually implies (`buildAuthorizedDestinationBinding`);
 *   - normalizing whatever a settlement Provider reports into the
 *     three semantic facts Core can consume (`normalizeProviderReport`)
 *     — Provider SUCCESS never becomes MATCH automatically;
 *   - invoking Core's pure evaluator with those two products.
 */
import {
  DestinationBinding,
  ExecutionObservation,
  CorrespondenceInput,
  CorrespondenceResult,
  referenceDestinationCorrespondenceEvaluator,
} from '@sails/core'

/** Binds a destination at decision time. Rail-neutral to this adapter too — the reference is whatever string/opaque value the Runtime's own resolved-address logic produces; this function never inspects it. */
export function buildAuthorizedDestinationBinding(resolvedAddress: string): DestinationBinding<string> {
  return { reference: resolvedAddress }
}

/**
 * Runtime responsibility, never Core's: turning whatever a settlement
 * Provider reports (a raw transaction, a provider-specific status
 * enum, confirmation counts, ...) into the three normalized semantic
 * facts Core can consume. A Provider reporting "SUCCESS" is NOT, by
 * itself, translated into `status: 'OBSERVED'` with matching fields —
 * only genuinely reported destination/amount/asset values ever populate
 * this shape; anything the Provider didn't actually report stays
 * `undefined`, which the evaluator itself already treats as UNKNOWN for
 * any dimension the authorization bound (see correspondence.ts).
 */
export function normalizeProviderReport(report: {
  readonly hasReachedRail: boolean
  readonly reportedDestination?: string
  readonly reportedAmount?: string
  readonly reportedAsset?: string
}): ExecutionObservation<string> {
  if (!report.hasReachedRail) {
    return { status: 'AWAITED' }
  }
  return {
    status: 'OBSERVED',
    destinationReference: report.reportedDestination,
    amount: report.reportedAmount,
    asset: report.reportedAsset,
  }
}

export function evaluateSettlementCorrespondence(
  authorizedDestination: DestinationBinding<string> | undefined,
  authorizedAmount: string | undefined,
  authorizedAsset: string | undefined,
  observation: ExecutionObservation<string>,
): CorrespondenceResult {
  const input: CorrespondenceInput<string> = {
    authorizedDestination,
    authorizedAmount,
    authorizedAsset,
    observation,
  }
  return referenceDestinationCorrespondenceEvaluator.evaluate(input)
}
