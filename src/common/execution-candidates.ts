/**
 * Adaptive Execution / Capability Routing — Mission 4 (2026-09-14). First
 * runtime layer of the Execution Model
 * `docs/ADAPTIVE_EXECUTION_CAPABILITY_ROUTING.md` defines: Candidate
 * Discovery + the eligibility distinction "no scope" vs "scope, zero
 * providers" vs "exactly one eligible candidate" vs "more than one
 * eligible candidate."
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
 * Backlog Delta): Selection among multiple eligible candidates
 * (`MULTIPLE_ELIGIBLE_CANDIDATES` is a terminal, explicit-failure outcome
 * here, never resolved automatically — same "fail loudly, never silently
 * pick first-registered-wins" rule VERTICAL-SLICE-1 already froze for
 * BTC, now general); execution; risk policy; maturity/evidence; wallet
 * capability; partner/UI context. None of those exist as real runtime
 * concepts anywhere in this codebase yet (confirmed by this mission's own
 * audit) — this file does not pretend otherwise.
 */
import type { Asset, SettlementRail, SettlementScope } from './types/settlement-scope'
import { isSettlementScopeRegistered } from './settlement-scope-registry'
import {
  listProvidersForScope,
  type SettlementCapability,
  type SettlementProviderRegistration,
} from './settlement-provider-registry'

/**
 * A concrete, structurally-eligible execution path for a registered
 * `SettlementScope` — today exactly a `SettlementProviderRegistration`
 * (ADR-002 draws no distinction yet between "a provider registration"
 * and "a candidate path"; inventing a separate wrapper type before any
 * real second dimension exists would be speculative structure this
 * repository's own discipline rejects).
 */
export type ExecutionCandidate = SettlementProviderRegistration

/**
 * The result of Candidate Discovery for one `{asset, rail}` scope.
 * Deliberately a closed, exhaustive union — a caller must handle every
 * outcome explicitly (TypeScript's own exhaustiveness checking on the
 * `outcome` discriminant), which is what makes "unavailable" and
 * "unsupported" and "ineligible" structurally impossible to collapse
 * into one string here, unlike the single `EscrowError('UNAVAILABLE')`
 * every one of these cases threw before this file existed.
 */
export type CandidateDiscoveryResult =
  | { readonly outcome: 'SCOPE_NOT_REGISTERED'; readonly asset: Asset; readonly rail: SettlementRail }
  | { readonly outcome: 'SCOPE_REGISTERED_NO_PROVIDER'; readonly scope: SettlementScope }
  | { readonly outcome: 'SINGLE_ELIGIBLE_CANDIDATE'; readonly scope: SettlementScope; readonly candidate: ExecutionCandidate }
  | { readonly outcome: 'MULTIPLE_ELIGIBLE_CANDIDATES'; readonly scope: SettlementScope; readonly candidates: readonly ExecutionCandidate[] }

/**
 * Pure, never-throwing Candidate Discovery. Composes the two existing
 * registries only — no I/O, no config read, no provider call.
 *
 * - `SCOPE_NOT_REGISTERED`: `{asset, rail}` is not Day-0 Product Scope at
 *   all (ADR-002 §4's "absence means not in scope").
 * - `SCOPE_REGISTERED_NO_PROVIDER`: valid, expected, non-error state
 *   (ADR-002 §4/§5) — in scope, zero implementations exist yet.
 * - `SINGLE_ELIGIBLE_CANDIDATE`: the only outcome a caller may treat as
 *   auto-resolved without a Selection policy.
 * - `MULTIPLE_ELIGIBLE_CANDIDATES`: Selection is NOT decided here — see
 *   `resolveSingleEligibleImplementation()` below, which surfaces this as
 *   an explicit refusal rather than choosing.
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
  const candidates = listProvidersForScope(asset, rail, requiredCapability)
  if (candidates.length === 0) return { outcome: 'SCOPE_REGISTERED_NO_PROVIDER', scope }
  if (candidates.length === 1) return { outcome: 'SINGLE_ELIGIBLE_CANDIDATE', scope, candidate: candidates[0] }
  return { outcome: 'MULTIPLE_ELIGIBLE_CANDIDATES', scope, candidates }
}

/**
 * Convenience for a caller that wants "the one auto-selectable
 * implementation for this scope, or an explicit, honest reason why not"
 * — never guesses among multiple eligible candidates, and never
 * collapses "not in scope" and "in scope, no provider" and "more than
 * one eligible candidate" into the same message. This is the exact
 * shape `escrow.service.ts`'s `resolveEscrowType()` consumes.
 */
export function resolveSingleEligibleImplementation(
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
    case 'SINGLE_ELIGIBLE_CANDIDATE':
      return { implementation: result.candidate.implementation }
    case 'MULTIPLE_ELIGIBLE_CANDIDATES':
      return {
        error:
          `{${asset}, ${rail}} has ${result.candidates.length} eligible settlement implementations ` +
          `(${result.candidates.map((c) => c.implementation).join(', ')}) — refusing to guess which one to use. ` +
          'Selection among multiple eligible candidates is an Architecture Decision Required ' +
          '(see docs/ADAPTIVE_EXECUTION_CAPABILITY_ROUTING.md), not implemented by this function.',
      }
  }
}
