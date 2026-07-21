/**
 * ws-auth.ts — extracted from chat.routes.ts/relay.routes.ts, which each
 * had their own identical copy of this token-resolution logic (found
 * while wiring relay.routes.ts, which would have made it a third copy).
 */
export {} // same forced-module reasoning as chatUnification.test.ts

const mockRedisGet = jest.fn()
jest.mock('../src/common/redis', () => ({
  redis: { get: (...args: unknown[]) => mockRedisGet(...args) },
}))

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { resolveParticipantFromToken } = require('../src/common/middleware/ws-auth')

describe('resolveParticipantFromToken (ws-auth.ts)', () => {
  beforeEach(() => {
    mockRedisGet.mockReset()
  })

  it('returns null without querying Redis when no token is given', async () => {
    const result = await resolveParticipantFromToken(undefined)
    expect(result).toBeNull()
    expect(mockRedisGet).not.toHaveBeenCalled()
  })

  it('looks up the session under the auth:session: prefix and returns the participantId', async () => {
    mockRedisGet.mockResolvedValueOnce('participant-42')

    const result = await resolveParticipantFromToken('some-token')

    expect(mockRedisGet).toHaveBeenCalledWith('auth:session:some-token')
    expect(result).toBe('participant-42')
  })

  it('returns null for an expired or unknown token', async () => {
    mockRedisGet.mockResolvedValueOnce(null)
    const result = await resolveParticipantFromToken('expired-token')
    expect(result).toBeNull()
  })
})
