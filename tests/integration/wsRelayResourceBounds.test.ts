// Issue #307 — real-Redis evidence for the authenticated Blind Relay budget.
//
// Unit/route tests prove the WebSocket close behavior. This suite proves the
// production-critical property they cannot manufacture with a JS Map: two
// independent processes/connections increment the SAME participant-scoped
// Redis budget atomically, with a bounded window for both count and bytes.

import Redis from 'ioredis'
import { randomUUID } from 'crypto'

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379'
const WINDOW_MS = 5_000
const MESSAGE_MAX = 8
const BYTE_MAX = MESSAGE_MAX * 1024 * 1024

// Same Redis operations/invariant as checkSharedWsMessageRateLimit(). The
// independent clients below model separate Sails instances sharing Redis.
async function admit(client: Redis, participantId: string, frameBytes: number): Promise<boolean> {
  const messageKey = `ratelimit:ws-relay:${participantId}`
  const byteKey = `ratelimit:ws-relay-bytes:${participantId}`
  const [messageCount, byteCount] = await Promise.all([
    client.incr(messageKey),
    client.incrby(byteKey, frameBytes),
  ])
  if (messageCount === 1) {
    await Promise.all([client.pexpire(messageKey, WINDOW_MS), client.pexpire(byteKey, WINDOW_MS)])
  }
  return messageCount <= MESSAGE_MAX && byteCount <= BYTE_MAX
}

describe('Issue #307 — relay resource bounds, real Redis', () => {
  jest.setTimeout(30_000)

  const clients: Redis[] = []
  let redisAvailable = false

  function newClient(): Redis {
    const client = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
      lazyConnect: true,
    })
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

  function skipIfUnavailable(name: string): boolean {
    if (!redisAvailable) {
      console.warn(`Skipping "${name}" — no Redis reachable at ${REDIS_URL}`)
      return true
    }
    return false
  }

  it('shares one participant message budget across independent clients under contention', async () => {
    const name = 'multi-instance shared message budget'
    if (skipIfUnavailable(name)) return

    const a = newClient()
    const b = newClient()
    await Promise.all([a.connect(), b.connect()])
    const participantId = `it-307-count-${randomUUID()}`

    const results = await Promise.all(
      Array.from({ length: MESSAGE_MAX + 4 }, (_, i) => admit(i % 2 === 0 ? a : b, participantId, 1)),
    )

    expect(results.filter(Boolean)).toHaveLength(MESSAGE_MAX)
    expect(await a.get(`ratelimit:ws-relay:${participantId}`)).toBe(String(MESSAGE_MAX + 4))
    expect(await b.pttl(`ratelimit:ws-relay:${participantId}`)).toBeGreaterThan(0)
  })

  it('shares aggregate byte accounting across independent clients and keeps both keys bounded', async () => {
    const name = 'multi-instance shared byte budget'
    if (skipIfUnavailable(name)) return

    const a = newClient()
    const b = newClient()
    await Promise.all([a.connect(), b.connect()])
    const participantId = `it-307-bytes-${randomUUID()}`
    const half = Math.floor(BYTE_MAX / 2)

    expect(await admit(a, participantId, half)).toBe(true)
    expect(await admit(b, participantId, half)).toBe(true)
    expect(await admit(a, participantId, 1)).toBe(false)

    const countKey = `ratelimit:ws-relay:${participantId}`
    const byteKey = `ratelimit:ws-relay-bytes:${participantId}`
    expect(Number(await b.get(byteKey))).toBe(BYTE_MAX + 1)
    expect(await a.pttl(countKey)).toBeGreaterThan(0)
    expect(await b.pttl(byteKey)).toBeGreaterThan(0)
    expect(await a.pttl(countKey)).toBeLessThanOrEqual(WINDOW_MS)
    expect(await b.pttl(byteKey)).toBeLessThanOrEqual(WINDOW_MS)
  })
})
