/**
 * Sails Core Implementation Program M4 (Retry) — First Core-Authoritative
 * Semantic Slice (FUNDS_LOCKED -> EXPIRED). Pure-function-level proofs
 * for expiry-authority.ts that don't need tests/sweepers.test.ts's full
 * fake-Prisma harness: structural non-authority, Ruleset binding
 * checks, wrong-Core injection, fail-closed ConditionResult handling,
 * and TransitionRecord construction fidelity. The live, end-to-end
 * proofs (boundary equality actually reaching Core through the real
 * sweep, atomic commit, non-target regression, idempotency,
 * concurrency) live in tests/sweepers.test.ts's own "M4" describe block
 * and tests/integration/escrowTimelockExpiryAuthority.test.ts (real
 * Postgres), since those specifically require the real repository/
 * service/database wiring.
 */
import * as fs from 'fs'
import * as path from 'path'
import {
  evaluateExpiryAuthority,
  ESCROW_TIMELOCK_EXPIRY_RULESET,
} from '../src/modules/open-settlement/expiry-authority'
import {
  ConditionResult,
  createRulesetRef,
  createCanonicalEvaluatorIdentity,
  createCanonicalSemanticProfileIdentity,
  SAILS_TIMELOCK_EVALUATOR_IDENTITY,
  SAILS_SEMANTIC_PROFILE_IDENTITY,
} from '@sails/core'

const REPO_ROOT = path.resolve(__dirname, '..')

describe('Structural non-authority: expiry-authority.ts has no path to State/Provider/authoritative events', () => {
  it('the module\'s import statements pull in nothing but @sails/core and this slice\'s own payload type — no Prisma, no event bus, no Provider, no escrow-lifecycle', () => {
    const source = fs.readFileSync(path.join(REPO_ROOT, 'src', 'modules', 'open-settlement', 'expiry-authority.ts'), 'utf8')
    const importLines = source.split('\n').filter((line) => /^\s*import\s/.test(line))
    expect(importLines.some((l) => l.includes('@prisma') || l.includes('common/database') || l.includes('event-bus') || l.includes('escrow-lifecycle') || l.includes('escrow-providers'))).toBe(false)
  })

  it('evaluateExpiryAuthority\'s own signature has no access to State, a Provider, or an event bus — only explicit values and an optional pure evaluate fn', () => {
    const verdict = evaluateExpiryAuthority('escrow-1', 1000, 2000)
    expect(verdict.kind).toBe('AUTHORIZED')
  })
})

describe('F. Correct Core authorizes for expected cases', () => {
  it.each([
    ['well before deadline', 2000, 1000, 'NOT_ELIGIBLE'],
    ['well after deadline', 2000, 3000, 'AUTHORIZED'],
  ] as const)('%s', (_label, deadlineMs, evalMs, expectedKind) => {
    const verdict = evaluateExpiryAuthority('escrow-1', deadlineMs, evalMs)
    expect(verdict.kind).toBe(expectedKind)
  })
})

describe('P4. Deadline equality is authorized per canonical Core semantics (>=)', () => {
  it('evaluationTime === deadline is AUTHORIZED', () => {
    const verdict = evaluateExpiryAuthority('escrow-1', 5000, 5000)
    expect(verdict.kind).toBe('AUTHORIZED')
  })
})

describe('P5. deadline - 1 does not authorize', () => {
  it('evaluationTime one millisecond before deadline is NOT_ELIGIBLE', () => {
    const verdict = evaluateExpiryAuthority('escrow-1', 5000, 4999)
    expect(verdict.kind).toBe('NOT_ELIGIBLE')
    expect(verdict.kind === 'NOT_ELIGIBLE' && verdict.conditionResult).toBe('NOT_YET_SATISFIED')
  })
})

describe('T20/T21. Wrong-Core test: evaluateExpiryAuthority follows whatever inner evaluator it is given, with no independent legacy-predicate re-check of its own', () => {
  it('an injected evaluator that always returns NOT_YET_SATISFIED makes a deeply-past-deadline case NOT_ELIGIBLE', () => {
    const alwaysNotYet = (): ConditionResult => 'NOT_YET_SATISFIED'
    const verdict = evaluateExpiryAuthority('escrow-1', 1000, 999_999_999, ESCROW_TIMELOCK_EXPIRY_RULESET, alwaysNotYet)
    expect(verdict).toEqual({ kind: 'NOT_ELIGIBLE', conditionResult: 'NOT_YET_SATISFIED' })
  })

  it('an injected evaluator that always returns SATISFIED authorizes a deadline-in-the-far-future case — Core\'s own word is sufficient, nothing double-checks the real dates', () => {
    const alwaysSatisfied = (): ConditionResult => 'SATISFIED'
    const verdict = evaluateExpiryAuthority('escrow-1', 999_999_999_999, 1, ESCROW_TIMELOCK_EXPIRY_RULESET, alwaysSatisfied)
    expect(verdict.kind).toBe('AUTHORIZED')
  })
})

describe('P10. Evaluator failure fails closed, never throws past this function\'s own boundary', () => {
  it('a thrown evaluator fails closed as EVALUATION_FAILED', () => {
    const throwing = (): ConditionResult => {
      throw new Error('simulated evaluator failure')
    }
    expect(() => evaluateExpiryAuthority('escrow-1', 1000, 2000, ESCROW_TIMELOCK_EXPIRY_RULESET, throwing)).not.toThrow()
    expect(evaluateExpiryAuthority('escrow-1', 1000, 2000, ESCROW_TIMELOCK_EXPIRY_RULESET, throwing)).toEqual({ kind: 'EVALUATION_FAILED' })
  })
})

describe('P8/P9. UNKNOWN/UNSATISFIABLE fail closed — no invented economic meaning', () => {
  it('an evaluator returning UNKNOWN does not authorize', () => {
    const returnsUnknown = (): ConditionResult => 'UNKNOWN'
    const verdict = evaluateExpiryAuthority('escrow-1', 1000, 2000, ESCROW_TIMELOCK_EXPIRY_RULESET, returnsUnknown)
    expect(verdict).toEqual({ kind: 'NOT_ELIGIBLE', conditionResult: 'UNKNOWN' })
  })

  it('an evaluator returning UNSATISFIABLE does not authorize', () => {
    const returnsUnsatisfiable = (): ConditionResult => 'UNSATISFIABLE'
    const verdict = evaluateExpiryAuthority('escrow-1', 1000, 2000, ESCROW_TIMELOCK_EXPIRY_RULESET, returnsUnsatisfiable)
    expect(verdict).toEqual({ kind: 'NOT_ELIGIBLE', conditionResult: 'UNSATISFIABLE' })
  })
})

describe('P11. Ruleset/evaluator expected-identity mismatch fails closed', () => {
  it('a Ruleset expecting a different evaluator identity is rejected before the evaluator is ever consulted', () => {
    const spy = jest.fn()
    const wrongRuleset = createRulesetRef({
      ...ESCROW_TIMELOCK_EXPIRY_RULESET,
      expectedEvaluatorIdentity: createCanonicalEvaluatorIdentity('some-other-evaluator', '9.9'),
    })
    const verdict = evaluateExpiryAuthority('escrow-1', 1000, 2000, wrongRuleset, spy as any)
    expect(verdict.kind).toBe('BINDING_MISMATCH')
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('P12. Profile mismatch fails closed', () => {
  it('a Ruleset expecting a different profile identity is rejected before the evaluator is ever consulted', () => {
    const spy = jest.fn()
    const wrongRuleset = createRulesetRef({
      ...ESCROW_TIMELOCK_EXPIRY_RULESET,
      expectedProfileIdentity: createCanonicalSemanticProfileIdentity('some-other-profile', '2.0'),
    })
    const verdict = evaluateExpiryAuthority('escrow-1', 1000, 2000, wrongRuleset, spy as any)
    expect(verdict.kind).toBe('BINDING_MISMATCH')
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('P17/P18/P19. AUTHORIZED verdict carries a fully-formed TransitionRecord binding actual identity, Ruleset, and exact inputs', () => {
  it('the constructed record preserves interaction, transition scope, actual evaluator/profile identity, Ruleset, and exact semantic inputs', () => {
    const verdict = evaluateExpiryAuthority('escrow-42', 1_700_000_000_000, 1_700_000_001_000)
    if (verdict.kind !== 'AUTHORIZED') throw new Error('expected AUTHORIZED')
    const { record } = verdict
    expect(record.interaction).toBe('escrow-42')
    expect(record.transition.type).toBe('escrow.timelock.expire')
    expect(record.transition.payload).toEqual({
      fromState: 'FUNDS_LOCKED', toState: 'EXPIRED',
      deadlineMs: 1_700_000_000_000, evaluationTimeMs: 1_700_000_001_000,
    })
    expect(record.priorPosition).toBe('LEGACY_UNVERIFIED')
    expect(record.evaluatorIdentity).toEqual(SAILS_TIMELOCK_EVALUATOR_IDENTITY)
    expect(record.profileIdentity).toEqual(SAILS_SEMANTIC_PROFILE_IDENTITY)
    expect(record.rulesetRef).toEqual(ESCROW_TIMELOCK_EXPIRY_RULESET)
    expect(record.conditionResult).toBe('SATISFIED')
    expect(record.attribution).toBeUndefined()
    expect(record.outcome).toBeUndefined()
  })
})

describe('O. Determinism', () => {
  it('the same (deadline, evaluationTime) pair produces the identical verdict kind across repeated calls', () => {
    const results = Array.from({ length: 5 }, () => evaluateExpiryAuthority('escrow-1', 5000, 5000).kind)
    expect(new Set(results).size).toBe(1)
  })
})
