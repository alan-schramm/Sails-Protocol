/**
 * ProofRegistry — RFC-007 D1 (RWR-001), closed 2026-08-04. Real SHA-256
 * fingerprinting (same discipline as tests/paymentAccountService.test.ts's
 * own real-hash tests), mocked Prisma for the findDuplicates() query.
 */
export {} // same forced-module reasoning used throughout this suite

const mockProofFindMany = jest.fn()
jest.mock('../src/common/database', () => ({
  prisma: {
    proof: { findMany: (...args: unknown[]) => mockProofFindMany(...args) },
  },
}))

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ProofRegistry } = require('../src/modules/open-proof/proof-registry')

describe('ProofRegistry.fingerprint() — real SHA-256, exact-content only', () => {
  it('is deterministic — same evidence, same fingerprint, every time', async () => {
    const registry = new ProofRegistry()
    const f1 = await registry.fingerprint({ amount: '500', currency: 'BRL' })
    const f2 = await registry.fingerprint({ amount: '500', currency: 'BRL' })
    expect(f1).toBe(f2)
    expect(f1).toMatch(/^[0-9a-f]{64}$/)
  })

  it('key order does not change the fingerprint — canonicalized before hashing', async () => {
    const registry = new ProofRegistry()
    const f1 = await registry.fingerprint({ a: 1, b: 2 })
    const f2 = await registry.fingerprint({ b: 2, a: 1 })
    expect(f1).toBe(f2)
  })

  it('different evidence produces different fingerprints', async () => {
    const registry = new ProofRegistry()
    const f1 = await registry.fingerprint({ amount: '500' })
    const f2 = await registry.fingerprint({ amount: '501' })
    expect(f1).not.toBe(f2)
  })
})

describe('ProofRegistry.findDuplicates() — RFC-007 D1: flags reuse, does not adjudicate it', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns matches from a different trade, mapped to the D1 ProofRegistryMatch shape', async () => {
    mockProofFindMany.mockResolvedValue([
      { id: 'proof-2', submittedAt: new Date('2026-08-01T00:00:00Z'), claim: { tradeId: 'trade-other' } },
    ])
    const registry = new ProofRegistry()
    const matches = await registry.findDuplicates('abc123', 'trade-current')
    expect(matches).toEqual([{ proofId: 'proof-2', tradeId: 'trade-other', matchedAt: '2026-08-01T00:00:00.000Z' }])
  })

  it('excludes matches from the SAME trade — resubmitting your own evidence is not reuse', async () => {
    const registry = new ProofRegistry()
    await registry.findDuplicates('abc123', 'trade-current')
    const queryArg = mockProofFindMany.mock.calls[0][0]
    expect(queryArg.where.claim.OR).toEqual([{ tradeId: null }, { tradeId: { not: 'trade-current' } }])
  })

  it('with no excludeTradeId, queries only by fingerprint (no claim filter)', async () => {
    mockProofFindMany.mockResolvedValue([])
    const registry = new ProofRegistry()
    await registry.findDuplicates('abc123')
    const queryArg = mockProofFindMany.mock.calls[0][0]
    expect(queryArg.where).toEqual({ evidenceHash: 'abc123' })
  })
})
