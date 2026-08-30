/**
 * CorrespondenceResult — the frozen four-state correspondence vocabulary.
 *
 * `docs/CORE_IMPLEMENTATION_ARCHITECTURE.md` §9 (verbatim, not
 * reinterpreted here): "Final vocabulary: MATCH / DIVERGENT / PENDING /
 * UNKNOWN. No CONFLICTED state — conflicting execution evidence is
 * resolved into one of these four by Module/Ruleset policy, exactly as
 * contradiction is already handled for ConditionResult."
 *
 * Deliberately a SEPARATE type from `ConditionResult`
 * (condition-result.ts) — §11 requires the two semantic roles
 * (Transition-condition evaluation vs. execution-correspondence
 * evaluation) remain distinguishable, "sharing the identical four-value
 * algebra where useful... a discriminated result, separate types, or
 * any other realization is an implementation choice." This file chooses
 * separate types: `ConditionResult` answers "is this Transition valid
 * now?"; `CorrespondenceResult` answers a materially different
 * question, "does observed/proposed execution correspond to what an
 * already-authorized Outcome meant?" Conflating them would let a
 * correspondence check silently satisfy a condition, or vice versa —
 * exactly the layering violation §11 exists to prevent.
 *
 * MATCH     — observed execution corresponds to the authorized economic
 *             meaning under the applicable, already-bound execution
 *             semantics.
 * DIVERGENT — sufficient evidence exists to determine execution does
 *             NOT correspond. Permanent for the Outcome this evidence
 *             belongs to (§10, Historical Integrity) unless later,
 *             same-Outcome evidence legitimately supersedes it under
 *             that Outcome's own original execution semantics (a
 *             multi-leg completion, a reported reversal) — never
 *             "repaired" by a different, later Transition's own Outcome.
 * PENDING   — the bound execution semantics declare a specific
 *             completeness condition not yet satisfied; further
 *             evidence is EXPECTED under those same semantics. An
 *             ordinary, declared waiting state — never a permanent one.
 * UNKNOWN   — available admissible evidence is insufficient or
 *             irresolvable under the bound semantics, and no declared
 *             completeness condition classifies this as merely pending.
 *             Never a stand-in for "success," and never silently
 *             promoted to MATCH without new, resolving evidence.
 */
export type CorrespondenceResult = 'MATCH' | 'DIVERGENT' | 'PENDING' | 'UNKNOWN'

export const CORRESPONDENCE_RESULTS: readonly CorrespondenceResult[] = ['UNKNOWN', 'PENDING', 'DIVERGENT', 'MATCH']
