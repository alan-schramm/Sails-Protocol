/**
 * Sails Core Implementation Program M5 (Generalized Attribution).
 * Pure Core unit tests for referenceAttributionEvaluator/evaluateAttribution
 * (packages/sails-core/src/attribution.ts) — structural non-authority,
 * fail-closed binding checks, and conformance-harness parity. The
 * Runtime-adapter-level proofs (real Ed25519 signatures, real
 * Mission13-shaped payloads) live in tests/discretionaryAuthority.test.ts.
 */
import * as fs from 'fs'
import * as path from 'path'
import {
  referenceAttributionEvaluator,
  AttributionClaim,
  AttributionContext,
  SAILS_ATTRIBUTION_EVALUATOR_IDENTITY,
  SemanticCommitment,
} from '@sails/core'
import { checkDirectory } from '../scripts/check-core-boundary'
import { checkEvaluatorConformance } from '../scripts/run-conformance-harness'

const REPO_ROOT = path.resolve(__dirname, '..')

function claim(overrides: Partial<AttributionClaim> = {}): AttributionClaim {
  return {
    actor: 'arbiter-1' as any,
    claimedInteraction: 'escrow-1' as any,
    claimedTransitionType: 'escrow.dispute.rule' as any,
    claimedContentCommitment: 'sha256:abc' as unknown as SemanticCommitment,
    proofVerified: true,
    ...overrides,
  }
}

function context(overrides: Partial<AttributionContext> = {}): AttributionContext {
  return {
    interaction: 'escrow-1' as any,
    transitionType: 'escrow.dispute.rule' as any,
    contentCommitment: 'sha256:abc' as unknown as SemanticCommitment,
    ...overrides,
  }
}

describe('Structural non-authority: attribution.ts has no cryptographic capability of its own', () => {
  it('the module\'s import statements pull in nothing but Core\'s own identifiers/ruleset/condition-result/evaluator-identity/leaf-evaluator — no crypto library, no Prisma, no network', () => {
    const source = fs.readFileSync(path.join(REPO_ROOT, 'packages', 'sails-core', 'src', 'attribution.ts'), 'utf8')
    const importLines = source.split('\n').filter((line) => /^\s*import\s/.test(line))
    expect(importLines).toEqual([
      "import { ActorId, InteractionId, TransitionTypeId } from './identifiers'",
      "import { SemanticCommitment } from './ruleset'",
      "import { ConditionResult } from './condition-result'",
      "import { createCanonicalEvaluatorIdentity } from './evaluator-identity'",
      "import { LeafEvaluator } from './leaf-evaluator'",
    ])
  })
})

describe('F. Valid claim matching context is SATISFIED', () => {
  it('all four bindings matching authorizes', () => {
    expect(referenceAttributionEvaluator.evaluate({ claim: claim(), context: context() })).toBe('SATISFIED')
  })
})

describe('P9. Unverified proof fails closed', () => {
  it('proofVerified: false never authorizes, regardless of matching bindings', () => {
    expect(referenceAttributionEvaluator.evaluate({ claim: claim({ proofVerified: false }), context: context() })).toBe('UNSATISFIABLE')
  })
})

describe('P11/T5. Cross-interaction replay fails closed', () => {
  it('a claim bound to escrow-1 evaluated against escrow-2 fails', () => {
    expect(referenceAttributionEvaluator.evaluate({ claim: claim(), context: context({ interaction: 'escrow-2' as any }) })).toBe('UNSATISFIABLE')
  })
})

describe('P12/T6. Cross-transition replay fails closed', () => {
  it('a claim bound to one transition type evaluated against another fails', () => {
    expect(referenceAttributionEvaluator.evaluate({ claim: claim(), context: context({ transitionType: 'escrow.timelock.expire' as any }) })).toBe('UNSATISFIABLE')
  })
})

describe('P13/T7. Decision-content substitution fails closed', () => {
  it('a claim whose committed content no longer matches the actual content fails', () => {
    expect(referenceAttributionEvaluator.evaluate({ claim: claim(), context: context({ contentCommitment: 'sha256:different' as unknown as SemanticCommitment }) })).toBe('UNSATISFIABLE')
  })
})

describe('T22. No generic verified=true shortcut exists in the Core type itself', () => {
  it('AttributionClaim/AttributionContext contain no field named "verified" other than the one boolean the Runtime is required to compute honestly — proofVerified is the input, not a stored conclusion', () => {
    expect(Object.keys(claim())).toEqual(['actor', 'claimedInteraction', 'claimedTransitionType', 'claimedContentCommitment', 'proofVerified'])
  })
})

describe('Determinism', () => {
  it('the same (claim, context) pair produces the identical result across repeated calls', () => {
    const results = Array.from({ length: 5 }, () => referenceAttributionEvaluator.evaluate({ claim: claim(), context: context() }))
    expect(new Set(results).size).toBe(1)
  })
})

describe('Identity', () => {
  it('declares its own Canonical Evaluator Identity, never a package name/version', () => {
    expect(SAILS_ATTRIBUTION_EVALUATOR_IDENTITY).toEqual({ name: 'sails-attribution-evaluator', version: '1.0' })
    expect(referenceAttributionEvaluator.identity).toEqual(SAILS_ATTRIBUTION_EVALUATOR_IDENTITY)
  })
})

describe('M0 boundary remains intact', () => {
  it('packages/sails-core/src is still clean after adding attribution.ts', () => {
    const violations = checkDirectory(path.join(REPO_ROOT, 'packages', 'sails-core', 'src'))
    expect(violations).toEqual([])
  })
})

describe('M2 conformance — both evaluators remain conformant', () => {
  it('sails-attribution-evaluator@1.0 passes every canonical vector', () => {
    const report = checkEvaluatorConformance('sails-attribution-evaluator@1.0', referenceAttributionEvaluator, (raw) => raw as any)
    expect(report.conformant).toBe(true)
    expect(report.outcomes.length).toBeGreaterThan(0)
  })
})
