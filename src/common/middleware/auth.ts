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
import type { FastifyRequest } from 'fastify'
import { redis } from '../redis'
import { atomicCompareAndConsume } from '../redis/atomic-consume'
import { prisma } from '../database'
import { config } from '../../config'
import { AuthError } from '../errors'

/**
 * Typed request object for authenticated routes. Every route that uses
 * requireAuth can cast to this type to get type-safe access to participantId
 * without resorting to `(request as any).participantId`.
 */
export interface AuthenticatedRequest extends FastifyRequest {
  participantId: string
}

const CHALLENGE_PREFIX = 'auth:challenge:'
const SESSION_PREFIX = 'auth:session:'
const WS_TICKET_PREFIX = 'auth:ws-ticket:'

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
 * challenge for this publicKey.
 *
 * Issue #301 — one-time use is enforced by an ATOMIC compare-and-consume
 * (`atomicCompareAndConsume()`), not a separate `GET` + `DEL`. The plain
 * `redis.get()` below is only an OBSERVATION used to verify the
 * signature against — it is never itself the consuming operation, and
 * crucially it runs BEFORE any deletion, so an invalid signature never
 * reaches (and therefore never burns) the stored challenge. Only after
 * the signature verifies does this atomically claim the EXACT observed
 * challenge value: two concurrent replays of the same captured
 * (challenge, signature) pair both observe the same challenge and both
 * verify successfully, but the atomic claim has exactly one winner —
 * the loser's claim finds the value already gone (or, if a fresh
 * replacement challenge was issued in between, finds a DIFFERENT
 * current value) and fails closed, never deleting anything.
 */
export async function verifySignedChallenge(
  publicKeyHex: string,
  signatureHex: string
): Promise<{ verified: boolean; participantId?: string; sessionToken?: string; reason?: string }> {
  const challengeKey = `${CHALLENGE_PREFIX}${publicKeyHex}`
  const storedChallenge = await redis.get(challengeKey)
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

  // Atomic claim of the EXACT challenge this signature was verified
  // against — see this function's own header comment above for why
  // this must be compare-and-consume, not a blind delete. `false` means
  // this call lost the race (a concurrent request already consumed it)
  // or the challenge was replaced by a newer one since it was observed
  // — either way, fail closed: no session is minted.
  const claimed = await atomicCompareAndConsume(challengeKey, storedChallenge)
  if (!claimed) {
    return { verified: false, reason: 'Challenge already consumed or replaced — request a new one' }
  }

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
 * Security review finding, 2026-08-15 (P1): chat.routes.ts/relay.routes.ts's
 * WS upgrade routes authenticated via `?token=<raw session token>` — a
 * browser WS handshake can't set an Authorization header the way
 * requireAuth expects, but a raw session token is long-lived (1h
 * default) and reusable, so putting it in a URL meant it could leak
 * into proxy/load-balancer/observability logs (pino's own request-log
 * redact only masks named object fields — 'token' — never a substring
 * embedded inside req.url). Called from a new authenticated HTTP
 * endpoint (POST /v1/identity/ws-ticket) — the caller already proved
 * who they are via the Bearer session token on that call; this mints a
 * short-lived, single-use value instead, so even a captured ticket is
 * worthless within `wsTicketTtlSeconds` and can never be replayed a
 * second time regardless. Resolution + one-time burn lives in
 * ws-auth.ts's resolveParticipantFromTicket().
 */
export async function issueWsTicket(participantId: string): Promise<{ ticket: string; expiresIn: number }> {
  const ticket = randomBytes(32).toString('hex')
  await redis.set(
    `${WS_TICKET_PREFIX}${ticket}`,
    participantId,
    'EX',
    config.auth.wsTicketTtlSeconds
  )
  return { ticket, expiresIn: config.auth.wsTicketTtlSeconds }
}

/**
 * Fastify preHandler — attaches request.participantId, or throws AuthError.
 * This is what every route restored from TODO.md must use — a route
 * that reads `req.body.userId` directly instead of `req.participantId`
 * set by this middleware is exactly the RT-002 vulnerability again.
 */
export async function requireAuth(req: FastifyRequest, _reply: any): Promise<void> {
  const token = req.headers['authorization']?.replace(/^Bearer\s+/i, '')
  if (!token) {
    throw new AuthError('Missing Authorization header')
  }

  const participantId = await redis.get(`${SESSION_PREFIX}${token}`)
  if (!participantId) {
    throw new AuthError('Session expired or invalid — re-authenticate via /v1/identity/challenge')
  }

  ;(req as AuthenticatedRequest).participantId = participantId
}
