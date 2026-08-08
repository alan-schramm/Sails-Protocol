/**
 * Sails Protocol — Metrics (CTO_DUE_DILIGENCE_REPORT.md B-OPS-01)
 *
 * Scoped deliberately small: a self-hosted `prom-client` registry exposed
 * at GET /metrics, not the full OpenTelemetry/tracing/vendor-exporter
 * rollout the report's "Ação" line describes. Distributed tracing and a
 * managed backend (Prometheus/DataDog/etc.) are a real infrastructure
 * decision — which vendor, who operates the scraper/retention, cost — that
 * needs the project owner, not something to commit to unilaterally under
 * this pass's Tier 2 scope. This closes the concrete, immediately useful
 * half of the gap: request-level and business-level counters any operator
 * can point an existing Prometheus (or `curl`) at today.
 */
import { collectDefaultMetrics, Counter, Histogram, Registry } from 'prom-client'

export const metricsRegistry = new Registry()
collectDefaultMetrics({ register: metricsRegistry })

export const httpRequestsTotal = new Counter({
  name: 'sails_http_requests_total',
  help: 'Total HTTP requests, by method/route/status code',
  labelNames: ['method', 'route', 'status_code'],
  registers: [metricsRegistry],
})

export const httpRequestDurationSeconds = new Histogram({
  name: 'sails_http_request_duration_seconds',
  help: 'HTTP request duration in seconds, by method/route/status code',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [metricsRegistry],
})

// Business counters — the concrete "trades/segundo, escrows ativos" example
// the report itself gives for what generic HTTP metrics alone can't show.
// Wired in handlers.ts, off the same settlement.escrow.* events that
// already drive every other cross-module reaction — no new event needed.
export const escrowsCreatedTotal = new Counter({
  name: 'sails_escrows_created_total',
  help: 'Total escrows created',
  registers: [metricsRegistry],
})

export const escrowsReleasedTotal = new Counter({
  name: 'sails_escrows_released_total',
  help: 'Total escrows released to the buyer',
  registers: [metricsRegistry],
})

export const escrowsRefundedTotal = new Counter({
  name: 'sails_escrows_refunded_total',
  help: 'Total escrows refunded to the seller',
  registers: [metricsRegistry],
})

export const disputesOpenedTotal = new Counter({
  name: 'sails_disputes_opened_total',
  help: 'Total disputes opened',
  registers: [metricsRegistry],
})
