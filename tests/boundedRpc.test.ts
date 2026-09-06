/**
 * bounded-rpc.ts (F1, docs/TECHNICAL_DEBT_AUDIT.md #51) — proves the
 * property this fix exists for: every live chain/RPC call resolves or
 * fails within a bounded time, and only a call explicitly marked safe
 * (read-only) ever retries. These tests exercise the shared helper
 * directly rather than through a specific provider, since both
 * multisig.provider.ts and safe-guard-evm.provider.ts delegate to it
 * identically.
 */
import { boundedFetch, withBoundedRpcTimeout, BoundedRpcTimeoutError } from '../src/modules/open-settlement/bounded-rpc'

// A fetch stand-in that genuinely never resolves on its own — it only
// settles if its AbortSignal fires, exactly like a real hung TCP
// connection under a real AbortController-backed fetch. This is what
// distinguishes "the caller gave up waiting" (a real property this
// mission requires) from "the caller merely raced a promise that kept
// running in the background forever."
function hangingFetch(): jest.Mock {
  return jest.fn().mockImplementation((_url: string, init?: RequestInit) => {
    return new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        const err = new Error('aborted')
        err.name = 'AbortError'
        reject(err)
      })
    })
  })
}

describe('boundedFetch() — raw fetch() calls (multisig explorer, EVM bundler)', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
    jest.useRealTimers()
  })

  it('1. a hung request actually aborts and times out, rather than hanging forever', async () => {
    global.fetch = hangingFetch() as unknown as typeof fetch
    await expect(
      boundedFetch('https://explorer.example/tx/abc/status', {}, { timeoutMs: 30 })
    ).rejects.toThrow(BoundedRpcTimeoutError)
  })

  it('2. a safe (read-only) request retries only a bounded number of times, then gives up', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: false, status: 503 })
    global.fetch = fetchMock as unknown as typeof fetch
    const res = await boundedFetch('https://explorer.example/tx/abc/status', {}, {
      timeoutMs: 100,
      retry: { attempts: 3, backoffMs: 1 },
    })
    expect(res.status).toBe(503) // final, still-failing response is returned — never silently upgraded to success
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('3. a successful read does not retry, even when retry is authorized', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 })
    global.fetch = fetchMock as unknown as typeof fetch
    const res = await boundedFetch('https://explorer.example/tx/abc/status', {}, {
      timeoutMs: 100,
      retry: { attempts: 3, backoffMs: 1 },
    })
    expect(res.ok).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('4. a deterministic client error (404) is never retried, even when retry is authorized', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: false, status: 404 })
    global.fetch = fetchMock as unknown as typeof fetch
    const res = await boundedFetch('https://explorer.example/tx/abc/status', {}, {
      timeoutMs: 100,
      retry: { attempts: 3, backoffMs: 1 },
    })
    expect(res.status).toBe(404)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('5. a broadcast/submission call (no retry authorized) times out but is NEVER retried', async () => {
    global.fetch = hangingFetch() as unknown as typeof fetch
    await expect(
      boundedFetch('https://explorer.example/tx', { method: 'POST', body: 'deadbeef' }, { timeoutMs: 30 })
    ).rejects.toThrow(BoundedRpcTimeoutError)
    expect((global.fetch as jest.Mock)).toHaveBeenCalledTimes(1) // exactly once — no automatic retry of a submission
  })

  it('6. a broadcast/submission call that gets a transient 503 is NOT retried (retry is opt-in, never inferred)', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: false, status: 503 })
    global.fetch = fetchMock as unknown as typeof fetch
    const res = await boundedFetch('https://explorer.example/tx', { method: 'POST', body: 'deadbeef' }, { timeoutMs: 100 })
    expect(res.status).toBe(503)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('7. the final error remains visible to the caller after retries are exhausted', async () => {
    const fetchMock = jest.fn().mockRejectedValue(new Error('ECONNRESET'))
    global.fetch = fetchMock as unknown as typeof fetch
    await expect(
      boundedFetch('https://explorer.example/tx/abc/status', {}, { timeoutMs: 100, retry: { attempts: 2, backoffMs: 1 } })
    ).rejects.toThrow('ECONNRESET')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('8. no fake success is produced — a timeout never resolves, it always rejects', async () => {
    global.fetch = hangingFetch() as unknown as typeof fetch
    const outcome = await boundedFetch('https://explorer.example/tx/abc/status', {}, { timeoutMs: 20 }).then(
      () => 'resolved',
      () => 'rejected'
    )
    expect(outcome).toBe('rejected')
  })
})

describe('withBoundedRpcTimeout() — ethers JsonRpcProvider calls (SAFE_GUARD_EVM)', () => {
  it('1. a hung RPC call times out rather than hanging forever', async () => {
    const neverResolves = () => new Promise<bigint>(() => {})
    await expect(
      withBoundedRpcTimeout(neverResolves, 'test-hung-rpc-call', { timeoutMs: 30 })
    ).rejects.toThrow(BoundedRpcTimeoutError)
  })

  it('2. a safe (read-only) call retries only a bounded number of times, then gives up', async () => {
    const attempt = jest.fn().mockRejectedValue(new Error('ECONNRESET'))
    await expect(
      withBoundedRpcTimeout(attempt, 'test-retry-call', { timeoutMs: 100, retry: { attempts: 3, backoffMs: 1 } })
    ).rejects.toThrow('ECONNRESET')
    expect(attempt).toHaveBeenCalledTimes(3)
  })

  it('3. a successful call does not retry, even when retry is authorized', async () => {
    const attempt = jest.fn().mockResolvedValue(123n)
    const result = await withBoundedRpcTimeout(attempt, 'test-success-call', { timeoutMs: 100, retry: { attempts: 3, backoffMs: 1 } })
    expect(result).toBe(123n)
    expect(attempt).toHaveBeenCalledTimes(1)
  })

  it('7. the final error remains visible to the caller after retries are exhausted', async () => {
    const attempt = jest.fn().mockRejectedValue(new Error('rpc unreachable'))
    await expect(
      withBoundedRpcTimeout(attempt, 'test-final-error', { timeoutMs: 100, retry: { attempts: 2, backoffMs: 1 } })
    ).rejects.toThrow('rpc unreachable')
  })

  it('8. no fake success is produced — a timeout never resolves, it always rejects', async () => {
    const neverResolves = () => new Promise<bigint>(() => {})
    const outcome = await withBoundedRpcTimeout(neverResolves, 'test-no-fake-success', { timeoutMs: 20 }).then(
      () => 'resolved',
      () => 'rejected'
    )
    expect(outcome).toBe('rejected')
  })
})
