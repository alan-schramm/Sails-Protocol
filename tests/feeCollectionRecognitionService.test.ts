// tests/feeCollectionRecognitionService.test.ts
//
// Missão 11 Fase 5 §4/§6/§7/§8 — unit-level proof of
// FeeCollectionRecognitionService's state-machine + re-verification logic,
// against fake repositories (no real database). Real-Postgres proof of the
// full transition graph (including the DB-level VALID_COLLECTION_TRANSITIONS
// guard) lives in tests/integration/feeCollectionRecognitionIntegration.test.ts.

import { Prisma } from '@prisma/client'
import { FeeCollectionRecognitionService, type TransactionRunner } from '../src/modules/open-settlement/fee-collection-recognition.service'
import { FeeObligationService } from '../src/modules/open-settlement/fee-obligation.service'
import type { DistributionPolicyService } from '../src/modules/open-settlement/distribution-policy.service'
import type { FeeObligationRepository } from '../src/modules/open-settlement/fee-obligation-repository'
import type { FeeCollectionEvidenceRepository, FeeCollectionEvidenceKind } from '../src/modules/open-settlement/fee-collection-evidence-repository'

// Missão 11 Fase 7.2.1 — recognizeConfirmation() now commits its two
// writes inside an injected transaction runner (atomicity fix — see that
// method's own header comment). The real default reaches a real Postgres
// transaction; this fake just invokes the callback directly with no real
// transaction, keeping this file's own "no real database" unit-test
// contract intact — the fake evidenceRepo/obligationRepo below already
// ignore the `tx` argument entirely, so this changes nothing about what
// these tests verify (confirmed via a real hanging run against the
// unmocked default before this fake existed, not assumed).
const fakeRunInTransaction: TransactionRunner = (fn) => fn(undefined as any)

// Missão 11 Fase 7.2 — recognizeConfirmation() now resolves the live
// DistributionPolicyVersion to freeze onto the CONFIRMED row it creates.
// A fake here keeps this file a genuine unit test (no real database) —
// without it, the constructor's default parameter would reach the REAL
// singleton and make a real Postgres call, which happened to "work" only
// because a local dev Postgres was running (found and fixed while wiring
// this in — confirmed via a real failing/hanging run before this fake
// existed, not assumed).
function fakeDistributionPolicyService(overrides: Partial<jest.Mocked<DistributionPolicyService>> = {}): jest.Mocked<DistributionPolicyService> {
  return {
    findLivePolicy: jest.fn().mockResolvedValue(null),
    ...overrides,
  } as unknown as jest.Mocked<DistributionPolicyService>
}

function fakeObligationRepo(overrides: Partial<jest.Mocked<FeeObligationRepository>> = {}): jest.Mocked<FeeObligationRepository> {
  return {
    createOwed: jest.fn(),
    createNotApplicable: jest.fn(),
    findByEscrowId: jest.fn().mockResolvedValue(null),
    findById: jest.fn().mockResolvedValue(null),
    claimCollectionStatusTransition: jest.fn().mockResolvedValue(1),
    ...overrides,
  } as unknown as jest.Mocked<FeeObligationRepository>
}

function fakeEvidenceRepo(overrides: Partial<jest.Mocked<FeeCollectionEvidenceRepository>> = {}): jest.Mocked<FeeCollectionEvidenceRepository> {
  return {
    record: jest.fn().mockImplementation(async (input) => ({ id: 'evidence-1', recordedAt: new Date(), ...input })),
    listForObligation: jest.fn().mockResolvedValue([]),
    ...overrides,
  } as unknown as jest.Mocked<FeeCollectionEvidenceRepository>
}

function evidenceRow(kind: FeeCollectionEvidenceKind, overrides: Record<string, any> = {}) {
  return {
    id: `ev-${Math.random().toString(36).slice(2)}`,
    feeObligationId: 'obligation-1',
    kind,
    txid: null,
    vout: null,
    scriptPubKey: null,
    amount: null,
    confirmedAtHeight: null,
    note: null,
    recordedAt: new Date(),
    ...overrides,
  }
}

describe('FeeCollectionRecognitionService.recordBroadcastAndAdvance() — §6', () => {
  it('records BROADCAST evidence and transitions PENDING_COLLECTION -> IN_PROGRESS', async () => {
    const evidenceRepo = fakeEvidenceRepo()
    const obligationRepo = fakeObligationRepo()
    const obligationService = new FeeObligationService(obligationRepo)
    const service = new FeeCollectionRecognitionService(obligationRepo, evidenceRepo, obligationService)

    await service.recordBroadcastAndAdvance('obligation-1', { txid: 'a'.repeat(64), vout: 1, scriptPubKey: 'deadbeef', amountSats: 4000 })

    expect(evidenceRepo.record).toHaveBeenCalledWith(expect.objectContaining({ feeObligationId: 'obligation-1', kind: 'BROADCAST', txid: 'a'.repeat(64), vout: 1, scriptPubKey: 'deadbeef' }))
    const call = evidenceRepo.record.mock.calls[0][0]
    expect((call.amount as Prisma.Decimal).toString()).toBe('0.00004')
    expect(obligationRepo.claimCollectionStatusTransition).toHaveBeenCalledWith('obligation-1', 'PENDING_COLLECTION', 'IN_PROGRESS')
  })
})

describe('FeeCollectionRecognitionService.recognizeConfirmation() — §7', () => {
  it('records CONFIRMED evidence and transitions IN_PROGRESS -> COLLECTED when the txid matches the last BROADCAST evidence', async () => {
    const broadcastEvidence = evidenceRow('BROADCAST', { txid: 'b'.repeat(64), vout: 2, scriptPubKey: 'cafe', amount: new Prisma.Decimal('0.00004') })
    const evidenceRepo = fakeEvidenceRepo({ listForObligation: jest.fn().mockResolvedValue([broadcastEvidence]) })
    const obligationRepo = fakeObligationRepo({ findById: jest.fn().mockResolvedValue({ id: 'obligation-1', collectionStatus: 'IN_PROGRESS' }) })
    const obligationService = new FeeObligationService(obligationRepo)
    const distributionPolicyService = fakeDistributionPolicyService()
    const service = new FeeCollectionRecognitionService(obligationRepo, evidenceRepo, obligationService, distributionPolicyService, fakeRunInTransaction)

    await service.recognizeConfirmation('obligation-1', 'b'.repeat(64), 800_000)

    // Missão 11 Fase 7.2.1 — recognizeConfirmation() now always passes a
    // (possibly-fake) transaction client as evidenceRepo.record()'s 2nd
    // arg — fakeRunInTransaction supplies `undefined` here, so the real
    // call shape is 2 args, not 1.
    expect(evidenceRepo.record).toHaveBeenCalledWith(expect.objectContaining({ kind: 'CONFIRMED', txid: 'b'.repeat(64), confirmedAtHeight: 800_000, vout: 2, scriptPubKey: 'cafe' }), undefined)
    expect(obligationRepo.claimCollectionStatusTransition).toHaveBeenCalledWith('obligation-1', 'IN_PROGRESS', 'COLLECTED')
  })

  // Missão 11 Fase 7.2 (CTO-frozen decision) — the whole point of this
  // phase: the live DistributionPolicyVersion is resolved HERE, once, and
  // persisted onto the CONFIRMED row in the same insert. Real-Postgres
  // proof of the frozen value surviving worker delay/reorg lives in
  // tests/integration/collectedTimeDistributionFreeze.test.ts — this is
  // the unit-level proof of the wiring itself.
  it('freezes the live DistributionPolicyVersion onto the CONFIRMED evidence row', async () => {
    const broadcastEvidence = evidenceRow('BROADCAST', { txid: 'b'.repeat(64), vout: 2, scriptPubKey: 'cafe', amount: new Prisma.Decimal('0.00004') })
    const evidenceRepo = fakeEvidenceRepo({ listForObligation: jest.fn().mockResolvedValue([broadcastEvidence]) })
    const obligationRepo = fakeObligationRepo({ findById: jest.fn().mockResolvedValue({ id: 'obligation-1', collectionStatus: 'IN_PROGRESS' }) })
    const obligationService = new FeeObligationService(obligationRepo)
    const distributionPolicyService = fakeDistributionPolicyService({
      findLivePolicy: jest.fn().mockResolvedValue({ id: 'dpv-live-1' }),
    })
    const service = new FeeCollectionRecognitionService(obligationRepo, evidenceRepo, obligationService, distributionPolicyService, fakeRunInTransaction)

    await service.recognizeConfirmation('obligation-1', 'b'.repeat(64), 800_000)

    expect(distributionPolicyService.findLivePolicy).toHaveBeenCalledTimes(1)
    expect(evidenceRepo.record).toHaveBeenCalledWith(expect.objectContaining({ distributionPolicyVersionId: 'dpv-live-1' }), undefined)
  })

  it('freezes null when zero DistributionPolicyVersion is currently PUBLISHED — a real, permanent outcome, never a placeholder', async () => {
    const broadcastEvidence = evidenceRow('BROADCAST', { txid: 'b'.repeat(64), vout: 2, scriptPubKey: 'cafe', amount: new Prisma.Decimal('0.00004') })
    const evidenceRepo = fakeEvidenceRepo({ listForObligation: jest.fn().mockResolvedValue([broadcastEvidence]) })
    const obligationRepo = fakeObligationRepo({ findById: jest.fn().mockResolvedValue({ id: 'obligation-1', collectionStatus: 'IN_PROGRESS' }) })
    const obligationService = new FeeObligationService(obligationRepo)
    const distributionPolicyService = fakeDistributionPolicyService({ findLivePolicy: jest.fn().mockResolvedValue(null) })
    const service = new FeeCollectionRecognitionService(obligationRepo, evidenceRepo, obligationService, distributionPolicyService, fakeRunInTransaction)

    await service.recognizeConfirmation('obligation-1', 'b'.repeat(64), 800_000)

    expect(evidenceRepo.record).toHaveBeenCalledWith(expect.objectContaining({ distributionPolicyVersionId: null }), undefined)
  })

  it('refuses to recognize a confirmation for an obligation that is not IN_PROGRESS', async () => {
    const obligationRepo = fakeObligationRepo({ findById: jest.fn().mockResolvedValue({ id: 'obligation-1', collectionStatus: 'PENDING_COLLECTION' }) })
    const evidenceRepo = fakeEvidenceRepo()
    const service = new FeeCollectionRecognitionService(obligationRepo, evidenceRepo, new FeeObligationService(obligationRepo), fakeDistributionPolicyService(), fakeRunInTransaction)

    await expect(service.recognizeConfirmation('obligation-1', 'c'.repeat(64), 1)).rejects.toThrow(/is not IN_PROGRESS/)
    expect(evidenceRepo.record).not.toHaveBeenCalled()
  })

  it('refuses to recognize a confirmation whose txid does not match the recorded BROADCAST evidence — never trusts the caller on faith', async () => {
    const broadcastEvidence = evidenceRow('BROADCAST', { txid: 'd'.repeat(64) })
    const obligationRepo = fakeObligationRepo({ findById: jest.fn().mockResolvedValue({ id: 'obligation-1', collectionStatus: 'IN_PROGRESS' }) })
    const evidenceRepo = fakeEvidenceRepo({ listForObligation: jest.fn().mockResolvedValue([broadcastEvidence]) })
    const service = new FeeCollectionRecognitionService(obligationRepo, evidenceRepo, new FeeObligationService(obligationRepo), fakeDistributionPolicyService(), fakeRunInTransaction)

    await expect(service.recognizeConfirmation('obligation-1', 'e'.repeat(64), 1)).rejects.toThrow(/does not match this obligation's own recorded BROADCAST evidence/)
    expect(obligationRepo.claimCollectionStatusTransition).not.toHaveBeenCalled()
  })

  it('refuses when no obligation is found', async () => {
    const obligationRepo = fakeObligationRepo({ findById: jest.fn().mockResolvedValue(null) })
    const evidenceRepo = fakeEvidenceRepo()
    const service = new FeeCollectionRecognitionService(obligationRepo, evidenceRepo, new FeeObligationService(obligationRepo), fakeDistributionPolicyService(), fakeRunInTransaction)

    await expect(service.recognizeConfirmation('does-not-exist', 'f'.repeat(64), 1)).rejects.toThrow(/not found/)
  })
})

describe('FeeCollectionRecognitionService — §8 replacement/dropped/reorg', () => {
  it('records a REPLACED evidence row referencing the new txid, without touching collectionStatus', async () => {
    const obligationRepo = fakeObligationRepo()
    const evidenceRepo = fakeEvidenceRepo()
    const service = new FeeCollectionRecognitionService(obligationRepo, evidenceRepo, new FeeObligationService(obligationRepo))

    await service.recordReplacement('obligation-1', 'old'.repeat(20).slice(0, 64), 'new'.repeat(20).slice(0, 64))

    expect(evidenceRepo.record).toHaveBeenCalledWith(expect.objectContaining({ kind: 'REPLACED', txid: 'old'.repeat(20).slice(0, 64) }))
    expect(obligationRepo.claimCollectionStatusTransition).not.toHaveBeenCalled()
  })

  it('records a DROPPED evidence row without itself reverting status', async () => {
    const obligationRepo = fakeObligationRepo()
    const evidenceRepo = fakeEvidenceRepo()
    const service = new FeeCollectionRecognitionService(obligationRepo, evidenceRepo, new FeeObligationService(obligationRepo))

    await service.recordDropped('obligation-1', 'g'.repeat(64), 'no longer in mempool')

    expect(evidenceRepo.record).toHaveBeenCalledWith(expect.objectContaining({ kind: 'DROPPED', txid: 'g'.repeat(64), note: 'no longer in mempool' }))
    expect(obligationRepo.claimCollectionStatusTransition).not.toHaveBeenCalled()
  })

  it('reverts COLLECTED -> IN_PROGRESS on a reorg (Fase 2.1\'s own design principle)', async () => {
    const obligationRepo = fakeObligationRepo({ findById: jest.fn().mockResolvedValue({ id: 'obligation-1', collectionStatus: 'COLLECTED' }) })
    const evidenceRepo = fakeEvidenceRepo()
    const service = new FeeCollectionRecognitionService(obligationRepo, evidenceRepo, new FeeObligationService(obligationRepo))

    const result = await service.recordReorgAndRevert('obligation-1', 'h'.repeat(64))

    expect(result.reverted).toBe(true)
    expect(evidenceRepo.record).toHaveBeenCalledWith(expect.objectContaining({ kind: 'REORGED_OUT', txid: 'h'.repeat(64) }))
    expect(obligationRepo.claimCollectionStatusTransition).toHaveBeenCalledWith('obligation-1', 'COLLECTED', 'IN_PROGRESS')
  })

  it('refuses to auto-revert an already-DISTRIBUTED obligation — surfaces as an exceptional condition instead', async () => {
    const obligationRepo = fakeObligationRepo({ findById: jest.fn().mockResolvedValue({ id: 'obligation-1', collectionStatus: 'DISTRIBUTED' }) })
    const evidenceRepo = fakeEvidenceRepo()
    const service = new FeeCollectionRecognitionService(obligationRepo, evidenceRepo, new FeeObligationService(obligationRepo))

    const result = await service.recordReorgAndRevert('obligation-1', 'i'.repeat(64))

    expect(result.reverted).toBe(false)
    expect(evidenceRepo.record).toHaveBeenCalledWith(expect.objectContaining({ kind: 'REORGED_OUT' })) // still recorded for the forensic trail
    expect(obligationRepo.claimCollectionStatusTransition).not.toHaveBeenCalled() // never improvised
  })

  it('records reorg evidence but reverts nothing for an obligation not yet COLLECTED', async () => {
    const obligationRepo = fakeObligationRepo({ findById: jest.fn().mockResolvedValue({ id: 'obligation-1', collectionStatus: 'IN_PROGRESS' }) })
    const evidenceRepo = fakeEvidenceRepo()
    const service = new FeeCollectionRecognitionService(obligationRepo, evidenceRepo, new FeeObligationService(obligationRepo))

    const result = await service.recordReorgAndRevert('obligation-1', 'j'.repeat(64))

    expect(result.reverted).toBe(false)
    expect(obligationRepo.claimCollectionStatusTransition).not.toHaveBeenCalled()
  })
})
