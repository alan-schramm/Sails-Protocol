/**
 * Issue #266 — Dispute.evidence <-> OpenProof cross-reference.
 *
 * Proves the additive `evidenceReferenceId` path on `EvidenceDescriptor`
 * (dispute.service.ts's `resolveEvidenceDescriptor()`, called by both
 * `raiseDispute()` and `submitEvidence()`): a caller-supplied
 * `evidenceReferenceId` is resolved/scope-checked server-side via
 * `proofService.assertEvidenceReferenceBelongsToTrade()` — mocked here
 * at the collaborator boundary (its own correctness is proven directly
 * in tests/proofService.test.ts) — before ever being persisted, and a
 * legacy raw/external descriptor is left completely untouched.
 *
 * `idempotencyKey` is omitted in every submitEvidence() call below —
 * `withIdempotency()`'s own no-key path (`common/idempotency.ts`) calls
 * straight through to persist()/postPersist() with no Redis/Prisma
 * idempotency-store dependency, so this file needs no mock for that.
 */
const mockDisputeFindUnique = jest.fn()
const mockDisputeCreate = jest.fn()
const mockDisputeUpdate = jest.fn()
const mockTradeFindUnique = jest.fn()
const mockEscrowParticipantKeyFindUnique = jest.fn()
const mockEmit = jest.fn().mockResolvedValue(undefined)
const mockOpenDispute = jest.fn().mockResolvedValue({})
const mockAssertEvidenceReferenceBelongsToTrade = jest.fn()

jest.mock('../src/common/database', () => ({
  prisma: {
    dispute: {
      findUnique: (...args: unknown[]) => mockDisputeFindUnique(...args),
      create: (...args: unknown[]) => mockDisputeCreate(...args),
      update: (...args: unknown[]) => mockDisputeUpdate(...args),
    },
    trade: { findUnique: (...args: unknown[]) => mockTradeFindUnique(...args) },
    escrowParticipantKey: { findUnique: (...args: unknown[]) => mockEscrowParticipantKeyFindUnique(...args) },
  },
}))
jest.mock('../src/common/events/event-bus', () => ({
  eventBus: { emit: (...args: unknown[]) => mockEmit(...args) },
}))
jest.mock('../src/modules/open-settlement/escrow.service', () => ({
  escrowService: { openDispute: (...args: unknown[]) => mockOpenDispute(...args) },
}))
jest.mock('../src/modules/open-proof/proof.service', () => ({
  proofService: {
    assertEvidenceReferenceBelongsToTrade: (...args: unknown[]) => mockAssertEvidenceReferenceBelongsToTrade(...args),
  },
}))

import { DisputeService } from '../src/modules/open-settlement/dispute.service'
import type { ArbitrationProvider } from '../src/modules/open-settlement/arbitration-provider'
import { NotFoundError, ForbiddenError } from '../src/common/errors'

function fakeArbitrationProvider(pick = 'arb-configured'): ArbitrationProvider {
  return { name: 'fake-provider', arbitrators: [pick], assign: jest.fn().mockResolvedValue(pick) }
}

const TRADE_1 = { id: 'trade-1', buyerId: 'buyer-1', sellerId: 'seller-1', escrowId: 'escrow-1' }

function seedDispute(overrides: Partial<{ id: string; tradeId: string; status: string; evidence: unknown }> = {}) {
  const dispute = {
    id: overrides.id ?? 'dispute-1',
    tradeId: overrides.tradeId ?? 'trade-1',
    escrowId: 'escrow-1',
    status: overrides.status ?? 'OPENED',
    evidence: overrides.evidence ?? [],
  }
  mockDisputeFindUnique.mockResolvedValue(dispute)
  mockDisputeUpdate.mockImplementation(async ({ data }: any) => ({ ...dispute, ...data }))
  return dispute
}

describe('DisputeService.submitEvidence() — OpenProof cross-reference (Issue #266)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockTradeFindUnique.mockResolvedValue(TRADE_1)
  })

  const service = new DisputeService(fakeArbitrationProvider())

  // Property 1 — historical raw descriptors still read correctly.
  // (Read/serialization is untouched by #266 — settlement.routes.ts's
  // GET /v1/settlement/disputes/:id returns prisma.dispute.findUnique()'s
  // row as-is. This proves the WRITE side of the legacy shape is also
  // completely unaffected: a raw {type, uri, note} descriptor persists
  // exactly as it always did, no OpenProof lookup ever attempted.)
  it('1/2 — a legacy raw/external descriptor (no evidenceReferenceId) persists unchanged, with no OpenProof lookup attempted', async () => {
    seedDispute()

    const result = await service.submitEvidence('dispute-1', 'buyer-1', { type: 'chat_log', uri: 'https://example.com/receipt.png', note: 'see attached' })

    expect(mockAssertEvidenceReferenceBelongsToTrade).not.toHaveBeenCalled()
    const persistedEvidence = mockDisputeUpdate.mock.calls[0][0].data.evidence
    expect(persistedEvidence[0]).toMatchObject({ type: 'chat_log', uri: 'https://example.com/receipt.png', note: 'see attached', submittedBy: 'buyer-1' })
    expect(persistedEvidence[0].evidenceReferenceId).toBeUndefined()
    expect(result.status).toBe('EVIDENCE_SUBMITTED')
  })

  // Property 3 — new file/media dispute evidence cannot be represented
  // as production-eligible by raw URI alone: a raw uri-only descriptor
  // is persisted, but never as an integrity-bound entry (no
  // evidenceReferenceId is fabricated for it) — proven by the assertion
  // above that `evidenceReferenceId` is absent from the persisted entry.

  // Property 4 — valid OpenProof cross-reference attaches successfully.
  it('4 — a valid evidenceReferenceId attaches successfully after being scope-checked against the dispute\'s own trade', async () => {
    seedDispute()
    mockAssertEvidenceReferenceBelongsToTrade.mockResolvedValue({ id: 'ref-1', provider: 's3', uri: 'key.bin', sha256: 'abc' })

    const result = await service.submitEvidence('dispute-1', 'buyer-1', { type: 'payment_receipt', evidenceReferenceId: 'ref-1' })

    expect(mockAssertEvidenceReferenceBelongsToTrade).toHaveBeenCalledWith('ref-1', 'trade-1')
    const persistedEvidence = mockDisputeUpdate.mock.calls[0][0].data.evidence
    expect(persistedEvidence[0]).toMatchObject({ type: 'payment_receipt', evidenceReferenceId: 'ref-1', submittedBy: 'buyer-1' })
    // Never a second copy of OpenProof's own facts — provider/uri/sha256
    // are NOT duplicated into the descriptor.
    expect(persistedEvidence[0].uri).toBeUndefined()
    expect(persistedEvidence[0].provider).toBeUndefined()
    expect(persistedEvidence[0].sha256).toBeUndefined()
    expect(result.status).toBe('EVIDENCE_SUBMITTED')
  })

  // Property 5 — nonexistent reference is rejected.
  it('5 — a nonexistent evidenceReferenceId is rejected (NotFoundError from the OpenProof layer), nothing persisted', async () => {
    seedDispute()
    mockAssertEvidenceReferenceBelongsToTrade.mockRejectedValue(new NotFoundError('EvidenceReference', 'nope'))

    await expect(
      service.submitEvidence('dispute-1', 'buyer-1', { type: 'payment_receipt', evidenceReferenceId: 'nope' })
    ).rejects.toThrow(NotFoundError)
    expect(mockDisputeUpdate).not.toHaveBeenCalled()
  })

  // Property 6 — reference from another trade/economic scope is rejected.
  it('6 — an evidenceReferenceId belonging to a DIFFERENT trade is rejected (ForbiddenError from the OpenProof layer), nothing persisted', async () => {
    seedDispute()
    mockAssertEvidenceReferenceBelongsToTrade.mockRejectedValue(
      new ForbiddenError('EvidenceReference ref-foreign does not belong to trade trade-1')
    )

    await expect(
      service.submitEvidence('dispute-1', 'buyer-1', { type: 'payment_receipt', evidenceReferenceId: 'ref-foreign' })
    ).rejects.toThrow(ForbiddenError)
    expect(mockDisputeUpdate).not.toHaveBeenCalled()
  })

  // Property 7 — unrelated authenticated participant is rejected.
  it('7 — an authenticated but unrelated participant cannot attach a cross-reference to someone else\'s dispute — rejected before ever resolving the reference', async () => {
    seedDispute()

    await expect(
      service.submitEvidence('dispute-1', 'outsider-1', { type: 'payment_receipt', evidenceReferenceId: 'ref-1' })
    ).rejects.toThrow(/is not a party to trade/)
    expect(mockAssertEvidenceReferenceBelongsToTrade).not.toHaveBeenCalled()
    expect(mockDisputeUpdate).not.toHaveBeenCalled()
  })

  // Property 8 — superseded arbiter cannot use stale authority.
  // Dispute-native evidence submission has always been buyer/seller-only
  // (never the assigned arbiter, current or historical) — #266 does not
  // change this authorization boundary, it only reuses it. An arbiter id
  // (even the CURRENTLY assigned one) is rejected exactly like any other
  // non-party.
  it('8 — neither a historical nor the currently assigned arbiter can attach a cross-reference — dispute-evidence placement has always been buyer/seller-only', async () => {
    seedDispute()

    await expect(
      service.submitEvidence('dispute-1', 'arbiter-current-or-historical', { type: 'payment_receipt', evidenceReferenceId: 'ref-1' })
    ).rejects.toThrow(/is not a party to trade/)
    expect(mockAssertEvidenceReferenceBelongsToTrade).not.toHaveBeenCalled()
  })

  // Property 9 — caller cannot forge hash/provider/URI through the
  // dispute cross-reference: a descriptor combining uri + evidenceReferenceId
  // is rejected outright, never silently resolved by preferring one over
  // the other.
  it('9 — a descriptor combining uri AND evidenceReferenceId is rejected outright — never silently resolved by preferring one', async () => {
    seedDispute()

    await expect(
      service.submitEvidence('dispute-1', 'buyer-1', { type: 'payment_receipt', uri: 'https://attacker.example/fake.png', evidenceReferenceId: 'ref-1' })
    ).rejects.toThrow(/cannot include both uri and evidenceReferenceId/)
    expect(mockAssertEvidenceReferenceBelongsToTrade).not.toHaveBeenCalled()
    expect(mockDisputeUpdate).not.toHaveBeenCalled()
  })

  // Property 12 — #265 provider/error semantics remain intact: this
  // service never catches/reclassifies EvidenceStorageError or any
  // #265-defined error — whatever proofService throws propagates as-is
  // (already proven by properties 5/6 above using the real NotFoundError/
  // ForbiddenError classes, not a locally re-invented error shape).
})

describe('DisputeService.raiseDispute() — OpenProof cross-reference applies at dispute-creation time too (Issue #266)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockTradeFindUnique.mockResolvedValue(TRADE_1)
    mockEscrowParticipantKeyFindUnique.mockResolvedValue(null)
    mockDisputeCreate.mockImplementation(async ({ data }: any) => ({ id: 'dispute-1', ...data }))
    mockDisputeUpdate.mockImplementation(async ({ data }: any) => ({ id: 'dispute-1', tradeId: 'trade-1', arbiterId: 'arb-configured', ...data }))
  })

  const service = new DisputeService(fakeArbitrationProvider())

  // This is the bypass this mission's own resolveEvidenceDescriptor()
  // comment names explicitly: a caller could otherwise skip
  // submitEvidence()'s own cross-reference validation entirely by
  // submitting the SAME forged/out-of-scope reference at dispute-open
  // time instead.
  it('rejects a forged/out-of-scope evidenceReferenceId submitted at dispute-creation time — the same guard as submitEvidence(), not bypassable via raiseDispute()', async () => {
    mockAssertEvidenceReferenceBelongsToTrade.mockRejectedValue(
      new ForbiddenError('EvidenceReference ref-foreign does not belong to trade trade-1')
    )

    await expect(
      service.raiseDispute('trade-1', 'buyer-1', 'payment never received', [{ type: 'payment_receipt', evidenceReferenceId: 'ref-foreign' }])
    ).rejects.toThrow(ForbiddenError)
    expect(mockOpenDispute).not.toHaveBeenCalled()
    expect(mockDisputeCreate).not.toHaveBeenCalled()
  })

  it('accepts a valid evidenceReferenceId at dispute-creation time, scope-checked against the trade being disputed', async () => {
    mockAssertEvidenceReferenceBelongsToTrade.mockResolvedValue({ id: 'ref-1' })

    const dispute = await service.raiseDispute('trade-1', 'buyer-1', 'payment never received', [{ type: 'payment_receipt', evidenceReferenceId: 'ref-1' }])

    expect(mockAssertEvidenceReferenceBelongsToTrade).toHaveBeenCalledWith('ref-1', 'trade-1')
    expect(dispute.id).toBe('dispute-1')
    const persistedEvidence = mockDisputeCreate.mock.calls[0][0].data.evidence
    expect(persistedEvidence[0]).toMatchObject({ type: 'payment_receipt', evidenceReferenceId: 'ref-1' })
  })

  it('leaves a legacy raw descriptor at dispute-creation time completely untouched — no OpenProof lookup, unchanged pass-through', async () => {
    const dispute = await service.raiseDispute('trade-1', 'buyer-1', 'payment never received', [{ type: 'chat_log', uri: 'https://example.com/x.png' }])

    expect(mockAssertEvidenceReferenceBelongsToTrade).not.toHaveBeenCalled()
    expect(dispute.id).toBe('dispute-1')
    const persistedEvidence = mockDisputeCreate.mock.calls[0][0].data.evidence
    expect(persistedEvidence[0]).toMatchObject({ type: 'chat_log', uri: 'https://example.com/x.png' })
  })
})
