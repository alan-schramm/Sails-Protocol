/**
 * Explicit time input.
 *
 * `docs/CORE_ARCHITECTURE.md` §14 and
 * `docs/CORE_IMPLEMENTATION_ARCHITECTURE.md` §24: time may be an
 * explicit, committed semantic evaluation input — never something Pure
 * Core reads for itself, and never automatically an Assertion (there is
 * no fallible claim being made when a leaf predicate compares an
 * already-recorded timestamp against an explicitly supplied evaluation
 * time).
 *
 * `EvaluationTime` is a plain integer (milliseconds since the Unix
 * epoch) rather than a JS `Date` — a `Date` object is a TypeScript/JS
 * runtime value with mutation methods and environment-dependent
 * formatting; an integer millisecond count is the same concept a Rust
 * or Go implementation represents identically, with nothing
 * language-specific leaking into what the number itself means.
 */
import { Brand } from './identifiers'

export type EvaluationTime = Brand<number, 'EvaluationTime'>

export function createEvaluationTime(millisecondsSinceEpoch: number): EvaluationTime {
  if (!Number.isFinite(millisecondsSinceEpoch)) {
    throw new Error('EvaluationTime must be a finite number of milliseconds since the Unix epoch')
  }
  return millisecondsSinceEpoch as EvaluationTime
}

export function isAtOrAfter(time: EvaluationTime, deadline: EvaluationTime): boolean {
  return (time as number) >= (deadline as number)
}
