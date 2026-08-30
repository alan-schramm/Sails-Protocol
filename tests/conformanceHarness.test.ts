/**
 * Proves the M2 conformance mechanism end to end against the REAL
 * `conformance/` files (not fixtures) — semantic definition resolution,
 * profile resolution, input-contract declaration, a correct evaluator
 * passing, a deliberately incorrect evaluator failing, an
 * identity-spoofing evaluator failing, evaluator/profile reference
 * mismatch rejection (reusing the M1 `checkRulesetBinding` mechanism
 * unchanged), determinism, and that every loaded vector/definition
 * value is a plain JSON-safe value a Rust/Go harness could consume
 * without any TypeScript-specific runtime behavior.
 */
import * as fs from 'fs'
import * as path from 'path'
import { checkEvaluatorConformance } from '../scripts/run-conformance-harness'
import { referenceTimelockEvaluator, TimelockInput } from '../packages/sails-core/src/evaluators/timelock-evaluator'
import { createCanonicalEvaluatorIdentity, createCanonicalSemanticProfileIdentity } from '../packages/sails-core/src/evaluator-identity'
import { createRulesetRef, checkRulesetBinding, SemanticCommitment } from '../packages/sails-core/src/ruleset'
import { checkDirectory } from '../scripts/check-core-boundary'

const REPO_ROOT = path.resolve(__dirname, '..')
const DEFINITION_PATH = path.join(REPO_ROOT, 'conformance', 'evaluators', 'sails-timelock-evaluator-1.0.json')
const PROFILE_PATH = path.join(REPO_ROOT, 'conformance', 'profiles', 'sails-semantic-profile-1.0.json')
const VECTORS_PATH = path.join(REPO_ROOT, 'conformance', 'vectors', 'sails-timelock-evaluator-1.0.vectors.json')

function isJsonSafe(value: unknown): boolean {
  if (value === null) return true
  const t = typeof value
  if (t === 'string' || t === 'boolean') return true
  if (t === 'number') return Number.isFinite(value as number) // excludes NaN/Infinity
  if (Array.isArray(value)) return value.every(isJsonSafe)
  if (t === 'object') {
    // Excludes Map, Set, Date, class instances with methods, etc. — a
    // plain object literal is the only object shape JSON.parse ever
    // produces, and this checks nothing smuggled a richer type in
    // after parsing.
    return Object.getPrototypeOf(value) === Object.prototype && Object.values(value as object).every(isJsonSafe)
  }
  return false // undefined, function, bigint, symbol
}

describe('A. Semantic definition resolution', () => {
  it('resolves via a stable, repository-relative path — no line numbers, no absolute developer paths', () => {
    expect(fs.existsSync(DEFINITION_PATH)).toBe(true)
    const relative = path.relative(REPO_ROOT, DEFINITION_PATH)
    expect(relative).toBe(path.join('conformance', 'evaluators', 'sails-timelock-evaluator-1.0.json'))
  })

  it('names the evaluator identity, profile identity, and vectors reference', () => {
    const def = JSON.parse(fs.readFileSync(DEFINITION_PATH, 'utf8'))
    expect(def.evaluatorIdentity).toEqual({ name: 'sails-timelock-evaluator', version: '1.0' })
    expect(def.semanticProfileIdentity).toEqual({ name: 'sails-semantic-profile', version: '1.0' })
    expect(def.conformanceVectors).toBe('conformance/vectors/sails-timelock-evaluator-1.0.vectors.json')
  })
})

describe('B. Semantic profile resolution', () => {
  it('resolves and declares the rules the timelock evaluator actually depends on', () => {
    expect(fs.existsSync(PROFILE_PATH)).toBe(true)
    const profile = JSON.parse(fs.readFileSync(PROFILE_PATH, 'utf8'))
    expect(profile.profileIdentity).toEqual({ name: 'sails-semantic-profile', version: '1.0' })
    expect(profile.rules.integerRepresentation).toBeDefined()
    expect(profile.rules.conditionResultRepresentation.values).toEqual([
      'SATISFIED',
      'NOT_YET_SATISFIED',
      'UNSATISFIABLE',
      'UNKNOWN',
    ])
  })

  it('explicitly discloses what it does NOT yet specify, rather than silently omitting it', () => {
    const profile = JSON.parse(fs.readFileSync(PROFILE_PATH, 'utf8'))
    expect(Array.isArray(profile.notSpecifiedByThisVersion)).toBe(true)
    expect(profile.notSpecifiedByThisVersion.length).toBeGreaterThan(0)
  })
})

describe('C. Evaluator input-contract declaration', () => {
  it('declares exactly the two inputs the reference implementation actually consumes', () => {
    const def = JSON.parse(fs.readFileSync(DEFINITION_PATH, 'utf8'))
    const declaredInputNames = def.inputs.map((i: { name: string }) => i.name).sort()
    expect(declaredInputNames).toEqual(['deadline', 'evaluationTime'])
  })

  it('declares which ConditionResult values are reachable, and states why the others are not', () => {
    const def = JSON.parse(fs.readFileSync(DEFINITION_PATH, 'utf8'))
    expect(def.output.reachableValues.sort()).toEqual(['NOT_YET_SATISFIED', 'SATISFIED'])
    expect(def.output.unreachableValues.sort()).toEqual(['UNKNOWN', 'UNSATISFIABLE'])
    expect(typeof def.output.rationale).toBe('string')
    expect(def.output.rationale.length).toBeGreaterThan(0)
  })
})

describe('D/E/F. Conformance harness — correct, incorrect, and identity-spoofing evaluators', () => {
  it('D: the real reference evaluator is recognized and conformant against the real vectors', () => {
    const report = checkEvaluatorConformance('sails-timelock-evaluator@1.0', referenceTimelockEvaluator, (raw) => raw as TimelockInput)
    expect(report.recognized).toBe(true)
    expect(report.outcomes.length).toBeGreaterThan(0)
    expect(report.conformant).toBe(true)
    expect(report.outcomes.every((o) => o.passed)).toBe(true)
  })

  it('E: a deliberately incorrect evaluator (> instead of >=) is recognized but NOT conformant', () => {
    const incorrectEvaluator = {
      identity: referenceTimelockEvaluator.identity,
      evaluate: (input: TimelockInput) =>
        (input.evaluationTime as unknown as number) > (input.deadline as unknown as number)
          ? ('SATISFIED' as const)
          : ('NOT_YET_SATISFIED' as const),
    }
    const report = checkEvaluatorConformance('sails-timelock-evaluator@1.0', incorrectEvaluator, (raw) => raw as TimelockInput)
    expect(report.recognized).toBe(true)
    expect(report.conformant).toBe(false)
    const exactDeadlineOutcome = report.outcomes.find((o) => o.vectorId === 'timelock-exactly-at-deadline')
    expect(exactDeadlineOutcome).toEqual({
      vectorId: 'timelock-exactly-at-deadline',
      passed: false,
      expected: 'SATISFIED',
      actual: 'NOT_YET_SATISFIED',
    })
  })

  it('F: identity spoofing — declaring the correct identity does not make wrong behavior pass', () => {
    const spoofingEvaluator = {
      identity: referenceTimelockEvaluator.identity, // exact same identity value
      evaluate: () => 'UNSATISFIABLE' as const, // deliberately, obviously wrong for every vector
    }
    expect(spoofingEvaluator.identity).toEqual(referenceTimelockEvaluator.identity)
    const report = checkEvaluatorConformance('sails-timelock-evaluator@1.0', spoofingEvaluator, (raw) => raw as TimelockInput)
    // Recognized: the identity resolves to a real definition.
    expect(report.recognized).toBe(true)
    // NOT conformant: recognized never implies behaviorally correct.
    expect(report.conformant).toBe(false)
    expect(report.outcomes.every((o) => !o.passed)).toBe(true)
  })
})

describe('G/H. Evaluator/Profile reference mismatch — reuses the unchanged M1 mechanism', () => {
  const commitment = 'sha256:deadbeef' as unknown as SemanticCommitment
  const expectedEvaluator = createCanonicalEvaluatorIdentity('sails-timelock-evaluator', '1.0')
  const expectedProfile = createCanonicalSemanticProfileIdentity('sails-semantic-profile', '1.0')
  const ruleset = createRulesetRef({
    name: 'Escrow Expiry Ruleset (conceptual, not wired into any Runtime)',
    identity: 'escrow-expiry',
    version: '1.0',
    commitment,
    expectedEvaluatorIdentity: expectedEvaluator,
    expectedProfileIdentity: expectedProfile,
  })

  it('G: a different evaluator version is rejected before any semantic evaluation would proceed', () => {
    const wrongEvaluatorIdentity = createCanonicalEvaluatorIdentity('sails-timelock-evaluator', '2.0')
    const result = checkRulesetBinding(ruleset, {
      evaluatorIdentity: wrongEvaluatorIdentity,
      profileIdentity: expectedProfile,
    })
    expect(result.consistent).toBe(false)
  })

  it('H: a different profile version is rejected the same way', () => {
    const wrongProfileIdentity = createCanonicalSemanticProfileIdentity('sails-semantic-profile', '2.0')
    const result = checkRulesetBinding(ruleset, {
      evaluatorIdentity: expectedEvaluator,
      profileIdentity: wrongProfileIdentity,
    })
    expect(result.consistent).toBe(false)
  })

  it('reference consistency success does not, by itself, prove behavioral conformance', () => {
    // Passing the structural check (right labels) and passing the
    // behavioral check (right vectors) are two genuinely independent
    // facts — demonstrated by combining a structurally-consistent
    // identity with a behaviorally-wrong implementation.
    const structuralResult = checkRulesetBinding(ruleset, {
      evaluatorIdentity: expectedEvaluator,
      profileIdentity: expectedProfile,
    })
    expect(structuralResult.consistent).toBe(true)

    const wrongImplementation = { identity: expectedEvaluator, evaluate: () => 'SATISFIED' as const }
    const behavioralReport = checkEvaluatorConformance('sails-timelock-evaluator@1.0', wrongImplementation, (raw) => raw as TimelockInput)
    expect(behavioralReport.conformant).toBe(false)
  })
})

describe('I. Determinism', () => {
  it('running the same conformance check twice produces identical results', () => {
    const first = checkEvaluatorConformance('sails-timelock-evaluator@1.0', referenceTimelockEvaluator, (raw) => raw as TimelockInput)
    const second = checkEvaluatorConformance('sails-timelock-evaluator@1.0', referenceTimelockEvaluator, (raw) => raw as TimelockInput)
    expect(first.outcomes).toEqual(second.outcomes)
    expect(first.conformant).toBe(second.conformant)
  })
})

describe('J. Vectors and definitions contain no TypeScript-only values', () => {
  it('the raw vector file parses into plain JSON-safe values only', () => {
    const rawVectors = JSON.parse(fs.readFileSync(VECTORS_PATH, 'utf8'))
    expect(isJsonSafe(rawVectors)).toBe(true)
    expect(Array.isArray(rawVectors)).toBe(true)
    expect(rawVectors.length).toBeGreaterThan(0)
  })

  it('the raw evaluator definition parses into plain JSON-safe values only', () => {
    const rawDefinition = JSON.parse(fs.readFileSync(DEFINITION_PATH, 'utf8'))
    expect(isJsonSafe(rawDefinition)).toBe(true)
  })

  it('the raw profile parses into plain JSON-safe values only', () => {
    const rawProfile = JSON.parse(fs.readFileSync(PROFILE_PATH, 'utf8'))
    expect(isJsonSafe(rawProfile)).toBe(true)
  })
})

describe('K. M0 boundary checker still passes after M2 additions', () => {
  it('finds zero violations across the now-larger packages/sails-core/src', () => {
    const srcDir = path.join(REPO_ROOT, 'packages', 'sails-core', 'src')
    const violations = checkDirectory(srcDir)
    if (violations.length > 0) {
      // eslint-disable-next-line no-console
      console.error(violations)
    }
    expect(violations).toEqual([])
  })
})
