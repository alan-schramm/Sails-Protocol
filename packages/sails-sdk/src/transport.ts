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

  constructor(options: SailsTransportOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '')
    // Falls back to the global fetch — present in every modern browser
    // and Node 18+ — rather than bundling a polyfill this package
    // doesn't need in either target environment.
    this.fetchImpl = options.fetchImpl ?? (typeof fetch !== 'undefined' ? fetch : undefined as unknown as typeof fetch)
    if (!this.fetchImpl) {
      throw new SailsTransportError(
        'No fetch implementation available — pass { fetchImpl } explicitly in an environment without a global fetch.'
      )
    }
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

    let response: Response
    try {
      response = await this.fetchImpl(this.url(fullPath), {
        method,
        headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      })
    } catch (err) {
      throw new SailsTransportError(
        `Network request failed: ${method} ${fullPath} — ${err instanceof Error ? err.message : String(err)}`
      )
    }

    let json: unknown
    try {
      json = await response.json()
    } catch {
      throw new SailsTransportError(`${method} ${fullPath} returned a non-JSON response (status ${response.status})`)
    }

    if (!response.ok || (json as { success?: boolean }).success === false) {
      throw errorFromResponseBody(json as SailsErrorResponseBody)
    }

    return (json as SailsApiEnvelope<T>).data
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
