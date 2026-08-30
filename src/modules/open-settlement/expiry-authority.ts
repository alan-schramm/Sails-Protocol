/**
 * expiry-authority.ts — Sails Core Implementation Program M4 (Retry) —
 * First Core-Authoritative Semantic Slice: FUNDS_LOCKED -> EXPIRED.
 *
 * THIS MODULE IS THE SOLE SEMANTIC AUTHORITY for one narrow question:
 * is a FUNDS_LOCKED signature-collection escrow's timelock eligible for
 * the EXPIRED transition right now? An `AUTHORIZED` verdict from
 * `evaluateExpiryAuthority` is what escrow.service.ts's
 * sweepExpiredEscrows() actually acts on via the M3.5 atomic commit
 * path (semantic-transition-record.ts's commitAuthoritativeEscrowTimelockExpiry) —
 * there is no second, legacy check downstream that could veto or
 * override it for this transition.
 *
 * This supersedes the pre-M3.5 prototype of the same name (preserved,
 * never merged, on the local branch preserve/m4-authority-transfer-experiment):
 * that version returned a bare boolean and called the legacy
 * claimEscrowTransition()/emitEscrowTransition() pair directly, with no
 * durable Transition Record — exactly the gap M3.5 exists to close.
 * This version constructs a real, durable-persistable Core
 * `TransitionRecord` (binding the actual evaluator/profile identity,
 * the Ruleset, and the exact committed inputs) whenever it authorizes
 * a transition, and performs the M1 Ruleset structural-consistency
 * check (`checkRulesetBinding`) before ever consulting the evaluator —
 * both requirements this repository's architecture did not yet support
 * when the prototype was written.
 *
 * What did NOT migrate, and never will via this module:
 *   - State-transition COMMIT authority: still exclusively
 *     commitAuthoritativeEscrowTimelockExpiry()'s atomic transaction
 *     (claimTransition + SemanticTransitionRecord insert, M3.5/M3.5-V).
 *   - Event-emission authority: still exclusively emitEscrowTransition(),
 *     called only after that atomic commit actually succeeds.
 *   - Execution/fund-movement/Provider authority: this module has no
 *     import of Prisma, the event bus, or any Provider — proven
 *     structurally in tests/expiryAuthority.test.ts's import-statement
 *     scan, the same technique M3's own tests already established.
 */
import {
  createEvaluationTime,
  referenceTimelockEvaluator,
  ConditionResult,
  TimelockInput,
  checkRulesetBinding,
  RulesetRef,
  SAILS_TIMELOCK_EVALUATOR_IDENTITY,
  SAILS_SEMANTIC_PROFILE_IDENTITY,
  createTransitionRecord,
  createInteractionId,
  createTransitionTypeId,
  createCandidateTransition,
  LEGACY_UNVERIFIED,
  TransitionRecord,
} from '@sails/core'
import type { EscrowTimelockExpiryPayload } from './semantic-transition-record'

type EvaluateFn = (input: TimelockInput) => ConditionResult

/**
 * The Ruleset governing this decision (conformance/rulesets/sails-escrow-timelock-expiry-ruleset-1.0.json,
 * M3.5) — the same published identity/version/commitment/expected-
 * evaluator/expected-profile values, kept in sync by hand (no registry
 * exists yet to load this from, per that JSON's own commitmentNote).
 */
export const ESCROW_TIMELOCK_EXPIRY_RULESET: RulesetRef = {
  name: 'Sails Escrow Timelock Expiry Ruleset',
  identity: 'sails-escrow-timelock-expiry-ruleset',
  version: '1.0',
  commitment: 'sails-escrow-timelock-expiry-ruleset@1.0:evaluationTime>=deadline' as unknown as RulesetRef['commitment'],
  expectedEvaluatorIdentity: SAILS_TIMELOCK_EVALUATOR_IDENTITY,
  expectedProfileIdentity: SAILS_SEMANTIC_PROFILE_IDENTITY,
}

export type ExpiryAuthorityVerdict =
  | { readonly kind: 'AUTHORIZED'; readonly record: TransitionRecord<EscrowTimelockExpiryPayload> }
  | { readonly kind: 'NOT_ELIGIBLE'; readonly conditionResult: ConditionResult }
  | { readonly kind: 'BINDING_MISMATCH'; readonly reason: string }
  | { readonly kind: 'EVALUATION_FAILED' }

/**
 * Pure: explicit (escrowId, deadlineMs, evaluationTimeMs, rulesetRef)
 * in, a verdict out. No hidden clock, no database access, no Runtime
 * access, no Provider state, no mutable global.
 *
 * `evaluate` defaults to the real reference evaluator and is never
 * overridden by any production caller — the parameter exists solely so
 * tests can inject a deliberately wrong inner evaluator and prove this
 * function has no independent legacy-predicate re-check of its own
 * (the same test-only-injection precedent M3's compareExpiryShadow()
 * and the pre-M3.5 expiry-authority.ts prototype already established —
 * not new production configuration/substitution machinery).
 *
 * Fails closed on every non-SATISFIED path: NOT_YET_SATISFIED,
 * UNSATISFIABLE, and UNKNOWN are all folded into NOT_ELIGIBLE (no
 * transition, no economic meaning invented for the distinction between
 * them — this evaluator's own published semantics make UNSATISFIABLE/
 * UNKNOWN architecturally unreachable for valid inputs in the first
 * place); a thrown evaluator or a Ruleset binding mismatch each get
 * their own distinct verdict so a caller can tell "ordinary, not yet
 * due" apart from "a genuine anomaly worth surfacing loudly."
 */
export function evaluateExpiryAuthority(
  escrowId: string,
  deadlineMs: number,
  evaluationTimeMs: number,
  rulesetRef: RulesetRef = ESCROW_TIMELOCK_EXPIRY_RULESET,
  evaluate: EvaluateFn = referenceTimelockEvaluator.evaluate,
): ExpiryAuthorityVerdict {
  const bindingCheck = checkRulesetBinding(rulesetRef, {
    evaluatorIdentity: SAILS_TIMELOCK_EVALUATOR_IDENTITY,
    profileIdentity: SAILS_SEMANTIC_PROFILE_IDENTITY,
  })
  if (!bindingCheck.consistent) {
    return { kind: 'BINDING_MISMATCH', reason: bindingCheck.reason }
  }

  let conditionResult: ConditionResult
  try {
    conditionResult = evaluate({
      deadline: createEvaluationTime(deadlineMs),
      evaluationTime: createEvaluationTime(evaluationTimeMs),
    })
  } catch {
    return { kind: 'EVALUATION_FAILED' }
  }

  if (conditionResult !== 'SATISFIED') {
    return { kind: 'NOT_ELIGIBLE', conditionResult }
  }

  const interaction = createInteractionId(escrowId)
  const record = createTransitionRecord<EscrowTimelockExpiryPayload>({
    interaction,
    priorPosition: LEGACY_UNVERIFIED,
    transition: createCandidateTransition({
      interaction,
      type: createTransitionTypeId('escrow.timelock.expire'),
      payload: { fromState: 'FUNDS_LOCKED', toState: 'EXPIRED', deadlineMs, evaluationTimeMs },
    }),
    rulesetRef,
    evaluatorIdentity: SAILS_TIMELOCK_EVALUATOR_IDENTITY,
    profileIdentity: SAILS_SEMANTIC_PROFILE_IDENTITY,
    conditionResult,
  })
  return { kind: 'AUTHORIZED', record }
}
