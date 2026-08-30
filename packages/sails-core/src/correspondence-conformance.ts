/**
 * Pure conformance-comparison primitive for CorrespondenceEvaluator.
 *
 * A deliberate PARALLEL to `conformance.ts` (M2), never a modification
 * of it — `conformance.ts`'s own `ConformanceVector`/`runConformanceVectors`
 * are frozen to `ConditionResult` specifically (their own doc comments
 * say so), and `docs/CORE_IMPLEMENTATION_ARCHITECTURE.md` §11 explicitly
 * permits "separate types" as a valid realization of correspondence's
 * distinct semantic role from condition evaluation. Structurally
 * identical otherwise: comparing actual vs. expected is ordinary pure
 * computation, belongs in Pure Core; loading vector files from disk
 * does not (see `scripts/run-conformance-harness.ts`).
 */
import { CorrespondenceResult } from './correspondence-result'
import { CanonicalEvaluatorIdentity } from './evaluator-identity'
import { CanonicalSemanticProfileIdentity } from './evaluator-identity'

export interface CorrespondenceConformanceVector<TInput = unknown> {
  readonly vectorId: string
  readonly evaluatorIdentity: CanonicalEvaluatorIdentity
  readonly profileIdentity: CanonicalSemanticProfileIdentity
  readonly semanticDefinitionReference: string
  readonly input: TInput
  readonly expectedOutput: CorrespondenceResult
}

export interface CorrespondenceConformanceOutcome {
  readonly vectorId: string
  readonly passed: boolean
  readonly expected: CorrespondenceResult
  readonly actual: CorrespondenceResult
}

export function runCorrespondenceConformanceVectors<TInput>(
  evaluate: (input: TInput) => CorrespondenceResult,
  vectors: readonly CorrespondenceConformanceVector<TInput>[],
): CorrespondenceConformanceOutcome[] {
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

export function allCorrespondencePassed(outcomes: readonly CorrespondenceConformanceOutcome[]): boolean {
  return outcomes.every((o) => o.passed)
}
