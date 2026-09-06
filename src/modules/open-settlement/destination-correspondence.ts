/**
 * destination-correspondence.ts — Sails Core Implementation Program M6
 * (Correspondence + Destination Binding). Runtime-layer adapter for
 * `@sails/core`'s correspondence primitive
 * (`packages/sails-core/src/correspondence.ts`).
 *
 * NOT WIRED INTO ANY LIVE PATH when this module (M6) was built —
 * `dispute.service.ts`'s `resolveDispute()`/`applyRuling()` were, at
 * that time, completely untouched; see `discretionary-authority.ts`'s
 * own header for the M5 precedent this followed, and
 * `docs/CORE_TRANSITION_RECORD.md`-style reasoning applied to a new
 * dimension. **Corrigido 2026-09-04 (Current Truth Reconciliation
 * P0):** this module has since been wired live — the later M8-R
 * mission's `dispatch-translation-guard.ts` calls
 * `assertTranslationMatchesOutcome()` unconditionally inside
 * `dispute.service.ts`'s MULTISIG-only `applyRulingCoreAuthoritative()`
 * path, using this module's `buildAuthorizedDestinationBinding()`.
 *
 * CENTRAL, CONCRETE RESIDUAL THIS FILE ORIGINALLY DEMONSTRATED CLOSING
 * (retrofitted onto the live path for MULTISIG only, by the later M8-R
 * mission — never retrofitted for the other four rails): at the time
 * this module was built, `resolveDispute(disputeId, arbiterId, ruling,
 * releaseToAddress, refundToAddress, splitBuyerBps, authoritySignature,
 * authorityIssuedAt)` — `src/modules/open-settlement/dispute.service.ts`
 * — passed `releaseToAddress`/`refundToAddress` as plain, UNSIGNED
 * parameters, never inside `AuthorityDecisionPayload`
 * (`arbitration-authority.ts`'s own field list: `disputeId, escrowId,
 * appealRound, authorityId, outcome, buyerBps, issuedAt` — no
 * destination field at all). A server that also controls one
 * participant's cooperation could therefore construct a
 * cryptographically valid settlement transaction to a DIFFERENT address
 * than what the signed decision's own economic intent implies — exactly
 * `arbitration-authority.ts`'s own disclosed "Target 1, never Target 2"
 * residual, restated in destination terms. This remains exactly true
 * today for LIGHTNING_HODL/SAFE_GUARD_EVM/WDK_USDT_EVM/MOCK, which still
 * use the legacy `applyRuling()` path unchanged. This file's mechanism
 * closes it for MULTISIG only, via the live path described above.
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
