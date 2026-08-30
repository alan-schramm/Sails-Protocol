/**
 * Generalized attributed-discretion evaluation — Sails Core
 * Implementation Program M5.
 *
 * `docs/SEMANTIC_KERNEL.md` §6 (K2 — Attributed Discretion): "When a
 * state change depends on discretionary judgment, it must be
 * attributable to a specific actor and bound to that exact interaction
 * and transition — never inferred from whoever executes it."
 * `docs/CORE_ARCHITECTURE.md` §28 lists Actor/attribution material as
 * conditionally-required (only when K2 applies) and §32 lists
 * "evaluate discretionary attribution, when K2 applies" as a Core
 * capability; §28 also states a role-eligibility check ("does Actor X
 * currently hold Role R") is itself an ordinary evaluated condition —
 * this file follows that lead and expresses attribution as another
 * `LeafEvaluator`, reusing the exact same identity/profile/conformance
 * machinery M2 already built for the timelock evaluator, rather than
 * inventing a parallel mechanism.
 *
 * MECHANICAL BOUNDARY (why this file contains no cryptography): M0's
 * boundary forbids any external dependency inside `packages/sails-core/src`
 * — a real Ed25519/secp256k1 verification library cannot be imported
 * here without violating it, and `docs/CORE_ARCHITECTURE.md` §42
 * disclaims any "trustless Runtime" claim regardless. Verification
 * therefore happens in the Runtime/Identity layer (this Reference
 * Implementation reuses Mission13's own, unmodified
 * `verifyAuthorityDecisionSignature`, `src/modules/open-settlement/discretionary-authority.ts`),
 * which reduces its own cryptographic conclusion to one explicit,
 * already-computed boolean (`proofVerified`) before this evaluator ever
 * runs — the exact same "explicit committed input, never an implicit
 * capability" discipline `time.ts` already established for
 * `EvaluationTime` (Core never reads a clock; here, Core never runs a
 * signature check).
 *
 * WHAT THIS EVALUATOR DOES NOT DO — the boundaries this file is
 * deliberately narrow about:
 *   - It does not decide WHO is an acceptable authority for a given
 *     interaction (e.g. "is this actor the dispute's assigned
 *     arbiter") — that is domain/ruleset policy (`checkRulesetBinding()`'s
 *     own precedent: Core checks pure structural consistency of already-
 *     resolved material, never behavioral/eligibility conformance).
 *   - It does not interpret the decision's own economic content
 *     (RELEASE vs. REFUND vs. a split ratio) — that stays fully opaque,
 *     folded into `contentCommitment`, exactly like `RulesetRef.commitment`
 *     already treats Ruleset content as opaque-but-comparable.
 *   - It never produces `verified: true` as stored historical truth on
 *     its own — see `transition.ts`'s own `DiscretionaryAttributionMaterial`
 *     (frozen, M1), which has no such field; this evaluator's ConditionResult
 *     is a live judgment about the SUBMITTED claim, not a cached conclusion.
 */
import { ActorId, InteractionId, TransitionTypeId } from './identifiers'
import { SemanticCommitment } from './ruleset'
import { ConditionResult } from './condition-result'
import { createCanonicalEvaluatorIdentity } from './evaluator-identity'
import { LeafEvaluator } from './leaf-evaluator'

/**
 * What the submitted authorization material itself CLAIMS to cover —
 * assembled by the Runtime/domain layer from a verified, resolved
 * decision (e.g. Mission13's `AuthorityDecisionPayload`, unchanged).
 * `proofVerified` is the one cryptographic conclusion Core is allowed
 * to consume, always computed BEFORE this evaluator runs, never inside
 * it.
 */
export interface AttributionClaim {
  readonly actor: ActorId
  readonly claimedInteraction: InteractionId
  readonly claimedTransitionType: TransitionTypeId
  readonly claimedContentCommitment: SemanticCommitment
  readonly proofVerified: boolean
}

/** What is ACTUALLY being evaluated right now — the real interaction, the real candidate transition, and the real content commitment computed from the actual candidate payload. */
export interface AttributionContext {
  readonly interaction: InteractionId
  readonly transitionType: TransitionTypeId
  readonly contentCommitment: SemanticCommitment
}

export interface AttributionEvaluationInput {
  readonly claim: AttributionClaim
  readonly context: AttributionContext
}

export const SAILS_ATTRIBUTION_EVALUATOR_IDENTITY = createCanonicalEvaluatorIdentity('sails-attribution-evaluator', '1.0')

/**
 * output = SATISFIED only if the proof was independently verified AND
 * the claim binds to the exact interaction, exact transition type, and
 * exact decision-content commitment being evaluated — otherwise
 * UNSATISFIABLE. Matches the published semantic definition's own `rule`
 * field exactly.
 *
 * Never reaches NOT_YET_SATISFIED or UNKNOWN for valid explicit inputs:
 * unlike a timelock (which can genuinely become satisfied later),
 * attribution for one specific submitted claim is either valid now or
 * it never will be for that exact claim — resubmitting the identical,
 * mismatched material can never change the outcome. This is the
 * complementary state pair to the timelock evaluator's own
 * SATISFIED/NOT_YET_SATISFIED — a second, independent illustration that
 * different evaluators legitimately reach different halves of the same
 * frozen four-state vocabulary.
 */
export const referenceAttributionEvaluator: LeafEvaluator<AttributionEvaluationInput> = {
  identity: SAILS_ATTRIBUTION_EVALUATOR_IDENTITY,
  evaluate: ({ claim, context }): ConditionResult => {
    if (!claim.proofVerified) return 'UNSATISFIABLE'
    if (claim.claimedInteraction !== context.interaction) return 'UNSATISFIABLE'
    if (claim.claimedTransitionType !== context.transitionType) return 'UNSATISFIABLE'
    if (claim.claimedContentCommitment !== context.contentCommitment) return 'UNSATISFIABLE'
    return 'SATISFIED'
  },
}
