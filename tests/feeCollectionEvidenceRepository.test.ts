/**
 * fee-collection-evidence-repository.ts — Missão 11 Fase 2.2 economic
 * accounting foundation. Test M: evidence is append-only.
 *
 * Two independent proofs:
 *   1. Compile-time — the FeeCollectionEvidenceRepository interface has no
 *      update()/delete() member at all (TypeScript would reject an attempt
 *      to call one; asserted here via a runtime `in` check on the real
 *      exported singleton, which is as close to "prove the interface shape"
 *      as a Jest test can get without a separate type-only test file).
 *   2. Runtime — two record() calls for the same feeObligationId hit
 *      prisma.feeCollectionEvidence.create() twice, never .update()/.upsert(),
 *      producing two independent rows rather than mutating one.
 */
import { feeCollectionEvidenceRepository } from '../src/modules/open-settlement/fee-collection-evidence-repository'

jest.mock('../src/common/database', () => ({
  prisma: {
    feeCollectionEvidence: {
      create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: `evidence-${Math.random()}`, recordedAt: new Date(), ...data })),
      findMany: jest.fn().mockResolvedValue([]),
      update: undefined,
      upsert: undefined,
      delete: undefined,
    },
  },
}))

import { prisma } from '../src/common/database'

describe('FeeCollectionEvidenceRepository — append-only (Test M)', () => {
  it('exposes no update/delete method on the repository interface itself', () => {
    expect('update' in feeCollectionEvidenceRepository).toBe(false)
    expect('delete' in feeCollectionEvidenceRepository).toBe(false)
    expect('upsert' in feeCollectionEvidenceRepository).toBe(false)
  })

  it('records a BROADCAST then a REORGED_OUT correction as two separate rows, never mutating the first', async () => {
    const broadcast = await feeCollectionEvidenceRepository.record({
      feeObligationId: 'ob-1',
      kind: 'BROADCAST',
      txid: 'aaaa',
      vout: 0,
    })
    const reorg = await feeCollectionEvidenceRepository.record({
      feeObligationId: 'ob-1',
      kind: 'REORGED_OUT',
      txid: 'aaaa',
      vout: 0,
      note: 'block containing this tx was reorged out',
    })

    expect((prisma as any).feeCollectionEvidence.create).toHaveBeenCalledTimes(2)
    expect(broadcast.id).not.toEqual(reorg.id)
    expect(broadcast.kind).toBe('BROADCAST')
    expect(reorg.kind).toBe('REORGED_OUT')
  })
})
