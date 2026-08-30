import {
  createCanonicalEvaluatorIdentity,
  createCanonicalSemanticProfileIdentity,
  evaluatorIdentityEquals,
  profileIdentityEquals,
} from '../src/evaluator-identity'
import { createRulesetRef, checkRulesetBinding, SemanticCommitment } from '../src/ruleset'

const commitment = 'sha256:deadbeef' as unknown as SemanticCommitment

describe('Canonical Evaluator / Profile Identity — never package version', () => {
  it('is a name+version pair, structurally distinct from an npm package.json shape', () => {
    const evaluator = createCanonicalEvaluatorIdentity('payments-evaluator', '1.0')
    // Deliberately NOT the same field names as package.json ("name" +
    // "version" happen to coincide, but nothing about this type reads
    // an actual npm/crate manifest, has no `dependencies`, no
    // `main`/`exports`, and is never compared against one).
    expect(Object.keys(evaluator).sort()).toEqual(['name', 'version'])
    expect(evaluator.name).toBe('payments-evaluator')
    expect(evaluator.version).toBe('1.0')
  })

  it('two evaluators with the same name but different version are distinct', () => {
    const v1 = createCanonicalEvaluatorIdentity('payments-evaluator', '1.0')
    const v2 = createCanonicalEvaluatorIdentity('payments-evaluator', '2.0')
    expect(evaluatorIdentityEquals(v1, v2)).toBe(false)
  })

  it('rejects an empty name or version', () => {
    expect(() => createCanonicalEvaluatorIdentity('', '1.0')).toThrow()
    expect(() => createCanonicalEvaluatorIdentity('payments-evaluator', '')).toThrow()
  })

  it('Profile identity and Evaluator identity are never conflated by a shared comparison function', () => {
    const evaluator = createCanonicalEvaluatorIdentity('shared-name', '1.0')
    const profile = createCanonicalSemanticProfileIdentity('shared-name', '1.0')
    // Structurally similar shapes (same field names, same values here),
    // but distinct semantic roles at the type level (Brand<..., 'Canonical
    // EvaluatorIdentity'> vs Brand<..., 'CanonicalSemanticProfileIdentity'>)
    // — enforced by having no single function that compares one against
    // the other; each identity kind has its own dedicated equality check.
    expect(evaluatorIdentityEquals(evaluator, evaluator)).toBe(true)
    expect(profileIdentityEquals(profile, profile)).toBe(true)
    expect(evaluator.name).toBe(profile.name)
    expect(evaluator.version).toBe(profile.version)
  })
})

describe('RulesetRef — hybrid identity, never bound to npm/package version', () => {
  const evaluatorIdentity = createCanonicalEvaluatorIdentity('payments-evaluator', '1.0')
  const profileIdentity = createCanonicalSemanticProfileIdentity('sails-profile', '1.0')

  it('carries name, identity, version, commitment, and expected evaluator/profile — nothing else', () => {
    const ref = createRulesetRef({
      name: 'P2P Trading Ruleset',
      identity: 'openp2p-trading',
      version: '1.0',
      commitment,
      expectedEvaluatorIdentity: evaluatorIdentity,
      expectedProfileIdentity: profileIdentity,
    })
    expect(Object.keys(ref).sort()).toEqual(
      ['commitment', 'expectedEvaluatorIdentity', 'expectedProfileIdentity', 'identity', 'name', 'version'].sort(),
    )
  })

  it('rejects an empty identity or version', () => {
    expect(() =>
      createRulesetRef({
        name: 'x',
        identity: '',
        version: '1.0',
        commitment,
        expectedEvaluatorIdentity: evaluatorIdentity,
        expectedProfileIdentity: profileIdentity,
      }),
    ).toThrow()
  })
})

describe("checkRulesetBinding — Core's own pure structural consistency check", () => {
  const expectedEvaluator = createCanonicalEvaluatorIdentity('payments-evaluator', '1.0')
  const expectedProfile = createCanonicalSemanticProfileIdentity('sails-profile', '1.0')
  const ruleset = createRulesetRef({
    name: 'P2P Trading Ruleset',
    identity: 'openp2p-trading',
    version: '1.0',
    commitment,
    expectedEvaluatorIdentity: expectedEvaluator,
    expectedProfileIdentity: expectedProfile,
  })

  it('is consistent when actual matches expected exactly', () => {
    const result = checkRulesetBinding(ruleset, {
      evaluatorIdentity: expectedEvaluator,
      profileIdentity: expectedProfile,
    })
    expect(result).toEqual({ consistent: true })
  })

  it('rejects a substituted evaluator identity (E1/P1 expected, E2/P1 actual)', () => {
    const wrongEvaluator = createCanonicalEvaluatorIdentity('payments-evaluator', '2.0')
    const result = checkRulesetBinding(ruleset, {
      evaluatorIdentity: wrongEvaluator,
      profileIdentity: expectedProfile,
    })
    expect(result.consistent).toBe(false)
    if (!result.consistent) expect(result.reason).toMatch(/evaluator identity/)
  })

  it('rejects a substituted profile identity (E1/P1 expected, E1/P2 actual)', () => {
    const wrongProfile = createCanonicalSemanticProfileIdentity('sails-profile', '2.0')
    const result = checkRulesetBinding(ruleset, {
      evaluatorIdentity: expectedEvaluator,
      profileIdentity: wrongProfile,
    })
    expect(result.consistent).toBe(false)
    if (!result.consistent) expect(result.reason).toMatch(/profile identity/)
  })
})
