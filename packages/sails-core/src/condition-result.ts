/**
 * ConditionResult — the frozen four-state vocabulary.
 *
 * Defined in `docs/CORE_ARCHITECTURE.md` §12-13 and re-verified for
 * mathematical soundness during Core Architecture Phase 3. This file
 * implements exactly that frozen model — it does not redefine it, add
 * a fifth state, or reintroduce `CONFLICTED` (removed during that same
 * validation as unnecessary: contradiction-handling is domain/ruleset
 * semantics expressed through these four values plus a `reason`, never
 * a universal Core status).
 *
 * SATISFIED           — the condition holds under the exact inputs evaluated.
 * NOT_YET_SATISFIED   — does not hold now, but a specific, known path to
 *                        satisfaction remains open.
 * UNSATISFIABLE       — cannot hold for *this* proposal, evaluated against
 *                        *this* submitted input set — never a claim about a
 *                        future, differently-scoped proposal.
 * UNKNOWN             — a required input's own resolution is itself
 *                        uncertain; unlike NOT_YET_SATISFIED, there is no
 *                        known guarantee the uncertainty ever resolves.
 */
export type ConditionResult = 'SATISFIED' | 'NOT_YET_SATISFIED' | 'UNSATISFIABLE' | 'UNKNOWN'

export const CONDITION_RESULTS: readonly ConditionResult[] = [
  'UNSATISFIABLE',
  'UNKNOWN',
  'NOT_YET_SATISFIED',
  'SATISFIED',
]

// The one frozen total order the whole algebra rests on:
// UNSATISFIABLE < UNKNOWN < NOT_YET_SATISFIED < SATISFIED.
// AND = min over this order, OR = max over this order — both therefore
// commutative, associative, and idempotent for free, as verified in
// `docs/CORE_ARCHITECTURE.md` §13.
const ORDER: Record<ConditionResult, number> = {
  UNSATISFIABLE: 0,
  UNKNOWN: 1,
  NOT_YET_SATISFIED: 2,
  SATISFIED: 3,
}

function fromOrder(value: number): ConditionResult {
  const found = CONDITION_RESULTS.find((r) => ORDER[r] === value)
  if (!found) {
    throw new Error(`invalid ConditionResult order value: ${value}`)
  }
  return found
}

/** AND = min over the frozen order. Requires at least one operand. */
export function conditionAnd(...results: readonly ConditionResult[]): ConditionResult {
  if (results.length === 0) {
    throw new Error('conditionAnd requires at least one ConditionResult')
  }
  return fromOrder(Math.min(...results.map((r) => ORDER[r])))
}

/** OR = max over the frozen order. Requires at least one operand. */
export function conditionOr(...results: readonly ConditionResult[]): ConditionResult {
  if (results.length === 0) {
    throw new Error('conditionOr requires at least one ConditionResult')
  }
  return fromOrder(Math.max(...results.map((r) => ORDER[r])))
}

/**
 * N-of-M threshold, derived from semantic possibility (not enum
 * ordering convenience) — see `docs/CORE_ARCHITECTURE.md` §13.
 *
 * Counting s = SATISFIED, p = NOT_YET_SATISFIED, k = UNKNOWN,
 * f = UNSATISFIABLE among the M results:
 *   - s >= n                       -> SATISFIED   (already met)
 *   - s + p + k < n                -> UNSATISFIABLE (unreachable even optimistically)
 *   - s + p >= n                   -> NOT_YET_SATISFIED (known paths alone suffice)
 *   - otherwise                    -> UNKNOWN (reaching n needs an uncertain slot to resolve favorably)
 *
 * This is a strict generalization of AND/OR: threshold(m, results) ===
 * conditionAnd(...results) and threshold(1, results) ===
 * conditionOr(...results) for any m equal to results.length — verified
 * in `packages/sails-core/tests/conditionResult.test.ts`.
 */
export function conditionThreshold(n: number, results: readonly ConditionResult[]): ConditionResult {
  if (!Number.isInteger(n) || n < 1) {
    throw new Error('conditionThreshold requires an integer n >= 1')
  }
  if (results.length === 0) {
    throw new Error('conditionThreshold requires at least one ConditionResult')
  }
  const counts: Record<ConditionResult, number> = {
    SATISFIED: 0,
    NOT_YET_SATISFIED: 0,
    UNSATISFIABLE: 0,
    UNKNOWN: 0,
  }
  for (const r of results) counts[r] += 1

  const s = counts.SATISFIED
  const p = counts.NOT_YET_SATISFIED
  const k = counts.UNKNOWN

  if (s >= n) return 'SATISFIED'
  if (s + p + k < n) return 'UNSATISFIABLE'
  if (s + p >= n) return 'NOT_YET_SATISFIED'
  return 'UNKNOWN'
}
