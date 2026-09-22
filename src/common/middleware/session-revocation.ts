import type { FastifyRequest } from 'fastify'
import { redis } from '../redis'
import { AuthError } from '../errors'

const SESSION_PREFIX = 'auth:session:'

/**
 * Issue #312 — revoke exactly the bearer session presented by the caller.
 *
 * Redis is the authoritative shared session store used by requireAuth(), so
 * deleting this key invalidates the captured bearer across API instances.
 * DEL is intentionally idempotent. This primitive does not invent
 * account-wide revocation and does not claim to retroactively revoke an
 * already-issued WS ticket, which remains a separate short-lived credential.
 */
export async function revokeCurrentSession(req: FastifyRequest): Promise<void> {
  const token = req.headers['authorization']?.replace(/^Bearer\s+/i, '')
  if (!token) {
    throw new AuthError('Missing Authorization header')
  }

  await redis.del(`${SESSION_PREFIX}${token}`)
}
