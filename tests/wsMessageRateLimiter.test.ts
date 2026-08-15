/**
 * Unit tests for the fixed-window WS message rate limiter — isolated from
 * the full app/Prisma mock stack in routes.test.ts, which only exercises
 * the wiring (one over-budget request gets an ERROR frame). This file
 * covers the counting logic itself: per-participant isolation and window
 * expiry, using real timers since the window is a few tens of
 * milliseconds here, not the production default.
 */
import { checkWsMessageRateLimit, resetWsMessageRateLimiter } from '../src/modules/open-p2p/ws-message-rate-limiter'

jest.mock('../src/config', () => ({
  config: { rateLimit: { wsMessageMax: 3, wsMessageWindowMs: 50 } },
}))

describe('ws-message-rate-limiter', () => {
  beforeEach(() => {
    resetWsMessageRateLimiter()
  })

  it('allows up to wsMessageMax messages within the window, then rejects', () => {
    expect(checkWsMessageRateLimit('p1')).toBe(true)
    expect(checkWsMessageRateLimit('p1')).toBe(true)
    expect(checkWsMessageRateLimit('p1')).toBe(true)
    expect(checkWsMessageRateLimit('p1')).toBe(false)
    expect(checkWsMessageRateLimit('p1')).toBe(false)
  })

  it('tracks each participant independently — one being over budget does not affect another', () => {
    expect(checkWsMessageRateLimit('p1')).toBe(true)
    expect(checkWsMessageRateLimit('p1')).toBe(true)
    expect(checkWsMessageRateLimit('p1')).toBe(true)
    expect(checkWsMessageRateLimit('p1')).toBe(false)

    expect(checkWsMessageRateLimit('p2')).toBe(true)
  })

  it('resets the budget once the window elapses', async () => {
    expect(checkWsMessageRateLimit('p1')).toBe(true)
    expect(checkWsMessageRateLimit('p1')).toBe(true)
    expect(checkWsMessageRateLimit('p1')).toBe(true)
    expect(checkWsMessageRateLimit('p1')).toBe(false)

    await new Promise((resolve) => setTimeout(resolve, 60))

    expect(checkWsMessageRateLimit('p1')).toBe(true)
  })
})
