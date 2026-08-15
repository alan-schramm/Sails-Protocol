/**
 * Suspicious-activity detection — a volume limiter (app.ts's
 * @fastify/rate-limit, ws-message-rate-limiter.ts) only stops a *fast*
 * flood; a slow, patient probe stays under any per-minute ceiling and
 * looks identical to a real user. Detection only, mirroring RFC-017's
 * SocialEngineeringAgent: never blocks, just logs once per window
 * (count === max, not >=, fires exactly on the crossing) and emits an
 * event.
 */
import { Counter } from 'prom-client'
import type { FastifyBaseLogger } from 'fastify'
import { config } from '../../config'
import { metricsRegistry } from '../metrics'
import { eventBus } from '../events/event-bus'
import { FixedWindowCounter } from '../fixed-window-counter'

export type SuspiciousActivityKind = 'AUTH_FAILURE' | 'NOT_FOUND_CLUSTER' | 'RATE_LIMITED'

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

const counter = new FixedWindowCounter(10 * 60 * 1000)

/**
 * Records one occurrence of `kind` for `identity` (participantId when the
 * caller is authenticated, request.ip otherwise). The moment the window's
 * threshold is crossed, logs a structured warning and emits
 * `security.suspicious_activity.detected` — once per window.
 */
export function recordSuspiciousActivity(kind: SuspiciousActivityKind, identity: string, log: FastifyBaseLogger): void {
  const { max, windowMs } = thresholdFor(kind)
  const count = counter.increment(`${kind}:${identity}`, windowMs)
  if (count !== max) return

  suspiciousActivityTotal.inc({ kind })
  log.warn({ msg: 'Suspicious activity pattern detected', module: 'suspicious-activity', kind, identity, count, windowMs })
  eventBus
    .emit('security.suspicious_activity.detected', { kind, identity, count, windowMs, detectedAt: new Date().toISOString() }, identity)
    .catch((err) => {
      log.error({ msg: 'Failed to emit security.suspicious_activity.detected', err: err instanceof Error ? err.message : String(err) })
    })
}

/** Test-only: clears all tracked windows so suites don't leak state across tests. */
export function resetSuspiciousActivityTracking(): void {
  counter.reset()
}
