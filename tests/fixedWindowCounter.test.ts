import { FixedWindowCounter } from '../src/common/fixed-window-counter'

describe('FixedWindowCounter', () => {
  it('starts a key at count 1 on first increment', () => {
    const counter = new FixedWindowCounter(60_000)
    expect(counter.increment('k1', 1000)).toBe(1)
  })

  it('increments an existing, still-active window', () => {
    const counter = new FixedWindowCounter(60_000)
    counter.increment('k1', 1000)
    counter.increment('k1', 1000)
    expect(counter.increment('k1', 1000)).toBe(3)
  })

  it('tracks each key independently', () => {
    const counter = new FixedWindowCounter(60_000)
    counter.increment('k1', 1000)
    counter.increment('k1', 1000)
    counter.increment('k2', 1000)
    expect(counter.peek('k1')).toBe(2)
    expect(counter.peek('k2')).toBe(1)
  })

  it('peek returns 0 for a key with no active window, without starting one', () => {
    const counter = new FixedWindowCounter(60_000)
    expect(counter.peek('never-seen')).toBe(0)
    // Confirmed no window was started — the next real increment() still begins at 1.
    expect(counter.increment('never-seen', 1000)).toBe(1)
  })

  it('resets the count once the window elapses', async () => {
    const counter = new FixedWindowCounter(60_000)
    counter.increment('k1', 50)
    counter.increment('k1', 50)
    expect(counter.peek('k1')).toBe(2)

    await new Promise((resolve) => setTimeout(resolve, 60))

    expect(counter.peek('k1')).toBe(0)
    expect(counter.increment('k1', 50)).toBe(1) // fresh window, not 3
  })

  it('reset() clears all tracked keys', () => {
    const counter = new FixedWindowCounter(60_000)
    counter.increment('k1', 1000)
    counter.increment('k2', 1000)
    counter.reset()
    expect(counter.peek('k1')).toBe(0)
    expect(counter.peek('k2')).toBe(0)
  })
})
