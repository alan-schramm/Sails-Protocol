/**
 * F8 (docs/TECHNICAL_DEBT_AUDIT.md #54) — cross-cutting shape checks for
 * the two new paired counters (sails_qvac_detection_invocations_total /
 * sails_qvac_detection_failures_total) that the per-path behavior tests
 * (tests/offerContentScreening.test.ts, tests/socialEngineeringAgent.test.ts,
 * tests/socialEngineeringDetection.test.ts) don't already cover: label
 * cardinality/shape, no PII, and safe re-import behavior. Observation
 * only — these counters never gate or block anything, and detection
 * itself remains advisory-only; nothing here changes that.
 */
import { metricsRegistry, qvacDetectionInvocationsTotal, qvacDetectionFailuresTotal } from '../src/common/metrics'

describe('QVAC detection observability metrics (F8)', () => {
  beforeEach(() => {
    metricsRegistry.resetMetrics()
  })

  it('both counters are registered exactly once on the shared registry, with a bounded "path" label only', async () => {
    const invocationsMetric = await metricsRegistry.getSingleMetric('sails_qvac_detection_invocations_total')
    const failuresMetric = await metricsRegistry.getSingleMetric('sails_qvac_detection_failures_total')
    expect(invocationsMetric).toBeDefined()
    expect(failuresMetric).toBeDefined()

    // prom-client's own labelNames — the only label either counter carries
    // is the closed 2-value "path" enum. No free-form error text, no
    // participant/trade/offer/message id, no model output.
    expect((invocationsMetric as any).labelNames).toEqual(['path'])
    expect((failuresMetric as any).labelNames).toEqual(['path'])
  })

  it('only the two named path values ever appear, even after both paths report every outcome', async () => {
    qvacDetectionInvocationsTotal.inc({ path: 'offer_screening' })
    qvacDetectionFailuresTotal.inc({ path: 'offer_screening' })
    qvacDetectionInvocationsTotal.inc({ path: 'social_engineering' })
    qvacDetectionFailuresTotal.inc({ path: 'social_engineering' })

    const rendered = await metricsRegistry.metrics()
    const pathValues = new Set(
      [...rendered.matchAll(/path="([^"]+)"/g)].map((m) => m[1])
    )
    expect(pathValues).toEqual(new Set(['offer_screening', 'social_engineering']))
  })

  it('re-importing the metrics module (module-cache hit) does not throw or double-register', () => {
    // prom-client's default Registry throws on a genuine duplicate
    // registration of the same metric name. jest's module cache means a
    // second require() within the same test file returns the SAME module
    // instance (same Counter objects, same Registry) rather than
    // re-running metrics.ts's top-level `new Counter(...)` calls a second
    // time — this is the same behavior every other counter in this file
    // (escrowsCreatedTotal, etc.) already relies on; asserting it here
    // documents that the two new counters don't change that.
    expect(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const second = require('../src/common/metrics')
      expect(second.qvacDetectionInvocationsTotal).toBe(qvacDetectionInvocationsTotal)
      expect(second.qvacDetectionFailuresTotal).toBe(qvacDetectionFailuresTotal)
    }).not.toThrow()
  })

  it('is a Counter (monotonic, prom-client type) — never a Gauge that could imply a live security state', () => {
    // Structural, not behavioral: distinguishing "we saw N failures" from
    // "the system is currently degraded" is a claim this mission is not
    // authorized to make (no health/degraded indicator, per the CTO
    // mission's Phase 2 answer #4) — a Counter can only count occurrences,
    // it cannot represent "currently degraded."
    expect(qvacDetectionInvocationsTotal.constructor.name).toBe('Counter')
    expect(qvacDetectionFailuresTotal.constructor.name).toBe('Counter')
  })
})
