/**
 * Three threshold presets, spread into a scenario/test file's own
 * `options.thresholds` rather than hard-coded per-file — so tightening
 * or loosening expectations across the whole suite is a one-place edit.
 * All three apply to k6's own built-in `http_req_duration`/`http_req_failed`
 * plus this suite's custom success-rate metrics (metrics.js) — a test
 * file that doesn't use one of the custom metrics simply gets an unused
 * (harmless) threshold entry, not an error.
 *
 * Real numbers, not arbitrary: `standard`'s p95/p99 come from the actual
 * results already on record for this backend (docs/whitepapers/
 * TECHNICAL_WHITEPAPER.md section 12 — Intent API p95 32ms/p99 55ms on
 * one local machine, zero failures over a 30s/20rps sustained window).
 * These thresholds assume the same "rate limits raised" precondition
 * that produced those numbers — see this suite's README for why.
 */
export const standard = {
  http_req_duration: ['p(95)<200', 'p(99)<500'],
  http_req_failed: ['rate<0.01'],
  sails_auth_success: ['rate>0.99'],
  sails_intent_success: ['rate>0.99'],
  sails_trade_success: ['rate>0.99'],
  sails_escrow_success: ['rate>0.99'],
  sails_reconciliation_success: ['rate>0.99'],
  sails_reputation_success: ['rate>0.99'],
}

// For stress/spike scenarios deliberately pushing past comfortable
// capacity — the point is finding where it breaks, not asserting it
// never does. Looser tolerances, still bounded (a threshold of "anything
// goes" would defeat having one at all).
export const relaxed = {
  http_req_duration: ['p(95)<1000', 'p(99)<3000'],
  http_req_failed: ['rate<0.10'],
  sails_auth_success: ['rate>0.90'],
  sails_intent_success: ['rate>0.90'],
  sails_trade_success: ['rate>0.90'],
  sails_escrow_success: ['rate>0.90'],
  sails_reconciliation_success: ['rate>0.90'],
  sails_reputation_success: ['rate>0.90'],
}

// For a real regression gate (CI) — tighter than the numbers already on
// record, so this catches a real slowdown before it ships, not just
// confirms today's status quo.
export const strict = {
  http_req_duration: ['p(95)<100', 'p(99)<250'],
  http_req_failed: ['rate<0.001'],
  sails_auth_success: ['rate>0.999'],
  sails_intent_success: ['rate>0.999'],
  sails_trade_success: ['rate>0.999'],
  sails_escrow_success: ['rate>0.999'],
  sails_reconciliation_success: ['rate>0.999'],
  sails_reputation_success: ['rate>0.999'],
}

/** Picks a preset by name (env var THRESHOLD_PROFILE, default 'standard') — lets `k6 run -e THRESHOLD_PROFILE=strict` swap presets without editing a file. */
export function selectThresholds(profileName) {
  const presets = { standard, strict, relaxed }
  return presets[profileName] || standard
}
