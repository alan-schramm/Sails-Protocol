/**
 * Unit tests for the fixed-window suspicious-activity detector — isolated
 * from the full app/Fastify stack, same split routes.test.ts and
 * wsMessageRateLimiter.test.ts already use (unit tests for the counting
 * logic here; tests/suspiciousActivityWiring.test.ts covers the real
 * onResponse hook + /metrics wiring through app.inject()).
 */
import { recordSuspiciousActivity, resetSuspiciousActivityTracking } from '../src/common/security/suspicious-activity'
import { eventBus } from '../src/common/events/event-bus'

jest.mock('../src/config', () => ({
  config: {
    suspiciousActivity: {
      authFailureMax: 3,
      authFailureWindowMs: 50,
      notFoundClusterMax: 3,
      notFoundClusterWindowMs: 50,
      rateLimitedMax: 3,
      rateLimitedWindowMs: 50,
    },
  },
}))

jest.mock('../src/common/events/event-bus', () => ({
  eventBus: { emit: jest.fn().mockResolvedValue(undefined) },
}))

function fakeLogger() {
  return { warn: jest.fn(), error: jest.fn() } as unknown as import('fastify').FastifyBaseLogger
}

describe('suspicious-activity detector', () => {
  beforeEach(() => {
    resetSuspiciousActivityTracking()
    jest.clearAllMocks()
  })

  it('does not warn or emit below the threshold', () => {
    const log = fakeLogger()
    recordSuspiciousActivity('AUTH_FAILURE', 'ip-1', log)
    recordSuspiciousActivity('AUTH_FAILURE', 'ip-1', log)

    expect(log.warn).not.toHaveBeenCalled()
    expect(eventBus.emit).not.toHaveBeenCalled()
  })

  it('warns and emits exactly once when the threshold is crossed within the window', () => {
    const log = fakeLogger()
    recordSuspiciousActivity('AUTH_FAILURE', 'ip-1', log)
    recordSuspiciousActivity('AUTH_FAILURE', 'ip-1', log)
    recordSuspiciousActivity('AUTH_FAILURE', 'ip-1', log) // crosses max=3

    expect(log.warn).toHaveBeenCalledTimes(1)
    expect(log.warn).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'AUTH_FAILURE', identity: 'ip-1', count: 3 })
    )
    expect(eventBus.emit).toHaveBeenCalledTimes(1)
    expect(eventBus.emit).toHaveBeenCalledWith(
      'security.suspicious_activity.detected',
      expect.objectContaining({ kind: 'AUTH_FAILURE', identity: 'ip-1', count: 3 }),
      'ip-1'
    )

    // Further hits in the same window must not re-alert.
    recordSuspiciousActivity('AUTH_FAILURE', 'ip-1', log)
    expect(log.warn).toHaveBeenCalledTimes(1)
    expect(eventBus.emit).toHaveBeenCalledTimes(1)
  })

  it('tracks each (kind, identity) pair independently', () => {
    const log = fakeLogger()
    recordSuspiciousActivity('AUTH_FAILURE', 'ip-1', log)
    recordSuspiciousActivity('AUTH_FAILURE', 'ip-1', log)
    recordSuspiciousActivity('AUTH_FAILURE', 'ip-1', log)
    expect(log.warn).toHaveBeenCalledTimes(1)

    // Different kind, same identity — separate counter.
    recordSuspiciousActivity('NOT_FOUND_CLUSTER', 'ip-1', log)
    expect(log.warn).toHaveBeenCalledTimes(1)

    // Same kind, different identity — separate counter.
    recordSuspiciousActivity('AUTH_FAILURE', 'ip-2', log)
    expect(log.warn).toHaveBeenCalledTimes(1)
  })

  it('resets the window once it elapses, allowing a fresh alert later', async () => {
    const log = fakeLogger()
    recordSuspiciousActivity('RATE_LIMITED', 'p1', log)
    recordSuspiciousActivity('RATE_LIMITED', 'p1', log)
    recordSuspiciousActivity('RATE_LIMITED', 'p1', log)
    expect(log.warn).toHaveBeenCalledTimes(1)

    await new Promise((resolve) => setTimeout(resolve, 60))

    recordSuspiciousActivity('RATE_LIMITED', 'p1', log)
    recordSuspiciousActivity('RATE_LIMITED', 'p1', log)
    recordSuspiciousActivity('RATE_LIMITED', 'p1', log)
    expect(log.warn).toHaveBeenCalledTimes(2)
  })
})
