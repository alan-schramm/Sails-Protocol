/**
 * Canonical Evaluator Identity & Canonical Semantic Profile Identity.
 *
 * `docs/CORE_IMPLEMENTATION_ARCHITECTURE.md` §5-7. This file implements
 * the MINIMUM representation needed to prevent later architectural
 * inversion — it deliberately does not implement a registry, a
 * publication mechanism, certification, or a conformance-vector harness
 * (all explicitly M2 scope). What it does fix, now, on purpose: neither
 * identity is ever a Module/npm package name or version, and neither is
 * ever conflated with the other or with Ruleset identity.
 *
 * "A Canonical Evaluator Identity is legitimate only if it resolves to
 * a publicly identifiable semantic behavioral definition" — that
 * requirement is a property of the *governance process* that assigns
 * and publishes these identities, not something a TypeScript type can
 * enforce; this module only fixes the identity's *shape*, never the
 * publication discipline around it.
 */
import { Brand } from './identifiers'

export type CanonicalEvaluatorIdentity = Brand<
  { readonly name: string; readonly version: string },
  'CanonicalEvaluatorIdentity'
>

export function createCanonicalEvaluatorIdentity(name: string, version: string): CanonicalEvaluatorIdentity {
  if (name.length === 0 || version.length === 0) {
    throw new Error('CanonicalEvaluatorIdentity requires a non-empty name and version')
  }
  return { name, version } as CanonicalEvaluatorIdentity
}

export type CanonicalSemanticProfileIdentity = Brand<
  { readonly name: string; readonly version: string },
  'CanonicalSemanticProfileIdentity'
>

export function createCanonicalSemanticProfileIdentity(
  name: string,
  version: string,
): CanonicalSemanticProfileIdentity {
  if (name.length === 0 || version.length === 0) {
    throw new Error('CanonicalSemanticProfileIdentity requires a non-empty name and version')
  }
  return { name, version } as CanonicalSemanticProfileIdentity
}

export function evaluatorIdentityEquals(
  a: CanonicalEvaluatorIdentity,
  b: CanonicalEvaluatorIdentity,
): boolean {
  return a.name === b.name && a.version === b.version
}

export function profileIdentityEquals(
  a: CanonicalSemanticProfileIdentity,
  b: CanonicalSemanticProfileIdentity,
): boolean {
  return a.name === b.name && a.version === b.version
}
