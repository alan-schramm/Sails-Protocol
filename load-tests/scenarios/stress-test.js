/**
 * Stress test — ramps request rate up to 1000 req/s. The point is
 * finding where this backend actually degrades, not asserting it never
 * does — `relaxed` thresholds on purpose (see utils/thresholds.js's own
 * comment). `preAllocatedVUs`/`maxVUs` are generous headroom for k6
 * itself to keep up with 1000 req/s of a multi-step mixed workload
 * (some iterations are ~9 real HTTP calls); if k6 logs "insufficient
 * VUs" for your machine, raise `maxVUs` further before assuming the
 * *server* is the bottleneck.
 */
import { baseOptions } from '../k6.config.js'
import { relaxed } from '../utils/thresholds.js'
import { setupMixedWorkload, runMixedWorkload } from './_shared-workload.js'

export const setup = setupMixedWorkload

export const options = {
  ...baseOptions,
  scenarios: {
    stress: {
      executor: 'ramping-arrival-rate',
      startRate: 50,
      timeUnit: '1s',
      preAllocatedVUs: 200,
      maxVUs: 1000,
      stages: [
        { duration: '1m', target: 300 },
        { duration: '2m', target: 1000 },
        { duration: '2m', target: 1000 }, // hold at peak
        { duration: '1m', target: 0 },
      ],
    },
  },
  thresholds: relaxed,
}

export default function (data) {
  runMixedWorkload(data)
}
