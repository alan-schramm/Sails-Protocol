/**
 * Error classes — referenced by escrow.service.ts, liquidity.service.ts,
 * and every route that gets restored. API_REFERENCE.md §9 defines the
 * response shape these map to.
 */

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
