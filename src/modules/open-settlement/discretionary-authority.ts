/**
 * discretionary-authority.ts — Sails Core Implementation Program M5
 * (Generalized Attribution). Runtime/Identity-layer adapter for
 * `@sails/core`'s generalized attribution evaluator
 * (`packages/sails-core/src/attribution.ts`).
 *
 * NOT WIRED INTO ANY LIVE PATH when this module (M5) was built —
 * `dispute.service.ts`'s `resolveDispute()` was, at that time, completely
 * untouched; see this file's own header below for why a live migration
 * was explicitly not attempted THEN. **Corrigido 2026-09-04 (Current
 * Truth Reconciliation P0):** this module has since been wired live —
 * the later M8-R mission's `dispute-outcome.ts` calls
 * `evaluateAuthorityDecisionAttribution()` unconditionally inside
 * `applyRulingCoreAuthoritative()`, itself unconditional for every
 * MULTISIG dispute ruling (`dispute.service.ts`'s
 * `escrowForBranch.type === 'MULTISIG'` branch). Still not wired for
 * LIGHTNING_HODL/SAFE_GUARD_EVM/WDK_USDT_EVM/MOCK, which still use the
 * legacy `applyRuling()` path. The "WHY NO LIVE MIGRATION" section below
 * remains an accurate historical record of this mission's own scope
 * decision, not a description of the current state. This
 * module exists to prove the generalized Core primitive genuinely works
 * against REAL Mission13-shaped signed authority decisions
 * (tests/discretionaryAuthority.test.ts), reusing Mission13's own,
 * unmodified cryptographic machinery (`arbitration-authority.ts`) —
 * no new signing convention, no new key type, no new cryptosystem.
 *
 * WHY NO LIVE MIGRATION (mission's own first-slice-selection gate,
 * §49): the only existing K2-shaped transition in this codebase —
 * `dispute.service.ts`'s `applyRuling()` — verifies the signed decision
 * and DISPATCHES FUND MOVEMENT (`initiateRelease`/`releaseFunds`,
 * `initiateRefund`/`refundFunds`, `initiateSplit`/`splitFunds`) inside
 * the very same synchronous flow, with no decoupled "semantic decision"
 * phase. Making this Core-authoritative the way M4 did for expiry would
 * require a real Outcome/economic-disposition concept (K3, M6/M7
 * territory) to represent RELEASE/REFUND/SPLIT's own economic meaning —
 * exactly the "premature Outcome/correspondence/provider architecture"
 * this mission's own §49 forbids pulling forward. This module therefore
 * stops at: the generalized primitive implemented and validated against
 * real domain material, with zero change to any live authority path.
 *
 * BOUNDARY THIS FILE ENFORCES: `evaluateAuthorityDecisionAttribution()`
 * NEVER accepts a pre-computed `proofVerified` boolean from a caller —
 * it always computes that boolean itself, from the real signature and
 * resolved public key, by calling Mission13's own
 * `verifyAuthorityDecisionSignature()`. This closes exactly the "server
 * asserts verified" shortcut a server-impersonation attack would need
 * (mission §32/T11) — there is no parameter path that lets a caller
 * skip real cryptographic verification and still reach an ATTRIBUTED
 * verdict.
 */
import {
  AttributionClaim,
  AttributionContext,
  referenceAttributionEvaluator,
  createActorId,
  createInteractionId,
  createTransitionTypeId,
  TransitionTypeId,
  SemanticCommitment,
  DiscretionaryAttributionMaterial,
} from '@sails/core'
import {
  AuthorityDecisionPayload,
  verifyAuthorityDecisionSignature,
  hashAuthorityDecision,
} from './arbitration-authority'

/**
 * One transition type for all three arbiter outcomes (RELEASE/REFUND/
 * SPLIT) — the semantic transition is "this dispute was ruled on by its
 * assigned authority"; which economic outcome resulted is domain
 * decision-content, folded into the opaque commitment below, exactly
 * how `outcome`/`buyerBps` already live inside Mission13's own signed
 * canonical string rather than as a separate binding field.
 */
export const ESCROW_DISPUTE_RULING_TRANSITION_TYPE: TransitionTypeId = createTransitionTypeId('escrow.dispute.rule')

export type DiscretionaryAuthorityVerdict =
  | { readonly kind: 'ATTRIBUTED'; readonly claim: AttributionClaim; readonly attribution: DiscretionaryAttributionMaterial }
  | { readonly kind: 'NOT_ATTRIBUTED' }

/**
 * Resolves cryptographic verification (Runtime/Identity layer — Core
 * cannot do this itself, M0 boundary) into one explicit boolean, builds
 * the generalized `AttributionClaim` from Mission13's own real signed
 * material, and asks Core's `referenceAttributionEvaluator` whether it
 * constitutes valid attributed discretion for the given `context`.
 *
 * Deliberately does NOT decide whether `payload.authorityId` was
 * actually the eligible authority for this dispute (e.g. the assigned
 * arbiter) — that is domain/ruleset eligibility policy, already
 * enforced by `dispute.service.ts`'s own `dispute.arbiterId === arbiterId`
 * check (unchanged, untouched by this module) — never Core's job, per
 * `checkRulesetBinding()`'s own precedent of checking pure structural
 * consistency, never behavioral/eligibility conformance.
 */
export function evaluateAuthorityDecisionAttribution(
  payload: AuthorityDecisionPayload,
  signatureHex: string,
  resolvedPublicKeyHex: string,
  context: AttributionContext,
): DiscretionaryAuthorityVerdict {
  const proofVerified = verifyAuthorityDecisionSignature(payload, signatureHex, resolvedPublicKeyHex)
  const contentCommitment = hashAuthorityDecision(payload) as unknown as SemanticCommitment

  const claim: AttributionClaim = {
    actor: createActorId(payload.authorityId),
    claimedInteraction: createInteractionId(payload.escrowId),
    claimedTransitionType: ESCROW_DISPUTE_RULING_TRANSITION_TYPE,
    claimedContentCommitment: contentCommitment,
    proofVerified,
  }

  const result = referenceAttributionEvaluator.evaluate({ claim, context })
  if (result !== 'SATISFIED') return { kind: 'NOT_ATTRIBUTED' }

  return {
    kind: 'ATTRIBUTED',
    claim,
    // Raw proof + resolved identity, captured verbatim at decision time
    // — never a bare `verified: true` (transition.ts's own frozen
    // DiscretionaryAttributionMaterial has no such field at all).
    attribution: {
      actor: claim.actor,
      rawProof: signatureHex,
      resolvedIdentityReference: resolvedPublicKeyHex,
    },
  }
}

/** Builds the `AttributionContext` a real dispute-ruling evaluation is checked against — the actual interaction and the actual recomputed decision-content commitment, never the claim's own (potentially forged) values. */
export function buildDisputeRulingContext(escrowId: string, actualPayload: AuthorityDecisionPayload): AttributionContext {
  return {
    interaction: createInteractionId(escrowId),
    transitionType: ESCROW_DISPUTE_RULING_TRANSITION_TYPE,
    contentCommitment: hashAuthorityDecision(actualPayload) as unknown as SemanticCommitment,
  }
}
