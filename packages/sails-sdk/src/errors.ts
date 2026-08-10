/**
 * @sails/sdk — typed errors
 *
 * Mirrors the reference implementation's `AppError` hierarchy
 * (src/common/errors/index.ts) and its response shape
 * (`API_REFERENCE.md` section 9:
 * `{ success: false, error: <CODE>, message, details: [] }`), verified
 * against src/app.ts's `setErrorHandler` and each `AppError` subclass's
 * `statusCode` before writing this — SDK_GUIDE.md section 6 requires
 * "typed subclasses matching the AppError hierarchy... not raw HTTP
 * error objects."
 */

export class SailsError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number,
    public readonly details: unknown[] = []
  ) {
    super(message)
    this.name = 'SailsError'
  }
}

export class SailsValidationError extends SailsError {
  constructor(message: string, details: unknown[] = []) {
    super(message, 'VALIDATION_ERROR', 400, details)
    this.name = 'SailsValidationError'
  }
}

export class SailsNotFoundError extends SailsError {
  constructor(message: string) {
    super(message, 'NOT_FOUND', 404)
    this.name = 'SailsNotFoundError'
  }
}

export class SailsEscrowError extends SailsError {
  constructor(message: string) {
    super(message, 'ESCROW_ERROR', 409)
    this.name = 'SailsEscrowError'
  }
}

export class SailsAuthError extends SailsError {
  constructor(message: string) {
    super(message, 'AUTH_ERROR', 401)
    this.name = 'SailsAuthError'
  }
}

export class SailsForbiddenError extends SailsError {
  constructor(message: string) {
    super(message, 'FORBIDDEN', 403)
    this.name = 'SailsForbiddenError'
  }
}

export class SailsInternalError extends SailsError {
  constructor(message: string) {
    super(message, 'INTERNAL_ERROR', 500)
    this.name = 'SailsInternalError'
  }
}

// DX audit, 2026-08-10 — @fastify/rate-limit's real 429 response
// (app.ts's setErrorHandler, API_REFERENCE.md §9) had no typed SDK
// counterpart; it fell through to the generic SailsError fallback below,
// which hardcoded statusCode 500 regardless of the real response —
// callers had no way to tell a rate limit apart from a real server
// error by inspecting the typed error. Note: SailsTransport (transport.ts)
// already retries a GET request that hits 429 automatically (using the
// real Retry-After header when present) — this class is what a caller
// sees for a mutating request (POST/PATCH/DELETE never auto-retry) or
// once GET's own retries are exhausted.
export class SailsRateLimitError extends SailsError {
  constructor(message: string) {
    super(message, 'RATE_LIMIT_EXCEEDED', 429)
    this.name = 'SailsRateLimitError'
  }
}

// A server response wasn't the standard `{success:false, error, message,
// details}` shape at all (network failure, non-Sails server, etc.) — kept
// distinct from SailsInternalError (a real, well-formed 500 from a Sails
// node) so callers can tell "the protocol node reported an internal
// error" apart from "something between us and the node broke."
export class SailsTransportError extends SailsError {
  constructor(message: string) {
    super(message, 'TRANSPORT_ERROR', 0)
    this.name = 'SailsTransportError'
  }
}

// Client-side precondition failure with no server round-trip at all — e.g.
// calling client.getBalance()/sendTransaction()/etc. without having passed
// a WalletAdapter to the SailsClient constructor. Deliberately NOT
// SailsTransportError: no network activity was ever attempted here, so
// "something between us and the node broke" would be the wrong diagnosis
// for a caller catching this. Production Readiness Audit finding, closed
// 2026-08-09 — client.ts's five wallet-adapter methods' own JSDoc already
// promised `@throws SailsTransportError`, but the real thrown type was a
// bare `Error`; this fixes both the type and the promise to agree, rather
// than picking whichever was more convenient to leave as-is.
export class SailsConfigError extends SailsError {
  constructor(message: string) {
    super(message, 'CONFIG_ERROR', 0)
    this.name = 'SailsConfigError'
  }
}

// Thrown by SDK methods whose backing route/primitive genuinely does not
// exist yet in the reference implementation (Proof primitive has zero
// routes; there is no Intent -> Trade -> Escrow resolution path for
// releaseAsset(intentId)/dispute(intentId, reason) yet — see
// docs/BACKLOG.md P0's Proof Primitive row and TODO.md). SDK_GUIDE.md's
// own rule ("no new business logic... a design smell") means this SDK
// will not paper over that gap with fabricated behavior — it fails loud
// and says exactly what's missing, instead of silently succeeding
// against nothing.
export class SailsNotImplementedError extends SailsError {
  constructor(message: string) {
    super(message, 'NOT_IMPLEMENTED', 501)
    this.name = 'SailsNotImplementedError'
  }
}

const ERROR_CODE_MAP: Record<string, new (message: string, details?: unknown[]) => SailsError> = {
  VALIDATION_ERROR: SailsValidationError,
  NOT_FOUND: SailsNotFoundError,
  ESCROW_ERROR: SailsEscrowError,
  AUTH_ERROR: SailsAuthError,
  FORBIDDEN: SailsForbiddenError,
  INTERNAL_ERROR: SailsInternalError,
  RATE_LIMIT_EXCEEDED: SailsRateLimitError,
}

export interface SailsErrorResponseBody {
  success: false
  error: string
  message: string
  details?: unknown[]
}

// `statusCode` (DX audit, 2026-08-10 — previously not accepted here at
// all) is the real HTTP status the response actually came back with.
// Recognized codes below already hardcode the right statusCode on their
// own class (mirroring the server's AppError hierarchy exactly, verified
// against app.ts), so this param only matters for the generic fallback —
// without it, an unrecognized code (e.g. a future server-side addition
// this SDK hasn't been taught about yet) always reported statusCode 500
// regardless of what actually happened, which is wrong for anything
// that wasn't literally a 500.
export function errorFromResponseBody(body: SailsErrorResponseBody, statusCode: number): SailsError {
  const ErrorClass = ERROR_CODE_MAP[body.error]
  if (ErrorClass === SailsValidationError) {
    return new SailsValidationError(body.message, body.details ?? [])
  }
  if (ErrorClass) {
    return new ErrorClass(body.message)
  }
  // An error code this SDK doesn't recognize yet — still a real,
  // well-formed Sails error response, just not one of the known
  // AppError subclasses. Surfaced as-is rather than forced into the
  // wrong bucket.
  return new SailsError(body.message, body.error, statusCode, body.details ?? [])
}
