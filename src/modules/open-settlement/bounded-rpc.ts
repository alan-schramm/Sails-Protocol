/**
 * Sails OpenSettlement — bounded liveness for live chain/RPC calls (F1).
 *
 * Closes docs/TECHNICAL_DEBT_AUDIT.md #51: every live external chain/RPC
 * call in the MULTISIG/SAFE_GUARD_EVM settlement path must resolve or
 * fail within a bounded time. Two distinct transports, two distinct
 * mechanisms — neither is a generic resilience framework, provider
 * abstraction, or policy registry:
 *
 * - `boundedFetch()` — raw `fetch()` calls (multisig.provider.ts's
 *   explorer calls, safe-guard-evm.provider.ts's bundler submission).
 *   This codebase owns the transport directly, so timeout is a real
 *   `AbortController` that genuinely cancels the in-flight request.
 * - `withBoundedRetry()` — `ethers` `JsonRpcProvider`/`Contract` calls
 *   (safe-guard-evm.provider.ts's RPC reads). This codebase does NOT own
 *   the transport; timeout is configured natively on `ethers` itself
 *   (`FetchRequest.timeout`, set once where the provider is constructed
 *   — see that call site's own comment for the evidence this is a real,
 *   not merely caller-side, bound), so this helper is retry-only.
 *
 * TIMEOUT != RETRY. Retry is an opt-in the CALLER decides per call site,
 * never inferred here — a mutating/broadcast/submission call must never
 * request it, since a timeout after dispatch means "result unknown," not
 * "operation failed," and retrying could duplicate an already-accepted
 * economic action (docs/BACKLOG.md's F1 obligation).
 */

export class BoundedRpcTimeoutError extends Error {
  constructor(label: string, timeoutMs: number) {
    super(`Bounded RPC call timed out after ${timeoutMs}ms: ${label}`)
    this.name = 'BoundedRpcTimeoutError'
  }
}

export interface BoundedRetryPolicy {
  /** Total attempts, including the first — e.g. 3 means up to 2 retries. */
  attempts: number
  /** Linear backoff base; actual delay is backoffMs * attemptNumber. */
  backoffMs: number
}

export interface BoundedFetchOptions {
  timeoutMs: number
  /** Omit for any write/broadcast/submission call — see file header. */
  retry?: BoundedRetryPolicy
}

// 429 (rate limited) and 5xx (server/gateway trouble) are transient and
// safe to retry on an already-classified-safe (read-only) call; any
// other 4xx means the request itself is wrong and won't succeed on
// repeat, so it is never retried regardless of the caller's policy.
function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * fetch() with a real AbortController-backed timeout that actually
 * cancels the underlying network operation. Retry (bounded, linear
 * backoff, transient statuses/network errors only) only happens when the
 * caller explicitly passes `retry` — reserved for read-only calls whose
 * call site has justified that repeating them is safe.
 */
export async function boundedFetch(url: string, init: RequestInit, options: BoundedFetchOptions): Promise<Response> {
  const attempts = options.retry?.attempts ?? 1
  const backoffMs = options.retry?.backoffMs ?? 0
  let lastError: unknown

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), options.timeoutMs)
    try {
      const res = await fetch(url, { ...init, signal: controller.signal })
      clearTimeout(timer)
      if (!res.ok && isRetryableStatus(res.status) && attempt < attempts) {
        lastError = new Error(`HTTP ${res.status} from ${url}`)
        await delay(backoffMs * attempt)
        continue
      }
      return res
    } catch (err) {
      clearTimeout(timer)
      const aborted = err instanceof Error && err.name === 'AbortError'
      lastError = aborted ? new BoundedRpcTimeoutError(url, options.timeoutMs) : err
      if (attempt < attempts) {
        await delay(backoffMs * attempt)
        continue
      }
      throw lastError
    }
  }
  throw lastError
}

/**
 * CTO Gate correction (2026-09-06): an earlier version of this file
 * bounded ethers `JsonRpcProvider` calls with a `Promise.race()`-based
 * timeout (`withBoundedRpcTimeout()`). That was rejected — it only
 * bounds the CALLER's wait; the underlying ethers call keeps running
 * unbounded, so a retry loop built on top of it could start a second
 * attempt while the first was still live (overlapping hung network
 * work, never economically unsafe here since these are all reads, but
 * a real resource/liveness concern the CTO correctly flagged).
 *
 * Direct inspection of the installed `ethers@6.17.0` source
 * (`node_modules/ethers/lib.commonjs/utils/geturl.js`) plus an empirical
 * test against a TCP server that accepts a connection and never responds
 * confirmed `ethers.FetchRequest.timeout` is a REAL transport-level
 * timeout: `JsonRpcProvider` accepts a `FetchRequest` in its constructor
 * (`provider-jsonrpc.js`'s own `constructor(url, network, options)`
 * clones whatever `FetchRequest` it's given), and the default
 * `getUrlFunc` applies `req.timeout` via Node's own
 * `http.ClientRequest.setTimeout()`, which — proven empirically — DOES
 * reject a genuinely hung request with a distinguishable `TIMEOUT`-coded
 * error at the configured bound, not merely after some unrelated race.
 * Because each retry attempt now only starts after ethers' OWN transport
 * has already settled (rejected) the prior attempt, there is no more
 * overlap — `withBoundedRetry()` below is a plain sequential retry loop,
 * no timer of its own.
 *
 * Disclosed, not fixed here (would require writing a custom transport,
 * which this mission's own Simplicity Rule forbids): ethers' timeout
 * handler rejects the JS-level promise but does not call
 * `request.destroy()`/abort the socket — confirmed empirically, the
 * underlying TCP connection can still be open after the JS timeout
 * fires. This is a pre-existing ethers library behavior at the deepest
 * layer this codebase can reach without inventing a new transport, not
 * a gap introduced by this file.
 */
export async function withBoundedRetry<T>(fn: () => Promise<T>, options: BoundedRetryPolicy): Promise<T> {
  let lastError: unknown
  for (let attempt = 1; attempt <= options.attempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      if (attempt < options.attempts) {
        await delay(options.backoffMs * attempt)
        continue
      }
      throw lastError
    }
  }
  throw lastError
}
