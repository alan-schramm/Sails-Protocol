/**
 * Issue #301 — auth.ts's verifySignedChallenge() one-time-consumption
 * property, previously implemented as a plain `redis.get()` (verify
 * signature) then `redis.del()` (burn). Two concurrent requests
 * replaying the same captured (challenge, signature) pair could both
 * observe the challenge before either deleted it, both verify
 * successfully, and both mint independent sessions — "sequential
 * one-time behavior" (the old unit test coverage, which never existed
 * for this function at all — HTTP-level tests in tests/routes.test.ts
 * only ever exercised sequential, non-adversarial auth) is not the same
 * property as "concurrent single-consumption."
 *
 * This file tests the REAL `verifySignedChallenge()`/`issueChallenge()`
 * with REAL Ed25519 signing (tweetnacl, a real generated keypair — the
 * same "test real crypto, not a mock of it" discipline
 * tests/proofService.test.ts already establishes for OpenProof), mocked
 * only at the Prisma/Redis collaborator boundary. The mocked Redis is
 * backed by a real Map, and its `eval()` genuinely reimplements
 * common/redis/atomic-consume.ts's two Lua scripts (discriminated by
 * whether the script references ARGV[1]) rather than always
 * succeeding — the concurrency tests below depend on that being a real
 * atomic check-then-delete, not a canned response.
 */
export {} // forces this file to be a module — same reasoning as the other test files in this suite

import nacl from 'tweetnacl'

jest.mock('../src/config', () => ({
  config: { auth: { challengeTtlSeconds: 120, sessionTtlSeconds: 3600 } },
}))

const redisStore = new Map<string, string>()
jest.mock('../src/common/redis', () => ({
  redis: {
    get: jest.fn((key: string) => Promise.resolve(redisStore.get(key) ?? null)),
    set: jest.fn((key: string, value: string) => {
      redisStore.set(key, value)
      return Promise.resolve('OK')
    }),
    del: jest.fn((key: string) => {
      const existed = redisStore.has(key)
      redisStore.delete(key)
      return Promise.resolve(existed ? 1 : 0)
    }),
    // Real reimplementation of atomic-consume.ts's two Lua scripts
    // against the same redisStore every other mocked command shares —
    // see this file's own header comment.
    eval: jest.fn((script: string, _numKeys: number, ...args: unknown[]) => {
      const key = args[0] as string
      if (script.includes('ARGV[1]')) {
        const expected = args[1] as string
        if (redisStore.get(key) === expected) {
          redisStore.delete(key)
          return Promise.resolve(1)
        }
        return Promise.resolve(0)
      }
      const current = redisStore.get(key)
      if (current === undefined) return Promise.resolve(null)
      redisStore.delete(key)
      return Promise.resolve(current)
    }),
  },
}))

const mockUserFindUnique = jest.fn()
jest.mock('../src/common/database', () => ({
  prisma: { user: { findUnique: (...args: unknown[]) => mockUserFindUnique(...args) } },
}))

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { issueChallenge, verifySignedChallenge } = require('../src/common/middleware/auth')

const keypair = nacl.sign.keyPair()
const publicKeyHex = Buffer.from(keypair.publicKey).toString('hex')

// Mirrors auth.ts's own verifySignedChallenge() byte construction
// exactly: the message actually signed/verified is the UTF-8 bytes of
// the challenge's own hex-string text, not the raw decoded 32 bytes —
// existing, unchanged behavior; this test signs the same way a real
// client already has to.
function signChallenge(challenge: string): string {
  const message = new Uint8Array(Buffer.from(challenge, 'utf8'))
  const signature = nacl.sign.detached(message, keypair.secretKey)
  return Buffer.from(signature).toString('hex')
}

describe('verifySignedChallenge() — atomic one-time consumption (Issue #301)', () => {
  beforeEach(() => {
    redisStore.clear()
    mockUserFindUnique.mockReset()
    mockUserFindUnique.mockResolvedValue({ id: 'user-1', publicKey: publicKeyHex })
  })

  it('sequential behavior preserved: a valid signature succeeds once, a replay after that fails', async () => {
    const { challenge } = await issueChallenge(publicKeyHex)
    const signatureHex = signChallenge(challenge)

    const first = await verifySignedChallenge(publicKeyHex, signatureHex)
    expect(first.verified).toBe(true)
    expect(first.sessionToken).toBeTruthy()

    const second = await verifySignedChallenge(publicKeyHex, signatureHex)
    expect(second.verified).toBe(false)
  })

  // Adversarial requirement 1 — same valid signed challenge x 10
  // concurrent calls -> exactly 1 verified=true, exactly 1 session
  // token stored/issued.
  it('10 concurrent verifySignedChallenge() calls with the SAME valid (challenge, signature): exactly 1 verified=true, exactly 1 session stored', async () => {
    const { challenge } = await issueChallenge(publicKeyHex)
    const signatureHex = signChallenge(challenge)

    const results = await Promise.all(
      Array.from({ length: 10 }, () => verifySignedChallenge(publicKeyHex, signatureHex))
    )

    const winners = results.filter((r) => r.verified === true)
    const losers = results.filter((r) => r.verified === false)
    expect(winners).toHaveLength(1)
    expect(losers).toHaveLength(9)
    expect(winners[0].sessionToken).toBeTruthy()

    const sessionKeysStored = Array.from(redisStore.keys()).filter((k) => k.startsWith('auth:session:'))
    expect(sessionKeysStored).toHaveLength(1)
  })

  // Adversarial requirements 2/7 — an invalid signature must never
  // consume the legitimate holder's outstanding challenge: it must
  // still be usable by the real, valid signature afterward. Proves
  // AUTH never GETDELs before cryptographic validation — an invalid
  // signature is rejected while the challenge remains present in Redis.
  it('an invalid signature does not consume the challenge — it remains usable by the legitimate valid signature afterward', async () => {
    const { challenge } = await issueChallenge(publicKeyHex)
    const forgedKeypair = nacl.sign.keyPair()
    const forgedSignature = Buffer.from(nacl.sign.detached(new Uint8Array(Buffer.from(challenge, 'utf8')), forgedKeypair.secretKey)).toString('hex')

    const invalidAttempt = await verifySignedChallenge(publicKeyHex, forgedSignature)
    expect(invalidAttempt.verified).toBe(false)
    // The challenge is still present — an invalid signature never
    // reaches the atomic-consume step at all (signature verification
    // runs first in the real function).
    expect(redisStore.get(`auth:challenge:${publicKeyHex}`)).toBe(challenge)

    const legitimateSignature = signChallenge(challenge)
    const legitimateAttempt = await verifySignedChallenge(publicKeyHex, legitimateSignature)
    expect(legitimateAttempt.verified).toBe(true)
  })

  // Adversarial requirement 3 — a stale valid auth request (holding an
  // old, already-observed challenge) must never delete a newly-issued
  // replacement challenge for the same public key. Directly exercises
  // the real atomicCompareAndConsume() call verifySignedChallenge()
  // makes: the stale request's claim compares against the OLD value,
  // which no longer matches what is currently stored.
  it('a stale request holding an OLD challenge cannot consume a newly-issued REPLACEMENT challenge', async () => {
    const { atomicCompareAndConsume } = require('../src/common/redis/atomic-consume')
    const key = `auth:challenge:${publicKeyHex}`

    const { challenge: staleChallenge } = await issueChallenge(publicKeyHex)
    // A fresh challenge is issued for the SAME public key before the
    // stale request's claim runs — issueChallenge() unconditionally
    // overwrites the stored value (real, existing behavior).
    const { challenge: freshChallenge } = await issueChallenge(publicKeyHex)
    expect(freshChallenge).not.toBe(staleChallenge)

    const staleClaim = await atomicCompareAndConsume(key, staleChallenge)
    expect(staleClaim).toBe(false)
    // The replacement challenge must still be intact — never deleted by
    // the stale claim attempt.
    expect(redisStore.get(key)).toBe(freshChallenge)

    // The real, current challenge remains genuinely consumable.
    const freshClaim = await atomicCompareAndConsume(key, freshChallenge)
    expect(freshClaim).toBe(true)
  })

  // Adversarial requirement 8 (AUTH half) — no challenge issued at all
  // (or expired/evicted): zero winners, even under concurrency.
  it('10 concurrent attempts against a NEVER-issued challenge: zero winners', async () => {
    const forgedSignature = signChallenge('irrelevant-since-no-challenge-exists')

    const results = await Promise.all(
      Array.from({ length: 10 }, () => verifySignedChallenge(publicKeyHex, forgedSignature))
    )

    expect(results.every((r) => r.verified === false)).toBe(true)
  })
})
