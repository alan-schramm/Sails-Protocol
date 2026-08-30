/**
 * Pure conformance-comparison primitive.
 *
 * `docs/CORE_IMPLEMENTATION_ARCHITECTURE.md` §19-20 (M2 mission):
 * comparing an evaluator's actual output against a vector's expected
 * output is ordinary pure computation — it belongs inside Pure Core,
 * exactly like any other semantic primitive. Loading vector files from
 * disk, resolving which implementation to run, and reporting results
 * (console output, process exit codes) does NOT belong here — see
 * `scripts/run-conformance-harness.ts`, which loads JSON and calls
 * `runConformanceVectors` with already-in-memory values.
 *
 * `ConformanceVector`'s `evaluatorIdentity`/`profileIdentity`/
 * `semanticDefinitionReference`/`vectorId` fields are documentation-only
 * (per the semantic profile's own `conformanceVectorRepresentation`
 * rule) — this module never compares them; only `input` vs.
 * `expectedOutput`, run through the caller-supplied evaluator, is
 * semantically binding. This is deliberate: it is what lets a vector
 * declare the "wrong" identity in a test (the identity-spoof scenario)
 * while comparison itself still runs correctly.
 */
import { ConditionResult } from './condition-result'
import { CanonicalEvaluatorIdentity } from './evaluator-identity'
import { CanonicalSemanticProfileIdentity } from './evaluator-identity'

export interface ConformanceVector<TInput = unknown> {
  /** Documentation only — never semantically compared. */
  readonly vectorId: string
  /** Documentation only — never semantically compared. */
  readonly evaluatorIdentity: CanonicalEvaluatorIdentity
  /** Documentation only — never semantically compared. */
  readonly profileIdentity: CanonicalSemanticProfileIdentity
  /** Documentation only — never semantically compared. */
  readonly semanticDefinitionReference: string
  /** Semantically binding: fed directly to the supplied evaluator. */
  readonly input: TInput
  /** Semantically binding: compared against the evaluator's actual output. */
  readonly expectedOutput: ConditionResult
}

export interface ConformanceOutcome {
  readonly vectorId: string
  readonly passed: boolean
  readonly expected: ConditionResult
  readonly actual: ConditionResult
}

/**
 * Runs every vector through `evaluate` and compares actual vs expected.
 * Never normalizes a mismatch into a pass — this is the one property
 * `scripts/run-conformance-harness.ts`'s own tests exist to prove
 * (docs/CORE_IMPLEMENTATION_ARCHITECTURE.md's "conformance vectors are
 * evidence, not proof" — but the evidence itself must be honest).
 */
export function runConformanceVectors<TInput>(
  evaluate: (input: TInput) => ConditionResult,
  vectors: readonly ConformanceVector<TInput>[],
): ConformanceOutcome[] {
  return vectors.map((vector) => {
    const actual = evaluate(vector.input)
    return {
      vectorId: vector.vectorId,
      passed: actual === vector.expectedOutput,
      expected: vector.expectedOutput,
      actual,
    }
  })
}

export function allPassed(outcomes: readonly ConformanceOutcome[]): boolean {
  return outcomes.every((o) => o.passed)
}
