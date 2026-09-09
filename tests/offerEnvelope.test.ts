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
    mockFindFirst.mockResolvedValue({ revision: 1, ownerPublicKey: publicKeyHex })
    mockCreate.mockResolvedValue({ id: 'row-2' })

    const envelope = signedEnvelope(baseContent({ revision: 2 }, publicKeyHex), secretKeyHex)
    const result = await repo.ingest(envelope as any)

    expect(result).toEqual({ accepted: true, id: 'row-2' })
    expect(mockCreate).toHaveBeenCalledTimes(1)
  })

  it('10. an equal-or-lower revision does not overwrite the newer stored one', async () => {
    const { publicKeyHex, secretKeyHex } = makeKeypair()
    mockFindFirst.mockResolvedValue({ revision: 5, ownerPublicKey: publicKeyHex })

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
    mockFindFirst.mockResolvedValue({ revision: 1, ownerPublicKey: publicKeyHex })
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
    mockFindFirst.mockResolvedValue({ revision: 1, ownerPublicKey: publicKeyHex })

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

describe('OfferEnvelopeRepository.ingest() — owner continuity (Property A, CTO Gate correction 2026-09-09)', () => {
  let repo: InstanceType<typeof OfferEnvelopeRepository>

  beforeEach(() => {
    mockFindFirst.mockReset()
    mockCreate.mockReset()
    repo = new OfferEnvelopeRepository()
  })

  it('CONFIRMED VULNERABILITY (pre-fix reproduction): a different key claiming a higher revision for an already-owned logicalOfferId used to be accepted — this test now proves it is rejected', async () => {
    const alice = makeKeypair()
    const mallory = makeKeypair()
    // Alice's revision 1 is already the accepted, stored state for this logicalOfferId.
    mockFindFirst.mockResolvedValue({ revision: 1, ownerPublicKey: alice.publicKeyHex })

    // Mallory owns a completely real keypair and signs her own envelope
    // correctly — the signature is genuinely valid, it just claims an
    // logicalOfferId she was never the accepted owner of.
    const forgedTakeover = signedEnvelope(
      baseContent({ revision: 2 }, mallory.publicKeyHex),
      mallory.secretKeyHex
    )

    // Sanity check: this envelope is internally well-formed and validly
    // self-signed — verifyOfferEnvelope() alone cannot and should not
    // catch this; continuity is ingest()'s job.
    expect(verifyOfferEnvelope(forgedTakeover).valid).toBe(true)

    const result = await repo.ingest(forgedTakeover as any)

    expect(result.accepted).toBe(false)
    expect((result as { reason: string }).reason).toMatch(/owner continuity/)
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('an attacker cannot take over via a higher-revision CANCELLED tombstone either', async () => {
    const alice = makeKeypair()
    const mallory = makeKeypair()
    mockFindFirst.mockResolvedValue({ revision: 1, ownerPublicKey: alice.publicKeyHex })

    const forgedTombstone = signedEnvelope(
      baseContent({ revision: 2, status: 'CANCELLED' }, mallory.publicKeyHex),
      mallory.secretKeyHex
    )
    expect(verifyOfferEnvelope(forgedTombstone).valid).toBe(true)

    const result = await repo.ingest(forgedTombstone as any)

    expect(result.accepted).toBe(false)
    expect((result as { reason: string }).reason).toMatch(/owner continuity/)
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('the legitimate owner can still supersede their own offer at a higher revision', async () => {
    const alice = makeKeypair()
    mockFindFirst.mockResolvedValue({ revision: 1, ownerPublicKey: alice.publicKeyHex })
    mockCreate.mockResolvedValue({ id: 'row-2' })

    const legitimateUpdate = signedEnvelope(baseContent({ revision: 2 }, alice.publicKeyHex), alice.secretKeyHex)
    const result = await repo.ingest(legitimateUpdate as any)

    expect(result).toEqual({ accepted: true, id: 'row-2' })
  })

  it('the legitimate owner can still cancel their own offer at a higher revision', async () => {
    const alice = makeKeypair()
    mockFindFirst.mockResolvedValue({ revision: 1, ownerPublicKey: alice.publicKeyHex })
    mockCreate.mockResolvedValue({ id: 'row-cancel' })

    const legitimateCancel = signedEnvelope(
      baseContent({ revision: 2, status: 'CANCELLED' }, alice.publicKeyHex),
      alice.secretKeyHex
    )
    const result = await repo.ingest(legitimateCancel as any)

    expect(result).toEqual({ accepted: true, id: 'row-cancel' })
  })

  it('the first envelope for a new logicalOfferId establishes its owner (first-writer-wins) with no prior history to check', async () => {
    const alice = makeKeypair()
    mockFindFirst.mockResolvedValue(null)
    mockCreate.mockResolvedValue({ id: 'row-1' })

    const first = signedEnvelope(baseContent({ revision: 1 }, alice.publicKeyHex), alice.secretKeyHex)
    const result = await repo.ingest(first as any)

    expect(result).toEqual({ accepted: true, id: 'row-1' })
  })
})

describe('OfferEnvelope — canonical serialization must be injective (Property B, CTO Gate correction 2026-09-09)', () => {
  it('CONFIRMED COLLISION (pre-fix): two distinct field tuples that would have produced identical canonical bytes are now both rejected by shape validation before canonicalization ever runs', () => {
    const { secretKeyHex } = makeKeypair()
    // Shifting a \x1f across a field boundary used to make
    // {logicalOfferId: 'a\x1fb', ownerPublicKey: 'owner'} collide with
    // {logicalOfferId: 'a', ownerPublicKey: 'b\x1fowner'} at the byte
    // level. Neither 'owner' nor 'b\x1fowner' is a valid ownerPublicKey
    // (not 64 hex chars) and 'a\x1fb' contains a control character, so
    // both are now rejected outright by shape validation — the
    // ambiguous byte collision can never be reached because neither
    // input is ever canonicalized in the first place.
    const t1 = signedEnvelope(baseContent({ logicalOfferId: 'a\x1fb' }, 'owner'), secretKeyHex)
    expect(verifyOfferEnvelope(t1 as any).valid).toBe(false)

    const t2 = signedEnvelope(baseContent({ logicalOfferId: 'a' }, 'b\x1fowner'), secretKeyHex)
    expect(verifyOfferEnvelope(t2 as any).valid).toBe(false)
  })

  it('a logicalOfferId containing the field separator is rejected before signature verification', () => {
    const { publicKeyHex, secretKeyHex } = makeKeypair()
    const envelope = signedEnvelope(baseContent({ logicalOfferId: 'offer\x1finjected' }, publicKeyHex), secretKeyHex)
    const verdict = verifyOfferEnvelope(envelope as any)
    expect(verdict.valid).toBe(false)
    expect((verdict as { reason: string }).reason).toMatch(/logicalOfferId/)
  })

  it('an ownerPublicKey that is not exactly 64 lowercase hex characters is rejected', () => {
    const { secretKeyHex } = makeKeypair()
    const envelope = signedEnvelope(baseContent({}, 'not-a-valid-hex-public-key'), secretKeyHex)
    const verdict = verifyOfferEnvelope(envelope as any)
    expect(verdict.valid).toBe(false)
    expect((verdict as { reason: string }).reason).toMatch(/ownerPublicKey/)
  })
})

describe('OfferEnvelope — canonical numeric representation (Property C)', () => {
  it.each([
    ['exponent notation', '6.5e4'],
    ['plus sign', '+65000.00000000'],
    ['leading/trailing whitespace', ' 65000.00000000 '],
    ['wrong scale (too few fractional digits)', '65000.0'],
    ['wrong scale (too many fractional digits)', '65000.000000001'],
    ['negative value', '-1.00000000'],
    ['zero', '0.00000000'],
    ['NaN-like', 'NaN'],
    ['not a number at all', 'abc'],
    ['no fractional part', '65000'],
  ])('rejects priceUsd with %s: %s', (_label, badPrice) => {
    const { publicKeyHex, secretKeyHex } = makeKeypair()
    const envelope = signedEnvelope(baseContent({ priceUsd: badPrice }, publicKeyHex), secretKeyHex)
    const verdict = verifyOfferEnvelope(envelope as any)
    expect(verdict.valid).toBe(false)
    expect((verdict as { reason: string }).reason).toMatch(/priceUsd/)
  })

  it('accepts the one canonical decimal form with exactly 8 fractional digits', () => {
    const { publicKeyHex, secretKeyHex } = makeKeypair()
    const envelope = signedEnvelope(baseContent({ priceUsd: '65000.00000000' }, publicKeyHex), secretKeyHex)
    expect(verifyOfferEnvelope(envelope as any)).toEqual({ valid: true })
  })
})

describe('OfferEnvelope — canonical timestamp representation (Property D)', () => {
  it.each([
    ['timezone offset instead of Z', '2026-09-09T00:00:00.000+00:00'],
    ['missing milliseconds', '2026-09-09T00:00:00Z'],
    ['space instead of T', '2026-09-09 00:00:00.000Z'],
    ['invalid calendar date', '2026-13-45T00:00:00.000Z'],
    ['not a timestamp at all', 'not-a-date'],
  ])('rejects expiresAt with %s: %s', (_label, badTimestamp) => {
    const { publicKeyHex, secretKeyHex } = makeKeypair()
    const envelope = signedEnvelope(baseContent({ expiresAt: badTimestamp }, publicKeyHex), secretKeyHex)
    const verdict = verifyOfferEnvelope(envelope as any)
    expect(verdict.valid).toBe(false)
    expect((verdict as { reason: string }).reason).toMatch(/expiresAt/)
  })

  it('accepts the one canonical UTC ISO-8601 millisecond form', () => {
    const { publicKeyHex, secretKeyHex } = makeKeypair()
    const envelope = signedEnvelope(baseContent({}, publicKeyHex), secretKeyHex)
    expect(verifyOfferEnvelope(envelope as any)).toEqual({ valid: true })
  })
})

describe('OfferEnvelope — revision domain bounds (Property F)', () => {
  it.each([
    ['negative', -1],
    ['fractional', 1.5],
    ['above Postgres INT4 max', 2147483648],
    ['JS-unsafe integer', Number.MAX_SAFE_INTEGER + 1],
    ['NaN', NaN],
  ])('rejects revision that is %s: %s', (_label, badRevision) => {
    const { publicKeyHex, secretKeyHex } = makeKeypair()
    const envelope = signedEnvelope(baseContent({ revision: badRevision }, publicKeyHex), secretKeyHex)
    const verdict = verifyOfferEnvelope(envelope as any)
    expect(verdict.valid).toBe(false)
    expect((verdict as { reason: string }).reason).toMatch(/revision/)
  })

  it('accepts revision 0 and the Postgres INT4 max', () => {
    const { publicKeyHex, secretKeyHex } = makeKeypair()
    const zero = signedEnvelope(baseContent({ revision: 0 }, publicKeyHex), secretKeyHex)
    expect(verifyOfferEnvelope(zero as any)).toEqual({ valid: true })

    const max = signedEnvelope(baseContent({ revision: 2147483647 }, publicKeyHex), secretKeyHex)
    expect(verifyOfferEnvelope(max as any)).toEqual({ valid: true })
  })
})

describe('OfferEnvelope — shape validation runs before crypto/DB (Property G)', () => {
  it('a malformed envelope is rejected with a shape-specific reason, distinguishable from "signature does not verify"', () => {
    const { publicKeyHex, secretKeyHex } = makeKeypair()
    const malformed = signedEnvelope(baseContent({ asset: 'NOT_A_REAL_ASSET' }, publicKeyHex), secretKeyHex)
    const verdict = verifyOfferEnvelope(malformed as any)
    expect(verdict.valid).toBe(false)
    expect((verdict as { reason: string }).reason).not.toMatch(/signature does not verify/)
    expect((verdict as { reason: string }).reason).toMatch(/asset/)
  })

  it('a malformed envelope never reaches the database via ingest()', async () => {
    mockFindFirst.mockReset()
    mockCreate.mockReset()
    const repo = new OfferEnvelopeRepository()
    const { publicKeyHex, secretKeyHex } = makeKeypair()
    const malformed = signedEnvelope(baseContent({ revision: -1 }, publicKeyHex), secretKeyHex)

    const result = await repo.ingest(malformed as any)

    expect(result.accepted).toBe(false)
    expect(mockFindFirst).not.toHaveBeenCalled()
    expect(mockCreate).not.toHaveBeenCalled()
  })
})
