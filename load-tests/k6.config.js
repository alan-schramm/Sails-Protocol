/**
 * Shared base config every scenario/test file imports from — one place
 * for the target URL and the handful of `options` fields that should be
 * identical across the whole suite (summary trend stats, discard-body
 * setting), so a scenario file only needs to declare what's actually
 * scenario-specific (VUs/stages/thresholds).
 *
 * BASE_URL defaults to the same localhost:3000 the e2e suite and
 * loadtest/ (Artillery) both already target — override with
 * `-e BASE_URL=...` for a non-local run.
 */
export const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000'

/** Spread into a scenario file's own `export const options = {...}` alongside its stages/thresholds. */
export const baseOptions = {
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
  discardResponseBodies: false, // every test here parses .json() from real responses (sessionToken, ids) — can't discard bodies
}
