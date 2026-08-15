/**
 * escrow-circuit-breaker.ts — two layers, same split routes.test.ts /
 * wsMessageRateLimiter.test.ts already use elsewhere:
 *
 * - Pure unit tests of the module's own counting/opening/reset logic,
 *   isolated from Prisma entirely.
 * - A real-wiring test against claimEscrowTransition() (escrow-lifecycle.ts),
 *   the actual chokepoint every mutating escrow method shares, proving a
 *   burst of real conflicting updateMany() results (count: 0 — the exact
 *   signal a concurrent double-release/double-refund attempt produces)
 *   trips the breaker and that a *different* escrowId is unaffected.
 */
import {
  assertCircuitClosed,
  recordEscrowConflict,
  resetEscrowCircuitBreaker,
} from '../src/modules/open-settlement/escrow-circuit-breaker'
import { CircuitBreakerOpenError, EscrowError } from '../src/common/errors'

jest.mock('../src/config', () => ({
  config: {
    escrowCircuitBreaker: { failureThreshold: 3, windowMs: 50, cooldownMs: 100 },
  },
}))

describe('escrow-circuit-breaker (unit)', () => {
  beforeEach(() => resetEscrowCircuitBreaker())

  it('stays closed below the failure threshold', () => {
    recordEscrowConflict('escrow-1')
    recordEscrowConflict('escrow-1')
    expect(() => assertCircuitClosed('escrow-1')).not.toThrow()
  })

  it('opens once the threshold is crossed within the window, and rejects further attempts', () => {
    recordEscrowConflict('escrow-1')
    recordEscrowConflict('escrow-1')
    recordEscrowConflict('escrow-1') // crosses failureThreshold=3

    expect(() => assertCircuitClosed('escrow-1')).toThrow(CircuitBreakerOpenError)
  })

  it('scopes the circuit per escrowId — a different escrow is unaffected', () => {
    recordEscrowConflict('escrow-1')
    recordEscrowConflict('escrow-1')
    recordEscrowConflict('escrow-1')
    expect(() => assertCircuitClosed('escrow-1')).toThrow(CircuitBreakerOpenError)

    expect(() => assertCircuitClosed('escrow-2')).not.toThrow()
  })

  it('auto-closes once cooldownMs elapses — no manual reset required', async () => {
    recordEscrowConflict('escrow-1')
    recordEscrowConflict('escrow-1')
    recordEscrowConflict('escrow-1')
    expect(() => assertCircuitClosed('escrow-1')).toThrow(CircuitBreakerOpenError)

    await new Promise((resolve) => setTimeout(resolve, 120)) // > cooldownMs=100

    expect(() => assertCircuitClosed('escrow-1')).not.toThrow()
  })
})

describe('escrow-circuit-breaker (real wiring — claimEscrowTransition)', () => {
  const mockEscrowUpdateMany = jest.fn()

  jest.doMock('../src/common/database', () => ({
    prisma: { escrow: { updateMany: (...args: unknown[]) => mockEscrowUpdateMany(...args) } },
  }))

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { claimEscrowTransition } = require('../src/modules/open-settlement/escrow-lifecycle')

  beforeEach(() => {
    resetEscrowCircuitBreaker()
    mockEscrowUpdateMany.mockReset()
  })

  it('trips after a real burst of concurrent-conflict results (updateMany count: 0), then fails fast without touching the DB', async () => {
    mockEscrowUpdateMany.mockResolvedValue({ count: 0 }) // every attempt loses the race

    for (let i = 0; i < 3; i++) {
      await expect(claimEscrowTransition('escrow-1', 'FUNDS_LOCKED', 'PAYMENT_PENDING')).rejects.toThrow(EscrowError)
    }
    expect(mockEscrowUpdateMany).toHaveBeenCalledTimes(3)

    // Threshold (3) now crossed — next attempt must fail fast as
    // CircuitBreakerOpenError, and never even reach updateMany, even
    // though this call would otherwise have won the race.
    mockEscrowUpdateMany.mockResolvedValue({ count: 1 })
    await expect(claimEscrowTransition('escrow-1', 'FUNDS_LOCKED', 'PAYMENT_PENDING')).rejects.toThrow(CircuitBreakerOpenError)
    expect(mockEscrowUpdateMany).toHaveBeenCalledTimes(3) // unchanged — short-circuited before the DB call
  })

  it('does not open for an escrow with only occasional, non-clustered conflicts', async () => {
    mockEscrowUpdateMany.mockResolvedValueOnce({ count: 0 })
    await expect(claimEscrowTransition('escrow-2', 'FUNDS_LOCKED', 'PAYMENT_PENDING')).rejects.toThrow(EscrowError)

    mockEscrowUpdateMany.mockResolvedValueOnce({ count: 1 })
    await expect(claimEscrowTransition('escrow-2', 'FUNDS_LOCKED', 'PAYMENT_PENDING')).resolves.toBeUndefined()
  })
})
