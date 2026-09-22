const sessionStore = new Map<string, string>()

jest.mock('../src/common/redis', () => ({
  redis: {
    get: jest.fn((key: string) => Promise.resolve(sessionStore.get(key) ?? null)),
    del: jest.fn((key: string) => Promise.resolve(sessionStore.delete(key) ? 1 : 0)),
    set: jest.fn(),
  },
}))

jest.mock('../src/common/database', () => ({ prisma: {} }))

import type { FastifyRequest } from 'fastify'
import { requireAuth } from '../src/common/middleware/auth'
import { revokeCurrentSession } from '../src/common/middleware/session-revocation'

function request(token?: string): FastifyRequest {
  return {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  } as unknown as FastifyRequest
}

describe('current bearer session revocation (#312)', () => {
  beforeEach(() => sessionStore.clear())

  it('accepts a live token, then rejects the exact same captured token immediately after revocation', async () => {
    const token = 'captured-bearer-token'
    sessionStore.set(`auth:session:${token}`, 'participant-312')
    const stolenCopy = request(token)

    await expect(requireAuth(stolenCopy, undefined)).resolves.toBeUndefined()
    expect((stolenCopy as unknown as { participantId: string }).participantId).toBe('participant-312')

    await expect(revokeCurrentSession(request(token))).resolves.toBeUndefined()
    await expect(requireAuth(stolenCopy, undefined)).rejects.toThrow(/Session expired or invalid/)
  })

  it('revokes only the presented session and leaves a second session for the same participant live', async () => {
    sessionStore.set('auth:session:device-a', 'participant-312')
    sessionStore.set('auth:session:device-b', 'participant-312')

    await revokeCurrentSession(request('device-a'))

    await expect(requireAuth(request('device-a'), undefined)).rejects.toThrow(/Session expired or invalid/)
    await expect(requireAuth(request('device-b'), undefined)).resolves.toBeUndefined()
  })

  it('repeated storage-level revocation remains safe and cannot recreate authority', async () => {
    sessionStore.set('auth:session:repeat-me', 'participant-312')

    await revokeCurrentSession(request('repeat-me'))
    await revokeCurrentSession(request('repeat-me'))

    expect(sessionStore.has('auth:session:repeat-me')).toBe(false)
    await expect(requireAuth(request('repeat-me'), undefined)).rejects.toThrow(/Session expired or invalid/)
  })

  it('fails closed when revocation is requested without a bearer token', async () => {
    await expect(revokeCurrentSession(request())).rejects.toThrow(/Missing Authorization header/)
  })
})
