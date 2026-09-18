export {}

let enforceCapabilities = true
jest.mock('../src/config', () => ({
  get config() {
    return { features: { enforceCapabilities } }
  },
}))

const mockExecuteRaw = jest.fn().mockResolvedValue(0)
const mockAuthFindUnique = jest.fn()
const mockAuthCreate = jest.fn()
const mockGrantFindMany = jest.fn()

const tx = {
  $executeRaw: mockExecuteRaw,
  capabilityExecutionAuthorization: {
    findUnique: mockAuthFindUnique,
    create: mockAuthCreate,
  },
  capabilityGrant: {
    findMany: mockGrantFindMany,
  },
}

const mockTransaction = jest.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx))

jest.mock('../src/common/database', () => ({
  prisma: {
    $transaction: (...args: unknown[]) => mockTransaction(...(args as [any])),
  },
}))

import {
  authorizePendingExecution,
  capabilityOperationDigest,
} from '../src/modules/open-settlement/capability-execution-authorization'

const pending = {
  id: 'pending-1',
  escrowId: 'escrow-1',
  kind: 'release',
  toAddress: 'bc1qbuyer',
  toAddressSecondary: null,
  buyerBps: null,
  feeCollectionSats: 100,
  feeCollectionWaived: false,
  minerFeeSats: 250,
  unsignedPsbtBase64: 'cHNidP8BAA==',
  requiredSigners: ['buyer-1', 'seller-1'],
  triggeredBy: 'seller-1',
}

function grant(overrides: Record<string, unknown> = {}) {
  return {
    id: 'grant-1',
    grantedTo: 'seller-1',
    capabilityName: 'settlement',
    scope: ['settlement.escrow.released'],
    constraints: null,
    issuedBy: 'seller-1',
    revokedAt: null,
    createdAt: new Date('2026-09-18T00:00:00.000Z'),
    ...overrides,
  }
}

describe('ADR-004 capability execution commit gate', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    enforceCapabilities = true
    mockAuthFindUnique.mockResolvedValue(null)
    mockGrantFindMany.mockResolvedValue([grant()])
    mockAuthCreate.mockImplementation(async ({ data }) => ({
      id: 'auth-1',
      authorizedAt: new Date(),
      ...data,
    }))
  })

  it('preserves unchecked behavior and writes no provenance when enforcement is disabled', async () => {
    enforceCapabilities = false

    await expect(authorizePendingExecution(pending)).resolves.toBeNull()

    expect(mockTransaction).not.toHaveBeenCalled()
    expect(mockAuthCreate).not.toHaveBeenCalled()
  })

  it('commits exact grant provenance before execution for the original initiator', async () => {
    const result = await authorizePendingExecution(pending)

    expect(mockExecuteRaw).toHaveBeenCalled()
    expect(mockGrantFindMany).toHaveBeenCalledWith({
      where: {
        grantedTo: 'seller-1',
        capabilityName: 'settlement',
        revokedAt: null,
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    })
    expect(mockAuthCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        pendingOperationId: 'pending-1',
        escrowId: 'escrow-1',
        grantId: 'grant-1',
        grantedTo: 'seller-1',
        capabilityName: 'settlement',
        requiredScope: 'settlement.escrow.released',
        operationDigest: capabilityOperationDigest(pending),
      }),
    })
    expect(result).toEqual(expect.objectContaining({ grantId: 'grant-1' }))
  })

  it('fails closed if the original grant expired before Gate B', async () => {
    mockGrantFindMany.mockResolvedValue([
      grant({ constraints: { expiresAt: '2026-09-17T00:00:00.000Z' } }),
    ])

    await expect(authorizePendingExecution(pending)).rejects.toThrow(/no active 'settlement' capability grant/)
    expect(mockAuthCreate).not.toHaveBeenCalled()
  })

  it('allows a replacement live grant for the unchanged pending operation', async () => {
    mockGrantFindMany.mockResolvedValue([
      grant({ id: 'grant-old', constraints: { expiresAt: '2026-09-17T00:00:00.000Z' } }),
      grant({ id: 'grant-replacement', createdAt: new Date('2026-09-18T01:00:00.000Z') }),
    ])

    await authorizePendingExecution(pending)

    expect(mockAuthCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ grantId: 'grant-replacement' }),
    })
  })

  it('reuses an already committed authorization without requiring a still-live grant', async () => {
    const existing = {
      id: 'auth-1',
      pendingOperationId: pending.id,
      escrowId: pending.escrowId,
      grantId: 'grant-1',
      grantedTo: pending.triggeredBy,
      capabilityName: 'settlement',
      requiredScope: 'settlement.escrow.released',
      constraints: null,
      operationDigest: capabilityOperationDigest(pending),
      authorizedAt: new Date(),
    }
    mockAuthFindUnique.mockResolvedValue(existing)
    mockGrantFindMany.mockResolvedValue([])

    await expect(authorizePendingExecution(pending)).resolves.toBe(existing)
    expect(mockGrantFindMany).not.toHaveBeenCalled()
    expect(mockAuthCreate).not.toHaveBeenCalled()
  })

  it('rejects reuse if immutable pending facts no longer match the committed authorization', async () => {
    mockAuthFindUnique.mockResolvedValue({
      id: 'auth-1',
      pendingOperationId: pending.id,
      escrowId: pending.escrowId,
      grantId: 'grant-1',
      grantedTo: pending.triggeredBy,
      capabilityName: 'settlement',
      requiredScope: 'settlement.escrow.released',
      constraints: null,
      operationDigest: 'different-digest',
      authorizedAt: new Date(),
    })

    await expect(authorizePendingExecution(pending)).rejects.toThrow(/no longer matches its committed capability authorization/)
    expect(mockGrantFindMany).not.toHaveBeenCalled()
    expect(mockAuthCreate).not.toHaveBeenCalled()
  })
})
