/**
 * Shared custom metrics — one place so `tests/*.js` and `scenarios/*.js`
 * report under the same metric names (a scenario importing a test module
 * gets the same Trend/Rate/Counter instances, not a second set), and so
 * thresholds.js's presets can reference these names without every test
 * file re-declaring its own.
 */
import { Trend, Rate, Counter } from 'k6/metrics'

// Per-real-flow latency — separate from k6's own built-in http_req_duration
// because a "trade lifecycle" or "auth" flow is several HTTP calls, not
// one; these measure the whole real-world action a user cares about.
export const authDuration = new Trend('sails_auth_duration', true)
export const intentCreateDuration = new Trend('sails_intent_create_duration', true)
export const intentCancelDuration = new Trend('sails_intent_cancel_duration', true)
export const tradeLifecycleDuration = new Trend('sails_trade_lifecycle_duration', true)
export const escrowLifecycleDuration = new Trend('sails_escrow_lifecycle_duration', true)
export const reconciliationDuration = new Trend('sails_reconciliation_duration', true)
export const reputationLookupDuration = new Trend('sails_reputation_lookup_duration', true)

// Success rate per real flow (1 = every step in the flow succeeded, 0 =
// at least one step failed) — a coarser, more meaningful signal than
// "did this one HTTP call 2xx" for a multi-step scenario.
export const authSuccessRate = new Rate('sails_auth_success')
export const intentSuccessRate = new Rate('sails_intent_success')
export const tradeSuccessRate = new Rate('sails_trade_success')
export const escrowSuccessRate = new Rate('sails_escrow_success')
export const reconciliationSuccessRate = new Rate('sails_reconciliation_success')
export const reputationSuccessRate = new Rate('sails_reputation_success')

// Real rate-limit visibility (RT-002) — a 429 here is a correct,
// expected result at shipped defaults (see load-tests/README.md), not a
// bug; counting it separately from "failed" keeps that distinction
// visible in the summary instead of collapsing it into a generic error.
export const rateLimited429 = new Counter('sails_rate_limited_429')

/** Records a Rate + (optionally) a Trend from one flow's outcome in one call, and tags 429s separately from other failures. */
export function recordFlow({ successRate, duration, durationMs, ok, response }) {
  successRate.add(ok ? 1 : 0)
  if (duration !== undefined && durationMs !== undefined) duration.add(durationMs)
  if (response && response.status === 429) rateLimited429.add(1)
}
