/**
 * Suspicious-activity detection — closes the gap rate limiting structurally
 * can't: a volume limiter (app.ts's @fastify/rate-limit, ws-message-rate-limiter.ts)
 * only stops a *fast* flood. A slow, patient probe — one request every few
 * seconds, well under any per-minute ceiling — looks identical to a real
 * user to a pure rate limiter, and is exactly the pattern Boltz's own
 * shutdown post-mortem described ("months of automated, AI-assisted
 * probing... before the pace accelerated sharply").
 *
 * Deliberately not a WAF or an ML anomaly model — a small, in-memory,
 * fixed-window counter per (kind, identity), same shape and same
 * single-instance/deliberate-simplification precedent as
 * ws-message-rate-limiter.ts. It answers one question: "has this identity
 * crossed a suspicious threshold for this kind of failure recently?" — and
 * when the answer flips to yes, it logs once (not once per subsequent hit,
 * so a real ongoing probe doesn't spam the log into unreadability) and
 * emits an event so a human/alerting pipeline can act on it. Detection
 * only — mirrors RFC-017's SocialEngineeringAgent posture exactly: this
 * never blocks a request or bans an identity itself, it surfaces a signal.
 */
import { Counter } from 'prom-client'
import type { FastifyBaseLogger } from 'fastify'
import { config } from '../../config'
import { metricsRegistry } from '../metrics'
import { eventBus } from '../events/event-bus'

export type SuspiciousActivityKind = 'AUTH_FAILURE' | 'NOT_FOUND_CLUSTER' | 'RATE_LIMITED'

interface Window {
  count: number
  resetAt: number
  alerted: boolean
}

const windows = new Map<string, Window>()

function thresholdFor(kind: SuspiciousActivityKind): { max: number; windowMs: number } {
  switch (kind) {
    case 'AUTH_FAILURE':
      return { max: config.suspiciousActivity.authFailureMax, windowMs: config.suspiciousActivity.authFailureWindowMs }
    case 'NOT_FOUND_CLUSTER':
      return { max: config.suspiciousActivity.notFoundClusterMax, windowMs: config.suspiciousActivity.notFoundClusterWindowMs }
    case 'RATE_LIMITED':
      return { max: config.suspiciousActivity.rateLimitedMax, windowMs: config.suspiciousActivity.rateLimitedWindowMs }
  }
}

export const suspiciousActivityTotal = new Counter({
  name: 'sails_suspicious_activity_total',
  help: 'Total suspicious-activity threshold crossings, by kind',
  labelNames: ['kind'],
  registers: [metricsRegistry],
})

// Bounds map growth for a long-running process, same rationale as
// ws-message-rate-limiter.ts's own sweep — an identity seen once and never
// again shouldn't sit in memory forever. Runs far less often than any
// window here so it never interferes with the counting logic itself.
const SWEEP_INTERVAL_MS = 10 * 60 * 1000
setInterval(() => {
  const now = Date.now()
  for (const [key, window] of windows) {
    if (window.resetAt <= now) windows.delete(key)
  }
}, SWEEP_INTERVAL_MS).unref()

/**
 * Records one occurrence of `kind` for `identity` (participantId when the
 * caller is authenticated, request.ip otherwise — same fallback
 * @fastify/rate-limit's own default keying already uses). The first time
 * the window's threshold is crossed, logs a structured warning and emits
 * `security.suspicious_activity.detected` — once per window, not once per
 * subsequent hit past the threshold.
 */
export function recordSuspiciousActivity(kind: SuspiciousActivityKind, identity: string, log: FastifyBaseLogger): void {
  const { max, windowMs } = thresholdFor(kind)
  const key = `${kind}:${identity}`
  const now = Date.now()
  const existing = windows.get(key)

  if (!existing || existing.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs, alerted: false })
    return
  }

  existing.count += 1
  if (existing.count < max || existing.alerted) return

  existing.alerted = true
  suspiciousActivityTotal.inc({ kind })
  log.warn({
    msg: 'Suspicious activity pattern detected',
    module: 'suspicious-activity',
    kind,
    identity,
    count: existing.count,
    windowMs,
  })
  eventBus
    .emit('security.suspicious_activity.detected', {
      kind,
      identity,
      count: existing.count,
      windowMs,
      detectedAt: new Date().toISOString(),
    }, identity)
    .catch((err) => {
      log.error({ msg: 'Failed to emit security.suspicious_activity.detected', err: err instanceof Error ? err.message : String(err) })
    })
}

/** Test-only: clears all tracked windows so suites don't leak state across tests. */
export function resetSuspiciousActivityTracking(): void {
  windows.clear()
}
