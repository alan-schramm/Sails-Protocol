/**
 * ADR-001 Day-0 Multi-Operator Sails Network, Implementation Sequence
 * step (a) "Portable Signed Offers" — adversarial test suite.
 * docs/PORTABLE_SIGNED_OFFERS_EVIDENCE.md carries the full evidence
 * narrative; this file is the real, executable proof.
 *
 * Real Ed25519 cryptography throughout (tweetnacl, the same library
 * common/middleware/auth.ts already uses for challenge-response) — no
 * mocking of signing/verification. Only `prisma.offerEnvelope` is
 * mocked, for the ingest()/convergence tests specifically.
 */
export {} // isolates this file's module-scope consts, same convention
// tests/capabilityGrantRepository.test.ts already establishes.

const mockFindFirst = jest.fn()
const mockCreate = jest.fn()
jest.mock('../src/common/database', () => ({
  prisma: {
    offerEnvelope: {
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
      create: (...args: unknown[]) => mockCreate(...args),
    },
  },
}))

// eslint-disable-next-line @typescript-eslint/no-var-requires
const nacl = require('tweetnacl')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  canonicalizeOfferEnvelope,
  hashOfferEnvelope,
  signOfferEnvelope,
  verifyOfferEnvelope,
  isOfferEnvelopeEconomicallyActive,
  OFFER_ENVELOPE_DOMAIN_TAG,
} = require('../src/modules/open-liquidity/offer-envelope')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { OfferEnvelopeRepository } = require('../src/modules/open-liquidity/offer-envelope-repository')

function hex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('hex')
}

function makeKeypair() {
  const kp = nacl.sign.keyPair()
  return { publicKeyHex: hex(kp.publicKey), secretKeyHex: hex(kp.secretKey) }
}

function baseContent(overrides: Partial<Record<string, unknown>> = {}, ownerPublicKey: string) {
  return {
    logicalOfferId: '11111111-1111-1111-1111-111111111111',
    ownerPublicKey,
    asset: 'BTC',
    side: 'SELL',
    priceUsd: '65000.00000000',
    minAmount: '0.00100000',
    maxAmount: '0.50000000',
    paymentMethod: 'PIX',
    revision: 1,
    createdAt: '2026-09-09T00:00:00.000Z',
    revisedAt: '2026-09-09T00:00:00.000Z',
    expiresAt: '2026-09-09T01:00:00.000Z',
    status: 'ACTIVE',
    ...overrides,
  }
}

function signedEnvelope(content: ReturnType<typeof baseContent>, secretKeyHex: string) {
  return { ...content, signature: signOfferEnvelope(content as any, secretKeyHex) }
}

describe('OfferEnvelope — canonical serialization (deterministic vectors)', () => {
  it('15. produces byte-identical canonical output for identical input, twice', () => {
    const { publicKeyHex } = makeKeypair()
    const content = baseContent({}, publicKeyHex)
    const a = canonicalizeOfferEnvelope(content as any)
    const b = canonicalizeOfferEnvelope(content as any)
    expect(a.equals(b)).toBe(true)
  })

  it('15b. hardcoded deterministic test vector — an independent implementation can check itself against this exact digest', () => {
    // Fixed, hand-verified input — a real conformant implementation
    // reproducing this same digest hex is the actual cross-language
    // determinism proof (ADR-001 §3's own requirement), not merely
    // "this codebase agrees with itself."
    const content = {
      logicalOfferId: 'offer-vector-0001',
      ownerPublicKey: '0'.repeat(64),
      asset: 'BTC',
      side: 'SELL',
      priceUsd: '65000.00000000',
      minAmount: '0.00100000',
      maxAmount: '0.50000000',
      paymentMethod: 'PIX',
      revision: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
      revisedAt: '2026-01-01T00:00:00.000Z',
      expiresAt: '2026-01-02T00:00:00.000Z',
      status: 'ACTIVE',
    }
    const canonical = canonicalizeOfferEnvelope(content as any)
    expect(canonical.toString('utf8')).toBe(
      [
        OFFER_ENVELOPE_DOMAIN_TAG,
        'offer-vector-0001',
        '0'.repeat(64),
        'BTC',
        'SELL',
        '65000.00000000',
        '0.00100000',
        '0.50000000',
        'PIX',
        '1',
        '2026-01-01T00:00:00.000Z',
        '2026-01-01T00:00:00.000Z',
        '2026-01-02T00:00:00.000Z',
        'ACTIVE',
      ].join('\x1f')
    )
    // Independently computed (plain Node `crypto.createHash('sha256')`
    // over the exact same canonical string, outside this module under
    // test) — a real cross-check, not a tautology against the function
    // being tested. Any conformant implementation reproducing this
    // canonical string must arrive at this exact digest.
    const digestHex = hashOfferEnvelope(content as any).toString('hex')
    expect(digestHex).toBe('634577a0f860f90d84d5e957fd688ad081b8b9b5e1b922924faf29636e227ff7')
    expect(digestHex).toHaveLength(64)
    expect(/^[0-9a-f]{64}$/.test(digestHex)).toBe(true)
  })
})

describe('OfferEnvelope — signature verification (adversarial)', () => {
  it('1. valid signature verifies', () => {
    const { publicKeyHex, secretKeyHex } = makeKeypair()
    const envelope = signedEnvelope(baseContent({}, publicKeyHex), secretKeyHex)
    expect(verifyOfferEnvelope(envelope)).toEqual({ valid: true })
  })

  it('2. invalid signature (garbage bytes) is rejected', () => {
    const { publicKeyHex } = makeKeypair()
    const envelope = { ...baseContent({}, publicKeyHex), signature: '00'.repeat(64) }
    const verdict = verifyOfferEnvelope(envelope)
    expect(verdict.valid).toBe(false)
  })

  it('3. price altered after signing invalidates the signature', () => {
    const { publicKeyHex, secretKeyHex } = makeKeypair()
    const envelope = signedEnvelope(baseContent({}, publicKeyHex), secretKeyHex)
    const tampered = { ...envelope, priceUsd: '1.00000000' }
    expect(verifyOfferEnvelope(tampered).valid).toBe(false)
  })

  it('4. owner altered (different ownerPublicKey, same signature) invalidates', () => {
    const { publicKeyHex, secretKeyHex } = makeKeypair()
    const attacker = makeKeypair()
    const envelope = signedEnvelope(baseContent({}, publicKeyHex), secretKeyHex)
    const tampered = { ...envelope, ownerPublicKey: attacker.publicKeyHex }
    expect(verifyOfferEnvelope(tampered).valid).toBe(false)
  })

  it('5. logicalOfferId altered invalidates', () => {
    const { publicKeyHex, secretKeyHex } = makeKeypair()
    const envelope = signedEnvelope(baseContent({}, publicKeyHex), secretKeyHex)
    const tampered = { ...envelope, logicalOfferId: 'a-different-offer-id' }
    expect(verifyOfferEnvelope(tampered).valid).toBe(false)
  })

  it('6. revision altered invalidates', () => {
    const { publicKeyHex, secretKeyHex } = makeKeypair()
    const envelope = signedEnvelope(baseContent({}, publicKeyHex), secretKeyHex)
    const tampered = { ...envelope, revision: 999 }
    expect(verifyOfferEnvelope(tampered).valid).toBe(false)
  })

  it('7. expiresAt altered invalidates', () => {
    const { publicKeyHex, secretKeyHex } = makeKeypair()
    const envelope = signedEnvelope(baseContent({}, publicKeyHex), secretKeyHex)
    const tampered = { ...envelope, expiresAt: '2099-01-01T00:00:00.000Z' }
    expect(verifyOfferEnvelope(tampered).valid).toBe(false)
  })

  it('8. an expired offer is rejected as economically active, independent of signature validity', () => {
    const { publicKeyHex, secretKeyHex } = makeKeypair()
    const content = baseContent({ expiresAt: '2020-01-01T00:00:00.000Z' }, publicKeyHex)
    const envelope = signedEnvelope(content, secretKeyHex)
    // The signature itself is genuinely, correctly valid...
    expect(verifyOfferEnvelope(envelope).valid).toBe(true)
    // ...but it is not economically active, checked independently.
    expect(isOfferEnvelopeEconomicallyActive(envelope, new Date('2026-09-09T00:00:00.000Z'))).toBe(false)
  })

  it('13. a byte-for-byte copy of a valid envelope (as any relay would forward it) verifies identically', () => {
    const { publicKeyHex, secretKeyHex } = makeKeypair()
    const envelope = signedEnvelope(baseContent({}, publicKeyHex), secretKeyHex)
    const relayed = JSON.parse(JSON.stringify(envelope)) // simulates serialization over any transport
    expect(verifyOfferEnvelope(relayed)).toEqual({ valid: true })
  })

  it('14. a relay cannot create a valid update by reusing the old signature at a bumped revision', () => {
    const { publicKeyHex, secretKeyHex } = makeKeypair()
    const original = signedEnvelope(baseContent({ revision: 1 }, publicKeyHex), secretKeyHex)
    // A malicious relay, with no access to the owner's secret key,
    // tries to fabricate revision 2 by reusing revision 1's own
    // signature verbatim.
    const forged = { ...original, revision: 2 }
    expect(verifyOfferEnvelope(forged).valid).toBe(false)
  })

  it('16. two independently-constructed verifier calls agree on the same envelope (no hidden per-call state)', () => {
    const { publicKeyHex, secretKeyHex } = makeKeypair()
    const envelope = signedEnvelope(baseContent({}, publicKeyHex), secretKeyHex)
    const verdictA = verifyOfferEnvelope({ ...envelope })
    const verdictB = verifyOfferEnvelope({ ...envelope })
    expect(verdictA).toEqual({ valid: true })
    expect(verdictB).toEqual({ valid: true })
    expect(verdictA).toEqual(verdictB)
  })

  it('a false tombstone (bad signature) is rejected the same way any other tampered envelope is', () => {
    // Covers item 12 alongside the dedicated ingest-level test below —
    // verification has no special-cased path for CANCELLED envelopes,
    // exactly as ADR-001 intends (cancellation reuses the identical
    // signature/revision machinery, not a separate mechanism).
    const { publicKeyHex, secretKeyHex } = makeKeypair()
    const attacker = makeKeypair()
    const real = signedEnvelope(baseContent({ revision: 2, status: 'CANCELLED' }, publicKeyHex), secretKeyHex)
    const forged = { ...real, signature: signOfferEnvelope(real as any, attacker.secretKeyHex) }
    expect(verifyOfferEnvelope(forged).valid).toBe(false)
  })
})

describe('OfferEnvelopeRepository.ingest() — convergence, replay protection, tombstones', () => {
  let repo: InstanceType<typeof OfferEnvelopeRepository>

  beforeEach(() => {
    mockFindFirst.mockReset()
    mockCreate.mockReset()
    repo = new OfferEnvelopeRepository()
  })

  it('rejects an envelope with an invalid signature before ever touching the database', async () => {
    const { publicKeyHex } = makeKeypair()
    const envelope = { ...baseContent({}, publicKeyHex), signature: 'ff'.repeat(64) }
    const result = await repo.ingest(envelope as any)
    expect(result.accepted).toBe(false)
    expect(mockFindFirst).not.toHaveBeenCalled()
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('9. a higher revision supersedes a previously-stored one and is accepted', async () => {
    const { publicKeyHex, secretKeyHex } = makeKeypair()
    mockFindFirst.mockResolvedValue({ revision: 1 })
    mockCreate.mockResolvedValue({ id: 'row-2' })

    const envelope = signedEnvelope(baseContent({ revision: 2 }, publicKeyHex), secretKeyHex)
    const result = await repo.ingest(envelope as any)

    expect(result).toEqual({ accepted: true, id: 'row-2' })
    expect(mockCreate).toHaveBeenCalledTimes(1)
  })

  it('10. an equal-or-lower revision does not overwrite the newer stored one', async () => {
    const { publicKeyHex, secretKeyHex } = makeKeypair()
    mockFindFirst.mockResolvedValue({ revision: 5 })

    const equalRevision = signedEnvelope(baseContent({ revision: 5 }, publicKeyHex), secretKeyHex)
    const lowerRevision = signedEnvelope(baseContent({ revision: 3 }, publicKeyHex), secretKeyHex)

    const resultEqual = await repo.ingest(equalRevision as any)
    const resultLower = await repo.ingest(lowerRevision as any)

    expect(resultEqual.accepted).toBe(false)
    expect(resultLower.accepted).toBe(false)
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('11. a validly-signed tombstone (CANCELLED at a higher revision) is accepted', async () => {
    const { publicKeyHex, secretKeyHex } = makeKeypair()
    mockFindFirst.mockResolvedValue({ revision: 1 })
    mockCreate.mockResolvedValue({ id: 'row-cancel' })

    const tombstone = signedEnvelope(baseContent({ revision: 2, status: 'CANCELLED' }, publicKeyHex), secretKeyHex)
    const result = await repo.ingest(tombstone as any)

    expect(result).toEqual({ accepted: true, id: 'row-cancel' })
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'CANCELLED', revision: 2 }) })
    )
  })

  it('12. a tombstone with a forged/invalid signature is rejected, never stored', async () => {
    const { publicKeyHex, secretKeyHex } = makeKeypair()
    const attacker = makeKeypair()
    mockFindFirst.mockResolvedValue({ revision: 1 })

    const real = signedEnvelope(baseContent({ revision: 2, status: 'CANCELLED' }, publicKeyHex), secretKeyHex)
    const forged = { ...real, signature: signOfferEnvelope(real as any, attacker.secretKeyHex) }

    const result = await repo.ingest(forged as any)
    expect(result.accepted).toBe(false)
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('COBRA check: the stored row carries the real signature, never a bare "trusted" boolean', async () => {
    const { publicKeyHex, secretKeyHex } = makeKeypair()
    mockFindFirst.mockResolvedValue(null)
    mockCreate.mockResolvedValue({ id: 'row-1' })

    const envelope = signedEnvelope(baseContent({}, publicKeyHex), secretKeyHex)
    await repo.ingest(envelope as any)

    const createCall = mockCreate.mock.calls[0][0]
    expect(createCall.data.signature).toBe(envelope.signature)
    expect(createCall.data).not.toHaveProperty('trusted')
    expect(createCall.data).not.toHaveProperty('verified')
  })
})
