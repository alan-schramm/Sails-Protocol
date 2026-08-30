/**
 * Sails Core Implementation Program M6 (Correspondence + Destination
 * Binding). Runtime-adapter-level proofs for destination-correspondence.ts,
 * using Mission13's own real field shapes as the adversarial reference
 * (never modifying dispute.service.ts/arbitration-authority.ts). Proves
 * destination rotation is prospective-only, the Mission13 residual
 * (X vs X -> MATCH, X vs Y -> DIVERGENT) closes with this mechanism,
 * and Provider SUCCESS never automatically becomes MATCH.
 *
 * NOT WIRED INTO ANY LIVE PATH — dispute.service.ts is untouched.
 */
import * as fs from 'fs'
import * as path from 'path'
import {
  createTransitionRecord,
  createInteractionId,
  createTransitionTypeId,
  createCandidateTransition,
  createRulesetRef,
  createOutcome,
  LEGACY_UNVERIFIED,
  SAILS_TIMELOCK_EVALUATOR_IDENTITY,
  SAILS_SEMANTIC_PROFILE_IDENTITY,
} from '@sails/core'
import {
  buildAuthorizedDestinationBinding,
  normalizeProviderReport,
  evaluateSettlementCorrespondence,
} from '../src/modules/open-settlement/destination-correspondence'

const REPO_ROOT = path.resolve(__dirname, '..')

describe('T20/§20. Destination rotation attack — prospective only, never retroactive', () => {
  it('an authorization bound to D1 at T1 still means D1 after the participant\'s current destination rotates to D2 at T2', () => {
    // T1 — the dispute is ruled on; the arbiter's decision economically
    // implies release to the buyer's THEN-current, resolved address.
    const authorizedDestination = buildAuthorizedDestinationBinding('bc1q-buyer-D1')

    // T2 — the buyer later updates their profile/payout address to D2.
    // This never touches the ALREADY-authorized binding above — it is a
    // plain local value, not looked up again from any "current profile."
    const buyerCurrentDestinationAtT2 = 'bc1q-buyer-D2'
    void buyerCurrentDestinationAtT2 // never consulted below — the point of this test

    // Execution reportedly delivers to the participant's NEW (T2)
    // address — this must NOT retroactively validate against the OLD
    // (T1) authorization.
    const observationToD2 = normalizeProviderReport({ hasReachedRail: true, reportedDestination: 'bc1q-buyer-D2', reportedAmount: '0.001', reportedAsset: 'BTC' })
    expect(evaluateSettlementCorrespondence(authorizedDestination, '0.001', 'BTC', observationToD2)).toBe('DIVERGENT')

    // Execution delivering to the ORIGINAL (T1) address remains valid —
    // rotation never invalidates an already-authorized, still-correct
    // execution either.
    const observationToD1 = normalizeProviderReport({ hasReachedRail: true, reportedDestination: 'bc1q-buyer-D1', reportedAmount: '0.001', reportedAsset: 'BTC' })
    expect(evaluateSettlementCorrespondence(authorizedDestination, '0.001', 'BTC', observationToD1)).toBe('MATCH')
  })
})

describe('Mission13 residual, reproduced as an isolated reference demonstration (never live)', () => {
  // arbitration-authority.ts's own AuthorityDecisionPayload has NO
  // destination field — resolveDispute()'s releaseToAddress/refundToAddress
  // are passed as separate, unsigned parameters (verified directly against
  // the real file: disputeId/escrowId/appealRound/authorityId/outcome/
  // buyerBps/issuedAt is the complete field list). This demonstrates what
  // M6's mechanism would catch if a future M7 bound the decision's own
  // economic intent to a destination and checked it against execution.
  it('X vs X: the settlement key holder executes exactly the authorized destination -> MATCH', () => {
    const authorized = buildAuthorizedDestinationBinding('bc1q-buyer-address') // what the arbiter\'s RELEASE ruling economically implies
    const executed = normalizeProviderReport({ hasReachedRail: true, reportedDestination: 'bc1q-buyer-address', reportedAmount: '0.001', reportedAsset: 'BTC' })
    expect(evaluateSettlementCorrespondence(authorized, '0.001', 'BTC', executed)).toBe('MATCH')
  })

  it('X vs Y: a settlement-key holder constructs a Bitcoin-valid transaction to a DIFFERENT address -> DIVERGENT, never silently accepted', () => {
    const authorized = buildAuthorizedDestinationBinding('bc1q-buyer-address')
    // A technically valid transaction (real signature, real broadcast,
    // real confirmation) — but to an address the signed decision never
    // authorized. This is exactly "valid execution != corresponding
    // execution" (mission's own central threat, §2).
    const executedElsewhere = normalizeProviderReport({ hasReachedRail: true, reportedDestination: 'bc1q-ATTACKER-address', reportedAmount: '0.001', reportedAsset: 'BTC' })
    expect(evaluateSettlementCorrespondence(authorized, '0.001', 'BTC', executedElsewhere)).toBe('DIVERGENT')
  })
})

describe('P9. Provider SUCCESS never automatically becomes MATCH', () => {
  it('a Provider reporting only "reached the rail" with no actual destination/amount detail normalizes to UNKNOWN, never MATCH', () => {
    const authorized = buildAuthorizedDestinationBinding('bc1q-buyer-address')
    const vagueSuccessReport = normalizeProviderReport({ hasReachedRail: true }) // no reportedDestination/Amount/Asset at all
    expect(evaluateSettlementCorrespondence(authorized, '0.001', 'BTC', vagueSuccessReport)).toBe('UNKNOWN')
  })

  it('a Provider that has not yet reached the rail normalizes to PENDING, never MATCH or DIVERGENT', () => {
    const authorized = buildAuthorizedDestinationBinding('bc1q-buyer-address')
    const notYetReached = normalizeProviderReport({ hasReachedRail: false })
    expect(evaluateSettlementCorrespondence(authorized, '0.001', 'BTC', notYetReached)).toBe('PENDING')
  })
})

describe('Correct destination + wrong amount, and correct amount + wrong destination — independent dimensions', () => {
  it('correct destination, wrong amount -> DIVERGENT', () => {
    const authorized = buildAuthorizedDestinationBinding('bc1q-buyer-address')
    const observation = normalizeProviderReport({ hasReachedRail: true, reportedDestination: 'bc1q-buyer-address', reportedAmount: '0.0005', reportedAsset: 'BTC' })
    expect(evaluateSettlementCorrespondence(authorized, '0.001', 'BTC', observation)).toBe('DIVERGENT')
  })

  it('correct amount, wrong destination -> DIVERGENT', () => {
    const authorized = buildAuthorizedDestinationBinding('bc1q-buyer-address')
    const observation = normalizeProviderReport({ hasReachedRail: true, reportedDestination: 'bc1q-someone-else', reportedAmount: '0.001', reportedAsset: 'BTC' })
    expect(evaluateSettlementCorrespondence(authorized, '0.001', 'BTC', observation)).toBe('DIVERGENT')
  })
})

describe('TransitionRecord integration — the frozen M1 conditional Outcome/destinationBinding field activates for real, opaque, rail-neutral content', () => {
  it('a full TransitionRecord can bind a real DestinationBinding inside its Outcome, reloadable and comparable without Core ever parsing the address', () => {
    const destinationBinding = buildAuthorizedDestinationBinding('bc1q-buyer-address')
    const outcome = createOutcome({ content: { economicMeaning: '100% to buyer' }, destinationBinding })
    const interaction = createInteractionId('escrow-1')
    const record = createTransitionRecord({
      interaction,
      priorPosition: LEGACY_UNVERIFIED,
      transition: createCandidateTransition({ interaction, type: createTransitionTypeId('escrow.dispute.rule'), payload: { outcome: 'RELEASE' } }),
      rulesetRef: createRulesetRef({
        name: 'reference', identity: 'reference-ruleset', version: '1.0',
        commitment: 'reference@1.0' as any,
        expectedEvaluatorIdentity: SAILS_TIMELOCK_EVALUATOR_IDENTITY, expectedProfileIdentity: SAILS_SEMANTIC_PROFILE_IDENTITY,
      }),
      evaluatorIdentity: SAILS_TIMELOCK_EVALUATOR_IDENTITY,
      profileIdentity: SAILS_SEMANTIC_PROFILE_IDENTITY,
      conditionResult: 'SATISFIED',
      outcome,
    })

    expect(record.outcome).toBeDefined()
    expect(record.outcome!.destinationBinding).toEqual({ reference: 'bc1q-buyer-address' })
    // Core never needs to parse 'bc1q-buyer-address' as a real Bitcoin
    // address — it is opaque, only ever compared for equality.
    expect(typeof record.outcome!.destinationBinding!.reference).toBe('string')
  })
})

describe('AF. Proof M6 introduces no live authority and no fund movement — dispute.service.ts is untouched', () => {
  it('dispute.service.ts does not import destination-correspondence.ts', () => {
    const source = fs.readFileSync(path.join(REPO_ROOT, 'src', 'modules', 'open-settlement', 'dispute.service.ts'), 'utf8')
    expect(source).not.toContain('destination-correspondence')
  })

  it('destination-correspondence.ts has no reference to any real settlement Provider, Prisma, or fund-movement function', () => {
    const source = fs.readFileSync(path.join(REPO_ROOT, 'src', 'modules', 'open-settlement', 'destination-correspondence.ts'), 'utf8')
    expect(source).not.toMatch(/prisma|multisig\.provider|refundFunds|releaseFunds|splitFunds|broadcast/i)
  })
})

describe('Determinism', () => {
  it('the same authorized/observation pair produces the identical result across repeated calls', () => {
    const authorized = buildAuthorizedDestinationBinding('D1')
    const observation = normalizeProviderReport({ hasReachedRail: true, reportedDestination: 'D1', reportedAmount: '1', reportedAsset: 'BTC' })
    const results = Array.from({ length: 5 }, () => evaluateSettlementCorrespondence(authorized, '1', 'BTC', observation))
    expect(new Set(results).size).toBe(1)
    expect(results[0]).toBe('MATCH')
  })
})
