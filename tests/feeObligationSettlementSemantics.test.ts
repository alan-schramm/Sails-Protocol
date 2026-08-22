/**
 * fee-obligation.service.ts's recordObligationForEscrowSettlement() —
 * Missão 11 Fase 3. Fake-repo unit tests covering what's impractical to
 * exercise through a full real-Postgres settlement (dispute-ruling
 * equivalence, provider-type-agnosticism, and error-swallowing) —
 * complements tests/integration/feeObligationSettlementLifecycle.test.ts's
 * real end-to-end proofs.
 */
import { FeeObligationService } from '../src/modules/open-settlement/fee-obligation.service'
import type { FeeObligationRepository } from '../src/modules/open-settlement/fee-obligation-repository'
import type { FeePolicyVersionRepository } from '../src/modules/open-settlement/fee-policy-repository'

function fakeObligationRepo(overrides: Partial<jest.Mocked<FeeObligationRepository>> = {}): jest.Mocked<FeeObligationRepository> {
  return {
    createOwed: jest.fn().mockImplementation((input) => Promise.resolve({ id: 'ob-1', collectionStatus: 'PENDING_COLLECTION', ...input })),
    createNotApplicable: jest.fn().mockImplementation((input) => Promise.resolve({ id: 'ob-2', collectionStatus: null, ...input })),
    findByEscrowId: jest.fn().mockResolvedValue(null),
    findById: jest.fn().mockResolvedValue(null),
    claimCollectionStatusTransition: jest.fn().mockResolvedValue(1),
    ...overrides,
  }
}

function fakePolicyRepo(overrides: Partial<jest.Mocked<FeePolicyVersionRepository>> = {}): jest.Mocked<FeePolicyVersionRepository> {
  return {
    create: jest.fn(),
    findById: jest.fn().mockResolvedValue({ id: 'policy-1', smallTradeRule: {} }),
    findPublishedForRail: jest.fn().mockResolvedValue([]),
    publish: jest.fn(),
    retire: jest.fn(),
    ...overrides,
  }
}

const POLICY_AWARE_ESCROW = {
  id: 'escrow-1',
  lockedAmount: '100000',
  asset: 'BTC' as const,
  feePolicyVersionId: 'policy-1',
  snapshotProtocolFeeRate: '0.004',
}

describe('createObligationForSettlement — dispute-ruling equivalence (Tests 5/6)', () => {
  it('DISPUTE_SELLER_WINS produces the identical OWED determination as a plain RELEASE', async () => {
    const repo = fakeObligationRepo()
    const service = new FeeObligationService(repo, fakePolicyRepo())

    await service.createObligationForSettlement({
      escrowId: 'escrow-1', feePolicyVersionId: 'policy-1', outcome: 'DISPUTE_SELLER_WINS',
      basisAmount: '100000', computedFee: '400', asset: 'BTC',
    })

    expect(repo.createOwed).toHaveBeenCalledWith(expect.objectContaining({ economicDetermination: 'OWED' }))
    expect(repo.createNotApplicable).not.toHaveBeenCalled()
  })

  it('DISPUTE_BUYER_WINS produces the identical NOT_APPLICABLE determination as a plain FULL_REFUND', async () => {
    const repo = fakeObligationRepo()
    const service = new FeeObligationService(repo, fakePolicyRepo())

    await service.createObligationForSettlement({
      escrowId: 'escrow-1', feePolicyVersionId: 'policy-1', outcome: 'DISPUTE_BUYER_WINS',
    })

    expect(repo.createNotApplicable).toHaveBeenCalledWith(expect.objectContaining({ economicDetermination: 'NOT_APPLICABLE' }))
    expect(repo.createOwed).not.toHaveBeenCalled()
  })
})

describe('recordObligationForEscrowSettlement — provider-type-agnosticism (Test 13/14)', () => {
  // The function signature itself takes no `type`/provider discriminator at
  // all — it only ever reads lockedAmount/feePolicyVersionId/
  // snapshotProtocolFeeRate. This test proves that directly: the identical
  // input (differing ONLY in which escrow "type" it conceptually
  // represents) produces the identical output, regardless of whether that
  // escrow is MOCK, WDK_USDT_EVM, or MULTISIG — because this function
  // cannot distinguish them even if it wanted to. This is the structural
  // guarantee behind Fase 7's "one economic semantics, not two
  // implementations" requirement: escrow.service.ts's direct-call
  // releaseFunds()/refundFunds()/splitFunds() AND escrow-pending-tx.ts's
  // submitTransactionSignature() both call this exact same function
  // (confirmed by direct code reading of both call sites) — there is only
  // one implementation to diverge from.
  it('produces identical output for a MOCK-shaped, WDK-shaped, and MULTISIG-shaped escrow object', async () => {
    const repo = fakeObligationRepo()
    const service = new FeeObligationService(repo, fakePolicyRepo())

    for (const pseudoType of ['MOCK', 'WDK_USDT_EVM', 'MULTISIG', 'LIGHTNING_HODL', 'SAFE_GUARD_EVM']) {
      jest.clearAllMocks()
      await service.recordObligationForEscrowSettlement({ ...POLICY_AWARE_ESCROW, id: `escrow-${pseudoType}` }, 'RELEASE')
      expect(repo.createOwed).toHaveBeenCalledWith(
        expect.objectContaining({ basisAmount: expect.anything(), computedFee: expect.anything() })
      )
      const call = repo.createOwed.mock.calls[0][0]
      expect(call.basisAmount.toString()).toBe('100000')
      expect(call.computedFee.toString()).toBe('400')
    }
  })
})

describe('recordObligationForEscrowSettlement — legacy and error-safety', () => {
  it('Test 1 (unit level): a null feePolicyVersionId is a silent no-op, no repository call at all', async () => {
    const repo = fakeObligationRepo()
    const service = new FeeObligationService(repo, fakePolicyRepo())

    await service.recordObligationForEscrowSettlement({ ...POLICY_AWARE_ESCROW, feePolicyVersionId: null }, 'RELEASE')

    expect(repo.createOwed).not.toHaveBeenCalled()
    expect(repo.createNotApplicable).not.toHaveBeenCalled()
  })

  it('never throws when the repository fails unexpectedly — a settlement whose real funds already moved must not be aborted by this accounting step', async () => {
    const repo = fakeObligationRepo({ createOwed: jest.fn().mockRejectedValue(new Error('simulated DB outage')) })
    const service = new FeeObligationService(repo, fakePolicyRepo())

    await expect(
      service.recordObligationForEscrowSettlement(POLICY_AWARE_ESCROW, 'RELEASE')
    ).resolves.toBeUndefined()
  })

  it('an existing FeeObligation short-circuits before any computation — idempotent retry (Test 11, unit level)', async () => {
    const repo = fakeObligationRepo({ findByEscrowId: jest.fn().mockResolvedValue({ id: 'already-there' }) })
    const service = new FeeObligationService(repo, fakePolicyRepo())

    await service.recordObligationForEscrowSettlement(POLICY_AWARE_ESCROW, 'RELEASE')

    expect(repo.createOwed).not.toHaveBeenCalled()
  })
})
