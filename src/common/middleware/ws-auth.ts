/**
 * Session-token resolution for WebSocket upgrade routes — a browser
 * client can't set an Authorization header on a WS upgrade request the
 * way `requireAuth` (auth.ts) expects, so both chat.routes.ts and
 * relay.routes.ts authenticate via a `?token=` query param instead,
 * resolved against the same Redis session store `requireAuth` uses.
 * Extracted here because both files had their own identical copy of this
 * function and the `auth:session:` prefix (found while adding
 * relay.routes.ts, which would have made it a third copy).
 */
import { redis } from '../redis'

const SESSION_PREFIX = 'auth:session:'

export async function resolveParticipantFromToken(token: string | undefined): Promise<string | null> {
  if (!token) return null
  return redis.get(`${SESSION_PREFIX}${token}`)
}
