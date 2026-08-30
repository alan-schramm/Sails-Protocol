import {
  CONDITION_RESULTS,
  ConditionResult,
  conditionAnd,
  conditionOr,
  conditionThreshold,
} from '../src/condition-result'

describe('ConditionResult — the frozen four-state vocabulary', () => {
  it('has exactly four, distinct values — no fifth state, no CONFLICTED', () => {
    expect(CONDITION_RESULTS).toHaveLength(4)
    expect(new Set(CONDITION_RESULTS).size).toBe(4)
    expect(CONDITION_RESULTS).toEqual(
      expect.arrayContaining(['SATISFIED', 'NOT_YET_SATISFIED', 'UNSATISFIABLE', 'UNKNOWN']),
    )
    // @ts-expect-error CONFLICTED must not be a valid ConditionResult
    const notAllowed: ConditionResult = 'CONFLICTED'
    void notAllowed
  })
})

describe('conditionAnd / conditionOr — algebraic properties', () => {
  const all = CONDITION_RESULTS

  it('is commutative', () => {
    for (const a of all) {
      for (const b of all) {
        expect(conditionAnd(a, b)).toBe(conditionAnd(b, a))
        expect(conditionOr(a, b)).toBe(conditionOr(b, a))
      }
    }
  })

  it('is associative', () => {
    for (const a of all) {
      for (const b of all) {
        for (const c of all) {
          expect(conditionAnd(a, conditionAnd(b, c))).toBe(conditionAnd(conditionAnd(a, b), c))
          expect(conditionOr(a, conditionOr(b, c))).toBe(conditionOr(conditionOr(a, b), c))
        }
      }
    }
  })

  it('is idempotent', () => {
    for (const a of all) {
      expect(conditionAnd(a, a)).toBe(a)
      expect(conditionOr(a, a)).toBe(a)
    }
  })

  // Explicit truth-table entries from docs/CORE_ARCHITECTURE.md §13,
  // re-verified during the Implementation Program's own Red Team.
  it.each([
    ['UNKNOWN', 'UNSATISFIABLE', 'UNSATISFIABLE'],
    ['UNKNOWN', 'SATISFIED', 'UNKNOWN'],
    ['UNKNOWN', 'NOT_YET_SATISFIED', 'UNKNOWN'],
    ['SATISFIED', 'NOT_YET_SATISFIED', 'NOT_YET_SATISFIED'],
  ] as const)('AND(%s, %s) = %s', (a, b, expected) => {
    expect(conditionAnd(a, b)).toBe(expected)
  })

  it.each([
    ['UNKNOWN', 'UNSATISFIABLE', 'UNKNOWN'],
    ['UNKNOWN', 'SATISFIED', 'SATISFIED'],
    ['UNKNOWN', 'NOT_YET_SATISFIED', 'NOT_YET_SATISFIED'],
    ['UNSATISFIABLE', 'UNSATISFIABLE', 'UNSATISFIABLE'],
  ] as const)('OR(%s, %s) = %s', (a, b, expected) => {
    expect(conditionOr(a, b)).toBe(expected)
  })

  it('AND absorbs UNSATISFIABLE regardless of other operands', () => {
    for (const a of all) {
      expect(conditionAnd('UNSATISFIABLE', a)).toBe('UNSATISFIABLE')
    }
  })

  it('OR absorbs SATISFIED regardless of other operands', () => {
    for (const a of all) {
      expect(conditionOr('SATISFIED', a)).toBe('SATISFIED')
    }
  })
})

describe('conditionThreshold — N-of-M generalizes AND and OR', () => {
  const all = CONDITION_RESULTS

  it('threshold(1, [a]) reduces to identity, matching OR(a) semantics for a single operand', () => {
    for (const a of all) {
      expect(conditionThreshold(1, [a])).toBe(a)
    }
  })

  it('threshold(m, results) === conditionAnd(...results) when m equals results.length', () => {
    for (const a of all) {
      for (const b of all) {
        for (const c of all) {
          const results = [a, b, c]
          expect(conditionThreshold(results.length, results)).toBe(conditionAnd(...results))
        }
      }
    }
  })

  it('threshold(1, results) === conditionOr(...results)', () => {
    for (const a of all) {
      for (const b of all) {
        for (const c of all) {
          const results = [a, b, c]
          expect(conditionThreshold(1, results)).toBe(conditionOr(...results))
        }
      }
    }
  })

  it('2-of-3: SATISFIED already met regardless of the third slot', () => {
    expect(conditionThreshold(2, ['SATISFIED', 'SATISFIED', 'UNSATISFIABLE'])).toBe('SATISFIED')
  })

  it('2-of-3: a NOT_YET slot alone can still reach threshold -> NOT_YET_SATISFIED', () => {
    expect(conditionThreshold(2, ['SATISFIED', 'NOT_YET_SATISFIED', 'UNSATISFIABLE'])).toBe('NOT_YET_SATISFIED')
  })

  it('2-of-3: threshold unreachable even optimistically -> UNSATISFIABLE', () => {
    expect(conditionThreshold(2, ['SATISFIED', 'UNSATISFIABLE', 'UNSATISFIABLE'])).toBe('UNSATISFIABLE')
  })

  it('2-of-3: reaching threshold requires an UNKNOWN slot to resolve favorably -> UNKNOWN', () => {
    expect(conditionThreshold(2, ['SATISFIED', 'UNKNOWN', 'UNSATISFIABLE'])).toBe('UNKNOWN')
  })

  it('1-of-1 is just the single value itself', () => {
    for (const a of all) {
      expect(conditionThreshold(1, [a])).toBe(a)
    }
  })

  it('3-of-5: known paths alone already suffice regardless of an UNKNOWN slot', () => {
    expect(
      conditionThreshold(3, ['SATISFIED', 'SATISFIED', 'NOT_YET_SATISFIED', 'UNKNOWN', 'UNSATISFIABLE']),
    ).toBe('NOT_YET_SATISFIED')
  })

  it('rejects n < 1 and empty operand lists', () => {
    expect(() => conditionThreshold(0, ['SATISFIED'])).toThrow()
    expect(() => conditionThreshold(1, [])).toThrow()
  })
})
