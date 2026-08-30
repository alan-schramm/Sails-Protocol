/**
 * RulesetRef — hybrid semantic identity.
 *
 * `docs/CORE_ARCHITECTURE.md` §17 and the Implementation Architecture's
 * own §H/§I: a Ruleset identity is never sufficient as a bare
 * version number. It binds a human-readable name (display only, no
 * semantic weight), a stable identity+version (addressing), a content
 * commitment (integrity — detects substitution under the same
 * name/version), and the *expected* Canonical Evaluator Identity and
 * Canonical Semantic Profile identity/version that must interpret it.
 *
 * Ruleset/evaluator *admission* (recognizing whether a given
 * combination is trusted for use) is explicitly deferred — this file
 * only fixes the reference *shape*, per
 * `docs/CORE_IMPLEMENTATION_ARCHITECTURE.md` §14.
 */
import { Brand } from './identifiers'
import {
  CanonicalEvaluatorIdentity,
  CanonicalSemanticProfileIdentity,
  evaluatorIdentityEquals,
  profileIdentityEquals,
} from './evaluator-identity'

/**
 * An opaque, mechanism-agnostic content commitment. Deliberately
 * `unknown` at this layer — `docs/CORE_ARCHITECTURE.md` §16 leaves the
 * encoding mechanism open (a hash, a signed registry entry, or another
 * scheme), and Core never inspects a commitment's internal shape, only
 * compares two for equality via whatever equality the Runtime/Module
 * layer supplying them defines.
 */
export type SemanticCommitment = Brand<unknown, 'SemanticCommitment'>

export interface RulesetRef {
  /** Display only — carries no semantic weight and is never compared. */
  readonly name: string
  readonly identity: string
  readonly version: string
  readonly commitment: SemanticCommitment
  readonly expectedEvaluatorIdentity: CanonicalEvaluatorIdentity
  readonly expectedProfileIdentity: CanonicalSemanticProfileIdentity
}

export function createRulesetRef(input: {
  readonly name: string
  readonly identity: string
  readonly version: string
  readonly commitment: SemanticCommitment
  readonly expectedEvaluatorIdentity: CanonicalEvaluatorIdentity
  readonly expectedProfileIdentity: CanonicalSemanticProfileIdentity
}): RulesetRef {
  if (input.identity.length === 0 || input.version.length === 0) {
    throw new Error('RulesetRef requires a non-empty identity and version')
  }
  return { ...input }
}

export type RulesetBindingCheck =
  | { readonly consistent: true }
  | { readonly consistent: false; readonly reason: string }

/**
 * Core's own pure structural consistency check — never a behavioral
 * conformance judgment (that remains Runtime/governance admission,
 * `docs/CORE_IMPLEMENTATION_ARCHITECTURE.md` §23). This is exactly the
 * comparison that must reject an evaluation *before* any semantic
 * evaluation proceeds when the actually-supplied evaluator or profile
 * identity does not match what the Ruleset itself declares as expected
 * — a deterministic, pure identifier comparison, never an inference of
 * behavioral conformance from identity-label equality.
 */
export function checkRulesetBinding(
  ruleset: RulesetRef,
  actual: {
    readonly evaluatorIdentity: CanonicalEvaluatorIdentity
    readonly profileIdentity: CanonicalSemanticProfileIdentity
  },
): RulesetBindingCheck {
  if (!evaluatorIdentityEquals(ruleset.expectedEvaluatorIdentity, actual.evaluatorIdentity)) {
    return {
      consistent: false,
      reason: `expected evaluator identity ${ruleset.expectedEvaluatorIdentity.name}@${ruleset.expectedEvaluatorIdentity.version}, got ${actual.evaluatorIdentity.name}@${actual.evaluatorIdentity.version}`,
    }
  }
  if (!profileIdentityEquals(ruleset.expectedProfileIdentity, actual.profileIdentity)) {
    return {
      consistent: false,
      reason: `expected profile identity ${ruleset.expectedProfileIdentity.name}@${ruleset.expectedProfileIdentity.version}, got ${actual.profileIdentity.name}@${actual.profileIdentity.version}`,
    }
  }
  return { consistent: true }
}
