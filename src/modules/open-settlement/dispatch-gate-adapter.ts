/**
 * dispatch-gate-adapter.ts — Sails Core Implementation Program M8
 * (Provider Dispatch Gate). Runtime-layer adapter for `@sails/core`'s
 * `evaluateDispatchEligibility` (`packages/sails-core/src/dispatch-gate.ts`).
 *
 * NOT WIRED INTO ANY LIVE PATH. See docs/M8_DISPATCH_GATE_FINDINGS.md
 * (and this mission's own final report) for the full, concrete reason:
 * `dispute.service.ts`'s `resolveDispute()` currently lets a caller's
 * `releaseToAddress`/`refundToAddress` parameter unconditionally
 * override a participant's own registered payout address
 * (`escrow-lifecycle.ts`'s `resolvePayoutAddress()`: "an explicit
 * address always wins") with NO cryptographic or durable-provenance
 * check at all — a real, concrete instance of exactly the destination-
 * substitution threat this whole Core Implementation Program exists to
 * close. Migrating live before that gap has a deliberate, disclosed
 * resolution would risk building a gate that looks authoritative while
 * the actual vulnerable input still flows straight through it.
 *
 * WHAT THIS FILE DEMONSTRATES: the correct SHAPE of the trust boundary
 * a future live wiring must respect — `alreadyDispatched` is NEVER a
 * parameter an external caller can influence. It is computed here
 * exclusively by `checkDurableDispatchRecord`, an injected function
 * whose OWN contract is "perform a real, durable lookup" — in a live
 * system this would be a database read against a real dispatch-intent
 * table (M9/persistence territory, deliberately not built here since no
 * live wiring exists to need it yet); in this reference/test module, it
 * is satisfied by a caller-supplied function so tests can simulate both
 * "never dispatched" and "already dispatched" outcomes without a real
 * database — but there is no public parameter on
 * `evaluateLiveDispatchEligibility` itself that lets a caller simply
 * assert `alreadyDispatched: false` directly, mirroring exactly how
 * `discretionary-authority.ts` (M5) never accepts a pre-computed
 * `proofVerified` boolean either.
 */
import { TransitionRecord, evaluateDispatchEligibility, DispatchGateVerdict } from '@sails/core'

/**
 * A real Runtime implementation of this signature performs a durable
 * database read (or equivalent) — this is the ONLY legitimate source of
 * `alreadyDispatched`. Never satisfied by a bare boolean literal in
 * production code; the type signature (an async function returning a
 * boolean, not a boolean itself) exists specifically to make a
 * short-circuited "just pass true" call site visually and structurally
 * different from a real check.
 */
export type DurableDispatchRecordCheck = (interactionId: string, transitionType: string) => Promise<boolean>

export async function evaluateLiveDispatchEligibility<TPayload, TOutcomeContent, TDestination>(
  record: TransitionRecord<TPayload, TOutcomeContent, TDestination>,
  requiresAttribution: boolean,
  requiresOutcome: boolean,
  checkDurableDispatchRecord: DurableDispatchRecordCheck,
): Promise<DispatchGateVerdict> {
  const alreadyDispatched = await checkDurableDispatchRecord(record.interaction, record.transition.type)
  return evaluateDispatchEligibility({ record, requiresAttribution, requiresOutcome, alreadyDispatched })
}
