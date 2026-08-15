/**
 * In-memory, per-key fixed-window counter — the shared primitive behind
 * every rate-limit/detection-window in this codebase
 * (ws-message-rate-limiter.ts, suspicious-activity.ts,
 * escrow-circuit-breaker.ts, previously three separate copies of the
 * same Map<string, {count, resetAt}> logic). Single-instance, not
 * distributed — same deliberate-simplification precedent app.ts's own
 * @fastify/rate-limit comment already established for the HTTP tiers: a
 * real improvement over no ceiling, not a distributed solution.
 */
export class FixedWindowCounter {
  private readonly windows = new Map<string, { count: number; resetAt: number }>()

  /** sweepIntervalMs should be well above any windowMs a caller uses — it only bounds memory growth, it's not part of the limiting logic. */
  constructor(sweepIntervalMs: number) {
    setInterval(() => this.sweep(), sweepIntervalMs).unref()
  }

  private sweep(): void {
    const now = Date.now()
    for (const [key, window] of this.windows) {
      if (window.resetAt <= now) this.windows.delete(key)
    }
  }

  /** Increments key's count within windowMs, starting a fresh window if none is active. Returns the count after incrementing. */
  increment(key: string, windowMs: number): number {
    const now = Date.now()
    const existing = this.windows.get(key)
    if (!existing || existing.resetAt <= now) {
      this.windows.set(key, { count: 1, resetAt: now + windowMs })
      return 1
    }
    existing.count += 1
    return existing.count
  }

  /** Current count for key within its active window — 0 if none is active. Never increments or starts a window. */
  peek(key: string): number {
    const existing = this.windows.get(key)
    if (!existing || existing.resetAt <= Date.now()) return 0
    return existing.count
  }

  /** Test-only: clears all tracked windows so suites don't leak state across tests. */
  reset(): void {
    this.windows.clear()
  }
}
