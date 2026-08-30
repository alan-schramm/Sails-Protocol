/**
 * Canonical Semantic Profile Identity constant for
 * `sails-semantic-profile@1.0` (published at
 * `conformance/profiles/sails-semantic-profile-1.0.json`, M2).
 *
 * M2 published the profile's JSON definition but never exported a
 * matching TypeScript identity constant the way
 * `evaluators/timelock-evaluator.ts` already does for
 * `SAILS_TIMELOCK_EVALUATOR_IDENTITY` — a durable Transition Record
 * (M3.5) needs to bind the actual profile identity used, and Runtime
 * code constructing one must not hardcode this identity's
 * name/version as a bare string literal at each call site.
 */
import { createCanonicalSemanticProfileIdentity } from '../evaluator-identity'

export const SAILS_SEMANTIC_PROFILE_IDENTITY = createCanonicalSemanticProfileIdentity('sails-semantic-profile', '1.0')
