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
const mockFindMany = jest.fn()
const mockCreate = jest.fn()
jest.mock('../src/common/database', () => ({
  prisma: {
    offerEnvelope: {
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
      findMany: (...args: unknown[]) => mockFindMany(...args),
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
    mockFindMany.mockReset()
    mockFindMany.mockResolvedValue([])
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
    mockFindFirst.mockResolvedValue({ revision: 1, ownerPublicKey: publicKeyHex, createdAt: new Date('2026-09-09T00:00:00.000Z') })
    mockCreate.mockResolvedValue({ id: 'row-2' })

    const envelope = signedEnvelope(baseContent({ revision: 2 }, publicKeyHex), secretKeyHex)
    const result = await repo.ingest(envelope as any)

    expect(result).toEqual({ accepted: true, id: 'row-2' })
    expect(mockCreate).toHaveBeenCalledTimes(1)
  })

  it('10. a lower revision does not overwrite the newer stored one', async () => {
    // CTO Gate correction (2026-09-09), Property J: the EQUAL-revision
    // case is no longer part of this test — a revision equal to the
    // current highest is now either an idempotent resend or owner
    // equivocation (see the dedicated Property J describe block below),
    // never a blanket rejection. This test covers only the unambiguous
    // case: a genuinely STALE, lower revision.
    const { publicKeyHex, secretKeyHex } = makeKeypair()
    mockFindFirst.mockResolvedValue({ revision: 5, ownerPublicKey: publicKeyHex, createdAt: new Date('2026-09-09T00:00:00.000Z') })

    const lowerRevision = signedEnvelope(baseContent({ revision: 3 }, publicKeyHex), secretKeyHex)
    const resultLower = await repo.ingest(lowerRevision as any)

    expect(resultLower.accepted).toBe(false)
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('11. a validly-signed tombstone (CANCELLED at a higher revision) is accepted', async () => {
    const { publicKeyHex, secretKeyHex } = makeKeypair()
    mockFindFirst.mockResolvedValue({ revision: 1, ownerPublicKey: publicKeyHex, createdAt: new Date('2026-09-09T00:00:00.000Z') })
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
    mockFindFirst.mockResolvedValue({ revision: 1, ownerPublicKey: publicKeyHex, createdAt: new Date('2026-09-09T00:00:00.000Z') })

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

describe('OfferEnvelopeRepository.ingest() — offer identity is order-independent (Property H, CTO Gate correction 2026-09-09)', () => {
  // An earlier fix attempt (Property A) rejected any envelope whose
  // ownerPublicKey differed from "whichever owner was already accepted"
  // for a bare logicalOfferId — first-accepted-owner-wins. That is
  // itself a defect: it makes ARRIVAL ORDER decide who owns an economic
  // object, which is unacceptable for a multi-operator network where two
  // nodes can observe the same two facts in different orders. The
  // correct model: offer identity is the PAIR (ownerPublicKey,
  // logicalOfferId); logicalOfferId is only ever creator-local, so two
  // different owners choosing the same string were never making a
  // competing claim over one object.
  //
  // These tests use a small in-memory fake in place of the jest.fn()
  // mocks used elsewhere in this file, because proving order-independence
  // genuinely requires persisted state across multiple ingest() calls
  // (a bare mockResolvedValue can't express "what a real database would
  // actually contain after these prior writes"). Exported at module
  // scope-ish via closure so the Property J/L describe blocks below reuse
  // the identical helper rather than a slightly-different copy.
  function useInMemoryStore(): void {
    const rows: any[] = []
    mockFindFirst.mockImplementation(async ({ where, orderBy }: any) => {
      const matches = rows.filter((r: any) => Object.entries(where).every(([k, v]) => r[k] === v))
      if (matches.length === 0) return null
      matches.sort((a: any, b: any) => (orderBy?.revision === 'desc' ? b.revision - a.revision : a.revision - b.revision))
      return matches[0]
    })
    mockFindMany.mockImplementation(async ({ where }: any) => {
      return rows.filter((r: any) => Object.entries(where).every(([k, v]) => r[k] === v))
    })
    mockCreate.mockImplementation(async ({ data }: any) => {
      const row = { id: `row-${rows.length}`, ...data }
      rows.push(row)
      return row
    })
  }

  beforeEach(() => {
    mockFindFirst.mockReset()
    mockFindMany.mockReset()
    mockCreate.mockReset()
  })

  /** `getLatest()` returns a discriminated `LatestOfferState` (Property J) — this helper unwraps the common RESOLVED case for tests that aren't specifically about equivocation. */
  function expectResolved(state: any) {
    expect(state.status).toBe('RESOLVED')
    return state.row
  }

  it('CONFIRMED CONVERGENCE / NAMESPACE DEFECT (pre-fix reproduction): two nodes ingesting the identical two independently-valid envelopes in opposite arrival order used to disagree about who owned the shared logicalOfferId — this test now proves both converge identically regardless of order', async () => {
    const alice = makeKeypair()
    const mallory = makeKeypair()
    const aliceEnvelope = signedEnvelope(baseContent({ logicalOfferId: 'X', revision: 0 }, alice.publicKeyHex), alice.secretKeyHex)
    const malloryEnvelope = signedEnvelope(baseContent({ logicalOfferId: 'X', revision: 0 }, mallory.publicKeyHex), mallory.secretKeyHex)

    // "Node A": Alice arrives first, Mallory second.
    useInMemoryStore()
    const repoA = new OfferEnvelopeRepository()
    const rA1 = await repoA.ingest(aliceEnvelope as any)
    const rA2 = await repoA.ingest(malloryEnvelope as any)
    const aliceLatestOnA = await repoA.getLatest(alice.publicKeyHex, 'X')
    const malloryLatestOnA = await repoA.getLatest(mallory.publicKeyHex, 'X')

    // "Node B": Mallory arrives first, Alice second — same two facts, opposite order.
    useInMemoryStore()
    const repoB = new OfferEnvelopeRepository()
    const rB1 = await repoB.ingest(malloryEnvelope as any)
    const rB2 = await repoB.ingest(aliceEnvelope as any)
    const aliceLatestOnB = await repoB.getLatest(alice.publicKeyHex, 'X')
    const malloryLatestOnB = await repoB.getLatest(mallory.publicKeyHex, 'X')

    // Both envelopes are independently accepted on BOTH nodes, regardless
    // of arrival order — neither blocks, supersedes, or "wins" over the
    // other, because they were never competing claims over one object.
    expect(rA1.accepted).toBe(true)
    expect(rA2.accepted).toBe(true)
    expect(rB1.accepted).toBe(true)
    expect(rB2.accepted).toBe(true)
    expect(expectResolved(aliceLatestOnA).ownerPublicKey).toBe(alice.publicKeyHex)
    expect(expectResolved(malloryLatestOnA).ownerPublicKey).toBe(mallory.publicKeyHex)
    expect(expectResolved(aliceLatestOnB).ownerPublicKey).toBe(alice.publicKeyHex)
    expect(expectResolved(malloryLatestOnB).ownerPublicKey).toBe(mallory.publicKeyHex)
  })

  it('cross-owner collision test: two owners using the identical creator-local logicalOfferId are both independently valid — neither is rejected, blocked, or superseded by the other', async () => {
    useInMemoryStore()
    const repo = new OfferEnvelopeRepository()
    const alice = makeKeypair()
    const mallory = makeKeypair()

    const aliceOffer = signedEnvelope(baseContent({ logicalOfferId: 'X', revision: 0 }, alice.publicKeyHex), alice.secretKeyHex)
    const malloryOffer = signedEnvelope(baseContent({ logicalOfferId: 'X', revision: 0 }, mallory.publicKeyHex), mallory.secretKeyHex)

    const resultAlice = await repo.ingest(aliceOffer as any)
    const resultMallory = await repo.ingest(malloryOffer as any)

    expect(resultAlice.accepted).toBe(true)
    expect(resultMallory.accepted).toBe(true)

    const aliceLatest = await repo.getLatest(alice.publicKeyHex, 'X')
    const malloryLatest = await repo.getLatest(mallory.publicKeyHex, 'X')
    expect(expectResolved(aliceLatest).ownerPublicKey).toBe(alice.publicKeyHex)
    expect(expectResolved(malloryLatest).ownerPublicKey).toBe(mallory.publicKeyHex)
  })

  it('cross-owner cancellation test: one owner cancelling their offer has zero effect on a different owner\'s offer at the identical logicalOfferId', async () => {
    useInMemoryStore()
    const repo = new OfferEnvelopeRepository()
    const alice = makeKeypair()
    const mallory = makeKeypair()

    await repo.ingest(signedEnvelope(baseContent({ logicalOfferId: 'X', revision: 0 }, alice.publicKeyHex), alice.secretKeyHex) as any)
    await repo.ingest(signedEnvelope(baseContent({ logicalOfferId: 'X', revision: 0 }, mallory.publicKeyHex), mallory.secretKeyHex) as any)

    const malloryTombstone = signedEnvelope(
      baseContent({ logicalOfferId: 'X', revision: 1, status: 'CANCELLED' }, mallory.publicKeyHex),
      mallory.secretKeyHex
    )
    const cancelResult = await repo.ingest(malloryTombstone as any)
    expect(cancelResult.accepted).toBe(true)

    const aliceLatest = expectResolved(await repo.getLatest(alice.publicKeyHex, 'X'))
    expect(aliceLatest.status).toBe('ACTIVE')
    expect(aliceLatest.revision).toBe(0)
  })

  it('same-owner revision test: a legitimate higher revision supersedes only that owner\'s own prior revision, with zero effect on a different owner\'s offer at the identical logicalOfferId', async () => {
    useInMemoryStore()
    const repo = new OfferEnvelopeRepository()
    const alice = makeKeypair()
    const mallory = makeKeypair()

    await repo.ingest(signedEnvelope(baseContent({ logicalOfferId: 'X', revision: 0 }, alice.publicKeyHex), alice.secretKeyHex) as any)
    await repo.ingest(signedEnvelope(baseContent({ logicalOfferId: 'X', revision: 0 }, mallory.publicKeyHex), mallory.secretKeyHex) as any)

    const aliceRev1 = signedEnvelope(baseContent({ logicalOfferId: 'X', revision: 1 }, alice.publicKeyHex), alice.secretKeyHex)
    const result = await repo.ingest(aliceRev1 as any)
    expect(result.accepted).toBe(true)

    const aliceLatest = expectResolved(await repo.getLatest(alice.publicKeyHex, 'X'))
    const malloryLatest = expectResolved(await repo.getLatest(mallory.publicKeyHex, 'X'))
    expect(aliceLatest.revision).toBe(1)
    expect(malloryLatest.revision).toBe(0)
  })

  it('CONVERGENCE TEST: two histories carrying the identical set of facts in different arrival orders converge to the identical final state — arrival order does not affect object identity or latest revision', async () => {
    const alice = makeKeypair()
    const mallory = makeKeypair()
    const aliceRev0 = signedEnvelope(baseContent({ logicalOfferId: 'X', revision: 0 }, alice.publicKeyHex), alice.secretKeyHex)
    const malloryRev0 = signedEnvelope(baseContent({ logicalOfferId: 'X', revision: 0 }, mallory.publicKeyHex), mallory.secretKeyHex)
    const aliceRev1 = signedEnvelope(baseContent({ logicalOfferId: 'X', revision: 1 }, alice.publicKeyHex), alice.secretKeyHex)

    // History A: Alice/X/0, Mallory/X/0, Alice/X/1
    useInMemoryStore()
    const repoA = new OfferEnvelopeRepository()
    await repoA.ingest(aliceRev0 as any)
    await repoA.ingest(malloryRev0 as any)
    await repoA.ingest(aliceRev1 as any)
    const aliceFinalA = expectResolved(await repoA.getLatest(alice.publicKeyHex, 'X'))
    const malloryFinalA = expectResolved(await repoA.getLatest(mallory.publicKeyHex, 'X'))

    // History B: Mallory/X/0, Alice/X/0, Alice/X/1 — same facts, different order.
    useInMemoryStore()
    const repoB = new OfferEnvelopeRepository()
    await repoB.ingest(malloryRev0 as any)
    await repoB.ingest(aliceRev0 as any)
    await repoB.ingest(aliceRev1 as any)
    const aliceFinalB = expectResolved(await repoB.getLatest(alice.publicKeyHex, 'X'))
    const malloryFinalB = expectResolved(await repoB.getLatest(mallory.publicKeyHex, 'X'))

    expect(aliceFinalA.revision).toBe(1)
    expect(malloryFinalA.revision).toBe(0)
    expect(aliceFinalB.revision).toBe(1)
    expect(malloryFinalB.revision).toBe(0)
  })

  it('the first envelope for a new offer identity is accepted with no prior history to check — not "first-writer-wins" over a shared namespace, simply the first fact about THIS owner\'s THIS logicalOfferId', async () => {
    useInMemoryStore()
    const repo = new OfferEnvelopeRepository()
    const alice = makeKeypair()

    const first = signedEnvelope(baseContent({ logicalOfferId: 'X', revision: 0 }, alice.publicKeyHex), alice.secretKeyHex)
    const result = await repo.ingest(first as any)

    expect(result.accepted).toBe(true)
  })
})

describe('OfferEnvelope — createdAt is advisory only, not enforced (Property K, CTO Gate correction 2026-09-09 — retracts Property I)', () => {
  // Property I (an earlier pass, same date) enforced createdAt
  // immutability by rejecting any new revision whose createdAt didn't
  // match whichever row the ingesting node had already locally observed
  // as "highest." Reproduced directly, before retracting this: a node
  // that happens to observe revision 2 before ever seeing revision 0 has
  // nothing to compare against and accepts it unconditionally; a node
  // that observes them in the true historical order (0 then 2) rejects
  // revision 2 outright because its createdAt differs from revision 0's.
  // Two nodes given the identical eventual set of facts ended up with
  // DIFFERENT highest-known-revision (0 on one node, 2 on the other) —
  // not merely a different createdAt verdict, a different accepted
  // ECONOMIC STATE. There is no order-independent mechanism to enforce
  // this using only a node's own locally-first-observed reference point
  // (step (a) has no full-history replication), so the property first,
  // mechanism second rule applies: no correct mechanism exists, so the
  // claim is narrowed, not forced. `createdAt` remains signed
  // (tamper-evident) and advisory (never used for ordering) — it is
  // simply no longer enforced as immutable by ingest().
  let repo: InstanceType<typeof OfferEnvelopeRepository>

  beforeEach(() => {
    mockFindFirst.mockReset()
    mockFindMany.mockReset()
    mockFindMany.mockResolvedValue([])
    mockCreate.mockReset()
    repo = new OfferEnvelopeRepository()
  })

  it('CONFIRMED ORDER-DEPENDENCE (pre-fix reproduction, now retracted): a later revision carrying a genuinely different createdAt than an earlier one is accepted, not rejected — enforcing immutability against a locally-first-observed value was itself non-convergent', async () => {
    const alice = makeKeypair()
    mockFindFirst.mockResolvedValue({
      revision: 0,
      ownerPublicKey: alice.publicKeyHex,
      createdAt: new Date('2026-09-09T00:00:00.000Z'),
    })
    mockCreate.mockResolvedValue({ id: 'row-1' })

    const differentCreatedAt = signedEnvelope(
      baseContent({ revision: 1, createdAt: '2026-09-10T00:00:00.000Z' }, alice.publicKeyHex),
      alice.secretKeyHex
    )
    const result = await repo.ingest(differentCreatedAt as any)

    expect(result).toEqual({ accepted: true, id: 'row-1' })
  })

  it('a later revision carrying the identical createdAt as the prior one is, of course, still accepted', async () => {
    const alice = makeKeypair()
    mockFindFirst.mockResolvedValue({
      revision: 0,
      ownerPublicKey: alice.publicKeyHex,
      createdAt: new Date('2026-09-09T00:00:00.000Z'),
    })
    mockCreate.mockResolvedValue({ id: 'row-1' })

    const consistent = signedEnvelope(
      baseContent({ revision: 1, createdAt: '2026-09-09T00:00:00.000Z' }, alice.publicKeyHex),
      alice.secretKeyHex
    )
    const result = await repo.ingest(consistent as any)

    expect(result).toEqual({ accepted: true, id: 'row-1' })
  })

  it('CONVERGENCE TEST: two nodes observing revision 0 and revision 2 (with different createdAt values) in opposite orders now converge to the identical final state', async () => {
    const alice = makeKeypair()
    const rev0Content = baseContent({ revision: 0, createdAt: '2026-01-01T00:00:00.000Z', revisedAt: '2026-01-01T00:00:00.000Z' }, alice.publicKeyHex)
    const rev2Content = baseContent({ revision: 2, createdAt: '2026-02-01T00:00:00.000Z', revisedAt: '2026-02-01T00:00:00.000Z' }, alice.publicKeyHex)
    const rev0 = signedEnvelope(rev0Content, alice.secretKeyHex)
    const rev2 = signedEnvelope(rev2Content, alice.secretKeyHex)

    function useInMemoryStore(): void {
      const rows: any[] = []
      mockFindFirst.mockImplementation(async ({ where, orderBy }: any) => {
        const matches = rows.filter((r: any) => Object.entries(where).every(([k, v]) => r[k] === v))
        if (matches.length === 0) return null
        matches.sort((a: any, b: any) => (orderBy?.revision === 'desc' ? b.revision - a.revision : a.revision - b.revision))
        return matches[0]
      })
      mockFindMany.mockImplementation(async ({ where }: any) => rows.filter((r: any) => Object.entries(where).every(([k, v]) => r[k] === v)))
      mockCreate.mockImplementation(async ({ data }: any) => {
        const row = { id: `row-${rows.length}`, ...data }
        rows.push(row)
        return row
      })
    }

    // Node A: rev0 → rev2 (the true historical order).
    useInMemoryStore()
    const repoA = new OfferEnvelopeRepository()
    await repoA.ingest(rev0 as any)
    await repoA.ingest(rev2 as any)
    const finalA = await repoA.getLatest(alice.publicKeyHex, rev0Content.logicalOfferId)

    // Node B: rev2 → rev0 — same two facts, opposite order.
    useInMemoryStore()
    const repoB = new OfferEnvelopeRepository()
    await repoB.ingest(rev2 as any)
    await repoB.ingest(rev0 as any)
    const finalB = await repoB.getLatest(alice.publicKeyHex, rev0Content.logicalOfferId)

    expect(finalA.status).toBe('RESOLVED')
    expect(finalB.status).toBe('RESOLVED')
    expect((finalA as any).row.revision).toBe(2)
    expect((finalB as any).row.revision).toBe(2)
  })
})

describe('OfferEnvelopeRepository.ingest() — owner equivocation (Property J, CTO Gate correction 2026-09-09)', () => {
  function useInMemoryStore(): void {
    const rows: any[] = []
    mockFindFirst.mockImplementation(async ({ where, orderBy }: any) => {
      const matches = rows.filter((r: any) => Object.entries(where).every(([k, v]) => r[k] === v))
      if (matches.length === 0) return null
      matches.sort((a: any, b: any) => (orderBy?.revision === 'desc' ? b.revision - a.revision : a.revision - b.revision))
      return matches[0]
    })
    mockFindMany.mockImplementation(async ({ where }: any) => rows.filter((r: any) => Object.entries(where).every(([k, v]) => r[k] === v)))
    mockCreate.mockImplementation(async ({ data }: any) => {
      const row = { id: `row-${rows.length}`, ...data }
      rows.push(row)
      return row
    })
  }

  beforeEach(() => {
    mockFindFirst.mockReset()
    mockFindMany.mockReset()
    mockCreate.mockReset()
  })

  it('CONFIRMED CONVERGENCE / EQUIVOCATION DEFECT (pre-fix reproduction): two nodes ingesting the same owner\'s two conflicting, independently-valid same-revision envelopes in opposite order used to accept different economic content — this test now proves both converge to the identical EQUIVOCATED verdict', async () => {
    const alice = makeKeypair()
    const e1Content = baseContent({ revision: 5, priceUsd: '65000.00000000' }, alice.publicKeyHex)
    const e2Content = baseContent({ revision: 5, priceUsd: '70000.00000000' }, alice.publicKeyHex)
    const e1 = signedEnvelope(e1Content, alice.secretKeyHex)
    const e2 = signedEnvelope(e2Content, alice.secretKeyHex)

    // "Node A": E1 arrives first, E2 second.
    useInMemoryStore()
    const repoA = new OfferEnvelopeRepository()
    const rA1 = await repoA.ingest(e1 as any)
    const rA2 = await repoA.ingest(e2 as any)
    const finalA = await repoA.getLatest(alice.publicKeyHex, e1Content.logicalOfferId)

    // "Node B": E2 arrives first, E1 second — same two facts, opposite order.
    useInMemoryStore()
    const repoB = new OfferEnvelopeRepository()
    const rB1 = await repoB.ingest(e2 as any)
    const rB2 = await repoB.ingest(e1 as any)
    const finalB = await repoB.getLatest(alice.publicKeyHex, e1Content.logicalOfferId)

    // Both envelopes are durably stored on both nodes — neither is
    // silently discarded as "doesn't supersede."
    expect(rA1.accepted).toBe(true)
    expect(rA2).toEqual(expect.objectContaining({ accepted: true, equivocationDetected: true }))
    expect(rB1.accepted).toBe(true)
    expect(rB2).toEqual(expect.objectContaining({ accepted: true, equivocationDetected: true }))

    // Both nodes converge to the IDENTICAL verdict — EQUIVOCATED, naming
    // both conflicting prices — regardless of which arrived first. This
    // is the actual convergence property: not "the same price wins
    // everywhere," but "the same truth, including the fact of a
    // conflict, is visible everywhere once the same facts have arrived."
    expect(finalA.status).toBe('EQUIVOCATED')
    expect(finalB.status).toBe('EQUIVOCATED')
    const pricesA = new Set((finalA as any).rows.map((r: any) => r.priceUsd))
    const pricesB = new Set((finalB as any).rows.map((r: any) => r.priceUsd))
    expect(pricesA).toEqual(new Set(['65000.00000000', '70000.00000000']))
    expect(pricesB).toEqual(new Set(['65000.00000000', '70000.00000000']))
  })

  it('a byte-identical resend of an already-stored fact at the same revision is idempotent, not equivocation', async () => {
    useInMemoryStore()
    const repo = new OfferEnvelopeRepository()
    const alice = makeKeypair()
    const envelope = signedEnvelope(baseContent({ revision: 0 }, alice.publicKeyHex), alice.secretKeyHex)

    const first = await repo.ingest(envelope as any)
    const resend = await repo.ingest({ ...envelope } as any)

    expect(first.accepted).toBe(true)
    expect(resend).toEqual({ accepted: true, id: (first as any).id })
    expect((resend as any).equivocationDetected).toBeUndefined()

    const latest = await repo.getLatest(alice.publicKeyHex, envelope.logicalOfferId)
    expect(latest.status).toBe('RESOLVED')
  })

  it('equivocation is fail-closed: an EQUIVOCATED offer state is never economically active, regardless of expiresAt on either conflicting envelope', async () => {
    const { isOfferStateEconomicallyActive } = require('../src/modules/open-liquidity/offer-envelope-repository')
    useInMemoryStore()
    const repo = new OfferEnvelopeRepository()
    const alice = makeKeypair()

    const e1 = signedEnvelope(baseContent({ revision: 0, expiresAt: '2099-01-01T00:00:00.000Z' }, alice.publicKeyHex), alice.secretKeyHex)
    const e2 = signedEnvelope(baseContent({ revision: 0, priceUsd: '1.00000000', expiresAt: '2099-01-01T00:00:00.000Z' }, alice.publicKeyHex), alice.secretKeyHex)
    await repo.ingest(e1 as any)
    await repo.ingest(e2 as any)

    const latest = await repo.getLatest(alice.publicKeyHex, e1.logicalOfferId)
    expect(latest.status).toBe('EQUIVOCATED')
    expect(isOfferStateEconomicallyActive(latest, new Date('2026-09-09T00:00:00.000Z'))).toBe(false)
  })

  it('a NOT_FOUND offer state is never economically active', async () => {
    const { isOfferStateEconomicallyActive } = require('../src/modules/open-liquidity/offer-envelope-repository')
    expect(isOfferStateEconomicallyActive({ status: 'NOT_FOUND' })).toBe(false)
  })
})

describe('OfferEnvelopeRepository.ingest() — higher revision after equivocation (Property L, CTO Gate correction 2026-09-09)', () => {
  function useInMemoryStore(): void {
    const rows: any[] = []
    mockFindFirst.mockImplementation(async ({ where, orderBy }: any) => {
      const matches = rows.filter((r: any) => Object.entries(where).every(([k, v]) => r[k] === v))
      if (matches.length === 0) return null
      matches.sort((a: any, b: any) => (orderBy?.revision === 'desc' ? b.revision - a.revision : a.revision - b.revision))
      return matches[0]
    })
    mockFindMany.mockImplementation(async ({ where }: any) => rows.filter((r: any) => Object.entries(where).every(([k, v]) => r[k] === v)))
    mockCreate.mockImplementation(async ({ data }: any) => {
      const row = { id: `row-${rows.length}`, ...data }
      rows.push(row)
      return row
    })
  }

  beforeEach(() => {
    mockFindFirst.mockReset()
    mockFindMany.mockReset()
    mockCreate.mockReset()
  })

  it('a correctly-signed higher revision deterministically resolves the CURRENT state, while the equivocation evidence at the lower revision remains preserved, never erased', async () => {
    useInMemoryStore()
    const repo = new OfferEnvelopeRepository()
    const alice = makeKeypair()

    const e1 = signedEnvelope(baseContent({ revision: 5, priceUsd: '65000.00000000' }, alice.publicKeyHex), alice.secretKeyHex)
    const e2 = signedEnvelope(baseContent({ revision: 5, priceUsd: '70000.00000000' }, alice.publicKeyHex), alice.secretKeyHex)
    await repo.ingest(e1 as any)
    await repo.ingest(e2 as any)

    const equivocated = await repo.getLatest(alice.publicKeyHex, e1.logicalOfferId)
    expect(equivocated.status).toBe('EQUIVOCATED')

    const rev6 = signedEnvelope(baseContent({ revision: 6, priceUsd: '68000.00000000' }, alice.publicKeyHex), alice.secretKeyHex)
    const rev6Result = await repo.ingest(rev6 as any)
    expect(rev6Result.accepted).toBe(true)

    // Current state is now unambiguous — the higher revision resolved it.
    const resolved = await repo.getLatest(alice.publicKeyHex, e1.logicalOfferId)
    expect(resolved.status).toBe('RESOLVED')
    expect((resolved as any).row.priceUsd).toBe('68000.00000000')
    expect((resolved as any).row.revision).toBe(6)

    // The rev-5 equivocation is NOT deleted — both conflicting rows are
    // still directly queryable as historical evidence that this owner
    // equivocated once, even though they're no longer "the latest."
    const allRev5Rows = await mockFindMany({
      where: { ownerPublicKey: alice.publicKeyHex, logicalOfferId: e1.logicalOfferId, revision: 5 },
    })
    expect(allRev5Rows).toHaveLength(2)
    expect(new Set(allRev5Rows.map((r: any) => r.priceUsd))).toEqual(new Set(['65000.00000000', '70000.00000000']))
  })

  it('CONVERGENCE TEST WITH RECOVERY: two histories (E1,E2,rev6 vs E2,E1,rev6) converge to the identical resolved state', async () => {
    const alice = makeKeypair()
    const e1 = signedEnvelope(baseContent({ revision: 5, priceUsd: '65000.00000000' }, alice.publicKeyHex), alice.secretKeyHex)
    const e2 = signedEnvelope(baseContent({ revision: 5, priceUsd: '70000.00000000' }, alice.publicKeyHex), alice.secretKeyHex)
    const rev6 = signedEnvelope(baseContent({ revision: 6, priceUsd: '68000.00000000' }, alice.publicKeyHex), alice.secretKeyHex)

    useInMemoryStore()
    const repoA = new OfferEnvelopeRepository()
    await repoA.ingest(e1 as any)
    await repoA.ingest(e2 as any)
    await repoA.ingest(rev6 as any)
    const finalA = await repoA.getLatest(alice.publicKeyHex, e1.logicalOfferId)

    useInMemoryStore()
    const repoB = new OfferEnvelopeRepository()
    await repoB.ingest(e2 as any)
    await repoB.ingest(e1 as any)
    await repoB.ingest(rev6 as any)
    const finalB = await repoB.getLatest(alice.publicKeyHex, e1.logicalOfferId)

    expect(finalA.status).toBe('RESOLVED')
    expect(finalB.status).toBe('RESOLVED')
    expect((finalA as any).row.priceUsd).toBe('68000.00000000')
    expect((finalB as any).row.priceUsd).toBe('68000.00000000')
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
