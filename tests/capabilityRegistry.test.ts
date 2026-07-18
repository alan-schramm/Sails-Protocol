/**
 * capability-registry.ts — RFC-013's real implementation of RFC-005's
 * CapabilityGrant. Mocks only prisma.capabilityGrant, same discipline
 * as every other Core component's test in this suite.
 */
const mockCreate = jest.fn()
const mockFindMany = jest.fn()
const mockFindUnique = jest.fn()
const mockUpdate = jest.fn()

jest.mock('../src/common/database', () => ({
  prisma: {
    capabilityGrant: {
      create: (...args: unknown[]) => mockCreate(...args),
      findMany: (...args: unknown[]) => mockFindMany(...args),
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
    },
  },
}))

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { capabilityRegistry, CAPABILITY_IMPLEMENTATIONS } = require('../src/core/capability-registry')

describe('capabilityRegistry.grant', () => {
  beforeEach(() => jest.clearAllMocks())

  it('creates a grant and returns it in the frozen CapabilityGrant shape (grantId, not id)', async () => {
    mockCreate.mockResolvedValue({
      id: 'grant-1',
      grantedTo: 'user-1',
      capabilityName: 'trade-coordination',
      scope: ['openp2p.trade.created'],
      constraints: { maxValue: '100' },
      issuedBy: 'user-1',
    })

    const grant = await capabilityRegistry.grant({
      grantedTo: 'user-1',
      capabilityName: 'trade-coordination',
      scope: ['openp2p.trade.created'],
      constraints: { maxValue: '100' },
      issuedBy: 'user-1',
    })

    expect(grant).toEqual({
      grantId: 'grant-1', // mapped from Prisma's `id`, not re-exposed as `id`
      grantedTo: 'user-1',
      capabilityName: 'trade-coordination',
      scope: ['openp2p.trade.created'],
      constraints: { maxValue: '100' },
      issuedBy: 'user-1',
    })
  })
})

describe('capabilityRegistry.check', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns true when an active, unexpired grant covers the requested scope', async () => {
    mockFindMany.mockResolvedValue([
      { id: 'g1', grantedTo: 'user-1', capabilityName: 'trade-coordination', scope: ['a', 'b'], constraints: null, issuedBy: 'user-1' },
    ])

    const ok = await capabilityRegistry.check('user-1', 'trade-coordination', 'b')
    expect(ok).toBe(true)
    expect(mockFindMany).toHaveBeenCalledWith({
      where: { grantedTo: 'user-1', capabilityName: 'trade-coordination', revokedAt: null },
    })
  })

  it('returns false when no grant covers the requested scope', async () => {
    mockFindMany.mockResolvedValue([
      { id: 'g1', grantedTo: 'user-1', capabilityName: 'trade-coordination', scope: ['a'], constraints: null, issuedBy: 'user-1' },
    ])

    const ok = await capabilityRegistry.check('user-1', 'trade-coordination', 'z')
    expect(ok).toBe(false)
  })

  it('returns false for a grant whose constraints.expiresAt has passed', async () => {
    mockFindMany.mockResolvedValue([
      {
        id: 'g1', grantedTo: 'user-1', capabilityName: 'trade-coordination', scope: ['a'],
        constraints: { expiresAt: new Date(Date.now() - 1000).toISOString() }, issuedBy: 'user-1',
      },
    ])

    const ok = await capabilityRegistry.check('user-1', 'trade-coordination', 'a')
    expect(ok).toBe(false)
  })

  it('returns true for a grant whose constraints.expiresAt is in the future', async () => {
    mockFindMany.mockResolvedValue([
      {
        id: 'g1', grantedTo: 'user-1', capabilityName: 'trade-coordination', scope: ['a'],
        constraints: { expiresAt: new Date(Date.now() + 100_000).toISOString() }, issuedBy: 'user-1',
      },
    ])

    const ok = await capabilityRegistry.check('user-1', 'trade-coordination', 'a')
    expect(ok).toBe(true)
  })
})

describe('capabilityRegistry.revoke', () => {
  beforeEach(() => jest.clearAllMocks())

  it('throws NotFoundError for a nonexistent grantId', async () => {
    mockFindUnique.mockResolvedValue(null)
    await expect(capabilityRegistry.revoke('nope')).rejects.toThrow(/CapabilityGrant/)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('sets revokedAt on an existing grant', async () => {
    mockFindUnique.mockResolvedValue({ id: 'grant-1' })
    mockUpdate.mockResolvedValue({})

    await capabilityRegistry.revoke('grant-1')

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'grant-1' },
      data: { revokedAt: expect.any(Date) },
    })
  })
})

describe('capabilityRegistry.listGrants', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns only active grants, mapped to the frozen CapabilityGrant shape', async () => {
    mockFindMany.mockResolvedValue([
      { id: 'g1', grantedTo: 'user-1', capabilityName: 'trade-coordination', scope: ['a'], constraints: null, issuedBy: 'user-1' },
    ])

    const grants = await capabilityRegistry.listGrants('user-1')

    expect(grants).toEqual([
      { grantId: 'g1', grantedTo: 'user-1', capabilityName: 'trade-coordination', scope: ['a'], constraints: undefined, issuedBy: 'user-1' },
    ])
    expect(mockFindMany).toHaveBeenCalledWith({
      where: { grantedTo: 'user-1', revokedAt: null },
      orderBy: { createdAt: 'desc' },
    })
  })
})

describe('CAPABILITY_IMPLEMENTATIONS (RFC-005 module <-> Capability table)', () => {
  it('maps every real module to its Capability, matching RFC-005 exactly', () => {
    expect(CAPABILITY_IMPLEMENTATIONS).toEqual({
      openp2p: 'trade-coordination',
      opensettlement: 'settlement',
      openliquidity: 'liquidity-discovery',
      openidentity: 'identity-verification',
      openreputation: 'reputation-scoring',
      openagents: 'agent-delegation',
      openfinance: 'financial-instruments',
      openproof: 'proof-verification',
    })
  })
})
