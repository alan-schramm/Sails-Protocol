/**
 * Fase 1, Task 3(c) — "QVAC forgery" redirected to the real feature it
 * actually needed underneath it: there was no OpenProof service layer to
 * test hash/nonce/time-lock behavior against before this pass built
 * proof.service.ts (see that file's own header comment for the scope
 * this closes vs. what stays 📋 Planned — ProofRegistry, EvidenceProvider,
 * AnchorProof). The filename is kept matching the original brief so the
 * mapping from "Task 3" to "the test that covers it" stays obvious.
 *
 * Three properties, each corresponding to one item from the original
 * brief (hash recompute / nonce anti-replay / time-lock enforcement).
 */
export {} // same forced-module reasoning as chatUnification.test.ts

jest.mock('../src/config', () => ({
  config: {
    proof: { submissionWindowHours: 72, verificationNonceTtlSeconds: 300 },
  },
}))

const fakeClaims = new Map<string, any>()
const fakeProofs = new Map<string, any>()
let claimCounter = 0
let proofCounter = 0

jest.mock('../src/common/database', () => ({
  prisma: {
    claim: {
      create: jest.fn(async ({ data }: any) => {
        const id = `claim-${++claimCounter}`
        const row = { id, ...data, createdAt: data.createdAt ?? new Date() }
        fakeClaims.set(id, row)
        return row
      }),
      findUnique: jest.fn(async ({ where }: any) => fakeClaims.get(where.id) ?? null),
    },
    proof: {
      create: jest.fn(async ({ data }: any) => {
        const id = `proof-${++proofCounter}`
        const row = { id, ...data, submittedAt: new Date() }
        fakeProofs.set(id, row)
        return row
      }),
      findUnique: jest.fn(async ({ where }: any) => fakeProofs.get(where.id) ?? null),
    },
    verification: {
      create: jest.fn(async ({ data }: any) => ({ id: 'verification-1', ...data, verifiedAt: new Date() })),
    },
  },
}))

// A real, in-memory implementation of the exact Redis operations
// proof.service.ts uses (set with EX, get, del) — not a trivial
// always-succeeds stub, so the nonce tests actually exercise expiry/
// single-use semantics rather than assuming the mock cooperates.
const fakeRedisStore = new Map<string, string>()
jest.mock('../src/common/redis', () => ({
  redis: {
    set: jest.fn(async (key: string, value: string) => {
      fakeRedisStore.set(key, value)
      return 'OK'
    }),
    get: jest.fn(async (key: string) => fakeRedisStore.get(key) ?? null),
    del: jest.fn(async (key: string) => {
      const existed = fakeRedisStore.has(key)
      fakeRedisStore.delete(key)
      return existed ? 1 : 0
    }),
  },
}))

const mockEmit = jest.fn().mockResolvedValue(undefined)
jest.mock('../src/common/events/event-bus', () => ({
  eventBus: { emit: (...args: unknown[]) => mockEmit(...args) },
}))

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { proofService } = require('../src/modules/open-proof/proof.service')

describe('OpenProof — hash recompute (never trust a client-supplied hash)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    fakeClaims.clear()
    fakeProofs.clear()
  })

  it('stores the server-computed hash regardless of what the client claims', async () => {
    const claim = await proofService.assertClaim({
      claimedBy: 'buyer-1',
      claimType: 'payment_sent',
      assertion: { amount: '100', currency: 'BRL' },
    })

    const evidence = { receiptText: 'PIX comprovante real', txRef: 'E123456' }

    const proof = await proofService.submitProof({
      claimId: claim.id,
      evidence,
      submittedBy: 'buyer-1',
      // A forged hash a malicious/buggy client hopes the server just
      // trusts — this is the literal attack the original brief named.
      claimedHash: 'deadbeef'.repeat(8),
    })

    // The real sha256 of the canonicalized evidence, computed
    // independently here to prove the service isn't just echoing
    // whatever was submitted.
    const crypto = require('crypto')
    const expectedHash = crypto
      .createHash('sha256')
      .update(JSON.stringify({ receiptText: evidence.receiptText, txRef: evidence.txRef }))
      .digest('hex')

    expect(proof.evidenceHash).toBe(expectedHash)
    expect(proof.evidenceHash).not.toBe('deadbeef'.repeat(8))
  })

  it('emits proof.hash_mismatch_detected when the claimed hash does not match — a real, detectable forgery signal', async () => {
    const claim = await proofService.assertClaim({
      claimedBy: 'buyer-1',
      claimType: 'payment_sent',
      assertion: {},
    })

    await proofService.submitProof({
      claimId: claim.id,
      evidence: { real: 'evidence' },
      submittedBy: 'buyer-1',
      claimedHash: 'not-the-real-hash',
    })

    expect(mockEmit).toHaveBeenCalledWith(
      'proof.hash_mismatch_detected',
      expect.objectContaining({ claimedHash: 'not-the-real-hash' }),
      claim.id
    )
  })

  it('produces the identical hash for identical evidence submitted with keys in a different order — proves the hash is over canonical content, not JSON.stringify\'s incidental key order', async () => {
    const claim = await proofService.assertClaim({ claimedBy: 'buyer-1', claimType: 'payment_sent', assertion: {} })

    const proofA = await proofService.submitProof({
      claimId: claim.id,
      evidence: { a: 1, b: 2 },
      submittedBy: 'buyer-1',
    })
    const proofB = await proofService.submitProof({
      claimId: claim.id,
      evidence: { b: 2, a: 1 },
      submittedBy: 'buyer-1',
    })

    expect(proofA.evidenceHash).toBe(proofB.evidenceHash)
  })

  it('throws NotFoundError for a claim that does not exist rather than hashing evidence against nothing', async () => {
    await expect(
      proofService.submitProof({ claimId: 'does-not-exist', evidence: {}, submittedBy: 'buyer-1' })
    ).rejects.toThrow(/Claim/)
  })
})

describe('OpenProof — nonce anti-replay', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    fakeClaims.clear()
    fakeProofs.clear()
    fakeRedisStore.clear()
  })

  async function makeClaimAndProof() {
    const claim = await proofService.assertClaim({ claimedBy: 'buyer-1', claimType: 'payment_sent', assertion: {} })
    const proof = await proofService.submitProof({ claimId: claim.id, evidence: { x: 1 }, submittedBy: 'buyer-1' })
    return { claim, proof }
  }

  it('rejects verifyProof with no nonce at all', async () => {
    const { proof } = await makeClaimAndProof()
    await expect(
      proofService.verifyProof(proof.id, 'arbiter-1', 'ACCEPTED', 'never-issued-nonce')
    ).rejects.toThrow(/nonce/i)
  })

  it('accepts a freshly issued nonce exactly once', async () => {
    const { proof } = await makeClaimAndProof()
    const { nonce } = await proofService.issueVerificationNonce(proof.id)

    const verification = await proofService.verifyProof(proof.id, 'arbiter-1', 'ACCEPTED', nonce)
    expect(verification.verdict).toBe('ACCEPTED')
  })

  it('rejects a replay of the same nonce — the literal anti-replay property', async () => {
    const { proof } = await makeClaimAndProof()
    const { nonce } = await proofService.issueVerificationNonce(proof.id)

    await proofService.verifyProof(proof.id, 'arbiter-1', 'ACCEPTED', nonce)

    // Same nonce, second call — simulates a captured/replayed verification
    // request (or an attacker who observed the first one and resends it
    // hoping to flip REJECTED->ACCEPTED or vice versa on a re-review).
    await expect(
      proofService.verifyProof(proof.id, 'arbiter-1', 'REJECTED', nonce)
    ).rejects.toThrow(/nonce/i)
  })

  it("a nonce issued for one proof cannot verify a different proof", async () => {
    const { proof: proofA } = await makeClaimAndProof()
    const { proof: proofB } = await makeClaimAndProof()
    const { nonce } = await proofService.issueVerificationNonce(proofA.id)

    await expect(
      proofService.verifyProof(proofB.id, 'arbiter-1', 'ACCEPTED', nonce)
    ).rejects.toThrow(/nonce/i)
  })
})

describe('OpenProof — time-lock enforcement', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    fakeClaims.clear()
    fakeProofs.clear()
  })

  it('accepts a proof submitted well within the 72h window', async () => {
    const claim = await proofService.assertClaim({ claimedBy: 'buyer-1', claimType: 'payment_sent', assertion: {} })
    // Backdate createdAt by 1 hour — still inside the 72h window.
    fakeClaims.get(claim.id).createdAt = new Date(Date.now() - 3600 * 1000)

    const proof = await proofService.submitProof({ claimId: claim.id, evidence: { x: 1 }, submittedBy: 'buyer-1' })
    expect(proof.claimId).toBe(claim.id)
  })

  it('rejects a proof submitted after the submission window has passed — stale evidence cannot retroactively support an old claim', async () => {
    const claim = await proofService.assertClaim({ claimedBy: 'buyer-1', claimType: 'payment_sent', assertion: {} })
    // Backdate createdAt by 100 hours — past the 72h default window.
    fakeClaims.get(claim.id).createdAt = new Date(Date.now() - 100 * 3600 * 1000)

    await expect(
      proofService.submitProof({ claimId: claim.id, evidence: { x: 1 }, submittedBy: 'buyer-1' })
    ).rejects.toThrow(/submission window/)
  })
})
