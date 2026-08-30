/**
 * Correspondence — Sails Core Implementation Program M6.
 *
 * Materializes the second half of K3 ("Semantic Settlement
 * Independence"): "a mechanism may translate [an authorized outcome's]
 * meaning into its own terms but never alter what was authorized."
 * `docs/CORE_IMPLEMENTATION_ARCHITECTURE.md` §9-10, §15-16.
 *
 * CENTRAL THREAT (Mission13's own disclosed residual, restated
 * generically): a technically valid execution — a cryptographically
 * correct signature, a confirmed transaction, a provider SUCCESS
 * response — proves nothing about WHERE the value actually went or
 * whether that matches what was authorized. `resolveDispute()`'s own
 * `releaseToAddress`/`refundToAddress` parameters are passed alongside
 * the signed `AuthorityDecisionPayload`, never inside what is
 * cryptographically signed (`arbitration-authority.ts`,
 * `AUTHORITY_DECISION_DOMAIN`'s own field list) — a concrete, present-
 * day instance of exactly the gap this file's mechanism exists to
 * close for a FUTURE authoritative slice (M7), never retrofitted onto
 * the live path by this mission.
 *
 * WHAT THIS FILE DOES NOT DO:
 *   - It does not parse or understand any rail-specific destination
 *     representation — `DestinationBinding<TReference>` (outcome.ts,
 *     M1) stays exactly as opaque as it already was; this file only
 *     ever compares two already-resolved `TReference` values with `===`.
 *   - It does not solve finality — a MATCH here says nothing about
 *     confirmation depth (§9's own worked example: a correct,
 *     zero-confirmation mempool transaction may already be MATCH;
 *     finality is a separate, later concern this file does not touch).
 *   - It does not decide execution VALIDITY ("may this Outcome still be
 *     dispatched?", §11) — a distinct semantic role, deliberately left
 *     as its own future concern (M8).
 *   - It does not become a universal transaction model — the only
 *     economic facts represented are the ones already frozen as
 *     material by `docs/CORE_IMPLEMENTATION_ARCHITECTURE.md` §15
 *     (destination) plus amount/asset, the two additional dimensions
 *     the Red Team's own "right amount, wrong recipient" finding (and
 *     its dual, "right recipient, wrong amount") requires to close the
 *     substitution class this mission enumerates.
 */
import { DestinationBinding } from './outcome'
import { CorrespondenceResult } from './correspondence-result'
import { CanonicalEvaluatorIdentity, createCanonicalEvaluatorIdentity } from './evaluator-identity'

/**
 * What the Runtime/Provider-evidence layer reports about execution —
 * normalized to the only three semantic facts this evaluator can ever
 * consult, never raw rail-specific payloads. `status` carries the
 * PENDING/UNKNOWN distinction explicitly (mission §22): `AWAITED` means
 * further evidence is expected under a completeness condition the
 * Runtime/domain layer itself declares (Core never parses "N
 * confirmations" or any other rail-specific completeness rule);
 * `IRRESOLVABLE` means evidence arrived but cannot be trusted/resolved.
 * Core draws no distinction between "field genuinely absent" and
 * "field not economically bound" beyond what `CorrespondenceInput`'s
 * own optional `authorized*` fields already express — see
 * `evaluateCorrespondence`'s own logic for exactly how an OBSERVED
 * status with a missing bound field is handled (never silently MATCH).
 */
export type ExecutionEvidenceStatus = 'OBSERVED' | 'AWAITED' | 'IRRESOLVABLE'

export interface ExecutionObservation<TDestinationReference = unknown> {
  readonly status: ExecutionEvidenceStatus
  /** Present only when status === 'OBSERVED' and the destination was actually reported. */
  readonly destinationReference?: TDestinationReference
  /** Present only when status === 'OBSERVED' and an amount was actually reported. Decimal-as-string, matching this codebase's own existing convention — never a float. */
  readonly amount?: string
  /** Present only when status === 'OBSERVED' and an asset was actually reported. */
  readonly asset?: string
}

/**
 * What was actually authorized, bound at decision time — each
 * `authorized*` field is independently optional because not every
 * Outcome binds every dimension (a pure state-adjustment Outcome binds
 * none of them; a same-asset transfer binds destination+amount but
 * never needs an asset check). Only the dimensions an Outcome actually
 * bound are ever checked — this evaluator never invents a requirement
 * the authorization itself didn't declare.
 */
export interface CorrespondenceInput<TDestinationReference = unknown> {
  readonly authorizedDestination?: DestinationBinding<TDestinationReference>
  readonly authorizedAmount?: string
  readonly authorizedAsset?: string
  readonly observation: ExecutionObservation<TDestinationReference>
}

/**
 * The distinct evaluator-role contract for correspondence (§11's own
 * "distinguishability of role, not necessarily of concrete type" —
 * this file chooses a separate type rather than reusing `LeafEvaluator`,
 * since `LeafEvaluator` is frozen (M2) to `ConditionResult` specifically
 * and a correspondence evaluator answers a materially different
 * question). Otherwise structurally identical: a stable Canonical
 * Evaluator Identity, and a pure, deterministic function from declared
 * input to result.
 */
export interface CorrespondenceEvaluator<TInput> {
  readonly identity: CanonicalEvaluatorIdentity
  readonly evaluate: (input: TInput) => CorrespondenceResult
}

export const SAILS_DESTINATION_CORRESPONDENCE_EVALUATOR_IDENTITY = createCanonicalEvaluatorIdentity(
  'sails-destination-correspondence-evaluator',
  '1.0',
)

/**
 * Reference correspondence evaluator: checks whatever dimensions
 * (destination / amount / asset) the authorization actually bound
 * against the reported observation.
 *
 *  - `AWAITED`      -> PENDING (evidence expected, not yet in)
 *  - `IRRESOLVABLE` -> UNKNOWN (evidence arrived but cannot be trusted)
 *  - `OBSERVED`, any bound dimension AFFIRMATIVELY mismatching -> DIVERGENT
 *    (checked first and takes priority: one confirmed mismatch is
 *    conclusive regardless of what else is or isn't known)
 *  - `OBSERVED`, a bound dimension never actually reported -> UNKNOWN
 *    (absence of evidence for a materially bound fact is never treated
 *    as agreement — closes the "provider SUCCESS with no real detail"
 *    and "raw evidence unavailable" failure classes)
 *  - `OBSERVED`, every bound dimension reported and matching (or
 *    nothing was bound at all) -> MATCH
 */
export const referenceDestinationCorrespondenceEvaluator: CorrespondenceEvaluator<CorrespondenceInput> = {
  identity: SAILS_DESTINATION_CORRESPONDENCE_EVALUATOR_IDENTITY,
  evaluate: (input): CorrespondenceResult => {
    if (input.observation.status === 'AWAITED') return 'PENDING'
    if (input.observation.status === 'IRRESOLVABLE') return 'UNKNOWN'

    const checks: Array<'MATCH' | 'DIVERGENT' | 'UNKNOWN'> = []

    if (input.authorizedDestination !== undefined) {
      checks.push(
        input.observation.destinationReference === undefined
          ? 'UNKNOWN'
          : input.observation.destinationReference === input.authorizedDestination.reference
            ? 'MATCH'
            : 'DIVERGENT',
      )
    }
    if (input.authorizedAmount !== undefined) {
      checks.push(
        input.observation.amount === undefined
          ? 'UNKNOWN'
          : input.observation.amount === input.authorizedAmount
            ? 'MATCH'
            : 'DIVERGENT',
      )
    }
    if (input.authorizedAsset !== undefined) {
      checks.push(
        input.observation.asset === undefined
          ? 'UNKNOWN'
          : input.observation.asset === input.authorizedAsset
            ? 'MATCH'
            : 'DIVERGENT',
      )
    }

    if (checks.includes('DIVERGENT')) return 'DIVERGENT'
    if (checks.includes('UNKNOWN')) return 'UNKNOWN'
    return 'MATCH'
  },
}
