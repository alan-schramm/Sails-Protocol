/**
 * Unit tests for the fixed-window WS message rate limiter — isolated from
 * the full app/Prisma mock stack in routes.test.ts, which only exercises
 * the wiring (one over-budget request gets an ERROR frame). This file
 * covers the counting logic itself: per-participant isolation and window
 * expiry, using real timers since the window is a few tens of
 * milliseconds here, not the production default.
 */
import { checkWsMessageRateLimit, checkSharedWsMessageRateLimit, resetWsMessageRateLimiter } from '../src/modules/open-p2p/ws-message-rate-limiter'

const incr = jest.fn()
const pexpire = jest.fn()
jest.mock('../src/common/redis', () => ({ redis: { incr: (...args: unknown[]) => incr(...args), pexpire: (...args: unknown[]) => pexpire(...args) } }))

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
  it('#307 shares the relay budget through Redis and fails closed after the configured ceiling', async () => {
    incr.mockResolvedValueOnce(1).mockResolvedValueOnce(2).mockResolvedValueOnce(3).mockResolvedValueOnce(4)
    pexpire.mockResolvedValue(1)
    await expect(checkSharedWsMessageRateLimit('p-shared')).resolves.toBe(true)
    await expect(checkSharedWsMessageRateLimit('p-shared')).resolves.toBe(true)
    await expect(checkSharedWsMessageRateLimit('p-shared')).resolves.toBe(true)
    await expect(checkSharedWsMessageRateLimit('p-shared')).resolves.toBe(false)
    expect(pexpire).toHaveBeenCalledTimes(1)
    expect(pexpire).toHaveBeenCalledWith('ratelimit:ws-relay:p-shared', 50)
  })

  it('#307 fails the public relay budget closed when Redis is unavailable', async () => {
    incr.mockRejectedValueOnce(new Error('redis unavailable'))
    await expect(checkSharedWsMessageRateLimit('p-outage')).resolves.toBe(false)
  })

})
