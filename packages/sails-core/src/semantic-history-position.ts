/**
 * SemanticHistoryPosition — storage-neutral composite binding.
 *
 * `docs/CORE_ARCHITECTURE.md` §15 and
 * `docs/CORE_IMPLEMENTATION_ARCHITECTURE.md` §14/§21. Binds, only when
 * semantically consumed by an evaluation: the prior State, the Ruleset,
 * the actually-used Canonical Evaluator Identity and Canonical Semantic
 * Profile identity, and (when relevant) the specific Assertions and
 * identity-resolution material relied upon.
 *
 * This must never assume a SQL row number, a Postgres sequence, a
 * global order, a block height, or a central-server counter — it must
 * remain conceptually compatible with Postgres, event-sourced, and
 * local-first Runtimes alike. The `reference` field below is
 * deliberately `unknown`: distributed consensus is explicitly not
 * solved here, and no specific commitment/hash format is chosen, per
 * `docs/CORE_ARCHITECTURE.md` §15's own "do not overcommit to one
 * storage representation" instruction.
 */
import { InteractionId } from './identifiers'
import { RulesetRef } from './ruleset'
import { CanonicalEvaluatorIdentity, CanonicalSemanticProfileIdentity } from './evaluator-identity'

export interface SemanticHistoryPosition {
  readonly interaction: InteractionId
  readonly rulesetRef: RulesetRef
  readonly evaluatorIdentity: CanonicalEvaluatorIdentity
  readonly profileIdentity: CanonicalSemanticProfileIdentity
  /**
   * Opaque, Runtime-defined mechanism identifying the exact prior
   * State/Assertion-history snapshot this position denotes — a
   * revision counter, an event-log offset, a state-root commitment, a
   * hash-chain head, or any other mechanism a given Runtime chooses.
   * Core never inspects this value; it only ever compares two
   * references for equality via whatever equality the supplying
   * Runtime defines.
   */
  readonly reference: unknown
}

export function createSemanticHistoryPosition(input: {
  readonly interaction: InteractionId
  readonly rulesetRef: RulesetRef
  readonly evaluatorIdentity: CanonicalEvaluatorIdentity
  readonly profileIdentity: CanonicalSemanticProfileIdentity
  readonly reference: unknown
}): SemanticHistoryPosition {
  return { ...input }
}

/**
 * The one legitimate, explicitly-disclosed alternative to a resolved
 * `SemanticHistoryPosition`: a migrating Interaction's first Core
 * Transition Record may bind to this literal instead
 * (`docs/CORE_IMPLEMENTATION_ARCHITECTURE.md` §30) — never a
 * fabricated or synthesized historical position.
 */
export const LEGACY_UNVERIFIED = 'LEGACY_UNVERIFIED' as const
export type LegacyUnverified = typeof LEGACY_UNVERIFIED
