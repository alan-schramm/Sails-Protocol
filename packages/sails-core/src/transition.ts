/**
 * CandidateTransition & TransitionRecord.
 *
 * `docs/CORE_ARCHITECTURE.md` §20 and
 * `docs/CORE_IMPLEMENTATION_ARCHITECTURE.md` §12-13. A CandidateTransition
 * is a concrete instance invoking a named, Ruleset-defined Transition
 * type with specific arguments — the Ruleset itself (not implemented in
 * this file; deferred, see the module README) owns the *definition* of
 * what that named type means.
 *
 * TransitionRecord is the durable, authoritative artifact: no semantic
 * decision may become Core-authoritative before a durable Record for
 * that decision class exists. Its shape here is deliberately minimal
 * and CONDITIONAL — attribution material is present only when K2
 * applies, an Outcome only when K3 applies — never a maximal record
 * forcing both fields to exist regardless of whether discretion or an
 * economic outcome was actually involved.
 *
 * Two things this file deliberately does NOT do, both attacked and
 * rejected during architecture validation:
 *  - no standalone `semanticProvenance` field ("which state fields/
 *    observations were consulted") — fully reconstructible from the
 *    evaluator's own published input contract (M2+) combined with the
 *    consulted material already named in `SemanticHistoryPosition`,
 *    making a separate field redundant;
 *  - `DiscretionaryAttributionMaterial` never stores a bare
 *    `verified: true` conclusion — it carries the raw proof and the
 *    historically-resolved identity material a future, independent
 *    verifier actually needs, never an unverifiable cached boolean.
 *
 * Attribution *verification logic* (signature checking, identity
 * resolution) is out of scope for this mission — see M5 in
 * `docs/CORE_IMPLEMENTATION_ARCHITECTURE.md` §29 — this file only fixes
 * the minimal envelope shape needed to type `TransitionRecord`'s
 * conditional field correctly.
 */
import { ActorId, InteractionId, TransitionTypeId } from './identifiers'
import { ConditionResult } from './condition-result'
import { RulesetRef } from './ruleset'
import { CanonicalEvaluatorIdentity, CanonicalSemanticProfileIdentity } from './evaluator-identity'
import { SemanticHistoryPosition, LegacyUnverified } from './semantic-history-position'
import { Outcome } from './outcome'

export interface CandidateTransition<TPayload = unknown> {
  readonly interaction: InteractionId
  readonly type: TransitionTypeId
  /** Opaque, Ruleset/Module-defined proposal content. */
  readonly payload: TPayload
}

export function createCandidateTransition<TPayload = unknown>(input: {
  readonly interaction: InteractionId
  readonly type: TransitionTypeId
  readonly payload: TPayload
}): CandidateTransition<TPayload> {
  return { ...input }
}

/**
 * Minimal envelope only — see this file's own header for why
 * verification logic is out of scope here. `rawProof` and
 * `resolvedIdentityReference` are both opaque: their concrete shape is
 * a K2-realization concern (a signature, a threshold-proof set, a
 * delegation credential, ...), never something Core interprets.
 */
export interface DiscretionaryAttributionMaterial {
  readonly actor: ActorId
  readonly rawProof: unknown
  readonly resolvedIdentityReference: unknown
}

export interface TransitionRecordBase<TPayload = unknown> {
  readonly interaction: InteractionId
  readonly priorPosition: SemanticHistoryPosition | LegacyUnverified
  readonly transition: CandidateTransition<TPayload>
  readonly rulesetRef: RulesetRef
  readonly evaluatorIdentity: CanonicalEvaluatorIdentity
  readonly profileIdentity: CanonicalSemanticProfileIdentity
  readonly conditionResult: ConditionResult
}

/**
 * `attribution` is present only when this decision depended on
 * discretionary judgment (K2); `outcome` is present only when this
 * transition actually authorized an economic outcome (K3). Neither is
 * ever populated merely because the shape allows it.
 */
export type TransitionRecord<TPayload = unknown, TOutcomeContent = unknown, TDestination = unknown> =
  TransitionRecordBase<TPayload> & {
    readonly attribution?: DiscretionaryAttributionMaterial
    readonly outcome?: Outcome<TOutcomeContent, TDestination>
  }

export function createTransitionRecord<TPayload = unknown, TOutcomeContent = unknown, TDestination = unknown>(
  input: TransitionRecordBase<TPayload> & {
    readonly attribution?: DiscretionaryAttributionMaterial
    readonly outcome?: Outcome<TOutcomeContent, TDestination>
  },
): TransitionRecord<TPayload, TOutcomeContent, TDestination> {
  return { ...input }
}
