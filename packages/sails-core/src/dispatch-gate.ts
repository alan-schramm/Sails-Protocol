/**
 * Dispatch eligibility — Sails Core Implementation Program M8
 * (Provider Dispatch Gate).
 *
 * Answers exactly one question, structurally: given an already-durable
 * `TransitionRecord`, is the economic effect it may authorize eligible
 * to cross the boundary into external execution? This is a pure
 * structural check over already-resolved, already-Core-typed material
 * — it never verifies cryptography, never queries a database, and
 * never decides WHETHER an execution attempt already happened; it only
 * checks the CONSEQUENCE of that already-resolved fact.
 *
 * Deliberately NOT a new Canonical Evaluator Identity / conformance
 * evaluator (contrast with the timelock/attribution/correspondence
 * evaluators, M2/M5/M6): this checklist is fully and rigidly dictated
 * by the frozen `TransitionRecord`/`Outcome`/`DestinationBinding` shapes
 * themselves (docs/CORE_IMPLEMENTATION_ARCHITECTURE.md §12-16) — there
 * is no genuine RULE here a different conformant implementation could
 * reasonably disagree about (unlike "what counts as a valid timelock,"
 * which is a real domain choice), so a conformance-vector harness would
 * only restate the type system's own structural requirements. This
 * mirrors `ruleset.ts`'s own `checkRulesetBinding()` precedent exactly
 * — a plain pure function, no identity, no vectors — for the identical
 * reason (a pure structural consistency check, not a behavioral rule).
 *
 * CENTRAL TRUST-BOUNDARY DISCIPLINE (mission §6/§7, generalizing M5's
 * own `proofVerified` watchpoint): `alreadyDispatched` is an explicit,
 * externally-supplied boolean — exactly like `proofVerified` in
 * attribution.ts. This function has NO WAY to verify that boolean was
 * honestly computed; that responsibility belongs entirely to whichever
 * Runtime adapter calls this function, which must derive it from a real
 * durable check (a database read for an existing dispatch record) and
 * must NEVER expose a public path letting an untrusted caller assert it
 * directly. This file only guarantees: GIVEN an honest set of inputs,
 * the eligibility conclusion is correct — the same limited guarantee
 * `checkRulesetBinding()` and `evaluateAttribution()` already give.
 */
import { TransitionRecord } from './transition'

export type DispatchGateVerdict =
  | { readonly kind: 'ELIGIBLE' }
  | { readonly kind: 'INELIGIBLE'; readonly reason: string }

export interface DispatchGateInput<TPayload = unknown, TOutcomeContent = unknown, TDestination = unknown> {
  readonly record: TransitionRecord<TPayload, TOutcomeContent, TDestination>
  /** Whether this transition class depends on discretionary judgment (K2) — a Ruleset/domain fact, never inferred from whether `record.attribution` happens to be present. */
  readonly requiresAttribution: boolean
  /** Whether this transition class authorizes an economic outcome (K3) — a Ruleset/domain fact, never inferred from whether `record.outcome` happens to be present. */
  readonly requiresOutcome: boolean
  /**
   * MUST be derived by the calling Runtime from a real, durable check
   * (e.g. an existing dispatch-intent/execution record for this exact
   * semantic authorization) — never accepted from, or influenced by,
   * an untrusted external caller. See this file's own header.
   */
  readonly alreadyDispatched: boolean
}

/**
 * Pure, deterministic, no side effects. Checks, in order: the
 * underlying semantic transition was actually SATISFIED; attribution is
 * present when required (never inferred — an absent field on a
 * transition class that doesn't require it is not an error); an
 * economic Outcome is present when required; the Outcome's
 * DestinationBinding exists when an Outcome is present at all (an
 * Outcome with genuinely no economically material destination — a pure
 * state-adjustment Outcome — legitimately has none, per outcome.ts's
 * own "destinationBinding is optional" design; this function does not
 * second-guess that domain choice, it only requires SOME binding to
 * exist when the domain itself declared the outcome economically
 * material via `requiresOutcome`); and finally that no dispatch has
 * already occurred for this exact semantic authorization.
 */
export function evaluateDispatchEligibility<TPayload, TOutcomeContent, TDestination>(
  input: DispatchGateInput<TPayload, TOutcomeContent, TDestination>,
): DispatchGateVerdict {
  const { record } = input

  if (record.conditionResult !== 'SATISFIED') {
    return { kind: 'INELIGIBLE', reason: 'underlying semantic transition is not SATISFIED' }
  }
  if (input.requiresAttribution && !record.attribution) {
    return { kind: 'INELIGIBLE', reason: 'discretionary transition has no durable attribution' }
  }
  if (input.requiresOutcome) {
    if (!record.outcome) {
      return { kind: 'INELIGIBLE', reason: 'no durable economic Outcome exists for this transition' }
    }
    if (!record.outcome.destinationBinding) {
      return { kind: 'INELIGIBLE', reason: 'Outcome has no destination binding' }
    }
  }
  if (input.alreadyDispatched) {
    return { kind: 'INELIGIBLE', reason: 'dispatch already occurred for this exact semantic authorization' }
  }

  return { kind: 'ELIGIBLE' }
}
