import { createAssertion } from '../src/assertion'
import { createInteractionId, createSourceRef, createAssertionId } from '../src/identifiers'
import { SemanticCommitment } from '../src/ruleset'
import { createOutcome } from '../src/outcome'

const interaction = createInteractionId('interaction-1')
const commitment = 'sha256:deadbeef' as unknown as SemanticCommitment

describe('Assertion — envelope shape, never truth', () => {
  it('exposes exactly the seven Core-mandatory fields plus optional supersession — no more', () => {
    const assertion = createAssertion({
      id: createAssertionId('assertion-1'),
      interaction,
      source: createSourceRef('agent:qvac:recommendation-engine'),
      type: 'payment.confirmation',
      content: { claim: 'buyer sent payment' },
      commitment,
    })
    // Confirms the deliberate minimality: no `submissionOrdering`, no
    // `admissionStatus`, and critically no truth/confidence/verified
    // field anywhere — an Assertion never carries its own truth-status.
    expect(Object.keys(assertion).sort()).toEqual(
      ['commitment', 'content', 'id', 'interaction', 'source', 'type'].sort(),
    )
  })

  it('can represent a false claim exactly as easily as a true one — Assertion never scores truth', () => {
    const falseClaim = createAssertion({
      id: createAssertionId('assertion-2'),
      interaction,
      source: createSourceRef('human:buyer-123'),
      type: 'payment.confirmation',
      content: { claim: 'buyer sent payment', actuallyTrue: false },
      commitment,
    })
    // The type system and the constructor impose no truth requirement —
    // this compiles and constructs identically to a true claim, exactly
    // as SEMANTIC_KERNEL.md §8 requires ("never itself truth").
    expect(falseClaim.content).toEqual({ claim: 'buyer sent payment', actuallyTrue: false })
  })

  it('a correction is a NEW Assertion referencing the old one via supersession, never a mutation', () => {
    const original = createAssertion({
      id: createAssertionId('assertion-3'),
      interaction,
      source: createSourceRef('human:buyer-123'),
      type: 'payment.confirmation',
      content: { amount: 100 },
      commitment,
    })
    const correction = createAssertion({
      id: createAssertionId('assertion-4'),
      interaction,
      source: createSourceRef('human:buyer-123'),
      type: 'payment.confirmation',
      content: { amount: 150 },
      commitment,
      supersession: { supersedes: original.id },
    })
    expect(correction.supersession?.supersedes).toBe(original.id)
    // The original is untouched — no API exists to mutate it in place.
    expect(original.content).toEqual({ amount: 100 })
  })

  it('accepts a system source, not only human/participant sources', () => {
    const systemAssertion = createAssertion({
      id: createAssertionId('assertion-5'),
      interaction,
      source: createSourceRef('system:expiry-sweeper'),
      type: 'timelock.expired',
      content: { observedAt: 1730000000000 },
      commitment,
    })
    expect(systemAssertion.source).toBe('system:expiry-sweeper')
  })

  it('rejects an empty type', () => {
    expect(() =>
      createAssertion({
        id: createAssertionId('assertion-6'),
        interaction,
        source: createSourceRef('system:x'),
        type: '',
        content: {},
        commitment,
      }),
    ).toThrow()
  })
})

describe('Outcome — conditional, opaque, never rail-specific', () => {
  it('may exist with no destination binding at all (no transfer involved)', () => {
    const outcome = createOutcome({ content: { adjustment: 'reputation+1' } })
    expect(outcome.destinationBinding).toBeUndefined()
  })

  it('destination-binding existence is structurally visible, separate from content', () => {
    const outcome = createOutcome({
      content: { buyerShareBps: 7000, sellerShareBps: 3000 },
      destinationBinding: { reference: { rail: 'bitcoin', address: 'bc1qexampleaddress' } },
    })
    // Existence/reference is a distinct field from opaque content — an
    // auditor can see a binding exists without decoding `content`.
    expect(outcome.destinationBinding).toBeDefined()
    expect(outcome.content).toEqual({ buyerShareBps: 7000, sellerShareBps: 3000 })
    expect(outcome.destinationBinding?.reference).toEqual({ rail: 'bitcoin', address: 'bc1qexampleaddress' })
  })

  it('never resurrects EconomicEffect or relationGroup — Outcome has exactly two possible fields', () => {
    const outcome = createOutcome({
      content: {},
      destinationBinding: { reference: 'opaque' },
    })
    expect(Object.keys(outcome).sort()).toEqual(['content', 'destinationBinding'])
  })
})
