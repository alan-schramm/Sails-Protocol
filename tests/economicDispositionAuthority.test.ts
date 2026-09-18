export {}

const mockExecuteRaw = jest.fn().mockResolvedValue(0)
const mockAuthFindUnique = jest.fn()
const mockAuthCreate = jest.fn()
const mockDisputeFindUnique = jest.fn()

const tx = {
  $executeRaw: mockExecuteRaw,
  economicDispositionAuthorization: {
    findUnique: mockAuthFindUnique,
    create: mockAuthCreate,
  },
  dispute: {
    findUnique: mockDisputeFindUnique,
  },
}

const mockTransaction = jest.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx))

jest.mock('../src/common/database', () => ({
  prisma: {
    $transaction: (...args: unknown[]) => mockTransaction(...(args as [any])),
  },
}))

import {
  authorizeDisputedPendingExecution,
  economicDispositionLockKey,
} from '../src/modules/open-settlement/economic-disposition-authority'
import { capabilityOperationDigest } from '../src/modules/open-settlement/capability-execution-authorization'

const cooperativePending = {
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
  disputeId: null,
  rulingAppealRound: null,
  rulingArbiterId: null,
  rulingOutcome: null,
  rulingAuthoritySignature: null,
  rulingAuthorityIssuedAt: null,
}

const disputedPending = {
  ...cooperativePending,
  id: 'pending-2',
  triggeredBy: 'arbiter-1',
  disputeId: 'dispute-1',
  rulingAppealRound: 0,
  rulingArbiterId: 'arbiter-1',
  rulingOutcome: 'RELEASE',
  rulingAuthoritySignature: 'sig-generation-0',
  rulingAuthorityIssuedAt: new Date('2026-09-18T00:00:00.000Z'),
}

function liveDispute(overrides: Record<string, unknown> = {}) {
  return {
    id: 'dispute-1',
    status: 'RESOLVED',
    appealRound: 0,
    arbiterId: 'arbiter-1',
    ruling: 'RELEASE',
    authoritySignature: 'sig-generation-0',
    ...overrides,
  }
}

describe('ADR-005 economic disposition commit gate', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockAuthFindUnique.mockResolvedValue(null)
    mockAuthCreate.mockImplementation(async ({ data }) => ({
      id: 'eda-1',
      authorizedAt: new Date(),
      ...data,
    }))
    mockDisputeFindUnique.mockResolvedValue(liveDispute())
  })

  it('is a no-op for a pending operation with no recorded ruling generation (cooperative release)', async () => {
    await expect(authorizeDisputedPendingExecution(cooperativePending)).resolves.toBeNull()
    expect(mockTransaction).not.toHaveBeenCalled()
    expect(mockAuthCreate).not.toHaveBeenCalled()
  })

  it('commits economic disposition authority when the recorded generation is still current', async () => {
    const result = await authorizeDisputedPendingExecution(disputedPending)

    expect(mockExecuteRaw).toHaveBeenCalled()
    expect(mockDisputeFindUnique).toHaveBeenCalledWith({ where: { id: 'dispute-1' } })
    expect(mockAuthCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        pendingOperationId: 'pending-2',
        escrowId: 'escrow-1',
        disputeId: 'dispute-1',
        appealRound: 0,
        arbiterId: 'arbiter-1',
        ruling: 'RELEASE',
        operationDigest: capabilityOperationDigest(disputedPending),
      }),
    })
    expect(result).toEqual(expect.objectContaining({ disputeId: 'dispute-1' }))
  })

  it('uses the economic-disposition:<disputeId> lock scope shared with appeal()/applyRuling()', () => {
    expect(economicDispositionLockKey('dispute-1')).toBe('economic-disposition:dispute-1')
  })

  it('fails closed when an appeal advanced the appeal round before commit', async () => {
    mockDisputeFindUnique.mockResolvedValue(liveDispute({ status: 'APPEALED', appealRound: 1, arbiterId: 'arbiter-2', ruling: null }))

    await expect(authorizeDisputedPendingExecution(disputedPending)).rejects.toThrow(/no longer current/)
    expect(mockAuthCreate).not.toHaveBeenCalled()
  })

  it('fails closed when the current arbiter no longer matches the recorded generation', async () => {
    mockDisputeFindUnique.mockResolvedValue(liveDispute({ arbiterId: 'arbiter-2' }))

    await expect(authorizeDisputedPendingExecution(disputedPending)).rejects.toThrow(/no longer current/)
    expect(mockAuthCreate).not.toHaveBeenCalled()
  })

  it('fails closed when the dispute is not RESOLVED (e.g. reopened) even if appealRound/arbiterId coincidentally match', async () => {
    mockDisputeFindUnique.mockResolvedValue(liveDispute({ status: 'EVIDENCE_SUBMITTED' }))

    await expect(authorizeDisputedPendingExecution(disputedPending)).rejects.toThrow(/no longer current/)
    expect(mockAuthCreate).not.toHaveBeenCalled()
  })

  it('reuses an already-committed authorization without re-consulting the live dispute state — retry after a later appeal', async () => {
    const existing = {
      id: 'eda-1',
      pendingOperationId: disputedPending.id,
      escrowId: disputedPending.escrowId,
      disputeId: 'dispute-1',
      appealRound: 0,
      arbiterId: 'arbiter-1',
      ruling: 'RELEASE',
      operationDigest: capabilityOperationDigest(disputedPending),
      authorizedAt: new Date(),
    }
    mockAuthFindUnique.mockResolvedValue(existing)
    // Even though the dispute has since moved to a new generation, a
    // committed attempt is allowed to retry-to-completion (ADR-005 §4) —
    // this mock proves the live dispute row is never consulted on reuse.
    mockDisputeFindUnique.mockRejectedValue(new Error('must not be called on reuse'))

    await expect(authorizeDisputedPendingExecution(disputedPending)).resolves.toBe(existing)
    expect(mockDisputeFindUnique).not.toHaveBeenCalled()
    expect(mockAuthCreate).not.toHaveBeenCalled()
  })

  it('rejects reuse if the pending operation was mutated since the original commit', async () => {
    mockAuthFindUnique.mockResolvedValue({
      id: 'eda-1',
      pendingOperationId: disputedPending.id,
      escrowId: disputedPending.escrowId,
      disputeId: 'dispute-1',
      appealRound: 0,
      arbiterId: 'arbiter-1',
      ruling: 'RELEASE',
      operationDigest: 'different-digest',
      authorizedAt: new Date(),
    })

    await expect(authorizeDisputedPendingExecution(disputedPending)).rejects.toThrow(/no longer matches its committed economic disposition authorization/)
    expect(mockAuthCreate).not.toHaveBeenCalled()
  })
})
