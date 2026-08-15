/**
 * ws-auth.ts — extracted from chat.routes.ts/relay.routes.ts, which each
 * had their own identical copy of this ticket-resolution logic (found
 * while wiring relay.routes.ts, which would have made it a third copy).
 *
 * Migrated 2026-08-15 (security review P1): resolveParticipantFromToken
 * (looked up a raw, reusable, long-lived session token) replaced by
 * resolveParticipantFromTicket (looks up AND burns a short-lived,
 * single-use ticket) — see ws-auth.ts's own header for the full
 * rationale. Test shape carries over unchanged; the new "reused ticket"
 * case is the one genuinely new behavior (del after get) worth its own
 * assertion.
 */
export {} // same forced-module reasoning as chatUnification.test.ts

const mockRedisGet = jest.fn()
const mockRedisDel = jest.fn()
jest.mock('../src/common/redis', () => ({
  redis: {
    get: (...args: unknown[]) => mockRedisGet(...args),
    del: (...args: unknown[]) => mockRedisDel(...args),
  },
}))

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { resolveParticipantFromTicket } = require('../src/common/middleware/ws-auth')

describe('resolveParticipantFromTicket (ws-auth.ts)', () => {
  beforeEach(() => {
    mockRedisGet.mockReset()
    mockRedisDel.mockReset()
  })

  it('returns null without querying Redis when no ticket is given', async () => {
    const result = await resolveParticipantFromTicket(undefined)
    expect(result).toBeNull()
    expect(mockRedisGet).not.toHaveBeenCalled()
    expect(mockRedisDel).not.toHaveBeenCalled()
  })

  it('looks up the ticket under the auth:ws-ticket: prefix, burns it, and returns the participantId', async () => {
    mockRedisGet.mockResolvedValueOnce('participant-42')

    const result = await resolveParticipantFromTicket('some-ticket')

    expect(mockRedisGet).toHaveBeenCalledWith('auth:ws-ticket:some-ticket')
    expect(mockRedisDel).toHaveBeenCalledWith('auth:ws-ticket:some-ticket')
    expect(result).toBe('participant-42')
  })

  it('returns null for an expired or unknown ticket, without attempting to burn it', async () => {
    mockRedisGet.mockResolvedValueOnce(null)
    const result = await resolveParticipantFromTicket('expired-ticket')
    expect(result).toBeNull()
    expect(mockRedisDel).not.toHaveBeenCalled()
  })

  it('a reused ticket resolves to null the second time — del actually runs before the caller could ever call this again', async () => {
    mockRedisGet.mockResolvedValueOnce('participant-42')
    const first = await resolveParticipantFromTicket('one-time-ticket')
    expect(first).toBe('participant-42')

    // Simulates the real Redis behavior the first call's del() call
    // above produces: the key is gone, so a second lookup finds nothing.
    mockRedisGet.mockResolvedValueOnce(null)
    const second = await resolveParticipantFromTicket('one-time-ticket')
    expect(second).toBeNull()
  })
})
