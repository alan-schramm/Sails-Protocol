/**
 * Smoke test — 5 VUs, 1 minute. The cheapest, fastest real signal that
 * every wired flow (auth, Intent, trade, escrow, reconcile, reputation)
 * still works end-to-end before running anything heavier — run this
 * first, always (see README's "how to run" section).
 */
import { baseOptions } from '../k6.config.js'
import { standard } from '../utils/thresholds.js'
import { setupMixedWorkload, runMixedWorkload } from './_shared-workload.js'

export const setup = setupMixedWorkload

export const options = {
  ...baseOptions,
  scenarios: {
    smoke: {
      executor: 'constant-vus',
      vus: 5,
      duration: '1m',
    },
  },
  thresholds: standard,
}

export default function (data) {
  runMixedWorkload(data)
}
