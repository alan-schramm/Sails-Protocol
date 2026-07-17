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
}

export interface SailsErrorResponseBody {
  success: false
  error: string
  message: string
  details?: unknown[]
}

export function errorFromResponseBody(body: SailsErrorResponseBody): SailsError {
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
  return new SailsError(body.message, body.error, 500, body.details ?? [])
}
