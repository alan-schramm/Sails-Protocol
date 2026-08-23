/**
 * Error classes — referenced by escrow.service.ts, liquidity.service.ts,
 * and every route that gets restored. API_REFERENCE.md §9 defines the
 * response shape these map to.
 */

// Same link on every error response — there's no per-code anchor in
// API_REFERENCE.md's §9 (a table's rows aren't independently addressable
// on GitHub), so this points at the whole error-taxonomy section rather
// than fabricating anchors that don't exist. Real, checked repo URL, not
// a guessed one — this is the same GitHub path every other doc link in
// this codebase already uses.
export const ERROR_DOCS_URL = 'https://github.com/alan-schramm/Sails-Protocol/blob/main/docs/API_REFERENCE.md#9-error-response-shape'

export class AppError extends Error {
  statusCode: number
  code: string
  details?: unknown

  constructor(message: string, statusCode = 500, code = 'INTERNAL_ERROR', details?: unknown) {
    super(message)
    this.name = this.constructor.name
    this.statusCode = statusCode
    this.code = code
    this.details = details
    Error.captureStackTrace?.(this, this.constructor)
  }

  toResponse() {
    return {
      success: false,
      error: this.code,
      message: this.message,
      details: this.details ?? [],
      docsUrl: ERROR_DOCS_URL,
    }
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id: string) {
    super(`${resource} not found: ${id}`, 404, 'NOT_FOUND')
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 400, 'VALIDATION_ERROR', details)
  }
}

export class EscrowError extends AppError {
  constructor(message: string) {
    super(message, 409, 'ESCROW_ERROR')
  }
}

export class AuthError extends AppError {
  constructor(message = 'Authentication required or invalid') {
    super(message, 401, 'AUTH_ERROR')
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Not authorized for this action') {
    super(message, 403, 'FORBIDDEN')
  }
}

// Missão 11 Fase 7.1A/7.2 — thrown when a fail-closed policy lookup
// (FeePolicyService.findLivePolicyForRail() / DistributionPolicyService.
// findLivePolicy()) finds more than one simultaneously-PUBLISHED row for
// the same economic authority. Should be structurally impossible under
// the DB-native exclusivity indexes (fee_policy_versions_single_published_
// per_rail_key / distribution_policy_versions_single_published_key) —
// this is defense-in-depth for a legacy/corrupt/raw-SQL-bypass state, not
// an expected runtime path. 500, not 409/403: this is never the caller's
// fault, it signals a real reconciliation-worthy anomaly in the data.
export class EconomicAuthorityAmbiguityError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 500, 'ECONOMIC_AUTHORITY_AMBIGUITY', details)
  }
}

// escrow-circuit-breaker.ts, 2026-08-15 — 503 (not 409 like EscrowError):
// this isn't "your specific request conflicted," it's "this escrow is
// temporarily paused because of a recent burst of conflicts on it" —
// the caller should back off and retry later, the same semantic
// @fastify/rate-limit's own 429 already carries for volume limiting.
export class CircuitBreakerOpenError extends AppError {
  constructor(message: string) {
    super(message, 503, 'CIRCUIT_BREAKER_OPEN')
  }
}

// redis-rate-limit.ts (Missão 08B Fase 9) — same code/shape
// @fastify/rate-limit's own plugin-thrown 429 already produces via
// app.ts's error handler (statusCode===429 -> 'RATE_LIMIT_EXCEEDED'), so
// a caller can't tell whether a given route is on the local plugin or
// the shared Redis limiter from the response alone.
export class RateLimitExceededError extends AppError {
  constructor(retryAfterSeconds: number) {
    super('Rate limit exceeded', 429, 'RATE_LIMIT_EXCEEDED', { retryAfterSeconds })
  }
}

// Fase 8's route matrix: auth + critical tiers both already hard-depend
// on Redis independent of rate limiting (challenge/session lookups),
// so failing closed here adds no new single point of failure — same
// 503/"temporarily unavailable, retry" semantic as CircuitBreakerOpenError
// above, not a 500 (this isn't a bug, it's a deliberate fail-closed
// policy decision).
export class RateLimitUnavailableError extends AppError {
  constructor() {
    super('Rate limiting store temporarily unavailable', 503, 'RATE_LIMIT_UNAVAILABLE')
  }
}
