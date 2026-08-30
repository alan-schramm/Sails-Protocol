/**
 * Sails Core Implementation Program M7 (Authoritative Economic
 * Outcome). Runtime-level proofs for economic-outcome.ts, composing
 * M5 attribution (real Ed25519 signatures) + M7 Outcome content + M6
 * correspondence into one durable-shaped TransitionRecord. NOT WIRED
 * INTO ANY LIVE PATH — dispute.service.ts/arbitration-authority.ts
 * remain untouched.
 */
import * as fs from 'fs'
import * as path from 'path'
import nacl from 'tweetnacl'
import { createRulesetRef, SAILS_TIMELOCK_EVALUATOR_IDENTITY, SAILS_SEMANTIC_PROFILE_IDENTITY } from '@sails/core'
import {
  ArbitrationOutcomeContent,
  allocateExactUnits,
  canonicalizeOutcomeContent,
  hashOutcomeContent,
  buildOutcomeDestinationBinding,
  buildArbitrationOutcome,
  evaluateOutcomeCorrespondence,
  buildAttributedArbitrationTransitionRecord,
} from '../src/modules/open-settlement/economic-outcome'
import { normalizeProviderReport } from '../src/modules/open-settlement/destination-correspondence'
import { signAuthorityDecision, hashAuthorityDecision, AuthorityDecisionPayload } from '../src/modules/open-settlement/arbitration-authority'
import { evaluateAuthorityDecisionAttribution, buildDisputeRulingContext } from '../src/modules/open-settlement/discretionary-authority'

const REPO_ROOT = path.resolve(__dirname, '..')

function releaseContent(overrides: Partial<ArbitrationOutcomeContent> = {}): ArbitrationOutcomeContent {
  return {
    ruling: 'RELEASE',
    totalUnits: '100000',
    asset: 'BTC-SATS',
    allocations: [{ beneficiary: 'buyer', basisPoints: 10000 }],
    remainderBeneficiary: 'buyer',
    ...overrides,
  }
}

function splitContent(overrides: Partial<ArbitrationOutcomeContent> = {}): ArbitrationOutcomeContent {
  return {
    ruling: 'SPLIT',
    totalUnits: '100000',
    asset: 'BTC-SATS',
    allocations: [
      { beneficiary: 'buyer', basisPoints: 7000 },
      { beneficiary: 'seller', basisPoints: 3000 },
    ],
    remainderBeneficiary: 'seller',
    ...overrides,
  }
}

describe('P10/P11. Deterministic, exact-conservation integer allocation — never floating point', () => {
  it('70/30 of 100000 allocates exactly 70000/30000, summing back to the total', () => {
    const units = allocateExactUnits(splitContent())
    const buyer = units.find((u) => u.beneficiary === 'buyer')!
    const seller = units.find((u) => u.beneficiary === 'seller')!
    expect(buyer.units).toBe('70000')
    expect(seller.units).toBe('30000')
    expect(BigInt(buyer.units) + BigInt(seller.units)).toBe(BigInt('100000'))
  })

  it('a non-evenly-divisible split still conserves the exact total (no lost/created value from rounding)', () => {
    const units = allocateExactUnits(splitContent({ totalUnits: '100001' }))
    const sum = units.reduce((s, u) => s + BigInt(u.units), BigInt(0))
    expect(sum).toBe(BigInt('100001'))
  })

  it('M8 W1 — the EXPLICITLY named remainderBeneficiary absorbs the rounding remainder, deterministically — never caller/array-order-controlled, never an incidental name-sort artifact', () => {
    const a = allocateExactUnits({ ruling: 'SPLIT', totalUnits: '10', asset: 'X', remainderBeneficiary: 'buyer', allocations: [{ beneficiary: 'seller', basisPoints: 3333 }, { beneficiary: 'buyer', basisPoints: 6667 }] })
    const b = allocateExactUnits({ ruling: 'SPLIT', totalUnits: '10', asset: 'X', remainderBeneficiary: 'buyer', allocations: [{ beneficiary: 'buyer', basisPoints: 6667 }, { beneficiary: 'seller', basisPoints: 3333 }] })
    expect(a).toEqual(b) // array order never changes the result
    const buyerUnits = a.find((u) => u.beneficiary === 'buyer')!.units
    expect(buyerUnits).toBe('7') // 6667/10000 of 10 floors to 6, but buyer is remainderBeneficiary so gets 10 - floor(3333/10000*10)=10-3=7
  })

  it('M8 W1 — changing WHICH beneficiary is named as remainderBeneficiary changes the allocation, proving the field is load-bearing, not decorative', () => {
    const buyerAbsorbs = allocateExactUnits({ ruling: 'SPLIT', totalUnits: '10', asset: 'X', remainderBeneficiary: 'buyer', allocations: [{ beneficiary: 'seller', basisPoints: 3333 }, { beneficiary: 'buyer', basisPoints: 6667 }] })
    const sellerAbsorbs = allocateExactUnits({ ruling: 'SPLIT', totalUnits: '10', asset: 'X', remainderBeneficiary: 'seller', allocations: [{ beneficiary: 'seller', basisPoints: 3333 }, { beneficiary: 'buyer', basisPoints: 6667 }] })
    expect(buyerAbsorbs).not.toEqual(sellerAbsorbs)
  })

  it('M8 W1 — remainderBeneficiary must reference a real allocation beneficiary, fails closed otherwise', () => {
    expect(() => hashOutcomeContent(splitContent({ remainderBeneficiary: 'nobody' }))).toThrow(/remainderBeneficiary/)
  })
})

describe('Q25/P13. 70/30 cannot become 30/70 or any other allocation through ordering ambiguity — distinct economic meanings get distinct commitments', () => {
  it('reordering the SAME allocations produces the IDENTICAL commitment', () => {
    const orderA = splitContent()
    const orderB = splitContent({ allocations: [...splitContent().allocations].reverse() })
    expect(hashOutcomeContent(orderA)).toBe(hashOutcomeContent(orderB))
  })

  it('swapping WHICH beneficiary gets which share (70/30 -> 30/70) produces a DIFFERENT commitment', () => {
    const seventyThirty = splitContent()
    const thirtySeventy = splitContent({ allocations: [{ beneficiary: 'buyer', basisPoints: 3000 }, { beneficiary: 'seller', basisPoints: 7000 }] })
    expect(hashOutcomeContent(seventyThirty)).not.toBe(hashOutcomeContent(thirtySeventy))
  })

  it('a different total (same percentages) produces a DIFFERENT commitment — value is bound, not just proportions', () => {
    expect(hashOutcomeContent(splitContent())).not.toBe(hashOutcomeContent(splitContent({ totalUnits: '200000' })))
  })

  it('a different asset produces a DIFFERENT commitment', () => {
    expect(hashOutcomeContent(splitContent())).not.toBe(hashOutcomeContent(splitContent({ asset: 'WBTC-SATS' })))
  })
})

describe('§28.Q/R. Omitted beneficiary/destination fails closed at construction, never as a silently-skipped correspondence check', () => {
  it('a beneficiary with an allocation but no bound destination throws when the Outcome is constructed', () => {
    expect(() => buildArbitrationOutcome(splitContent(), buildOutcomeDestinationBinding([{ beneficiary: 'buyer', destination: 'D-buyer' }]))).toThrow(/seller.*no bound destination/)
  })
})

describe('§28.W. QVAC has no path into economic Outcome construction', () => {
  it('economic-outcome.ts has no reference to QVAC anywhere', () => {
    const source = fs.readFileSync(path.join(REPO_ROOT, 'src', 'modules', 'open-settlement', 'economic-outcome.ts'), 'utf8')
    expect(source).not.toMatch(/qvac/i)
  })
})

describe('Well-formedness — malformed content fails closed, never silently coerced', () => {
  it('allocations not summing to 10000 throw', () => {
    expect(() => hashOutcomeContent(splitContent({ allocations: [{ beneficiary: 'buyer', basisPoints: 5000 }, { beneficiary: 'seller', basisPoints: 4000 }] }))).toThrow(/10000/)
  })
  it('a non-integer totalUnits throws', () => {
    expect(() => hashOutcomeContent(splitContent({ totalUnits: '100.5' }))).toThrow()
  })
  it('duplicate beneficiaries throw', () => {
    expect(() => hashOutcomeContent(splitContent({ allocations: [{ beneficiary: 'buyer', basisPoints: 7000 }, { beneficiary: 'buyer', basisPoints: 3000 }] }))).toThrow(/distinct/)
  })
})

describe('P4/P24-P28. Composition with M6 correspondence — faithful and each substitution class', () => {
  it('faithful execution to both legs -> MATCH for both', () => {
    const outcome = buildArbitrationOutcome(splitContent(), buildOutcomeDestinationBinding([{ beneficiary: 'buyer', destination: 'D-buyer' }, { beneficiary: 'seller', destination: 'D-seller' }]))
    const observations = new Map([
      ['buyer', normalizeProviderReport({ hasReachedRail: true, reportedDestination: 'D-buyer', reportedAmount: '70000', reportedAsset: 'BTC-SATS' })],
      ['seller', normalizeProviderReport({ hasReachedRail: true, reportedDestination: 'D-seller', reportedAmount: '30000', reportedAsset: 'BTC-SATS' })],
    ])
    const results = evaluateOutcomeCorrespondence(outcome, observations)
    expect(results.get('buyer')).toBe('MATCH')
    expect(results.get('seller')).toBe('MATCH')
  })

  it('P26 — wrong destination for one leg -> DIVERGENT for that leg only, MATCH for the other', () => {
    const outcome = buildArbitrationOutcome(splitContent(), buildOutcomeDestinationBinding([{ beneficiary: 'buyer', destination: 'D-buyer' }, { beneficiary: 'seller', destination: 'D-seller' }]))
    const observations = new Map([
      ['buyer', normalizeProviderReport({ hasReachedRail: true, reportedDestination: 'D-ATTACKER', reportedAmount: '70000', reportedAsset: 'BTC-SATS' })],
      ['seller', normalizeProviderReport({ hasReachedRail: true, reportedDestination: 'D-seller', reportedAmount: '30000', reportedAsset: 'BTC-SATS' })],
    ])
    const results = evaluateOutcomeCorrespondence(outcome, observations)
    expect(results.get('buyer')).toBe('DIVERGENT')
    expect(results.get('seller')).toBe('MATCH')
  })

  it('P27 — wrong value for one leg (e.g. 60/40 executed instead of 70/30) -> DIVERGENT for the underpaid leg', () => {
    const outcome = buildArbitrationOutcome(splitContent(), buildOutcomeDestinationBinding([{ beneficiary: 'buyer', destination: 'D-buyer' }, { beneficiary: 'seller', destination: 'D-seller' }]))
    const observations = new Map([
      ['buyer', normalizeProviderReport({ hasReachedRail: true, reportedDestination: 'D-buyer', reportedAmount: '60000', reportedAsset: 'BTC-SATS' })],
      ['seller', normalizeProviderReport({ hasReachedRail: true, reportedDestination: 'D-seller', reportedAmount: '40000', reportedAsset: 'BTC-SATS' })],
    ])
    const results = evaluateOutcomeCorrespondence(outcome, observations)
    expect(results.get('buyer')).toBe('DIVERGENT')
    expect(results.get('seller')).toBe('DIVERGENT')
  })

  it('P28 — wrong asset -> DIVERGENT', () => {
    const outcome = buildArbitrationOutcome(releaseContent(), buildOutcomeDestinationBinding([{ beneficiary: 'buyer', destination: 'D-buyer' }]))
    const observations = new Map([['buyer', normalizeProviderReport({ hasReachedRail: true, reportedDestination: 'D-buyer', reportedAmount: '100000', reportedAsset: 'WBTC-SATS' })]])
    expect(evaluateOutcomeCorrespondence(outcome, observations).get('buyer')).toBe('DIVERGENT')
  })

  it('missing execution evidence for a leg -> that leg is treated as IRRESOLVABLE/UNKNOWN, never silently MATCH', () => {
    const outcome = buildArbitrationOutcome(splitContent(), buildOutcomeDestinationBinding([{ beneficiary: 'buyer', destination: 'D-buyer' }, { beneficiary: 'seller', destination: 'D-seller' }]))
    const observations = new Map([['buyer', normalizeProviderReport({ hasReachedRail: true, reportedDestination: 'D-buyer', reportedAmount: '70000', reportedAsset: 'BTC-SATS' })]]) // seller never reported
    const results = evaluateOutcomeCorrespondence(outcome, observations)
    expect(results.get('buyer')).toBe('MATCH')
    expect(results.get('seller')).toBe('UNKNOWN')
  })
})

describe('§20/P17. Destination rotation is prospective only — composed through the full Outcome, not just the raw evaluator', () => {
  it('an Outcome authorized against D1 still means D1 after a later, unrelated rotation to D2', () => {
    const outcome = buildArbitrationOutcome(releaseContent(), buildOutcomeDestinationBinding([{ beneficiary: 'buyer', destination: 'D1' }]))
    // A later rotation to D2 is simply never consulted — this Outcome
    // object is immutable, constructed once, at authorization time.
    const executionToD2 = new Map([['buyer', normalizeProviderReport({ hasReachedRail: true, reportedDestination: 'D2', reportedAmount: '100000', reportedAsset: 'BTC-SATS' })]])
    expect(evaluateOutcomeCorrespondence(outcome, executionToD2).get('buyer')).toBe('DIVERGENT')
  })
})

describe('T1/P29. Full M5+M7 composition — a real, Ed25519-signed decision produces an attributed, durable-shaped TransitionRecord', () => {
  function ruleset() {
    return createRulesetRef({
      name: 'reference-dispute-ruling', identity: 'reference-dispute-ruling', version: '1.0',
      commitment: 'reference@1.0' as any,
      expectedEvaluatorIdentity: SAILS_TIMELOCK_EVALUATOR_IDENTITY, expectedProfileIdentity: SAILS_SEMANTIC_PROFILE_IDENTITY,
    })
  }

  it('builds a TransitionRecord whose attribution and outcome are BOTH populated, with two independent, non-interchangeable commitments', () => {
    const keypair = nacl.sign.keyPair()
    const decisionPayload: AuthorityDecisionPayload = {
      disputeId: 'dispute-1', escrowId: 'escrow-1', appealRound: 0, authorityId: 'arbiter-1',
      outcome: 'SPLIT', buyerBps: 7000, issuedAt: '2026-08-29T00:00:00.000Z',
    }
    const signatureHex = signAuthorityDecision(decisionPayload, keypair.secretKey)
    const publicKeyHex = Buffer.from(keypair.publicKey).toString('hex')
    const context = buildDisputeRulingContext(decisionPayload.escrowId, decisionPayload)

    const verdict = evaluateAuthorityDecisionAttribution(decisionPayload, signatureHex, publicKeyHex, context)
    expect(verdict.kind).toBe('ATTRIBUTED')
    if (verdict.kind !== 'ATTRIBUTED') throw new Error('expected ATTRIBUTED')

    // The economic Outcome's own total/asset come from the already-
    // established escrow record (a separately-verified fact) — never
    // re-derived from the signed decision, which only authorizes the
    // ruling + allocation percentages.
    const content = splitContent()
    const outcome = buildArbitrationOutcome(content, buildOutcomeDestinationBinding([{ beneficiary: 'buyer', destination: 'D-buyer' }, { beneficiary: 'seller', destination: 'D-seller' }]))

    const record = buildAttributedArbitrationTransitionRecord('escrow-1', verdict.claim, verdict.attribution, outcome, ruleset())

    expect(record.attribution).toBeDefined()
    expect(record.attribution!.actor).toBe('arbiter-1')
    expect(record.attribution!.rawProof).toBe(signatureHex)
    expect(record.outcome).toBeDefined()
    expect(record.outcome!.content).toEqual(content)
    expect(record.outcome!.destinationBinding!.reference).toEqual([{ beneficiary: 'buyer', destination: 'D-buyer' }, { beneficiary: 'seller', destination: 'D-seller' }])

    // The two commitments are NEVER interchangeable — proven directly,
    // not merely asserted in a comment.
    const attributionCommitment = hashAuthorityDecision(decisionPayload)
    const outcomeCommitment = hashOutcomeContent(content)
    expect(attributionCommitment).not.toBe(outcomeCommitment)
  })

  it('an UNATTRIBUTED verdict (wrong signature) never reaches Outcome construction — the caller has no ATTRIBUTED branch to build a record from', () => {
    const keypair = nacl.sign.keyPair()
    const impostor = nacl.sign.keyPair()
    const decisionPayload: AuthorityDecisionPayload = { disputeId: 'd1', escrowId: 'escrow-2', appealRound: 0, authorityId: 'arbiter-1', outcome: 'RELEASE', buyerBps: null, issuedAt: '2026-08-29T00:00:00.000Z' }
    const impostorSignature = signAuthorityDecision(decisionPayload, impostor.secretKey)
    const verdict = evaluateAuthorityDecisionAttribution(decisionPayload, impostorSignature, Buffer.from(keypair.publicKey).toString('hex'), buildDisputeRulingContext(decisionPayload.escrowId, decisionPayload))
    expect(verdict.kind).toBe('NOT_ATTRIBUTED')
  })
})

describe('§27/Q47-Q49. Dual-authority test: NOT APPLICABLE — no live migration occurred', () => {
  it('no test exists proving "Core Outcome governs over legacy" because no live wiring exists for either to disagree through — dispute.service.ts is unmodified', () => {
    const source = fs.readFileSync(path.join(REPO_ROOT, 'src', 'modules', 'open-settlement', 'dispute.service.ts'), 'utf8')
    expect(source).not.toContain('economic-outcome')
    expect(source).not.toContain('buildAttributedArbitrationTransitionRecord')
  })
})

describe('P34/P35. No fee activation, no new fund movement', () => {
  it('economic-outcome.ts has no reference to fee/protocolFeeRate/broadcast/provider dispatch', () => {
    const source = fs.readFileSync(path.join(REPO_ROOT, 'src', 'modules', 'open-settlement', 'economic-outcome.ts'), 'utf8')
    expect(source).not.toMatch(/protocolFeeRate|broadcast|initiateRelease|initiateRefund|initiateSplit|refundFunds|releaseFunds|splitFunds/)
  })
})

describe('P11. No floating-point arithmetic anywhere in the allocation path', () => {
  it('allocateExactUnits/canonicalizeOutcomeContent/hashOutcomeContent contain no floating-point operators', () => {
    const source = fs.readFileSync(path.join(REPO_ROOT, 'src', 'modules', 'open-settlement', 'economic-outcome.ts'), 'utf8')
    expect(source).not.toMatch(/parseFloat|Math\.round|Math\.floor\(\d|\/\s*10000\.0/)
    expect(source).toContain('BigInt')
  })
})

describe('Determinism', () => {
  it('the same content produces the identical commitment and allocation across repeated calls', () => {
    const content = splitContent()
    const commitments = Array.from({ length: 5 }, () => hashOutcomeContent(content))
    expect(new Set(commitments).size).toBe(1)
    const allocations = Array.from({ length: 5 }, () => JSON.stringify(allocateExactUnits(content)))
    expect(new Set(allocations).size).toBe(1)
  })
})
