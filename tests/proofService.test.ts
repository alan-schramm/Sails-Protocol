/**
 * ProofService — new methods closed 2026-08-04: attachEvidence() (RFC-007
 * D2), anchorEvidence() (RFC-008 D1), getEvidenceBundleForTrade() (RFC-007
 * D6). Real Ed25519 signature verification (real `tweetnacl`, a real
 * generated keypair) — same "test real crypto, not a mock of it"
 * discipline `tests/identity.test.ts` already establishes; everything
 * else (Prisma, EvidenceProvider, TimestampAnchor, Timeline) mocked at
 * the collaborator boundary.
 */
export {} // same forced-module reasoning used throughout this suite

import nacl from 'tweetnacl'

jest.mock('../src/config', () => ({
  config: { proof: { submissionWindowHours: 72, verificationNonceTtlSeconds: 300 } },
}))

// proof.service.ts imports the real `redis` singleton, which reads
// config.redis.url at module-load time — not exercised by any test in
// this file, but mocked anyway so requiring proof.service.ts doesn't
// need a real Redis connection (same pattern tests/qvac-forgery.test.ts
// already establishes).
jest.mock('../src/common/redis', () => ({
  redis: { get: jest.fn(), set: jest.fn(), del: jest.fn() },
}))

const mockProofFindUnique = jest.fn()
const mockProofCreate = jest.fn()
const mockUserFindUnique = jest.fn()
const mockClaimFindMany = jest.fn()
const mockClaimFindUnique = jest.fn()
const mockEvidenceReferenceCreate = jest.fn()
const mockEvidenceReferenceFindUnique = jest.fn()
const mockEvidenceReferenceUpdate = jest.fn()

jest.mock('../src/common/database', () => ({
  prisma: {
    proof: {
      findUnique: (...args: unknown[]) => mockProofFindUnique(...args),
      create: (...args: unknown[]) => mockProofCreate(...args),
    },
    user: { findUnique: (...args: unknown[]) => mockUserFindUnique(...args) },
    claim: {
      findMany: (...args: unknown[]) => mockClaimFindMany(...args),
      findUnique: (...args: unknown[]) => mockClaimFindUnique(...args),
    },
    evidenceReference: {
      create: (...args: unknown[]) => mockEvidenceReferenceCreate(...args),
      findUnique: (...args: unknown[]) => mockEvidenceReferenceFindUnique(...args),
      update: (...args: unknown[]) => mockEvidenceReferenceUpdate(...args),
    },
  },
}))

const mockEmit = jest.fn().mockResolvedValue(undefined)
jest.mock('../src/common/events/event-bus', () => ({
  eventBus: { emit: (...args: unknown[]) => mockEmit(...args) },
}))

const mockStore = jest.fn()
jest.mock('../src/modules/open-proof/evidence-provider', () => ({
  evidenceProvider: { store: (...args: unknown[]) => mockStore(...args) },
}))

const mockAnchor = jest.fn()
jest.mock('../src/modules/open-proof/timestamp-anchor', () => ({
  timestampAnchor: { anchor: (...args: unknown[]) => mockAnchor(...args) },
}))

const mockFindDuplicates = jest.fn().mockResolvedValue([])
jest.mock('../src/modules/open-proof/proof-registry', () => ({
  proofRegistry: { findDuplicates: (...args: unknown[]) => mockFindDuplicates(...args) },
}))

const mockGetEvents = jest.fn().mockResolvedValue([])
jest.mock('../src/core/timeline', () => ({
  getTimeline: (...args: unknown[]) => ({ getEvents: () => mockGetEvents(...args) }),
}))

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ProofService } = require('../src/modules/open-proof/proof.service')

describe('ProofService.attachEvidence() — RFC-007 D2, real Ed25519 verification', () => {
  beforeEach(() => jest.clearAllMocks())

  it('stores real media and persists a real EvidenceReference when the signature genuinely verifies', async () => {
    const keypair = nacl.sign.keyPair()
    const publicKeyHex = Buffer.from(keypair.publicKey).toString('hex')
    const media = new Uint8Array(Buffer.from('real evidence photo bytes'))
    const digest = require('crypto').createHash('sha256').update(media).digest()
    const signature = nacl.sign.detached(digest, keypair.secretKey)
    const signatureHex = Buffer.from(signature).toString('hex')

    mockProofFindUnique.mockResolvedValue({ id: 'proof-1', claimId: 'claim-1' })
    mockUserFindUnique.mockResolvedValue({ id: 'user-1', publicKey: publicKeyHex })
    mockStore.mockResolvedValue({ provider: 'local-fs', uri: '/tmp/fake', sha256: digest.toString('hex') })
    mockEvidenceReferenceCreate.mockResolvedValue({ id: 'ref-1', proofId: 'proof-1' })

    const service = new ProofService()
    const result = await service.attachEvidence('proof-1', media, 'image', 'user-1', signatureHex)

    expect(mockStore).toHaveBeenCalledWith(media, 'image')
    expect(mockEvidenceReferenceCreate).toHaveBeenCalledWith({
      data: { proofId: 'proof-1', provider: 'local-fs', uri: '/tmp/fake', sha256: digest.toString('hex'), mimeType: 'image', signature: signatureHex },
    })
    expect(result.id).toBe('ref-1')
  })

  it('rejects a signature that does not verify against the submitter\'s real public key — never stores unverified evidence', async () => {
    const keypair = nacl.sign.keyPair()
    const wrongKeypair = nacl.sign.keyPair()
    const media = new Uint8Array(Buffer.from('real evidence'))
    const digest = require('crypto').createHash('sha256').update(media).digest()
    // Signed with the WRONG key — a real forgery attempt, not a malformed input.
    const signature = nacl.sign.detached(digest, wrongKeypair.secretKey)

    mockProofFindUnique.mockResolvedValue({ id: 'proof-1', claimId: 'claim-1' })
    mockUserFindUnique.mockResolvedValue({ id: 'user-1', publicKey: Buffer.from(keypair.publicKey).toString('hex') })

    const service = new ProofService()
    await expect(
      service.attachEvidence('proof-1', media, 'image', 'user-1', Buffer.from(signature).toString('hex'))
    ).rejects.toThrow(/does not verify/)
    expect(mockStore).not.toHaveBeenCalled()
  })

  it('throws NotFoundError for an unknown proofId', async () => {
    mockProofFindUnique.mockResolvedValue(null)
    const service = new ProofService()
    await expect(service.attachEvidence('nope', new Uint8Array(), 'image', 'user-1', 'ab')).rejects.toThrow('Proof')
  })

  it('throws NotFoundError for an unknown submittedBy', async () => {
    mockProofFindUnique.mockResolvedValue({ id: 'proof-1', claimId: 'claim-1' })
    mockUserFindUnique.mockResolvedValue(null)
    const service = new ProofService()
    await expect(service.attachEvidence('proof-1', new Uint8Array(), 'image', 'nope', 'ab')).rejects.toThrow('User')
  })
})

describe('ProofService.anchorEvidence() — RFC-008 D1', () => {
  beforeEach(() => jest.clearAllMocks())

  it('anchors an existing EvidenceReference and persists the real AnchorProof', async () => {
    mockEvidenceReferenceFindUnique.mockResolvedValue({ id: 'ref-1', sha256: 'abc123' })
    const anchorProof = { anchorType: 'opentimestamps', anchorId: 'base64stuff', submittedAt: '2026-08-04T00:00:00.000Z', upgraded: false }
    mockAnchor.mockResolvedValue(anchorProof)
    mockEvidenceReferenceUpdate.mockResolvedValue({ id: 'ref-1', anchorProof })

    const service = new ProofService()
    const result = await service.anchorEvidence('ref-1')

    expect(mockAnchor).toHaveBeenCalledWith('abc123')
    expect(mockEvidenceReferenceUpdate).toHaveBeenCalledWith({ where: { id: 'ref-1' }, data: { anchorProof } })
    expect(result.anchorProof).toEqual(anchorProof)
  })

  it('throws NotFoundError for an unknown evidenceReferenceId', async () => {
    mockEvidenceReferenceFindUnique.mockResolvedValue(null)
    const service = new ProofService()
    await expect(service.anchorEvidence('nope')).rejects.toThrow('EvidenceReference')
  })
})

describe('ProofService.getEvidenceBundleForTrade() — RFC-007 D6, real per-trade aggregate', () => {
  beforeEach(() => jest.clearAllMocks())

  it('aggregates claims, proofs, verifications, externalReferences, and the real Timeline', async () => {
    mockClaimFindMany.mockResolvedValue([
      {
        id: 'claim-1', tradeId: 'trade-1',
        proofs: [
          { id: 'proof-1', verifications: [{ id: 'v-1' }], evidenceReferences: [{ id: 'ref-1' }] },
        ],
      },
    ])
    mockGetEvents.mockResolvedValue([{ eventType: 'openp2p.trade.created', eventId: 'e-1' }])

    const service = new ProofService()
    const bundle = await service.getEvidenceBundleForTrade('trade-1')

    expect(mockClaimFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tradeId: 'trade-1' } }))
    expect(bundle.tradeId).toBe('trade-1')
    expect(bundle.claims).toHaveLength(1)
    expect(bundle.proofs).toEqual([expect.objectContaining({ id: 'proof-1' })])
    expect(bundle.verifications).toEqual([{ id: 'v-1' }])
    expect(bundle.externalReferences).toEqual([{ id: 'ref-1' }])
    expect(bundle.timeline).toEqual([{ eventType: 'openp2p.trade.created', eventId: 'e-1' }])
  })

  it('returns empty arrays for a trade with no claims, never throws', async () => {
    mockClaimFindMany.mockResolvedValue([])
    mockGetEvents.mockResolvedValue([])
    const service = new ProofService()
    const bundle = await service.getEvidenceBundleForTrade('trade-empty')
    expect(bundle.claims).toEqual([])
    expect(bundle.proofs).toEqual([])
  })
})

describe('ProofService.submitProof() — RFC-007 D1 duplicate detection (real wiring, mocked registry)', () => {
  beforeEach(() => jest.clearAllMocks())

  it('emits proof.duplicate_detected when the registry reports a real match from a different trade', async () => {
    mockClaimFindUnique.mockResolvedValue({ id: 'claim-1', tradeId: 'trade-current', createdAt: new Date() })
    mockProofCreate.mockResolvedValue({ id: 'proof-new', claimId: 'claim-1' })
    mockFindDuplicates.mockResolvedValue([{ proofId: 'proof-old', tradeId: 'trade-other', matchedAt: '2026-08-01T00:00:00.000Z' }])

    const service = new ProofService()
    await service.submitProof({ claimId: 'claim-1', evidence: { note: 'reused screenshot' }, submittedBy: 'user-1' })

    expect(mockEmit).toHaveBeenCalledWith(
      'proof.duplicate_detected',
      expect.objectContaining({ matches: [{ proofId: 'proof-old', tradeId: 'trade-other', matchedAt: '2026-08-01T00:00:00.000Z' }] }),
      'claim-1'
    )
  })

  it('does not emit proof.duplicate_detected when no real duplicate exists', async () => {
    mockClaimFindUnique.mockResolvedValue({ id: 'claim-1', tradeId: 'trade-current', createdAt: new Date() })
    mockProofCreate.mockResolvedValue({ id: 'proof-new', claimId: 'claim-1' })
    mockFindDuplicates.mockResolvedValue([])

    const service = new ProofService()
    await service.submitProof({ claimId: 'claim-1', evidence: { note: 'unique evidence' }, submittedBy: 'user-1' })

    expect(mockEmit).not.toHaveBeenCalledWith('proof.duplicate_detected', expect.anything(), expect.anything())
  })
})
