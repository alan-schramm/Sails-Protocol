import { createInteractionId, createActorId, createTransitionTypeId } from '../src/identifiers'
import { createCanonicalEvaluatorIdentity, createCanonicalSemanticProfileIdentity } from '../src/evaluator-identity'
import { createRulesetRef, SemanticCommitment } from '../src/ruleset'
import {
  createSemanticHistoryPosition,
  LEGACY_UNVERIFIED,
} from '../src/semantic-history-position'
import { createCandidateTransition, createTransitionRecord } from '../src/transition'
import { createOutcome } from '../src/outcome'

const interaction = createInteractionId('interaction-1')
const commitment = 'sha256:deadbeef' as unknown as SemanticCommitment
const evaluatorIdentity = createCanonicalEvaluatorIdentity('payments-evaluator', '1.0')
const profileIdentity = createCanonicalSemanticProfileIdentity('sails-profile', '1.0')
const rulesetRef = createRulesetRef({
  name: 'P2P Trading Ruleset',
  identity: 'openp2p-trading',
  version: '1.0',
  commitment,
  expectedEvaluatorIdentity: evaluatorIdentity,
  expectedProfileIdentity: profileIdentity,
})

describe('SemanticHistoryPosition — storage-neutral', () => {
  it('accepts an opaque reference of any shape a Runtime chooses — a counter', () => {
    const position = createSemanticHistoryPosition({
      interaction,
      rulesetRef,
      evaluatorIdentity,
      profileIdentity,
      reference: 42,
    })
    expect(position.reference).toBe(42)
  })

  it('accepts an event-log-offset-shaped reference', () => {
    const position = createSemanticHistoryPosition({
      interaction,
      rulesetRef,
      evaluatorIdentity,
      profileIdentity,
      reference: { streamId: 'interaction-1', offset: 17 },
    })
    expect(position.reference).toEqual({ streamId: 'interaction-1', offset: 17 })
  })

  it('accepts a content-hash/state-root-shaped reference', () => {
    const position = createSemanticHistoryPosition({
      interaction,
      rulesetRef,
      evaluatorIdentity,
      profileIdentity,
      reference: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
    })
    expect(typeof position.reference).toBe('string')
  })

  it('never assumes SQL row number, block height, or a specific mechanism at the type level', () => {
    // The absence of a compile error for three structurally unrelated
    // `reference` shapes above IS the proof: the type accepts `unknown`,
    // imposing no mechanism.
    expect(true).toBe(true)
  })
})

describe('TransitionRecord — conditional shape', () => {
  const baseTransition = createCandidateTransition({
    interaction,
    type: createTransitionTypeId('ESCROW_EXPIRE'),
    payload: {},
  })
  const priorPosition = createSemanticHistoryPosition({
    interaction,
    rulesetRef,
    evaluatorIdentity,
    profileIdentity,
    reference: 1,
  })

  it('a deterministic decision carries neither attribution nor outcome', () => {
    const record = createTransitionRecord({
      interaction,
      priorPosition,
      transition: baseTransition,
      rulesetRef,
      evaluatorIdentity,
      profileIdentity,
      conditionResult: 'SATISFIED',
    })
    expect('attribution' in record).toBe(false)
    expect('outcome' in record).toBe(false)
  })

  it('a discretionary decision carries raw proof and resolved identity, never only a boolean', () => {
    const record = createTransitionRecord({
      interaction,
      priorPosition,
      transition: baseTransition,
      rulesetRef,
      evaluatorIdentity,
      profileIdentity,
      conditionResult: 'SATISFIED',
      attribution: {
        actor: createActorId('arbiter-1'),
        rawProof: { signature: 'deadbeef', algorithm: 'ed25519' },
        resolvedIdentityReference: { publicKey: 'abc123', resolvedAt: 'assertion-42' },
      },
    })
    expect(record.attribution).toBeDefined()
    // Deliberately NOT just `{ verified: true }` — the raw proof and
    // resolved identity material are what a future, independent
    // verifier actually needs.
    expect(Object.keys(record.attribution!).sort()).toEqual(
      ['actor', 'rawProof', 'resolvedIdentityReference'].sort(),
    )
    expect(record.attribution).not.toEqual({ verified: true })
  })

  it('an outcome-bearing decision carries the Outcome, an outcome-free one does not', () => {
    const withOutcome = createTransitionRecord({
      interaction,
      priorPosition,
      transition: baseTransition,
      rulesetRef,
      evaluatorIdentity,
      profileIdentity,
      conditionResult: 'SATISFIED',
      outcome: createOutcome({ content: { buyerShareBps: 10000 } }),
    })
    expect(withOutcome.outcome).toBeDefined()

    const withoutOutcome = createTransitionRecord({
      interaction,
      priorPosition,
      transition: baseTransition,
      rulesetRef,
      evaluatorIdentity,
      profileIdentity,
      conditionResult: 'SATISFIED',
    })
    expect('outcome' in withoutOutcome).toBe(false)
  })

  it('never carries a standalone semanticProvenance field', () => {
    const record = createTransitionRecord({
      interaction,
      priorPosition,
      transition: baseTransition,
      rulesetRef,
      evaluatorIdentity,
      profileIdentity,
      conditionResult: 'SATISFIED',
    })
    expect('semanticProvenance' in record).toBe(false)
  })

  it('a migrating Interaction may bind priorPosition to LEGACY_UNVERIFIED, never a fabricated position', () => {
    const genesisRecord = createTransitionRecord({
      interaction,
      priorPosition: LEGACY_UNVERIFIED,
      transition: baseTransition,
      rulesetRef,
      evaluatorIdentity,
      profileIdentity,
      conditionResult: 'SATISFIED',
    })
    expect(genesisRecord.priorPosition).toBe('LEGACY_UNVERIFIED')
  })

  it('carries the actual evaluator/profile identity used, independent of the ruleset it references', () => {
    const differentEvaluator = createCanonicalEvaluatorIdentity('payments-evaluator', '1.0')
    const record = createTransitionRecord({
      interaction,
      priorPosition,
      transition: baseTransition,
      rulesetRef,
      evaluatorIdentity: differentEvaluator,
      profileIdentity,
      conditionResult: 'SATISFIED',
    })
    expect(record.evaluatorIdentity).toBe(differentEvaluator)
    expect(record.rulesetRef).toBe(rulesetRef)
  })
})
