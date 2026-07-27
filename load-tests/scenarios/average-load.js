/**
 * Average load — ramps up to 100 VUs, holds, ramps back down. The
 * "what does a normal busy period look like" profile: still expected
 * to comfortably clear the `standard` thresholds (docs/whitepapers/
 * TECHNICAL_WHITEPAPER.md section 12's own recorded numbers), unlike
 * stress-test.js/spike-test.js which deliberately push past that.
 */
import { baseOptions } from '../k6.config.js'
import { standard } from '../utils/thresholds.js'
import { setupMixedWorkload, runMixedWorkload } from './_shared-workload.js'

export const setup = setupMixedWorkload

export const options = {
  ...baseOptions,
  scenarios: {
    average_load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 100 }, // ramp up
        { duration: '3m', target: 100 }, // hold
        { duration: '1m', target: 0 }, // ramp down
      ],
    },
  },
  thresholds: standard,
}

export default function (data) {
  runMixedWorkload(data)
}
