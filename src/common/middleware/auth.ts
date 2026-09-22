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

export interface AuthenticatedRequest extends FastifyRequest {
  participantId: string
}

const CHALLENGE_PREFIX = 'auth:challenge:'
const SESSION_PREFIX = 'auth:session:'
const WS_TICKET_PREFIX = 'auth:ws-ticket:'
const REGISTER_CHALLENGE_PREFIX = 'identity:register-challenge:'
const REGISTRATION_PROOF_DOMAIN = 'sails-registration-proof-of-possession:v1'

function toBytes(hex: string): Uint8Array {
  return new Uint8Array(Buffer.from(hex, 'hex'))
}

export async function issueChallenge(publicKeyHex: string): Promise<{ challenge: string; expiresIn: number }> {
  const challenge = randomBytes(32).toString('hex')
  await redis.set(`${CHALLENGE_PREFIX}${publicKeyHex}`, challenge, 'EX', config.auth.challengeTtlSeconds)
  return { challenge, expiresIn: config.auth.challengeTtlSeconds }
}

export async function verifySignedChallenge(
  publicKeyHex: string,
  signatureHex: string
): Promise<{ verified: boolean; participantId?: string; sessionToken?: string; reason?: string }> {
  const challengeKey = `${CHALLENGE_PREFIX}${publicKeyHex}`
  const storedChallenge = await redis.get(challengeKey)
  if (!storedChallenge) return { verified: false, reason: 'No challenge issued, or it expired — request a new one' }

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
  if (!sigValid) return { verified: false, reason: 'Signature does not match challenge for this public key' }

  const claimed = await atomicCompareAndConsume(challengeKey, storedChallenge)
  if (!claimed) return { verified: false, reason: 'Challenge already consumed or replaced — request a new one' }

  const user = await prisma.user.findUnique({ where: { publicKey: publicKeyHex } })
  if (!user) return { verified: false, reason: 'No participant registered for this public key — call /v1/identity/participants first' }

  const sessionToken = randomBytes(32).toString('hex')
  await redis.set(`${SESSION_PREFIX}${sessionToken}`, user.id, 'EX', config.auth.sessionTtlSeconds)
  return { verified: true, participantId: user.id, sessionToken }
}

export async function issueRegistrationChallenge(publicKeyHex: string): Promise<{ challenge: string; expiresIn: number }> {
  const challenge = randomBytes(32).toString('hex')
  await redis.set(`${REGISTER_CHALLENGE_PREFIX}${publicKeyHex}`, challenge, 'EX', config.auth.challengeTtlSeconds)
  return { challenge, expiresIn: config.auth.challengeTtlSeconds }
}

export function registrationProofMessage(challenge: string, displayName?: string): Uint8Array {
  return new Uint8Array(Buffer.from(`${REGISTRATION_PROOF_DOMAIN}:${challenge}:${displayName ?? ''}`, 'utf8'))
}

export async function verifyRegistrationProof(
  publicKeyHex: string,
  signatureHex: string,
  displayName?: string
): Promise<{ verified: boolean; reason?: string }> {
  const challengeKey = `${REGISTER_CHALLENGE_PREFIX}${publicKeyHex}`
  const storedChallenge = await redis.get(challengeKey)
  if (!storedChallenge) return { verified: false, reason: 'No registration challenge issued, or it expired — request a new one' }

  let sigValid = false
  try {
    sigValid = nacl.sign.detached.verify(registrationProofMessage(storedChallenge, displayName), toBytes(signatureHex), toBytes(publicKeyHex))
  } catch {
    return { verified: false, reason: 'Malformed signature or public key encoding' }
  }
  if (!sigValid) return { verified: false, reason: 'Signature does not match the registration challenge/metadata for this public key' }

  const claimed = await atomicCompareAndConsume(challengeKey, storedChallenge)
  if (!claimed) return { verified: false, reason: 'Registration challenge already consumed or replaced — request a new one' }
  return { verified: true }
}

export async function issueWsTicket(participantId: string): Promise<{ ticket: string; expiresIn: number }> {
  const ticket = randomBytes(32).toString('hex')
  await redis.set(`${WS_TICKET_PREFIX}${ticket}`, participantId, 'EX', config.auth.wsTicketTtlSeconds)
  return { ticket, expiresIn: config.auth.wsTicketTtlSeconds }
}

/**
 * #312 — revoke exactly the bearer session presented by the caller.
 * Redis is the authoritative shared session store, so deletion is visible
 * immediately to every API instance. DEL is intentionally idempotent:
 * repeated logout is success, not a new authority decision.
 *
 * This does NOT invent account-wide revocation and does NOT claim to revoke
 * an already-issued WS ticket. WS tickets remain separately bounded by their
 * short TTL + one-time consume semantics.
 */
export async function revokeCurrentSession(req: FastifyRequest): Promise<void> {
  const token = req.headers['authorization']?.replace(/^Bearer\s+/i, '')
  if (!token) throw new AuthError('Missing Authorization header')
  await redis.del(`${SESSION_PREFIX}${token}`)
}

export async function requireAuth(req: FastifyRequest, _reply: any): Promise<void> {
  const token = req.headers['authorization']?.replace(/^Bearer\s+/i, '')
  if (!token) throw new AuthError('Missing Authorization header')

  const participantId = await redis.get(`${SESSION_PREFIX}${token}`)
  if (!participantId) throw new AuthError('Session expired or invalid — re-authenticate via /v1/identity/challenge')
  ;(req as AuthenticatedRequest).participantId = participantId
}
