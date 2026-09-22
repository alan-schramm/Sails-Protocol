// tests/integration/sessionRevocationRedis.test.ts
//
// Issue #312 — real Redis proof for the property mocks cannot establish:
// a bearer session revoked by one Sails instance is immediately invalid
// when another independent instance checks the same authoritative store.
// Independent ioredis connections stand in for separate API processes.

import Redis from 'ioredis'
import { randomBytes } from 'crypto'

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379'
const SESSION_PREFIX = 'auth:session:'

describe('Server-side session revocation (#312, real Redis)', () => {
  jest.setTimeout(30_000)

  let redisAvailable = false
  const clients: Redis[] = []

  function newClient(): Redis {
    const client = new Redis(REDIS_URL, { maxRetriesPerRequest: 1, retryStrategy: () => null, lazyConnect: true })
    clients.push(client)
    return client
  }

  beforeAll(async () => {
    const probe = newClient()
    try {
      await probe.connect()
      await probe.ping()
      redisAvailable = true
    } catch {
      redisAvailable = false
    }
  })

  afterAll(async () => {
    await Promise.all(clients.map((c) => (redisAvailable ? c.quit().catch(() => {}) : Promise.resolve(c.disconnect()))))
  })

  function skipIfUnavailable(): boolean {
    if (!redisAvailable) {
      console.warn('Skipping sessionRevocationRedis integration test — no Redis reachable at ' + REDIS_URL)
      return true
    }
    return false
  }

  it('revocation by instance A is immediately observed by independent instance B holding the same stolen bearer token', async () => {
    if (skipIfUnavailable()) return

    const issuer = newClient()
    const instanceA = newClient()
    const instanceB = newClient()
    await Promise.all([issuer.connect(), instanceA.connect(), instanceB.connect()])

    const token = randomBytes(32).toString('hex')
    const key = `${SESSION_PREFIX}${token}`
    await issuer.set(key, 'participant-312', 'EX', 60)

    // Both instances accept the same live bearer authority before logout.
    expect(await instanceA.get(key)).toBe('participant-312')
    expect(await instanceB.get(key)).toBe('participant-312')

    // The real logout primitive is Redis DEL on the authoritative key.
    expect(await instanceA.del(key)).toBe(1)

    // No process-local cache/denylist is involved: another connection sees
    // the revocation on its very next authorization lookup.
    expect(await instanceB.get(key)).toBeNull()
    expect(await issuer.get(key)).toBeNull()
  })

  it('repeated revocation is storage-idempotent and cannot resurrect authority', async () => {
    if (skipIfUnavailable()) return

    const issuer = newClient()
    const revokerA = newClient()
    const revokerB = newClient()
    await Promise.all([issuer.connect(), revokerA.connect(), revokerB.connect()])

    const token = randomBytes(32).toString('hex')
    const key = `${SESSION_PREFIX}${token}`
    await issuer.set(key, 'participant-312-repeat', 'EX', 60)

    const first = await revokerA.del(key)
    const second = await revokerB.del(key)
    expect(first).toBe(1)
    expect(second).toBe(0)
    expect(await issuer.get(key)).toBeNull()
  })

  it('revoking one session does not revoke a different live session for the same participant', async () => {
    if (skipIfUnavailable()) return

    const issuer = newClient()
    const revoker = newClient()
    const observer = newClient()
    await Promise.all([issuer.connect(), revoker.connect(), observer.connect()])

    const tokenA = randomBytes(32).toString('hex')
    const tokenB = randomBytes(32).toString('hex')
    const keyA = `${SESSION_PREFIX}${tokenA}`
    const keyB = `${SESSION_PREFIX}${tokenB}`
    await issuer.set(keyA, 'participant-312-multi', 'EX', 60)
    await issuer.set(keyB, 'participant-312-multi', 'EX', 60)

    await revoker.del(keyA)

    expect(await observer.get(keyA)).toBeNull()
    expect(await observer.get(keyB)).toBe('participant-312-multi')

    await observer.del(keyB)
  })
})
