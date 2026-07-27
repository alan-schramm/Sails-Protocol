/**
 * Spike test — 50 -> 500 -> 50 req/s. Tests the sudden-surge-then-
 * recovery shape specifically (unlike stress-test.js's gradual ramp to
 * a sustained peak) — real questions this answers: does the rate
 * limiter (RT-002) correctly shed the excess rather than the server
 * falling over, and does latency actually recover once the spike ends,
 * or stay degraded (a sign of a leaked resource/backlog, not the spike
 * itself). `relaxed` thresholds during the spike is expected; README
 * covers reading the per-stage breakdown to confirm recovery instead of
 * relying on the whole-run aggregate hiding it.
 */
import { baseOptions } from '../k6.config.js'
import { relaxed } from '../utils/thresholds.js'
import { setupMixedWorkload, runMixedWorkload } from './_shared-workload.js'

export const setup = setupMixedWorkload

export const options = {
  ...baseOptions,
  scenarios: {
    spike: {
      executor: 'ramping-arrival-rate',
      startRate: 50,
      timeUnit: '1s',
      preAllocatedVUs: 100,
      maxVUs: 500,
      stages: [
        { duration: '30s', target: 50 }, // baseline
        { duration: '10s', target: 500 }, // spike
        { duration: '30s', target: 500 }, // hold at spike
        { duration: '10s', target: 50 }, // drop back
        { duration: '30s', target: 50 }, // confirm recovery
      ],
    },
  },
  thresholds: relaxed,
}

export default function (data) {
  runMixedWorkload(data)
}
