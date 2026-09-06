/**
 * Sails OpenSettlement — bounded liveness for live chain/RPC calls (F1).
 *
 * Closes docs/TECHNICAL_DEBT_AUDIT.md #51: every live external chain/RPC
 * call in the MULTISIG/SAFE_GUARD_EVM settlement path must resolve or
 * fail within a bounded time. Shared by both providers because both
 * genuinely need identical semantics (timeout, and — only where the
 * caller explicitly asks for it — a bounded retry); this is a tiny local
 * helper, not a generic resilience framework, provider abstraction, or
 * policy registry.
 *
 * TIMEOUT != RETRY. Every call here gets a bounded timeout. Retry is an
 * opt-in the CALLER decides per call site, never inferred here — a
 * mutating/broadcast/submission call must never pass `retry`, since a
 * timeout after dispatch means "result unknown," not "operation failed,"
 * and retrying could duplicate an already-accepted economic action
 * (docs/BACKLOG.md's F1 obligation).
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
 * Bounds an already-issued call whose transport this codebase doesn't
 * control directly (ethers' `JsonRpcProvider` — no external AbortSignal
 * pass-through in the installed version). This bounds the CALLER's wait
 * and produces a distinguishable timeout error; it does not guarantee
 * the underlying socket is torn down (a disclosed, honest limitation of
 * ethers' transport, not a gap in this helper) — the property this
 * mission closes ("resolve or fail within a bounded time") is satisfied
 * from the settlement path's own perspective either way. Retry, when
 * requested, is bounded and linear-backoff, matching `boundedFetch()`.
 */
export async function withBoundedRpcTimeout<T>(fn: () => Promise<T>, label: string, options: BoundedFetchOptions): Promise<T> {
  const attempts = options.retry?.attempts ?? 1
  const backoffMs = options.retry?.backoffMs ?? 0
  let lastError: unknown

  for (let attempt = 1; attempt <= attempts; attempt++) {
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new BoundedRpcTimeoutError(label, options.timeoutMs)), options.timeoutMs)
    })
    try {
      return await Promise.race([fn(), timeout])
    } catch (err) {
      lastError = err
      if (attempt < attempts) {
        await delay(backoffMs * attempt)
        continue
      }
      throw lastError
    } finally {
      clearTimeout(timer)
    }
  }
  throw lastError
}
