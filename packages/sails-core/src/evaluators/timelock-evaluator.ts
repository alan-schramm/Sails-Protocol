/**
 * Reference TypeScript Evaluator for `sails-timelock-evaluator@1.0`.
 *
 * "Reference", never "Canonical" — Canonical describes the semantics
 * (published at `conformance/evaluators/sails-timelock-evaluator-1.0.json`,
 * which this file implements but does not define — see
 * `docs/CORE_IMPLEMENTATION_ARCHITECTURE.md` §19). This is one possible
 * conformant implementation of that identity, in this language, in this
 * repository; a Rust or Go implementation of the exact same identity is
 * an equally valid, equally first-class implementation, never a lesser
 * one merely for not being TypeScript.
 *
 * Sufficient for a future FUNDS_LOCKED -> EXPIRED evaluation (M3), but
 * this file does not wire it in, does not touch legacy Runtime or
 * State, and moves no funds — see the M2 mission's own scope boundary.
 */
import { EvaluationTime, isAtOrAfter } from '../time'
import { createCanonicalEvaluatorIdentity } from '../evaluator-identity'
import { LeafEvaluator } from '../leaf-evaluator'

export interface TimelockInput {
  readonly deadline: EvaluationTime
  readonly evaluationTime: EvaluationTime
}

export const SAILS_TIMELOCK_EVALUATOR_IDENTITY = createCanonicalEvaluatorIdentity('sails-timelock-evaluator', '1.0')

/**
 * output = SATISFIED if evaluationTime >= deadline, else
 * NOT_YET_SATISFIED — matching the published semantic definition's own
 * `rule` field exactly (>=, never >, per that definition's explicit
 * warning about the exact-deadline-instant edge case).
 *
 * Never reaches UNSATISFIABLE or UNKNOWN — both are genuinely
 * unreachable for this evaluator's own semantics (see the published
 * definition's `output.rationale`), not an unimplemented case.
 */
export const referenceTimelockEvaluator: LeafEvaluator<TimelockInput> = {
  identity: SAILS_TIMELOCK_EVALUATOR_IDENTITY,
  evaluate: ({ deadline, evaluationTime }) =>
    isAtOrAfter(evaluationTime, deadline) ? 'SATISFIED' : 'NOT_YET_SATISFIED',
}
