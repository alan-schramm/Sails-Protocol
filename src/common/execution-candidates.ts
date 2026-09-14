/**
 * Adaptive Execution / Capability Routing — Mission 4 (2026-09-14),
 * corrected R1 (2026-09-14, CTO Gate Corrective). First runtime layer of
 * the Execution Model `docs/ADAPTIVE_EXECUTION_CAPABILITY_ROUTING.md`
 * defines: Candidate Discovery + the structural-compatibility
 * distinction "no scope" vs "scope, zero providers at all" vs "providers
 * exist, none declare the required capability" vs "exactly one
 * structurally compatible candidate" vs "more than one structurally
 * compatible candidate."
 *
 * **R1 correction — two real defects found by CTO review, both fixed
 * here, not silently:**
 *
 * 1. The original version filtered `listProvidersForScope()` by
 *    `requiredCapability` in the SAME call used to detect "zero
 *    providers," so `{BTC, ARKADE}` + `requiredCapability: 'split'`
 *    (LIGHTNING_HODL IS registered there, it simply doesn't declare
 *    `split`) produced the exact same `SCOPE_REGISTERED_NO_PROVIDER`
 *    outcome as `{DEPIX, SPARK}` (genuinely zero providers registered at
 *    all) — a false statement: "no provider" and "provider lacks the
 *    required capability" are different facts and must never collapse.
 *    Fixed by querying the registry WITHOUT a capability filter first
 *    (`allRegisteredProviders`), classifying true zero-provider scopes
 *    from that, and only THEN applying the capability filter to what's
 *    left — see `discoverExecutionCandidates()` below.
 * 2. `SINGLE_ELIGIBLE_CANDIDATE`/`MULTIPLE_ELIGIBLE_CANDIDATES` and
 *    `resolveSingleEligibleImplementation()` overclaimed "Eligibility" —
 *    the design doc's own §3.3 already disclosed that permission, wallet
 *    capability, availability, and maturity/evidence are NOT evaluated
 *    by this file, but the code's own naming didn't reflect that
 *    discipline. Renamed throughout to "structurally compatible" —
 *    ADR-002 §6's own term for exactly this layer ("Settlement
 *    Capability — a *structural*, self-declared execution feature"),
 *    explicitly distinct from ADR-002's own frozen "Settlement
 *    Eligibility" (a later, more complete concept this file does not
 *    implement). See ADR-002 §6: Technical Capability ≠ Protocol
 *    Permission ≠ Economic Authority ≠ Settlement Eligibility — this
 *    file computes only the first of those four, and now says so in its
 *    own vocabulary, not just in prose elsewhere.
 *
 * Generalizes `escrow.service.ts`'s own `resolveEscrowType()` BTC-only
 * canonical-registry gate (VERTICAL-SLICE-1, 2026-09-12) into a
 * scope-agnostic, pure function — built entirely on ADR-002's already-
 * frozen `SettlementScope`/`SettlementProviderRegistration` registries.
 * Adds no new type, field, provider concept, or registry of its own; this
 * file is a read-only composition over the two registries that already
 * exist (`settlement-scope-registry.ts`, `settlement-provider-registry.ts`).
 *
 * Deliberately out of scope (see the design doc's own Non-Goals and
 * Backlog Delta): Selection among multiple structurally compatible
 * candidates (`MULTIPLE_STRUCTURALLY_COMPATIBLE_CANDIDATES` is a
 * terminal, explicit-failure outcome here, never resolved automatically
 * — same "fail loudly, never silently pick first-registered-wins" rule
 * VERTICAL-SLICE-1 already froze for BTC, now general); permission
 * filtering; availability filtering; maturity/evidence filtering; risk
 * policy; execution. None of those exist as real runtime concepts
 * anywhere in this codebase yet (confirmed by this mission's own audit)
 * — this file does not pretend otherwise, in its types or its naming.
 */
import type { Asset, SettlementRail, SettlementScope } from './types/settlement-scope'
import { isSettlementScopeRegistered } from './settlement-scope-registry'
import {
  listProvidersForScope,
  type SettlementCapability,
  type SettlementProviderRegistration,
} from './settlement-provider-registry'

/**
 * A concrete, structurally-registered execution path for a registered
 * `SettlementScope` — today exactly a `SettlementProviderRegistration`
 * (ADR-002 draws no distinction yet between "a provider registration"
 * and "a candidate path"; inventing a separate wrapper type before any
 * real second dimension exists would be speculative structure this
 * repository's own discipline rejects). Naming this "candidate," never
 * "eligible candidate" — structural registration alone is not
 * Eligibility (ADR-002 §6; see this file's own header, R1 correction 2).
 */
export type ExecutionCandidate = SettlementProviderRegistration

/**
 * The result of Candidate Discovery for one `{asset, rail}` scope.
 * Deliberately a closed, exhaustive union — a caller must handle every
 * outcome explicitly (TypeScript's own exhaustiveness checking on the
 * `outcome` discriminant), which is what makes "unavailable" and
 * "unsupported" and "capability mismatch" structurally impossible to
 * collapse into one string here, unlike the single
 * `EscrowError('UNAVAILABLE')` every one of these cases threw before
 * this file existed.
 *
 * Five outcomes, not four (R1 correction 1) — `SCOPE_REGISTERED_NO_PROVIDER`
 * means genuinely zero providers are registered for the scope AT ALL,
 * regardless of any capability filter; `NO_PROVIDER_WITH_REQUIRED_CAPABILITY`
 * means at least one provider IS registered for the scope, but none of
 * them declare the specific capability the caller required. These are
 * different facts about the world and must never produce the same
 * outcome or the same error message.
 */
export type CandidateDiscoveryResult =
  | { readonly outcome: 'SCOPE_NOT_REGISTERED'; readonly asset: Asset; readonly rail: SettlementRail }
  | { readonly outcome: 'SCOPE_REGISTERED_NO_PROVIDER'; readonly scope: SettlementScope }
  | {
      readonly outcome: 'NO_PROVIDER_WITH_REQUIRED_CAPABILITY'
      readonly scope: SettlementScope
      readonly requiredCapability: SettlementCapability
      /** Every provider registered for this scope, none of which declare `requiredCapability` — kept so a caller can explain exactly what WAS available, not just what wasn't. */
      readonly registeredProviders: readonly ExecutionCandidate[]
    }
  | { readonly outcome: 'SINGLE_STRUCTURALLY_COMPATIBLE_CANDIDATE'; readonly scope: SettlementScope; readonly candidate: ExecutionCandidate }
  | { readonly outcome: 'MULTIPLE_STRUCTURALLY_COMPATIBLE_CANDIDATES'; readonly scope: SettlementScope; readonly candidates: readonly ExecutionCandidate[] }

/**
 * Pure, never-throwing Candidate Discovery. Composes the two existing
 * registries only — no I/O, no config read, no provider call.
 *
 * Queries the provider registry WITHOUT a capability filter first
 * (`allRegisteredProviders`) so "zero providers registered for this
 * scope at all" can be distinguished from "providers are registered, but
 * none declare the required capability" — R1's own fix for the defect
 * that collapsed those two facts together.
 *
 * - `SCOPE_NOT_REGISTERED`: `{asset, rail}` is not Day-0 Product Scope at
 *   all (ADR-002 §4's "absence means not in scope").
 * - `SCOPE_REGISTERED_NO_PROVIDER`: valid, expected, non-error state
 *   (ADR-002 §4/§5) — in scope, genuinely zero implementations registered,
 *   independent of any capability filter.
 * - `NO_PROVIDER_WITH_REQUIRED_CAPABILITY`: at least one implementation is
 *   registered for this scope, but none declares `requiredCapability` —
 *   a real, different fact from the previous outcome.
 * - `SINGLE_STRUCTURALLY_COMPATIBLE_CANDIDATE`: the only outcome a caller
 *   may treat as auto-resolved without a Selection policy — and even
 *   then, only structurally, never as a claim of full Eligibility
 *   (permission/availability/maturity remain unevaluated, ADR-002 §6).
 * - `MULTIPLE_STRUCTURALLY_COMPATIBLE_CANDIDATES`: Selection is NOT
 *   decided here — see `resolveSingleStructurallyCompatibleImplementation()`
 *   below, which surfaces this as an explicit refusal rather than
 *   choosing.
 */
export function discoverExecutionCandidates(
  asset: Asset,
  rail: SettlementRail,
  requiredCapability?: SettlementCapability,
): CandidateDiscoveryResult {
  if (!isSettlementScopeRegistered(asset, rail)) {
    return { outcome: 'SCOPE_NOT_REGISTERED', asset, rail }
  }
  const scope: SettlementScope = { asset, rail }

  // Unfiltered on purpose (R1) — this is the "is there any provider at
  // all for this scope" fact, independent of what capability (if any)
  // the caller asked for.
  const allRegisteredProviders = listProvidersForScope(asset, rail)
  if (allRegisteredProviders.length === 0) {
    return { outcome: 'SCOPE_REGISTERED_NO_PROVIDER', scope }
  }

  const structurallyCompatible =
    requiredCapability === undefined
      ? allRegisteredProviders
      : allRegisteredProviders.filter((p) => p.capabilities.includes(requiredCapability))

  if (requiredCapability !== undefined && structurallyCompatible.length === 0) {
    return { outcome: 'NO_PROVIDER_WITH_REQUIRED_CAPABILITY', scope, requiredCapability, registeredProviders: allRegisteredProviders }
  }
  if (structurallyCompatible.length === 1) {
    return { outcome: 'SINGLE_STRUCTURALLY_COMPATIBLE_CANDIDATE', scope, candidate: structurallyCompatible[0] }
  }
  return { outcome: 'MULTIPLE_STRUCTURALLY_COMPATIBLE_CANDIDATES', scope, candidates: structurallyCompatible }
}

/**
 * Convenience for a caller that wants "the one auto-selectable
 * implementation for this scope, or an explicit, honest reason why not"
 * — never guesses among multiple structurally compatible candidates, and
 * never collapses "not in scope" / "in scope, no provider at all" /
 * "provider(s) exist, none have the required capability" / "more than
 * one structurally compatible candidate" into the same message. This is
 * the exact shape `escrow.service.ts`'s `resolveEscrowType()` consumes.
 *
 * Named `...StructurallyCompatible...`, not `...Eligible...` (R1
 * correction 2) — this function proves structural/capability
 * compatibility only, never full Eligibility (ADR-002 §6: Technical
 * Capability ≠ Protocol Permission ≠ Economic Authority ≠ Settlement
 * Eligibility).
 */
export function resolveSingleStructurallyCompatibleImplementation(
  asset: Asset,
  rail: SettlementRail,
  requiredCapability?: SettlementCapability,
): { implementation: ExecutionCandidate['implementation'] } | { error: string } {
  const result = discoverExecutionCandidates(asset, rail, requiredCapability)
  switch (result.outcome) {
    case 'SCOPE_NOT_REGISTERED':
      return { error: `{${asset}, ${rail}} is not a registered Product Scope — refusing to guess a settlement implementation.` }
    case 'SCOPE_REGISTERED_NO_PROVIDER':
      return { error: `{${asset}, ${rail}} is registered Product Scope but has zero registered settlement implementations yet.` }
    case 'NO_PROVIDER_WITH_REQUIRED_CAPABILITY':
      return {
        error:
          `{${asset}, ${rail}} has ${result.registeredProviders.length} registered settlement implementation(s) ` +
          `(${result.registeredProviders.map((p) => p.implementation).join(', ')}), but none declare the required '${result.requiredCapability}' capability.`,
      }
    case 'SINGLE_STRUCTURALLY_COMPATIBLE_CANDIDATE':
      return { implementation: result.candidate.implementation }
    case 'MULTIPLE_STRUCTURALLY_COMPATIBLE_CANDIDATES':
      return {
        error:
          `{${asset}, ${rail}} has ${result.candidates.length} structurally compatible settlement implementations ` +
          `(${result.candidates.map((c) => c.implementation).join(', ')}) — refusing to guess which one to use. ` +
          'Selection among multiple structurally compatible candidates is an Architecture Decision Required ' +
          '(see docs/ADAPTIVE_EXECUTION_CAPABILITY_ROUTING.md), not implemented by this function.',
      }
  }
}
