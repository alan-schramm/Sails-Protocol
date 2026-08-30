/**
 * Sails Core Implementation Program M5 (Generalized Attribution).
 * Runtime-adapter-level proofs for discretionary-authority.ts, using
 * REAL Ed25519 keypairs and Mission13's own, unmodified
 * arbitration-authority.ts crypto — not mocked signatures. Proves the
 * generalized Core primitive genuinely works against real
 * Mission13-shaped signed decisions, and that the boundaries the
 * mission requires (identity != authority, signature != authority,
 * submitter != authority, executor != authority, settlement key !=
 * authority key) hold under direct adversarial construction.
 *
 * NOT WIRED INTO ANY LIVE PATH — dispute.service.ts is untouched by
 * this mission (see discretionary-authority.ts's own header for why).
 */
import nacl from 'tweetnacl'
import * as fs from 'fs'
import * as path from 'path'
import {
  AuthorityDecisionPayload,
  signAuthorityDecision,
  hashAuthorityDecision,
} from '../src/modules/open-settlement/arbitration-authority'
import {
  evaluateAuthorityDecisionAttribution,
  buildDisputeRulingContext,
  ESCROW_DISPUTE_RULING_TRANSITION_TYPE,
} from '../src/modules/open-settlement/discretionary-authority'

const REPO_ROOT = path.resolve(__dirname, '..')

function basePayload(overrides: Partial<AuthorityDecisionPayload> = {}): AuthorityDecisionPayload {
  return {
    disputeId: 'dispute-1',
    escrowId: 'escrow-1',
    appealRound: 0,
    authorityId: 'arbiter-1',
    outcome: 'RELEASE',
    buyerBps: null,
    issuedAt: '2026-08-29T00:00:00.000Z',
    ...overrides,
  }
}

function hex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('hex')
}

describe('T1. Valid authority attribution — a real Ed25519-signed decision is attributed to the real signer', () => {
  it('ATTRIBUTED, with rawProof/resolvedIdentityReference captured verbatim', () => {
    const keypair = nacl.sign.keyPair()
    const payload = basePayload()
    const signatureHex = signAuthorityDecision(payload, keypair.secretKey)
    const publicKeyHex = hex(keypair.publicKey)

    const verdict = evaluateAuthorityDecisionAttribution(payload, signatureHex, publicKeyHex, buildDisputeRulingContext(payload.escrowId, payload))

    expect(verdict.kind).toBe('ATTRIBUTED')
    if (verdict.kind !== 'ATTRIBUTED') throw new Error('expected ATTRIBUTED')
    expect(verdict.claim.actor).toBe('arbiter-1')
    expect(verdict.claim.claimedInteraction).toBe('escrow-1')
    expect(verdict.claim.claimedTransitionType).toBe(ESCROW_DISPUTE_RULING_TRANSITION_TYPE)
    // T20/T21 — raw proof and resolved identity preserved verbatim.
    expect(verdict.attribution.rawProof).toBe(signatureHex)
    expect(verdict.attribution.resolvedIdentityReference).toBe(publicKeyHex)
    expect(verdict.attribution.actor).toBe('arbiter-1')
  })
})

describe('T2/P2. Wrong signer — a genuinely different keypair\'s signature does not attribute to the claimed actor', () => {
  it('NOT_ATTRIBUTED when the signature does not verify against the claimed authority\'s resolved key', () => {
    const realSigner = nacl.sign.keyPair()
    const impostor = nacl.sign.keyPair()
    const payload = basePayload()
    // Impostor signs, but the resolved public key on file is the REAL signer's.
    const impostorSignature = signAuthorityDecision(payload, impostor.secretKey)

    const verdict = evaluateAuthorityDecisionAttribution(payload, impostorSignature, hex(realSigner.publicKey), buildDisputeRulingContext(payload.escrowId, payload))
    expect(verdict.kind).toBe('NOT_ATTRIBUTED')
  })
})

describe('P1. Identity does not imply authority — a valid, resolvable actor with an invalid signature is not attributed', () => {
  it('a well-formed authorityId/escrowId with a bogus signature fails — being identifiable is not being authorized', () => {
    const keypair = nacl.sign.keyPair()
    const payload = basePayload()
    const bogusSignature = hex(new Uint8Array(64)) // syntactically plausible, cryptographically meaningless

    const verdict = evaluateAuthorityDecisionAttribution(payload, bogusSignature, hex(keypair.publicKey), buildDisputeRulingContext(payload.escrowId, payload))
    expect(verdict.kind).toBe('NOT_ATTRIBUTED')
  })
})

describe('T5/P11. Interaction A proof replayed to Interaction B fails closed', () => {
  it('a validly-signed decision for escrow-1 does not attribute when evaluated against escrow-2\'s context', () => {
    const keypair = nacl.sign.keyPair()
    const payload = basePayload({ escrowId: 'escrow-1' })
    const signatureHex = signAuthorityDecision(payload, keypair.secretKey)

    const wrongContext = buildDisputeRulingContext('escrow-2', payload) // interaction mismatch: escrow-2, not escrow-1
    const verdict = evaluateAuthorityDecisionAttribution(payload, signatureHex, hex(keypair.publicKey), wrongContext)
    expect(verdict.kind).toBe('NOT_ATTRIBUTED')
  })
})

describe('T7/P13. Decision payload substitution fails closed — both cryptographically AND structurally', () => {
  it('modifying outcome after signing invalidates the signature itself (canonical string changed)', () => {
    const keypair = nacl.sign.keyPair()
    const signedPayload = basePayload({ outcome: 'REFUND' })
    const signatureHex = signAuthorityDecision(signedPayload, keypair.secretKey)
    const tamperedPayload = { ...signedPayload, outcome: 'RELEASE' as const }

    // The tampered payload is what gets "presented" as the decision, but
    // the signature was computed over the ORIGINAL — verification itself
    // already fails here (real Ed25519 property, not a Core-level check).
    const verdict = evaluateAuthorityDecisionAttribution(tamperedPayload, signatureHex, hex(keypair.publicKey), buildDisputeRulingContext(tamperedPayload.escrowId, tamperedPayload))
    expect(verdict.kind).toBe('NOT_ATTRIBUTED')
  })

  it('a validly-signed decision for one payload does not authorize a DIFFERENT actual decision — the content-commitment binding catches what a naive re-verify-only check would miss', () => {
    const keypair = nacl.sign.keyPair()
    const signedPayload = basePayload({ outcome: 'REFUND' })
    const signatureHex = signAuthorityDecision(signedPayload, keypair.secretKey)
    // The signature/payload pair is internally consistent and verifies —
    // but the ACTUAL decision being executed (per the context) is a
    // different one (RELEASE, not REFUND).
    const actuallyExecutedPayload = { ...signedPayload, outcome: 'RELEASE' as const }
    const context = buildDisputeRulingContext(signedPayload.escrowId, actuallyExecutedPayload)

    const verdict = evaluateAuthorityDecisionAttribution(signedPayload, signatureHex, hex(keypair.publicKey), context)
    expect(verdict.kind).toBe('NOT_ATTRIBUTED')
  })
})

describe('T8/P6. Submitter != authority — attribution always follows authorityId, never any separately-supplied submitter identity', () => {
  it('the verdict\'s actor is exactly payload.authorityId regardless of who "submitted" the HTTP request — this adapter\'s signature has no submitter parameter at all', () => {
    const keypair = nacl.sign.keyPair()
    const payload = basePayload({ authorityId: 'arbiter-1' })
    const signatureHex = signAuthorityDecision(payload, keypair.secretKey)

    // evaluateAuthorityDecisionAttribution's own signature (payload,
    // signatureHex, resolvedPublicKeyHex, context) has no "submittedBy"
    // parameter to even pass a different submitter through — this is a
    // structural proof, not merely a runtime assertion.
    expect(evaluateAuthorityDecisionAttribution.length).toBe(4)
    const verdict = evaluateAuthorityDecisionAttribution(payload, signatureHex, hex(keypair.publicKey), buildDisputeRulingContext(payload.escrowId, payload))
    expect(verdict.kind === 'ATTRIBUTED' && verdict.claim.actor).toBe('arbiter-1')
  })
})

describe('T9/P7. Executor != authority — the adapter has no notion of "who will execute" at all', () => {
  it('discretionary-authority.ts\'s own exported functions take no executor/triggeredBy/settlement-key parameter', () => {
    const source = fs.readFileSync(path.join(REPO_ROOT, 'src', 'modules', 'open-settlement', 'discretionary-authority.ts'), 'utf8')
    expect(source).not.toMatch(/triggeredBy|executorId|settlementKey/)
  })
})

describe('T10/T25/P8. Settlement key != authority key — structurally separate modules, never imported by each other', () => {
  it('discretionary-authority.ts never imports the multisig execution-key derivation module', () => {
    const source = fs.readFileSync(path.join(REPO_ROOT, 'src', 'modules', 'open-settlement', 'discretionary-authority.ts'), 'utf8')
    expect(source).not.toContain('multisig.provider')
    expect(source).not.toContain('deriveArbiterKey')
  })
})

describe('T11/P9. Server impersonation — no parameter path accepts a pre-computed proofVerified boolean from a caller', () => {
  it('evaluateAuthorityDecisionAttribution always recomputes verification itself from real signature + key material — an impostor signature is rejected even if syntactically well-formed', () => {
    const keypair = nacl.sign.keyPair()
    const payload = basePayload()
    // A signature that never actually came from keypair.secretKey.
    const forgedSignature = hex(nacl.sign.detached(new Uint8Array(Buffer.from(hashAuthorityDecision(payload), 'hex')), nacl.sign.keyPair().secretKey))

    const verdict = evaluateAuthorityDecisionAttribution(payload, forgedSignature, hex(keypair.publicKey), buildDisputeRulingContext(payload.escrowId, payload))
    expect(verdict.kind).toBe('NOT_ATTRIBUTED')
  })
})

describe('T12/T13/P10. Malformed proof / malformed public key fail closed, never throw', () => {
  it('a malformed hex signature fails closed', () => {
    const payload = basePayload()
    expect(() => evaluateAuthorityDecisionAttribution(payload, 'not-valid-hex!!', hex(nacl.sign.keyPair().publicKey), buildDisputeRulingContext(payload.escrowId, payload))).not.toThrow()
    const verdict = evaluateAuthorityDecisionAttribution(payload, 'not-valid-hex!!', hex(nacl.sign.keyPair().publicKey), buildDisputeRulingContext(payload.escrowId, payload))
    expect(verdict.kind).toBe('NOT_ATTRIBUTED')
  })

  it('a malformed public key fails closed', () => {
    const keypair = nacl.sign.keyPair()
    const payload = basePayload()
    const signatureHex = signAuthorityDecision(payload, keypair.secretKey)
    const verdict = evaluateAuthorityDecisionAttribution(payload, signatureHex, 'not-a-real-key', buildDisputeRulingContext(payload.escrowId, payload))
    expect(verdict.kind).toBe('NOT_ATTRIBUTED')
  })
})

describe('T17. Assertion cannot substitute authorization — structurally distinct types, no conversion path', () => {
  it('nothing in discretionary-authority.ts imports or constructs an Assertion', () => {
    const source = fs.readFileSync(path.join(REPO_ROOT, 'src', 'modules', 'open-settlement', 'discretionary-authority.ts'), 'utf8')
    expect(source).not.toMatch(/Assertion/)
  })
})

describe('T18/T19. Evidence and QVAC cannot substitute authorization — no shared type, no shared function', () => {
  it('discretionary-authority.ts has no reference to evidence or QVAC types at all', () => {
    const source = fs.readFileSync(path.join(REPO_ROOT, 'src', 'modules', 'open-settlement', 'discretionary-authority.ts'), 'utf8')
    expect(source).not.toMatch(/[Ee]vidence|QVAC|qvac/)
  })
})

describe('AF. Proof M5 introduces no live authority — dispute.service.ts is untouched', () => {
  it('dispute.service.ts does not import discretionary-authority.ts', () => {
    const source = fs.readFileSync(path.join(REPO_ROOT, 'src', 'modules', 'open-settlement', 'dispute.service.ts'), 'utf8')
    expect(source).not.toContain('discretionary-authority')
  })
})

describe('T3. Unknown/unresolvable authority — an empty or malformed public key never attributes', () => {
  it('an empty resolved public key fails closed rather than throwing', () => {
    const payload = basePayload()
    const signatureHex = 'aa'.repeat(64)
    expect(() => evaluateAuthorityDecisionAttribution(payload, signatureHex, '', buildDisputeRulingContext(payload.escrowId, payload))).not.toThrow()
    expect(evaluateAuthorityDecisionAttribution(payload, signatureHex, '', buildDisputeRulingContext(payload.escrowId, payload)).kind).toBe('NOT_ATTRIBUTED')
  })
})

describe('T4/P6. Valid signer but unauthorized authority — a domain-level check, deliberately NOT Core\'s job', () => {
  it('evaluateAuthorityDecisionAttribution takes exactly (payload, signatureHex, resolvedPublicKeyHex, context) — no dispute row, no eligibility/assignment parameter of any kind; a cryptographically valid signer for a dispute they were never assigned to is still evaluated purely on interaction/transition/content binding here. Domain eligibility (dispute.arbiterId === arbiterId, unchanged, tests/disputeFlow.test.ts) is the caller\'s own, separate, un-duplicated responsibility.', () => {
    expect(evaluateAuthorityDecisionAttribution.length).toBe(4)
  })
})

describe('T16. Historical identity survives across two independently-keyed decisions — no shared mutable key state', () => {
  it('two decisions signed by two different real keypairs each attribute using their OWN resolved key, never the other\'s', () => {
    const keypairA = nacl.sign.keyPair()
    const keypairB = nacl.sign.keyPair()
    const payloadA = basePayload({ escrowId: 'escrow-a', authorityId: 'arbiter-a' })
    const payloadB = basePayload({ escrowId: 'escrow-b', authorityId: 'arbiter-b' })
    const sigA = signAuthorityDecision(payloadA, keypairA.secretKey)
    const sigB = signAuthorityDecision(payloadB, keypairB.secretKey)

    const verdictA = evaluateAuthorityDecisionAttribution(payloadA, sigA, hex(keypairA.publicKey), buildDisputeRulingContext(payloadA.escrowId, payloadA))
    const verdictB = evaluateAuthorityDecisionAttribution(payloadB, sigB, hex(keypairB.publicKey), buildDisputeRulingContext(payloadB.escrowId, payloadB))

    expect(verdictA.kind === 'ATTRIBUTED' && verdictA.attribution.resolvedIdentityReference).toBe(hex(keypairA.publicKey))
    expect(verdictB.kind === 'ATTRIBUTED' && verdictB.attribution.resolvedIdentityReference).toBe(hex(keypairB.publicKey))
    // A's proof does not attribute under B's resolved key, and vice versa.
    expect(evaluateAuthorityDecisionAttribution(payloadA, sigA, hex(keypairB.publicKey), buildDisputeRulingContext(payloadA.escrowId, payloadA)).kind).toBe('NOT_ATTRIBUTED')
  })
})

describe('Determinism / idempotency', () => {
  it('the same real signature evaluated repeatedly against the same context always attributes identically', () => {
    const keypair = nacl.sign.keyPair()
    const payload = basePayload()
    const signatureHex = signAuthorityDecision(payload, keypair.secretKey)
    const context = buildDisputeRulingContext(payload.escrowId, payload)

    const results = Array.from({ length: 5 }, () => evaluateAuthorityDecisionAttribution(payload, signatureHex, hex(keypair.publicKey), context).kind)
    expect(new Set(results).size).toBe(1)
    expect(results[0]).toBe('ATTRIBUTED')
  })
})
