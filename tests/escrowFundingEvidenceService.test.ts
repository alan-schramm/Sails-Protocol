// tests/escrowFundingEvidenceService.test.ts
//
// Missão 11 Fase 9.1 §1/§2 — EscrowFundingEvidenceService.isFundingUncertain()
// unit-level proof of the "last row decides" state machine. Fake
// repository, no real database.

import { EscrowFundingEvidenceService } from '../src/modules/open-settlement/escrow-funding-evidence.service'
import type { EscrowFundingEvidenceRepository } from '../src/modules/open-settlement/escrow-funding-evidence-repository'

function row(kind: string, overrides: Record<string, any> = {}) {
  return { id: 'ev-1', escrowId: 'escrow-1', kind, txid: 'a'.repeat(64), vout: 0, recordedAt: new Date(), ...overrides } as any
}

function fakeRepo(rows: any[]): EscrowFundingEvidenceRepository {
  return {
    record: jest.fn(),
    listForEscrow: jest.fn().mockResolvedValue(rows),
  }
}

describe('EscrowFundingEvidenceService.isFundingUncertain() — Missão 11 Fase 9.1', () => {
  it('an escrow with no recorded evidence at all is trusted (preserves existing behavior for the common case)', async () => {
    const service = new EscrowFundingEvidenceService(fakeRepo([]))
    expect(await service.isFundingUncertain('escrow-1')).toBe(false)
  })

  it('OBSERVED_CONFIRMED as the only/last row is trustworthy', async () => {
    const service = new EscrowFundingEvidenceService(fakeRepo([row('OBSERVED_CONFIRMED')]))
    expect(await service.isFundingUncertain('escrow-1')).toBe(false)
  })

  it('REORGED_INVALIDATED as the last row is uncertain', async () => {
    const service = new EscrowFundingEvidenceService(fakeRepo([row('OBSERVED_CONFIRMED'), row('REORGED_INVALIDATED')]))
    expect(await service.isFundingUncertain('escrow-1')).toBe(true)
  })

  it('RECONFIRMED after a REORGED_INVALIDATED clears uncertainty again — the historical invalidation row is never deleted, only superseded by a later row', async () => {
    const service = new EscrowFundingEvidenceService(fakeRepo([
      row('OBSERVED_CONFIRMED'), row('REORGED_INVALIDATED'), row('RECONFIRMED'),
    ]))
    expect(await service.isFundingUncertain('escrow-1')).toBe(false)
  })

  it('REPLACEMENT_OBSERVED as the last row is uncertain — a new candidate is never auto-trusted on first sight', async () => {
    const service = new EscrowFundingEvidenceService(fakeRepo([
      row('OBSERVED_CONFIRMED'), row('REORGED_INVALIDATED'), row('REPLACEMENT_OBSERVED'),
    ]))
    expect(await service.isFundingUncertain('escrow-1')).toBe(true)
  })

  it('AMBIGUOUS as the last row is uncertain', async () => {
    const service = new EscrowFundingEvidenceService(fakeRepo([row('OBSERVED_CONFIRMED'), row('AMBIGUOUS')]))
    expect(await service.isFundingUncertain('escrow-1')).toBe(true)
  })

  it('a second, later reorg after a reconfirmation is uncertain again — history keeps accumulating, never collapses to a single mutable field', async () => {
    const service = new EscrowFundingEvidenceService(fakeRepo([
      row('OBSERVED_CONFIRMED'), row('REORGED_INVALIDATED'), row('RECONFIRMED'), row('REORGED_INVALIDATED'),
    ]))
    expect(await service.isFundingUncertain('escrow-1')).toBe(true)
  })
})
