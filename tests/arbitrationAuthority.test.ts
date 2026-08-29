/**
 * arbitration-authority.ts — Missão 13 Fase 2, Task 29/30/A1-A13.
 *
 * Unit tests for the Candidate B signed-authority-decision primitive that
 * closes INV-12 for the MULTISIG disputed-settlement path. No Prisma/
 * eventBus mocking needed — this module is pure crypto + validation, the
 * same reason deriveTradeState()'s tests in disputeFlow.test.ts need none
 * either. dispute.service.ts's own integration of this module (the actual
 * resolveDispute() gate) is covered by disputeFlow.test.ts and
 * fullTradeLifecycle.test.ts — this file exercises the primitive itself,
 * including the adversarial cases a service-level mock can't cleanly
 * express (tampering with one field of an already-signed payload).
 */
import nacl from 'tweetnacl'
import {
  AUTHORITY_DECISION_DOMAIN,
  AUTHORITY_DECISION_VERSION,
  canonicalizeAuthorityDecision,
  hashAuthorityDecision,
  signAuthorityDecision,
  verifyAuthorityDecisionSignature,
  assertExecutionMatchesAuthorization,
  type AuthorityDecisionPayload,
} from '../src/modules/open-settlement/arbitration-authority'

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

describe('canonicalizeAuthorityDecision — deterministic, order-sensitive, domain-separated', () => {
  it('is a `|`-joined string starting with the domain and version, never JSON.stringify', () => {
    const canonical = canonicalizeAuthorityDecision(basePayload())
    expect(canonical).toBe(
      [AUTHORITY_DECISION_DOMAIN, String(AUTHORITY_DECISION_VERSION), 'dispute-1', 'escrow-1', '0', 'arbiter-1', 'RELEASE', '', '2026-08-29T00:00:00.000Z'].join('|')
    )
  })

  it('is deterministic — the same payload always canonicalizes identically', () => {
    const payload = basePayload({ outcome: 'SPLIT', buyerBps: 6000 })
    expect(canonicalizeAuthorityDecision(payload)).toBe(canonicalizeAuthorityDecision({ ...payload }))
  })

  it('encodes a null buyerBps as an empty field, never the string "null"', () => {
    const canonical = canonicalizeAuthorityDecision(basePayload({ outcome: 'REFUND', buyerBps: null }))
    expect(canonical).toContain('|REFUND||2026-08-29')
    expect(canonical).not.toContain('null')
  })

  it('rejects SPLIT with a null/out-of-range/non-integer buyerBps', () => {
    expect(() => canonicalizeAuthorityDecision(basePayload({ outcome: 'SPLIT', buyerBps: null }))).toThrow(/buyerBps/)
    expect(() => canonicalizeAuthorityDecision(basePayload({ outcome: 'SPLIT', buyerBps: 0 }))).toThrow(/buyerBps/)
    expect(() => canonicalizeAuthorityDecision(basePayload({ outcome: 'SPLIT', buyerBps: 10000 }))).toThrow(/buyerBps/)
    expect(() => canonicalizeAuthorityDecision(basePayload({ outcome: 'SPLIT', buyerBps: 1.5 }))).toThrow(/buyerBps/)
  })

  it('rejects RELEASE/REFUND carrying a non-null buyerBps', () => {
    expect(() => canonicalizeAuthorityDecision(basePayload({ outcome: 'RELEASE', buyerBps: 6000 }))).toThrow(/must not carry a buyerBps/)
    expect(() => canonicalizeAuthorityDecision(basePayload({ outcome: 'REFUND', buyerBps: 1 }))).toThrow(/must not carry a buyerBps/)
  })

  it('accepts the boundary values 1 and 9999 for SPLIT buyerBps', () => {
    expect(() => canonicalizeAuthorityDecision(basePayload({ outcome: 'SPLIT', buyerBps: 1 }))).not.toThrow()
    expect(() => canonicalizeAuthorityDecision(basePayload({ outcome: 'SPLIT', buyerBps: 9999 }))).not.toThrow()
  })
})

describe('hashAuthorityDecision', () => {
  it('is the sha256 hex digest of the canonical string', () => {
    const payload = basePayload()
    const expected = require('crypto').createHash('sha256').update(canonicalizeAuthorityDecision(payload)).digest('hex')
    expect(hashAuthorityDecision(payload)).toBe(expected)
  })

  it('changes if any single field changes — no two distinct economic dispositions ever collide', () => {
    const base = hashAuthorityDecision(basePayload())
    expect(hashAuthorityDecision(basePayload({ disputeId: 'dispute-2' }))).not.toBe(base)
    expect(hashAuthorityDecision(basePayload({ escrowId: 'escrow-2' }))).not.toBe(base)
    expect(hashAuthorityDecision(basePayload({ appealRound: 1 }))).not.toBe(base)
    expect(hashAuthorityDecision(basePayload({ authorityId: 'arbiter-2' }))).not.toBe(base)
    expect(hashAuthorityDecision(basePayload({ outcome: 'REFUND' }))).not.toBe(base)
    expect(hashAuthorityDecision(basePayload({ issuedAt: '2026-08-30T00:00:00.000Z' }))).not.toBe(base)
  })
})

describe('signAuthorityDecision / verifyAuthorityDecisionSignature — round trip', () => {
  const keypair = nacl.sign.keyPair()
  const publicKeyHex = Buffer.from(keypair.publicKey).toString('hex')
  const otherKeypair = nacl.sign.keyPair()
  const otherPublicKeyHex = Buffer.from(otherKeypair.publicKey).toString('hex')

  it('a signature produced by the authority verifies against their own public key', () => {
    const payload = basePayload()
    const signature = signAuthorityDecision(payload, keypair.secretKey)
    expect(verifyAuthorityDecisionSignature(payload, signature, publicKeyHex)).toBe(true)
  })

  // A1 — server fabricates a decision nobody signed: garbage/absent
  // signature never verifies against a real public key.
  it('A1 — a fabricated (garbage) signature does not verify', () => {
    const payload = basePayload()
    expect(verifyAuthorityDecisionSignature(payload, 'deadbeef'.repeat(16), publicKeyHex)).toBe(false)
  })

  // A6 — authority-identity swap: a real signature from a DIFFERENT real
  // keypair must not verify against this authority's public key, even
  // though both are otherwise well-formed Ed25519 signatures.
  it('A6 — a signature from a different real keypair does not verify against this authority\'s public key', () => {
    const payload = basePayload()
    const signatureFromWrongSigner = signAuthorityDecision(payload, otherKeypair.secretKey)
    expect(verifyAuthorityDecisionSignature(payload, signatureFromWrongSigner, publicKeyHex)).toBe(false)
    // ... but it DOES verify against the actual signer's own key — proving
    // the failure above is identity-specific, not a broken verifier.
    expect(verifyAuthorityDecisionSignature(payload, signatureFromWrongSigner, otherPublicKeyHex)).toBe(true)
  })

  // A2 — outcome substitution: a REFUND decision must never verify as
  // authorizing RELEASE, or vice versa.
  it('A2 — REFUND↔RELEASE substitution: a signature over one outcome does not verify for the other', () => {
    const refundPayload = basePayload({ outcome: 'REFUND' })
    const signature = signAuthorityDecision(refundPayload, keypair.secretKey)
    const releasePayload = { ...refundPayload, outcome: 'RELEASE' as const }
    expect(verifyAuthorityDecisionSignature(releasePayload, signature, publicKeyHex)).toBe(false)
  })

  // A3 / Task 30 — the Mission 13 signature test: an independent verifier
  // can tell a 70/30 SPLIT decision apart from a substituted 30/70 (or
  // 100/0) allocation, using only the public key and the signed artifact —
  // no trust in any executor-controlled mutable state.
  it('A3/Task 30 — a 70/30 SPLIT signature does not verify for a substituted 30/70 or 100/0 allocation', () => {
    const seventyThirty = basePayload({ outcome: 'SPLIT', buyerBps: 7000 })
    const signature = signAuthorityDecision(seventyThirty, keypair.secretKey)
    expect(verifyAuthorityDecisionSignature(seventyThirty, signature, publicKeyHex)).toBe(true)

    const thirtySeventy = { ...seventyThirty, buyerBps: 3000 }
    const oneHundredZero = { ...seventyThirty, buyerBps: 9999 }
    expect(verifyAuthorityDecisionSignature(thirtySeventy, signature, publicKeyHex)).toBe(false)
    expect(verifyAuthorityDecisionSignature(oneHundredZero, signature, publicKeyHex)).toBe(false)
  })

  // A4 — cross-dispute replay: a valid signature for dispute-1 must not
  // verify when presented as authorization for a different dispute.
  it('A4 — cross-dispute replay: a signature for dispute-1 does not verify for dispute-2', () => {
    const payload = basePayload({ disputeId: 'dispute-1' })
    const signature = signAuthorityDecision(payload, keypair.secretKey)
    expect(verifyAuthorityDecisionSignature({ ...payload, disputeId: 'dispute-2' }, signature, publicKeyHex)).toBe(false)
  })

  // A5 — cross-escrow replay: same idea, escrowId dimension. Guards
  // against a dispute row somehow pointing at the wrong escrow.
  it('A5 — cross-escrow replay: a signature for escrow-1 does not verify for escrow-2', () => {
    const payload = basePayload({ escrowId: 'escrow-1' })
    const signature = signAuthorityDecision(payload, keypair.secretKey)
    expect(verifyAuthorityDecisionSignature({ ...payload, escrowId: 'escrow-2' }, signature, publicKeyHex)).toBe(false)
  })

  // Cross-appeal-round replay — an authorization from appeal round 0
  // (the original ruling) must not verify for round 1 (a reopened,
  // possibly reassigned dispute), even if authorityId is unchanged.
  it('cross-appeal-round replay: a signature for appealRound 0 does not verify for appealRound 1', () => {
    const payload = basePayload({ appealRound: 0 })
    const signature = signAuthorityDecision(payload, keypair.secretKey)
    expect(verifyAuthorityDecisionSignature({ ...payload, appealRound: 1 }, signature, publicKeyHex)).toBe(false)
  })

  // Same-dispute-safe-retry: re-verifying the SAME already-valid
  // signature against the SAME unmodified payload any number of times
  // must keep succeeding — this primitive is not a nonce/one-shot
  // mechanism, retries of an identical request are expected to keep
  // working (idempotent verification, not idempotent EXECUTION — that
  // guarantee lives in dispute.service.ts's own RESOLVED-status guard).
  it('same-dispute-safe-retry: verifying the same unmodified payload+signature repeatedly keeps succeeding', () => {
    const payload = basePayload()
    const signature = signAuthorityDecision(payload, keypair.secretKey)
    expect(verifyAuthorityDecisionSignature(payload, signature, publicKeyHex)).toBe(true)
    expect(verifyAuthorityDecisionSignature(payload, signature, publicKeyHex)).toBe(true)
    expect(verifyAuthorityDecisionSignature(payload, signature, publicKeyHex)).toBe(true)
  })

  // A7 — malformed signature/public key input (not just wrong, but
  // structurally invalid hex/length) must return false, never throw —
  // a throw here would be a DoS vector (any caller could crash
  // resolveDispute() with a garbage signature field).
  it('A7 — malformed hex signature or public key returns false rather than throwing', () => {
    const payload = basePayload()
    expect(() => verifyAuthorityDecisionSignature(payload, 'not-hex-at-all', publicKeyHex)).not.toThrow()
    expect(verifyAuthorityDecisionSignature(payload, 'not-hex-at-all', publicKeyHex)).toBe(false)
    expect(() => verifyAuthorityDecisionSignature(payload, '', publicKeyHex)).not.toThrow()
    expect(verifyAuthorityDecisionSignature(payload, '', publicKeyHex)).toBe(false)
    expect(() => verifyAuthorityDecisionSignature(payload, signAuthorityDecision(payload, keypair.secretKey), 'garbage-not-hex')).not.toThrow()
    expect(verifyAuthorityDecisionSignature(payload, signAuthorityDecision(payload, keypair.secretKey), 'garbage-not-hex')).toBe(false)
  })

  // A8 — superseded decision: signing two different outcomes for the
  // SAME dispute/appealRound produces two independently valid signatures
  // (this primitive has no built-in "only one may ever be valid" state —
  // that's dispute.service.ts's job via the RESOLVED-status guard, not
  // this stateless crypto primitive's). Documents the boundary rather
  // than asserting a guarantee this module doesn't provide.
  it('A8 — this stateless primitive does not itself prevent two valid signed decisions for the same dispute (service-layer responsibility)', () => {
    const release = basePayload({ outcome: 'RELEASE' })
    const refund = basePayload({ outcome: 'REFUND' })
    const releaseSig = signAuthorityDecision(release, keypair.secretKey)
    const refundSig = signAuthorityDecision(refund, keypair.secretKey)
    expect(verifyAuthorityDecisionSignature(release, releaseSig, publicKeyHex)).toBe(true)
    expect(verifyAuthorityDecisionSignature(refund, refundSig, publicKeyHex)).toBe(true)
  })
})

describe('assertExecutionMatchesAuthorization — the execution-correspondence boundary', () => {
  const authorized = basePayload({ outcome: 'SPLIT', buyerBps: 7000 })

  it('does not throw when the requested execution matches the authorization exactly', () => {
    expect(() =>
      assertExecutionMatchesAuthorization(authorized, {
        disputeId: authorized.disputeId,
        escrowId: authorized.escrowId,
        appealRound: authorized.appealRound,
        authorityId: authorized.authorityId,
        outcome: authorized.outcome,
        buyerBps: authorized.buyerBps,
      })
    ).not.toThrow()
  })

  it('throws ForbiddenError when the requested disputeId differs', () => {
    expect(() =>
      assertExecutionMatchesAuthorization(authorized, { ...authorized, disputeId: 'dispute-2' })
    ).toThrow(/does not correspond to this dispute/)
  })

  it('throws ForbiddenError when the requested escrowId differs', () => {
    expect(() =>
      assertExecutionMatchesAuthorization(authorized, { ...authorized, escrowId: 'escrow-2' })
    ).toThrow(/does not correspond to this escrow/)
  })

  it('throws ForbiddenError when the requested appealRound differs', () => {
    expect(() =>
      assertExecutionMatchesAuthorization(authorized, { ...authorized, appealRound: 1 })
    ).toThrow(/different appeal round/)
  })

  it('throws ForbiddenError when the requested authorityId differs', () => {
    expect(() =>
      assertExecutionMatchesAuthorization(authorized, { ...authorized, authorityId: 'arbiter-2' })
    ).toThrow(/not produced by the authority assigned/)
  })

  // A2 at the boundary-check level too, not just the signature level.
  it('throws ForbiddenError when the requested outcome differs (RELEASE substituted for authorized SPLIT)', () => {
    expect(() =>
      assertExecutionMatchesAuthorization(authorized, { ...authorized, outcome: 'RELEASE', buyerBps: null })
    ).toThrow(/authorized SPLIT, not RELEASE/)
  })

  // A3 at the boundary-check level — 70/30 vs 30/70 substitution.
  it('throws ForbiddenError when the requested SPLIT allocation differs from the authorized one', () => {
    expect(() =>
      assertExecutionMatchesAuthorization(authorized, { ...authorized, buyerBps: 3000 })
    ).toThrow(/different SPLIT allocation/)
  })
})
