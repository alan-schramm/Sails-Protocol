/**
 * The mixed workload every scenario file (smoke/average/stress/soak/
 * spike) drives, just under a different VU/arrival-rate shape — the
 * brief's 5 scenarios describe load *profiles*, not 5 more endpoints, so
 * this is the one place that composes the 5 real flows from `../tests/`
 * into a single realistic traffic mix instead of each scenario file
 * re-implementing (or arbitrarily picking) its own.
 *
 * Weighting is a deliberate approximation of a real marketplace's read/
 * write ratio, not a measured production number (none exists yet for
 * this protocol — same caveat loadtest/README.md's Artillery numbers
 * already carry): reads (reputation lookups, reconcile checks) most
 * common, Intent create/cancel next, full trade/escrow lifecycles
 * rarest since they're the most expensive real flow (~9 HTTP calls
 * across 2 identities each).
 *
 * Leading underscore in the filename: this one has no standalone
 * `options`/is not meant to be run directly with `k6 run` (it would
 * technically execute, but with none of the load-shape context a real
 * scenario file supplies) — every real scenario file imports from here.
 */
import { setup as intentSetup, run as intentRun } from '../tests/intent-creation.js'
import { setup as reconcileSetup, run as reconcileRun } from '../tests/reconciliation.js'
import { setup as reputationSetup, run as reputationRun } from '../tests/reputation-lookup.js'
import { run as tradeLifecycleRun } from '../tests/trade-lifecycle.js'
import { run as escrowOperationsRun } from '../tests/escrow-operations.js'

export function setupMixedWorkload() {
  return {
    intent: intentSetup(),
    reconcile: reconcileSetup(),
    reputation: reputationSetup(),
  }
}

export function runMixedWorkload(data) {
  const r = Math.random()
  if (r < 0.35) {
    reputationRun(data.reputation.participantId)
  } else if (r < 0.6) {
    if (data.intent.user) intentRun(data.intent.user)
  } else if (r < 0.8) {
    reconcileRun(data.reconcile)
  } else if (r < 0.92) {
    tradeLifecycleRun()
  } else {
    escrowOperationsRun()
  }
}
