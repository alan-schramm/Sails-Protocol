/**
 * Sails Core Implementation Program M8 (Provider Dispatch Gate). Proves
 * evaluateDispatchEligibility (packages/sails-core/src/dispatch-gate.ts)
 * and its Runtime adapter (dispatch-gate-adapter.ts) in isolation — NOT
 * WIRED INTO ANY LIVE PATH. See this file's own "delete-the-Core"
 * section and the mission's final report for the concrete,
 * disclosed reason (dispute.service.ts's releaseToAddress/refundToAddress
 * override has no provenance check today).
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
  evaluateDispatchEligibility,
  DispatchGateInput,
} from '@sails/core'
import { evaluateLiveDispatchEligibility, DurableDispatchRecordCheck } from '../src/modules/open-settlement/dispatch-gate-adapter'
import { checkDirectory } from '../scripts/check-core-boundary'

const REPO_ROOT = path.resolve(__dirname, '..')

function ruleset() {
  return createRulesetRef({
    name: 'reference', identity: 'reference', version: '1.0', commitment: 'reference@1.0' as any,
    expectedEvaluatorIdentity: SAILS_TIMELOCK_EVALUATOR_IDENTITY, expectedProfileIdentity: SAILS_SEMANTIC_PROFILE_IDENTITY,
  })
}

function baseRecord(overrides: Partial<Parameters<typeof createTransitionRecord>[0]> = {}) {
  const interaction = createInteractionId('escrow-1')
  return createTransitionRecord({
    interaction,
    priorPosition: LEGACY_UNVERIFIED,
    transition: createCandidateTransition({ interaction, type: createTransitionTypeId('escrow.dispute.rule'), payload: {} }),
    rulesetRef: ruleset(),
    evaluatorIdentity: SAILS_TIMELOCK_EVALUATOR_IDENTITY,
    profileIdentity: SAILS_SEMANTIC_PROFILE_IDENTITY,
    conditionResult: 'SATISFIED',
    ...overrides,
  })
}

function gateInput(overrides: Partial<DispatchGateInput> = {}): DispatchGateInput {
  return {
    record: baseRecord(),
    requiresAttribution: false,
    requiresOutcome: false,
    alreadyDispatched: false,
    ...overrides,
  }
}

describe('Structural non-authority: dispatch-gate.ts has no persistence/network capability of its own', () => {
  it('the module\'s import statements pull in nothing but the TransitionRecord type', () => {
    const source = fs.readFileSync(path.join(REPO_ROOT, 'packages', 'sails-core', 'src', 'dispatch-gate.ts'), 'utf8')
    const importLines = source.split('\n').filter((line) => /^\s*import\s/.test(line))
    expect(importLines).toEqual(["import { TransitionRecord } from './transition'"])
  })
})

describe('P1/P2/P3/P4/P5. Baseline: all requirements satisfied -> ELIGIBLE', () => {
  it('a deterministic transition with no attribution/outcome required is eligible', () => {
    expect(evaluateDispatchEligibility(gateInput())).toEqual({ kind: 'ELIGIBLE' })
  })

  it('a discretionary, outcome-bearing transition with both present and a real destination binding is eligible', () => {
    const record = baseRecord({
      attribution: { actor: 'arbiter-1' as any, rawProof: 'sig', resolvedIdentityReference: 'pubkey' },
      outcome: createOutcome({ content: {}, destinationBinding: { reference: 'D1' } }),
    })
    expect(evaluateDispatchEligibility(gateInput({ record, requiresAttribution: true, requiresOutcome: true }))).toEqual({ kind: 'ELIGIBLE' })
  })
})

describe('Not-SATISFIED transitions are never eligible', () => {
  it('NOT_YET_SATISFIED -> INELIGIBLE', () => {
    const result = evaluateDispatchEligibility(gateInput({ record: baseRecord({ conditionResult: 'NOT_YET_SATISFIED' }) }))
    expect(result.kind).toBe('INELIGIBLE')
  })
})

describe('P3. Discretionary transition without durable attribution is ineligible', () => {
  it('requiresAttribution=true with no attribution field -> INELIGIBLE', () => {
    const result = evaluateDispatchEligibility(gateInput({ requiresAttribution: true }))
    expect(result).toEqual({ kind: 'INELIGIBLE', reason: 'discretionary transition has no durable attribution' })
  })

  it('a deterministic transition (requiresAttribution=false) with no attribution is still eligible — absence is not an error when not required', () => {
    expect(evaluateDispatchEligibility(gateInput({ requiresAttribution: false }))).toEqual({ kind: 'ELIGIBLE' })
  })
})

describe('P4. Outcome-bearing transition without a durable Outcome is ineligible', () => {
  it('requiresOutcome=true with no outcome field -> INELIGIBLE', () => {
    expect(evaluateDispatchEligibility(gateInput({ requiresOutcome: true }))).toEqual({ kind: 'INELIGIBLE', reason: 'no durable economic Outcome exists for this transition' })
  })
})

describe('P4/§30. Outcome without a destination binding fails closed when the transition requires one', () => {
  it('an Outcome with no destinationBinding at all -> INELIGIBLE', () => {
    const record = baseRecord({ outcome: createOutcome({ content: {} }) }) // no destinationBinding
    expect(evaluateDispatchEligibility(gateInput({ record, requiresOutcome: true }))).toEqual({ kind: 'INELIGIBLE', reason: 'Outcome has no destination binding' })
  })
})

describe('P36/P37. Already-dispatched semantic authorization is never eligible again — idempotency at the gate', () => {
  it('alreadyDispatched=true -> INELIGIBLE regardless of everything else being valid', () => {
    expect(evaluateDispatchEligibility(gateInput({ alreadyDispatched: true }))).toEqual({ kind: 'INELIGIBLE', reason: 'dispatch already occurred for this exact semantic authorization' })
  })
})

describe('§6/§7/P6/P7. Dispatch eligibility cannot be manufactured by an untrusted caller', () => {
  it('evaluateLiveDispatchEligibility has no parameter accepting a raw alreadyDispatched boolean — only an async CHECK FUNCTION, structurally distinct from a trust-me flag', () => {
    // 4 params: record, requiresAttribution, requiresOutcome, the check
    // function — never a 4th "alreadyDispatched: boolean" shortcut.
    expect(evaluateLiveDispatchEligibility.length).toBe(4)
  })

  it('the injected check function is actually consulted — a check that returns true makes an otherwise-eligible record ineligible', async () => {
    const alwaysDispatched: DurableDispatchRecordCheck = async () => true
    const verdict = await evaluateLiveDispatchEligibility(baseRecord(), false, false, alwaysDispatched)
    expect(verdict).toEqual({ kind: 'INELIGIBLE', reason: 'dispatch already occurred for this exact semantic authorization' })
  })

  it('a check function that returns false correctly allows an otherwise-eligible record through', async () => {
    const neverDispatched: DurableDispatchRecordCheck = async () => false
    const verdict = await evaluateLiveDispatchEligibility(baseRecord(), false, false, neverDispatched)
    expect(verdict).toEqual({ kind: 'ELIGIBLE' })
  })

  it('the check function receives the record\'s OWN interaction/transitionType — it cannot be tricked into checking a different semantic authorization', async () => {
    const spy = jest.fn(async () => false)
    const record = baseRecord()
    await evaluateLiveDispatchEligibility(record, false, false, spy)
    expect(spy).toHaveBeenCalledWith('escrow-1', 'escrow.dispute.rule')
  })
})

describe('§25. Delete-the-Core test: NOT APPLICABLE — no live migration occurred', () => {
  it('dispute.service.ts does not import the dispatch gate or its adapter', () => {
    const source = fs.readFileSync(path.join(REPO_ROOT, 'src', 'modules', 'open-settlement', 'dispute.service.ts'), 'utf8')
    expect(source).not.toContain('dispatch-gate')
  })

  it('dispatch-gate-adapter.ts has no reference to real fund-movement functions or Providers', () => {
    const source = fs.readFileSync(path.join(REPO_ROOT, 'src', 'modules', 'open-settlement', 'dispatch-gate-adapter.ts'), 'utf8')
    expect(source).not.toMatch(/releaseFunds|refundFunds|splitFunds|initiateRelease|initiateRefund|initiateSplit|multisig\.provider|broadcast/i)
  })
})

describe('Determinism', () => {
  it('the same input produces the identical verdict across repeated calls', () => {
    const input = gateInput()
    const results = Array.from({ length: 5 }, () => JSON.stringify(evaluateDispatchEligibility(input)))
    expect(new Set(results).size).toBe(1)
  })
})

describe('M0 boundary remains intact', () => {
  it('packages/sails-core/src is still clean after adding dispatch-gate.ts', () => {
    const violations = checkDirectory(path.join(REPO_ROOT, 'packages', 'sails-core', 'src'))
    expect(violations).toEqual([])
  })
})
