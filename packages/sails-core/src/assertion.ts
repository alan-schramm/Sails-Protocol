/**
 * Assertion — the frozen supporting primitive.
 *
 * `docs/SEMANTIC_KERNEL.md` §8 (verbatim, not reinterpreted here): "An
 * Assertion is an attributable, interaction-bound statement — never
 * itself truth — that becomes part of that interaction's permanent
 * record once submitted for its evaluation; corrections are new
 * Assertions, not edits; unsubmitted internal signals need no such
 * record."
 *
 * This file implements only the envelope shape needed by future
 * evaluation — no storage, no append-only database, no transport, no
 * evidence upload, no truth scoring (all explicitly out of M1 scope).
 * The seven-field minimum below is the result of the Implementation
 * Architecture Red Team's own minimality attack
 * (`docs/CORE_IMPLEMENTATION_ARCHITECTURE.md` §7's "declared input
 * contract" discussion and the Phase 2 Red Team that removed two
 * originally-proposed fields): `submission ordering` and `admission
 * status` were both attacked and removed as redundant or
 * Runtime-side-only — see the field-level comments below for exactly
 * why each survivor is load-bearing.
 */
import { AssertionId, InteractionId, SourceRef } from './identifiers'
import { SemanticCommitment } from './ruleset'

export type AssertionTypeId = string

/**
 * A correction is a NEW Assertion that supersedes or contradicts a
 * prior one — the prior Assertion is never edited and remains part of
 * the permanent record (`SEMANTIC_KERNEL.md` §21). This relation is a
 * typed pointer only; Core never auto-discards or auto-ignores a
 * superseded Assertion, and whether/how to weigh a superseded vs.
 * superseding pair is entirely Module-interpretation-defined.
 */
export interface AssertionSupersession {
  readonly supersedes: AssertionId
}

/**
 * `Assertion<TContent>` — content is intentionally generic/opaque:
 * Core never understands Assertion payloads, only the envelope around
 * them (`docs/CORE_IMPLEMENTATION_ARCHITECTURE.md` §7).
 */
export interface Assertion<TContent = unknown> {
  /** Stable reference for supersession/correction pointers. */
  readonly id: AssertionId
  /** Prevents cross-interaction replay — required, never optional. */
  readonly interaction: InteractionId
  /**
   * Identity only, never a closed source-kind taxonomy — see
   * `identifiers.ts`'s own `SourceRef` documentation for why kind is
   * deliberately excluded from this Core-mandatory envelope.
   */
  readonly source: SourceRef
  /** Routes to the Module-owned interpretation of `content`. */
  readonly type: AssertionTypeId
  /** Opaque to Core; interpreted only by the owning Module. */
  readonly content: TContent
  /**
   * Content-integrity commitment. Required on every Assertion — no
   * exception was found for any source kind, including system-sourced
   * observations, during architecture validation.
   */
  readonly commitment: SemanticCommitment
  /** Present only when this Assertion corrects/supersedes a prior one. */
  readonly supersession?: AssertionSupersession

  // Deliberately absent, and why:
  //  - `submissionOrdering` — an intrinsic, globally-ordered sequence
  //    field is server-centric and does not survive concurrent/P2P
  //    submission; ordering needed for supersession is already carried
  //    by `supersession` above, and ordering needed for completeness
  //    auditing is carried by the semantic-history-position binding
  //    (`semantic-history-position.ts`), not by the Assertion itself.
  //  - `admissionStatus` — a submission that fails admission never
  //    becomes a real `Assertion` at all (there is no value of this
  //    type representing a rejected submission); admission bookkeeping
  //    is Runtime-side metadata about a submission *attempt*, never a
  //    field on an admitted Assertion.
}

export function createAssertion<TContent = unknown>(input: {
  readonly id: AssertionId
  readonly interaction: InteractionId
  readonly source: SourceRef
  readonly type: AssertionTypeId
  readonly content: TContent
  readonly commitment: SemanticCommitment
  readonly supersession?: AssertionSupersession
}): Assertion<TContent> {
  if (input.type.length === 0) {
    throw new Error('Assertion requires a non-empty type')
  }
  return { ...input }
}
