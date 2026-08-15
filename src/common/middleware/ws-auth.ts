/**
 * Single-use WS ticket resolution for WebSocket upgrade routes — a
 * browser client can't set an Authorization header on a WS upgrade
 * request the way `requireAuth` (auth.ts) expects, so both
 * chat.routes.ts and relay.routes.ts authenticate via a query param
 * instead. Extracted here because both files had their own identical
 * copy of this function (found while adding relay.routes.ts, which
 * would have made it a third copy).
 *
 * Security review finding, 2026-08-15 (P1): this used to resolve a raw,
 * long-lived session token (`?token=`) straight against the same Redis
 * session store `requireAuth` uses — reusable, and dangerous to have
 * sitting in a URL that proxies/load-balancers/observability tooling
 * commonly log in full (pino's own request-log redact only masks named
 * object fields, never a substring inside req.url). Replaced with a
 * short-lived, single-use ticket (issueWsTicket() in auth.ts, minted by
 * an authenticated POST /v1/identity/ws-ticket call): resolving one
 * here immediately burns it, so even a ticket that does leak into a log
 * is worthless within seconds and can never be replayed a second time.
 */
import { redis } from '../redis'

const WS_TICKET_PREFIX = 'auth:ws-ticket:'

export async function resolveParticipantFromTicket(ticket: string | undefined): Promise<string | null> {
  if (!ticket) return null
  const key = `${WS_TICKET_PREFIX}${ticket}`
  const participantId = await redis.get(key)
  if (!participantId) return null
  await redis.del(key)
  return participantId
}
