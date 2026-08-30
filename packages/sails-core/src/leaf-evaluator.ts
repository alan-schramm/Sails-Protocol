/**
 * LeafEvaluator — the smallest useful evaluator contract consistent
 * with the frozen architecture.
 *
 * `docs/CORE_ARCHITECTURE.md` §M (leaf-predicate contract) and
 * `docs/CORE_IMPLEMENTATION_ARCHITECTURE.md` §14/§19 (M2 mission).
 * A leaf evaluator has a stable Canonical Evaluator Identity (never a
 * package name or version), declares its own semantic inputs via
 * `TInput`'s own shape, and evaluates them purely and deterministically
 * into one of the four frozen `ConditionResult` states.
 *
 * `identity` is the ONLY thing this contract requires an implementation
 * to declare about itself — nothing about language, package, or
 * artifact identity is part of this type. A Rust or Go implementation
 * of the same `CanonicalEvaluatorIdentity` conforms to the same
 * contract without sharing a single line of code with this one, and
 * without this type existing in either language at all — it is a
 * TypeScript-specific expression of a language-neutral requirement:
 * "declare your identity, then be a pure function from your declared
 * inputs to a ConditionResult."
 */
import { ConditionResult } from './condition-result'
import { CanonicalEvaluatorIdentity } from './evaluator-identity'

export interface LeafEvaluator<TInput> {
  readonly identity: CanonicalEvaluatorIdentity
  readonly evaluate: (input: TInput) => ConditionResult
}
