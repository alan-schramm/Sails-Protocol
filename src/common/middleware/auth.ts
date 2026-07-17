/**
 * Ed25519 Auth Middleware — fixes RED_TEAM_REVIEW.md RT-002 and the #1
 * item in TODO.md §3. Before this file existed, every route accepted a
 * raw `userId` in the request body with zero proof the caller controlled
 * that identity's keypair. This is the actual fix, not just the flag.
 *
 * Flow (challenge-response, PROTOCOL_SPECIFICATION.md §1.1's IdentityProof):
 *   1. Client requests a challenge for their claimed publicKey
 *   2. Server issues a random nonce, stored in Redis with a short TTL
 *   3. Client signs the nonce with their Ed25519 secret key
 *   4. Client sends { publicKey, signature } on every subsequent request
 *   5. This middleware verifies the signature against a per-request nonce
 *      header — never trusts a bare userId again
 */
import nacl from 'tweetnacl'
import { randomBytes } from 'crypto'
import { redis } from '../redis'
import { prisma } from '../database'
import { config } from '../../config'
import { AuthError } from '../errors'

const CHALLENGE_PREFIX = 'auth:challenge:'
const SESSION_PREFIX = 'auth:session:'

function toBytes(hex: string): Uint8Array {
  return new Uint8Array(Buffer.from(hex, 'hex'))
}

/**
 * Step 1-2: issue a challenge. Called by POST /v1/identity/challenge.
 */
export async function issueChallenge(publicKeyHex: string): Promise<{ challenge: string; expiresIn: number }> {
  const challenge = randomBytes(32).toString('hex')
  await redis.set(
    `${CHALLENGE_PREFIX}${publicKeyHex}`,
    challenge,
    'EX',
    config.auth.challengeTtlSeconds
  )
  return { challenge, expiresIn: config.auth.challengeTtlSeconds }
}

/**
 * Step 4-5 core logic: verify a signature against the previously-issued
 * challenge for this publicKey. One-time use — the challenge is deleted
 * on successful verification, so a captured signature can't be replayed.
 */
export async function verifySignedChallenge(
  publicKeyHex: string,
  signatureHex: string
): Promise<{ verified: boolean; participantId?: string; sessionToken?: string; reason?: string }> {
  const storedChallenge = await redis.get(`${CHALLENGE_PREFIX}${publicKeyHex}`)
  if (!storedChallenge) {
    return { verified: false, reason: 'No challenge issued, or it expired — request a new one' }
  }

  let sigValid = false
  try {
    sigValid = nacl.sign.detached.verify(
      toBytes(Buffer.from(storedChallenge).toString('hex')),
      toBytes(signatureHex),
      toBytes(publicKeyHex)
    )
  } catch {
    return { verified: false, reason: 'Malformed signature or public key encoding' }
  }

  if (!sigValid) {
    return { verified: false, reason: 'Signature does not match challenge for this public key' }
  }

  // One-time use: burn the challenge immediately so it can never be replayed.
  await redis.del(`${CHALLENGE_PREFIX}${publicKeyHex}`)

  const user = await prisma.user.findUnique({ where: { publicKey: publicKeyHex } })
  if (!user) {
    return { verified: false, reason: 'No participant registered for this public key — call /v1/identity/participants first' }
  }

  // Issue a short-lived session token bound to this participantId — every
  // subsequent request in this window is authenticated via the session,
  // not by re-signing every call.
  const sessionToken = randomBytes(32).toString('hex')
  await redis.set(
    `${SESSION_PREFIX}${sessionToken}`,
    user.id,
    'EX',
    config.auth.sessionTtlSeconds
  )

  // Bug fix (found while wiring identity.routes.ts): this function
  // generated and stored sessionToken above but never returned it, so a
  // caller had no way to learn the bearer token requireAuth() expects on
  // every subsequent request — the challenge-response flow was unusable
  // end-to-end despite verifying correctly.
  return { verified: true, participantId: user.id, sessionToken }
}

/**
 * Fastify preHandler — attaches request.participantId, or throws AuthError.
 * This is what every route restored from TODO.md must use — a route
 * that reads `req.body.userId` directly instead of `req.participantId`
 * set by this middleware is exactly the RT-002 vulnerability again.
 */
export async function requireAuth(req: any, _reply: any): Promise<void> {
  const token = req.headers['authorization']?.replace(/^Bearer\s+/i, '')
  if (!token) {
    throw new AuthError('Missing Authorization header')
  }

  const participantId = await redis.get(`${SESSION_PREFIX}${token}`)
  if (!participantId) {
    throw new AuthError('Session expired or invalid — re-authenticate via /v1/identity/challenge')
  }

  req.participantId = participantId
}
