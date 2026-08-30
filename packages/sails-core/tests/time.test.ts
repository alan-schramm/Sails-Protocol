import { createEvaluationTime, isAtOrAfter } from '../src/time'

describe('EvaluationTime — explicit input only, no hidden clock', () => {
  it('is a plain millisecond count, never a JS Date instance', () => {
    const time = createEvaluationTime(1_730_000_000_000)
    expect(typeof time).toBe('number')
    expect(time).not.toBeInstanceOf(Date)
  })

  it('rejects non-finite values', () => {
    expect(() => createEvaluationTime(Number.NaN)).toThrow()
    expect(() => createEvaluationTime(Number.POSITIVE_INFINITY)).toThrow()
  })

  it('isAtOrAfter compares two explicit values with no implicit "now"', () => {
    const earlier = createEvaluationTime(1000)
    const later = createEvaluationTime(2000)
    expect(isAtOrAfter(later, earlier)).toBe(true)
    expect(isAtOrAfter(earlier, later)).toBe(false)
    expect(isAtOrAfter(earlier, earlier)).toBe(true)
  })
})
