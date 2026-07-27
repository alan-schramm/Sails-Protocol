/**
 * Soak test — 50 VUs sustained for 4 hours. The question this answers
 * that none of the other 4 scenarios can (docs/whitepapers/
 * TECHNICAL_WHITEPAPER.md section 12 names this exact gap: "no numbers
 * exist yet for... sustained multi-minute soak"): does performance hold
 * steady, or does something degrade over hours — a connection-pool
 * leak, unbounded memory growth, a slow Postgres index that only hurts
 * once a table's grown — that a 30-second run would never surface.
 * `standard` thresholds on purpose, not `relaxed`: a soak test's whole
 * point is catching degradation, so loosening the bar defeats it.
 *
 * NOT run to completion as part of any automated verification in this
 * repo (a real 4-hour run needs a real 4-hour window) — verified
 * instead with a short override, matching README's own instructions:
 *   k6 run --duration 2m --vus 5 scenarios/soak-test.js
 * (CLI --duration/--vus replace this file's own `options.scenarios`
 * entirely when passed, which is exactly the override this is for.)
 */
import { baseOptions } from '../k6.config.js'
import { standard } from '../utils/thresholds.js'
import { setupMixedWorkload, runMixedWorkload } from './_shared-workload.js'

export const setup = setupMixedWorkload

export const options = {
  ...baseOptions,
  scenarios: {
    soak: {
      executor: 'constant-vus',
      vus: 50,
      duration: '4h',
    },
  },
  thresholds: standard,
}

export default function (data) {
  runMixedWorkload(data)
}
