/**
 * fee-obligation.service.ts — Missão 11 Fase 2.2 economic accounting
 * foundation. Fake-repo DI, same pattern as tests/capabilityRegistry.test.ts.
 *
 * Covers: Test K (explicit NOT_APPLICABLE is distinguishable from a missing
 * FeeObligation — the service always calls create(), for both outcomes) and
 * Test N (RBF/reorg/drop-style collectionStatus transitions never touch
 * economicDetermination — proven by transitionCollectionStatus() only ever
 * calling the repository's collectionStatus-scoped claim method, never
 * anything that could write economicDetermination).
 */
import { FeeObligationService } from '../src/modules/open-settlement/fee-obligation.service'
import type { FeeObligationRepository } from '../src/modules/open-settlement/fee-obligation-repository'

function fakeRepo(overrides: Partial<jest.Mocked<FeeObligationRepository>> = {}): jest.Mocked<FeeObligationRepository> {
  return {
    createOwed: jest.fn(),
    createNotApplicable: jest.fn(),
    findByEscrowId: jest.fn().mockResolvedValue(null),
    findById: jest.fn().mockResolvedValue(null),
    claimCollectionStatusTransition: jest.fn().mockResolvedValue(1),
    ...overrides,
  }
}

describe('FeeObligationService.createObligationForSettlement — economic determination (Test K)', () => {
  it('RELEASE creates an OWED obligation with the seller-delivered basis', async () => {
    const repo = fakeRepo({ createOwed: jest.fn().mockResolvedValue({ id: 'ob-1', economicDetermination: 'OWED' }) })
    const service = new FeeObligationService(repo)

    await service.createObligationForSettlement({
      escrowId: 'escrow-1',
      feePolicyVersionId: 'policy-1',
      outcome: 'RELEASE',
      basisAmount: '100000',
      computedFee: '400',
      asset: 'BTC',
    })

    expect(repo.createOwed).toHaveBeenCalledWith(
      expect.objectContaining({ escrowId: 'escrow-1', economicDetermination: 'OWED', basisAmount: '100000', computedFee: '400' })
    )
    expect(repo.createNotApplicable).not.toHaveBeenCalled()
  })

  it('SPLIT creates an OWED obligation (basis = seller-delivered portion only, caller-supplied)', async () => {
    const repo = fakeRepo({ createOwed: jest.fn().mockResolvedValue({ id: 'ob-2', economicDetermination: 'OWED' }) })
    const service = new FeeObligationService(repo)

    await service.createObligationForSettlement({
      escrowId: 'escrow-2',
      feePolicyVersionId: 'policy-1',
      outcome: 'SPLIT',
      basisAmount: '70000', // caller already resolved this to the seller's 70% share
      computedFee: '280',
      asset: 'BTC',
    })

    expect(repo.createOwed).toHaveBeenCalled()
  })

  it('DISPUTE_SELLER_WINS creates an OWED obligation (equivalent to RELEASE)', async () => {
    const repo = fakeRepo({ createOwed: jest.fn().mockResolvedValue({ id: 'ob-3', economicDetermination: 'OWED' }) })
    const service = new FeeObligationService(repo)

    await service.createObligationForSettlement({
      escrowId: 'escrow-3',
      feePolicyVersionId: 'policy-1',
      outcome: 'DISPUTE_SELLER_WINS',
      basisAmount: '50000',
      computedFee: '200',
      asset: 'BTC',
    })

    expect(repo.createOwed).toHaveBeenCalled()
  })

  it('FULL_REFUND creates an explicit NOT_APPLICABLE obligation — never absence', async () => {
    const repo = fakeRepo({ createNotApplicable: jest.fn().mockResolvedValue({ id: 'ob-4', economicDetermination: 'NOT_APPLICABLE' }) })
    const service = new FeeObligationService(repo)

    const result = await service.createObligationForSettlement({
      escrowId: 'escrow-4',
      feePolicyVersionId: 'policy-1',
      outcome: 'FULL_REFUND',
    })

    expect(repo.createNotApplicable).toHaveBeenCalledWith({ escrowId: 'escrow-4', feePolicyVersionId: 'policy-1', economicDetermination: 'NOT_APPLICABLE' })
    expect(repo.createOwed).not.toHaveBeenCalled()
    expect(result.economicDetermination).toBe('NOT_APPLICABLE')
  })

  it('DISPUTE_BUYER_WINS creates an explicit NOT_APPLICABLE obligation (equivalent to refund)', async () => {
    const repo = fakeRepo({ createNotApplicable: jest.fn().mockResolvedValue({ id: 'ob-5', economicDetermination: 'NOT_APPLICABLE' }) })
    const service = new FeeObligationService(repo)

    await service.createObligationForSettlement({
      escrowId: 'escrow-5',
      feePolicyVersionId: 'policy-1',
      outcome: 'DISPUTE_BUYER_WINS',
    })

    expect(repo.createNotApplicable).toHaveBeenCalled()
    expect(repo.createOwed).not.toHaveBeenCalled()
  })

  it('rejects an OWED outcome missing basisAmount/computedFee/asset rather than silently defaulting', async () => {
    const repo = fakeRepo()
    const service = new FeeObligationService(repo)

    await expect(
      service.createObligationForSettlement({ escrowId: 'escrow-6', feePolicyVersionId: 'policy-1', outcome: 'RELEASE' })
    ).rejects.toThrow(/requires basisAmount, computedFee, and asset/)
    expect(repo.createOwed).not.toHaveBeenCalled()
    expect(repo.createNotApplicable).not.toHaveBeenCalled()
  })
})

describe('FeeObligationService.transitionCollectionStatus — collection lifecycle graph', () => {
  it('allows PENDING_COLLECTION -> IN_PROGRESS', async () => {
    const repo = fakeRepo({ claimCollectionStatusTransition: jest.fn().mockResolvedValue(1) })
    const service = new FeeObligationService(repo)

    await service.transitionCollectionStatus('ob-1', 'PENDING_COLLECTION', 'IN_PROGRESS')
    expect(repo.claimCollectionStatusTransition).toHaveBeenCalledWith('ob-1', 'PENDING_COLLECTION', 'IN_PROGRESS')
  })

  it('allows the automatic pre-distribution reorg backward transition COLLECTED -> IN_PROGRESS (Test N)', async () => {
    const repo = fakeRepo({ claimCollectionStatusTransition: jest.fn().mockResolvedValue(1) })
    const service = new FeeObligationService(repo)

    await service.transitionCollectionStatus('ob-1', 'COLLECTED', 'IN_PROGRESS')
    expect(repo.claimCollectionStatusTransition).toHaveBeenCalledWith('ob-1', 'COLLECTED', 'IN_PROGRESS')
    // The transition method's own signature only ever touches collectionStatus
    // — there is no economicDetermination parameter anywhere in this call,
    // structurally proving a reorg/RBF/drop-driven transition cannot alter it.
  })

  it('rejects an automatic transition out of DISTRIBUTED (post-distribution reorg is a manual reconciliation case, never automatic — Fase 2.1 §5)', async () => {
    const repo = fakeRepo()
    const service = new FeeObligationService(repo)

    await expect(service.transitionCollectionStatus('ob-1', 'DISTRIBUTED', 'IN_PROGRESS')).rejects.toThrow(/Invalid FeeObligation collectionStatus transition/)
    expect(repo.claimCollectionStatusTransition).not.toHaveBeenCalled()
  })

  it('rejects a transition not present in the graph (e.g. WAIVED -> COLLECTED)', async () => {
    const repo = fakeRepo()
    const service = new FeeObligationService(repo)

    await expect(service.transitionCollectionStatus('ob-1', 'WAIVED', 'COLLECTED')).rejects.toThrow(/Invalid FeeObligation collectionStatus transition/)
    expect(repo.claimCollectionStatusTransition).not.toHaveBeenCalled()
  })

  it('throws when the atomic claim loses a race (0 rows affected)', async () => {
    const repo = fakeRepo({ claimCollectionStatusTransition: jest.fn().mockResolvedValue(0) })
    const service = new FeeObligationService(repo)

    await expect(service.transitionCollectionStatus('ob-1', 'PENDING_COLLECTION', 'IN_PROGRESS')).rejects.toThrow(/a concurrent transition already moved it/)
  })
})
