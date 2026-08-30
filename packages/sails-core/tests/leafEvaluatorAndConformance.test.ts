import { runConformanceVectors, allPassed, ConformanceVector } from '../src/conformance'
import { createEvaluationTime } from '../src/time'
import { createCanonicalEvaluatorIdentity, createCanonicalSemanticProfileIdentity } from '../src/evaluator-identity'
import { referenceTimelockEvaluator, TimelockInput, SAILS_TIMELOCK_EVALUATOR_IDENTITY } from '../src/evaluators/timelock-evaluator'

const evaluatorIdentity = createCanonicalEvaluatorIdentity('sails-timelock-evaluator', '1.0')
const profileIdentity = createCanonicalSemanticProfileIdentity('sails-semantic-profile', '1.0')

function vector(id: string, deadline: number, evaluationTime: number, expectedOutput: ConformanceVector<TimelockInput>['expectedOutput']): ConformanceVector<TimelockInput> {
  return {
    vectorId: id,
    evaluatorIdentity,
    profileIdentity,
    semanticDefinitionReference: 'conformance/evaluators/sails-timelock-evaluator-1.0.json',
    input: { deadline: createEvaluationTime(deadline), evaluationTime: createEvaluationTime(evaluationTime) },
    expectedOutput,
  }
}

describe('referenceTimelockEvaluator — LeafEvaluator contract', () => {
  it('declares the canonical evaluator identity, not a package name/version', () => {
    expect(referenceTimelockEvaluator.identity).toBe(SAILS_TIMELOCK_EVALUATOR_IDENTITY)
    expect(referenceTimelockEvaluator.identity.name).toBe('sails-timelock-evaluator')
    expect(referenceTimelockEvaluator.identity.version).toBe('1.0')
  })

  it('is deterministic: repeated calls with the same input produce the same output', () => {
    const input: TimelockInput = { deadline: createEvaluationTime(1000), evaluationTime: createEvaluationTime(1000) }
    const results = Array.from({ length: 5 }, () => referenceTimelockEvaluator.evaluate(input))
    expect(new Set(results).size).toBe(1)
    expect(results[0]).toBe('SATISFIED')
  })

  it('reaches only SATISFIED and NOT_YET_SATISFIED, never UNSATISFIABLE or UNKNOWN', () => {
    const samples: TimelockInput[] = [
      { deadline: createEvaluationTime(0), evaluationTime: createEvaluationTime(0) },
      { deadline: createEvaluationTime(1000), evaluationTime: createEvaluationTime(999) },
      { deadline: createEvaluationTime(1000), evaluationTime: createEvaluationTime(1001) },
    ]
    const outputs = new Set(samples.map((s) => referenceTimelockEvaluator.evaluate(s)))
    expect(outputs).toEqual(new Set(['SATISFIED', 'NOT_YET_SATISFIED']))
  })
})

describe('runConformanceVectors — pure comparison primitive', () => {
  it('passes the correct evaluator against hand-built vectors, including the exact-deadline edge case', () => {
    const vectors = [
      vector('exact', 2000, 2000, 'SATISFIED'),
      vector('after', 2000, 2001, 'SATISFIED'),
      vector('before', 2000, 1999, 'NOT_YET_SATISFIED'),
    ]
    const outcomes = runConformanceVectors(referenceTimelockEvaluator.evaluate, vectors)
    expect(allPassed(outcomes)).toBe(true)
    expect(outcomes).toHaveLength(3)
  })

  it('never normalizes a mismatch into a pass — a deliberately wrong (>) evaluator fails the exact-deadline vector', () => {
    const wrongEvaluator = (input: TimelockInput): ReturnType<typeof referenceTimelockEvaluator.evaluate> =>
      (input.evaluationTime as unknown as number) > (input.deadline as unknown as number) ? 'SATISFIED' : 'NOT_YET_SATISFIED'

    const vectors = [vector('exact', 2000, 2000, 'SATISFIED')]
    const outcomes = runConformanceVectors(wrongEvaluator, vectors)
    expect(allPassed(outcomes)).toBe(false)
    expect(outcomes[0]).toEqual({ vectorId: 'exact', passed: false, expected: 'SATISFIED', actual: 'NOT_YET_SATISFIED' })
  })

  it('identity-spoofing evaluator: declaring the right identity does not make wrong behavior pass', () => {
    const spoofingEvaluator = {
      // Same identity value as the real evaluator...
      identity: SAILS_TIMELOCK_EVALUATOR_IDENTITY,
      // ...but deliberately wrong behavior (always SATISFIED, ignoring input).
      evaluate: (): 'SATISFIED' => 'SATISFIED',
    }
    expect(spoofingEvaluator.identity).toBe(referenceTimelockEvaluator.identity)

    const vectors = [vector('before', 2000, 1999, 'NOT_YET_SATISFIED')]
    const outcomes = runConformanceVectors(spoofingEvaluator.evaluate, vectors)
    // Recognized (same declared identity) but NOT conformant (wrong behavior).
    expect(allPassed(outcomes)).toBe(false)
  })

  it('vectorId/evaluatorIdentity/profileIdentity/semanticDefinitionReference are never compared', () => {
    const mismatchedLabelVector: ConformanceVector<TimelockInput> = {
      vectorId: 'deliberately-mislabeled',
      evaluatorIdentity: createCanonicalEvaluatorIdentity('some-other-evaluator', '9.9'),
      profileIdentity: createCanonicalSemanticProfileIdentity('some-other-profile', '9.9'),
      semanticDefinitionReference: 'not/a/real/path.json',
      input: { deadline: createEvaluationTime(2000), evaluationTime: createEvaluationTime(2000) },
      expectedOutput: 'SATISFIED',
    }
    const outcomes = runConformanceVectors(referenceTimelockEvaluator.evaluate, [mismatchedLabelVector])
    // Only input vs expectedOutput matters — the mislabeled documentation
    // fields never affect the comparison.
    expect(outcomes[0].passed).toBe(true)
  })
})
