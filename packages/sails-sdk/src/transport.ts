/**
 * @sails/sdk — Transport layer (SDK_GUIDE.md section 4B's bottom layer:
 * "HTTP/WebSocket client, retry logic, auth headers")
 *
 * A real `fetch`-based HTTP client and a thin WebSocket wrapper — no
 * business logic, per SDK_GUIDE.md section 1 ("no new business logic...
 * if you ever find yourself adding real logic inside the SDK that isn't
 * already in a module's service layer, that's a design smell"). Every
 * module (identity.ts, liquidity.ts, etc.) calls through this, never
 * `fetch`/`WebSocket` directly — this is the one place base URL,
 * auth headers, and error-shape translation are handled.
 *
 * Uses the global `fetch`/`WebSocket` (available in every modern browser
 * and in Node.js 18+/22+ respectively — SDK_GUIDE.md section 6: "Must
 * work in both Node.js and browser environments"). Does not import `ws`
 * or any Node-only networking package, so this package has zero
 * environment-specific runtime dependencies beyond `tweetnacl` (pure JS,
 * identity.ts's Ed25519 signing).
 */
import { errorFromResponseBody, SailsTransportError, type SailsErrorResponseBody } from './errors'

export interface SailsTransportOptions {
  baseUrl: string
  fetchImpl?: typeof fetch
  webSocketImpl?: typeof WebSocket
  // Real network reliability (PRODUCTION_READINESS_REVIEW.md's High-
  // severity finding #1, closed 2026-08-02) — every request gets a real
  // timeout via AbortController; GET requests additionally get automatic
  // exponential-backoff retry. POST/PATCH/DELETE are deliberately NEVER
  // auto-retried here: this backend has no client-generated idempotency-
  // key mechanism, so a retried mutating call after a timeout genuinely
  // cannot be told apart from "the first attempt actually succeeded
  // server-side, this is now a duplicate" (the exact risk that review
  // called out) — silently retrying those would trade a visible timeout
  // error for an invisible double-submission, a worse failure mode.
  // Callers get a real timeout so they don't hang forever either way.
  timeoutMs?: number       // default 15000
  maxRetries?: number      // default 2 — GET only
  retryDelayMs?: number    // base delay for exponential backoff (doubles each attempt), default 300
}

// 502/503/504 are the transient, infrastructure-level failures worth
// retrying (bad gateway / unavailable / timeout at a proxy/LB) — a real
// 4xx or an ordinary 500 means the request was understood and rejected
// (or the server errored on that specific input), and retrying it
// identically will not change the outcome. 429 (DX audit, 2026-08-10 —
// previously not in this set at all, so a rate-limited GET surfaced as
// an immediate, unretried error) is the one real exception to that rule:
// @fastify/rate-limit's whole point is "this specific request is fine,
// just wait" — retrying identically is exactly the right move once the
// window resets. Below, a 429 response's real `Retry-After` header (sent
// by @fastify/rate-limit by default) is used for the wait instead of the
// generic exponential backoff, when present.
const RETRYABLE_STATUS_CODES = new Set([429, 502, 503, 504])

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export interface SailsApiEnvelope<T> {
  success: true
  data: T
}

export class SailsTransport {
  private sessionToken: string | null = null
  private readonly baseUrl: string
  private readonly fetchImpl: typeof fetch
  private readonly webSocketImpl: typeof WebSocket | undefined
  private readonly timeoutMs: number
  private readonly maxRetries: number
  private readonly retryDelayMs: number

  constructor(options: SailsTransportOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '')
    this.timeoutMs = options.timeoutMs ?? 15_000
    this.maxRetries = options.maxRetries ?? 2
    this.retryDelayMs = options.retryDelayMs ?? 300
    // Falls back to the global fetch — present in every modern browser
    // and Node 18+ — rather than bundling a polyfill this package
    // doesn't need in either target environment. Bound to globalThis,
    // not passed as a bare function reference: a real browser's fetch()
    // throws "Illegal invocation" when later called as `this.fetchImpl(...)`
    // (a method call whose receiver isn't a Window/WorkerGlobalScope) —
    // found the hard way in the first real browser exercise of this path
    // (packages/sails-ui), invisible to this SDK's own tests since they
    // always inject an explicit fetchImpl mock.
    //
    // Resolved into a local first (audit finding, docs/TODO.md §28):
    // validating and throwing BEFORE ever assigning to the readonly,
    // non-nullable `this.fetchImpl` field means no `as unknown as`
    // escape hatch is needed to satisfy the type checker — the field's
    // type keeps genuinely guaranteeing "always present, never
    // undefined" instead of the guarantee resting on a cast plus an
    // immediate-throw convention a future editor could accidentally
    // break.
    const resolvedFetch = options.fetchImpl ?? (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : undefined)
    if (!resolvedFetch) {
      throw new SailsTransportError(
        'No fetch implementation available — pass { fetchImpl } explicitly in an environment without a global fetch.'
      )
    }
    this.fetchImpl = resolvedFetch
    this.webSocketImpl = options.webSocketImpl ?? (typeof WebSocket !== 'undefined' ? WebSocket : undefined)
  }

  setSessionToken(token: string | null): void {
    this.sessionToken = token
  }

  getSessionToken(): string | null {
    return this.sessionToken
  }

  private url(path: string): string {
    return `${this.baseUrl}${path}`
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    opts: { body?: unknown; query?: Record<string, string | number | undefined>; auth?: boolean } = {}
  ): Promise<T> {
    let fullPath = path
    if (opts.query) {
      const params = new URLSearchParams()
      for (const [key, value] of Object.entries(opts.query)) {
        if (value !== undefined) params.set(key, String(value))
      }
      const qs = params.toString()
      if (qs) fullPath += `?${qs}`
    }

    const headers: Record<string, string> = {}
    if (opts.body !== undefined) headers['content-type'] = 'application/json'
    if (opts.auth) {
      if (!this.sessionToken) {
        throw new SailsTransportError(
          `${method} ${path} requires authentication — call identity.authenticate() first (or client.setSessionToken()).`
        )
      }
      headers['authorization'] = `Bearer ${this.sessionToken}`
    }

    // GET is the only verb retried automatically — see SailsTransportOptions's
    // own comment for why POST/PATCH/DELETE aren't (no idempotency-key
    // mechanism on this backend to tell "retry" apart from "duplicate").
    const maxAttempts = method === 'GET' ? this.maxRetries + 1 : 1

    let lastError: unknown
    let retryAfterMs: number | undefined
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt > 0) {
        if (retryAfterMs !== undefined) {
          // A prior attempt hit 429 with a real Retry-After header — use
          // the server's own number instead of guessing via exponential
          // backoff, then fall back to the normal schedule if it happens
          // again without one.
          await sleep(retryAfterMs)
          retryAfterMs = undefined
        } else {
          // Exponential backoff with jitter (±20%) — avoids every client
          // retrying in lockstep against a server that's already struggling.
          const baseDelay = this.retryDelayMs * 2 ** (attempt - 1)
          const jitter = baseDelay * 0.2 * (Math.random() * 2 - 1)
          await sleep(Math.max(0, baseDelay + jitter))
        }
      }

      const controller = typeof AbortController !== 'undefined' ? new AbortController() : undefined
      const timer = controller ? setTimeout(() => controller.abort(), this.timeoutMs) : undefined

      let response: Response
      try {
        response = await this.fetchImpl(this.url(fullPath), {
          method,
          headers,
          body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
          signal: controller?.signal,
        })
      } catch (err) {
        if (timer) clearTimeout(timer)
        const timedOut = controller?.signal.aborted
        lastError = new SailsTransportError(
          timedOut
            ? `Request timed out after ${this.timeoutMs}ms: ${method} ${fullPath}`
            : `Network request failed: ${method} ${fullPath} — ${err instanceof Error ? err.message : String(err)}`
        )
        if (attempt < maxAttempts - 1) continue
        throw lastError
      }
      if (timer) clearTimeout(timer)

      if (!response.ok && RETRYABLE_STATUS_CODES.has(response.status) && attempt < maxAttempts - 1) {
        lastError = new SailsTransportError(`${method} ${fullPath} returned a retryable status ${response.status}`)
        if (response.status === 429) {
          const retryAfterHeader = response.headers.get('retry-after')
          const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : NaN
          retryAfterMs = Number.isFinite(retryAfterSeconds) ? retryAfterSeconds * 1000 : undefined
        }
        continue
      }

      let json: unknown
      try {
        json = await response.json()
      } catch {
        throw new SailsTransportError(`${method} ${fullPath} returned a non-JSON response (status ${response.status})`)
      }

      if (!response.ok || (json as { success?: boolean }).success === false) {
        throw errorFromResponseBody(json as SailsErrorResponseBody, response.status)
      }

      return (json as SailsApiEnvelope<T>).data
    }

    // Unreachable in practice (the loop above always returns or throws on
    // its final attempt) — satisfies the compiler's control-flow analysis
    // without an `as never`/non-null assertion.
    throw lastError instanceof Error ? lastError : new SailsTransportError(`${method} ${fullPath} failed after ${maxAttempts} attempt(s)`)
  }

  get<T>(path: string, query?: Record<string, string | number | undefined>, auth = false): Promise<T> {
    return this.request<T>('GET', path, { query, auth })
  }

  post<T>(path: string, body?: unknown, auth = false): Promise<T> {
    return this.request<T>('POST', path, { body: body ?? {}, auth })
  }

  patch<T>(path: string, body?: unknown, auth = false): Promise<T> {
    return this.request<T>('PATCH', path, { body: body ?? {}, auth })
  }

  delete<T>(path: string, auth = false): Promise<T> {
    return this.request<T>('DELETE', path, { auth })
  }

  /**
   * Opens a raw WebSocket to `path` (relative to baseUrl, http(s)
   * auto-mapped to ws(s)). Callers own the connection's message protocol
   * — see modules/openp2p.ts's chat() for the one real protocol this SDK
   * currently wraps (API_REFERENCE.md section 5).
   */
  openWebSocket(path: string, query?: Record<string, string>): WebSocket {
    if (!this.webSocketImpl) {
      throw new SailsTransportError(
        'No WebSocket implementation available — pass { webSocketImpl } explicitly in an environment without a global WebSocket.'
      )
    }
    const wsBaseUrl = this.baseUrl.replace(/^http/, 'ws')
    let fullPath = path
    if (query) {
      const params = new URLSearchParams(query)
      fullPath += `?${params.toString()}`
    }
    return new this.webSocketImpl(`${wsBaseUrl}${fullPath}`)
  }
}
