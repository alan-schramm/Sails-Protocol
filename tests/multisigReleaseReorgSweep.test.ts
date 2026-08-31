// tests/multisigReleaseReorgSweep.test.ts
//
// Sails Core Implementation Program M9-F (Release-Leg Finality & Reorg
// Closure) — sweepMultisigReleaseReorgs() unit-level proof, mirroring
// tests/multisigFeeReorgSweep.test.ts's own established pattern: mocked
// Prisma + mocked explorer fetch, no real database or network. Proves
// the DETECTION/CLASSIFICATION logic (Worlds A-E) and that the real
// chain — never a cached evidence row — decides the outcome.

jest.mock('../src/config', () => ({
  config: {
    trade: { multisigReorgSafetyWindowBlocks: 100 },
    multisig: { explorerApiUrl: 'https://mempool.space/testnet/api' },
  },
}))

const mockEscrowFindMany = jest.fn()
jest.mock('../src/common/database', () => ({
  prisma: { escrow: { findMany: (...args: unknown[]) => mockEscrowFindMany(...args) } },
}))

const mockRecord = jest.fn()
const mockListForEscrow = jest.fn()
jest.mock('../src/modules/open-settlement/escrow-release-evidence-repository', () => ({
  escrowReleaseEvidenceRepository: {
    record: (...args: unknown[]) => mockRecord(...args),
    listForEscrow: (...args: unknown[]) => mockListForEscrow(...args),
  },
}))

const fetchMock = jest.fn()

import { sweepMultisigReleaseReorgs } from '../src/modules/open-settlement/multisig-release-reorg-sweep'

const TXID = 'a'.repeat(64)
const CONFLICT_TXID = 'c'.repeat(64)

function escrowFixture(overrides: Record<string, any> = {}) {
  return {
    id: 'escrow-1', type: 'MULTISIG', status: 'COMPLETED', txReleaseId: TXID,
    txLockId: 'f'.repeat(64), txLockVout: 0,
    ...overrides,
  }
}

function confirmedEvidence(overrides: Record<string, any> = {}) {
  return { kind: 'OBSERVED_CONFIRMED', txid: TXID, observedAtHeight: 800_000, recordedAt: new Date(), ...overrides }
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(global as any).fetch = fetchMock
  mockListForEscrow.mockResolvedValue([])
  mockRecord.mockResolvedValue({})
})

// Two DISTINCT chain-truth primitives (fetchTransactionExistence,
// fetchTransactionConfirmationStatus) hit the IDENTICAL `/tx/:txid/status`
// URL — the sweep calls the first, then (only for a genuinely NEW
// baseline/RECONFIRMED observation) the second, in that fixed order. A
// stateless URL-keyed mock cannot tell them apart; a small call-order
// queue can.
function mockChain({
  tipHeight,
  existence,
  confirmedStatus,
  outspend,
}: {
  tipHeight: number
  existence?: { exists: boolean; confirmed: boolean }
  confirmedStatus?: { confirmed: boolean; block_height?: number }
  outspend?: { spent: boolean; txid?: string }
}) {
  const statusResponses: any[] = []
  if (existence) {
    statusResponses.push(existence.exists ? { ok: true, json: async () => ({ confirmed: existence.confirmed }) } : { status: 404, ok: false })
  }
  statusResponses.push({ ok: true, json: async () => (confirmedStatus ?? { confirmed: true, block_height: 800_000 }) })
  let statusCallCount = 0

  fetchMock.mockImplementation((url: string) => {
    if (url.includes('/blocks/tip/height')) return Promise.resolve({ ok: true, text: async () => String(tipHeight) })
    if (url.includes('/outspend/')) {
      return Promise.resolve({ ok: true, json: async () => (outspend ?? { spent: false }) })
    }
    if (url.includes('/status')) {
      const response = statusResponses[Math.min(statusCallCount, statusResponses.length - 1)]
      statusCallCount += 1
      return Promise.resolve(response)
    }
    return Promise.resolve({ ok: true, json: async () => ({}) })
  })
}

describe('sweepMultisigReleaseReorgs() — Sails M9-F, C18 closure', () => {
  it('no candidates — a clean, empty result, no explorer call at all', async () => {
    mockEscrowFindMany.mockResolvedValue([])
    const result = await sweepMultisigReleaseReorgs()
    expect(result.observedBaseline).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('World A, first-ever observation: canonical + confirmed, no prior baseline — records OBSERVED_CONFIRMED', async () => {
    mockEscrowFindMany.mockResolvedValue([escrowFixture()])
    mockListForEscrow.mockResolvedValue([])
    mockChain({ tipHeight: 800_010, existence: { exists: true, confirmed: true }, confirmedStatus: { confirmed: true, block_height: 800_000 } })

    const result = await sweepMultisigReleaseReorgs()

    expect(result.observedBaseline).toEqual(['escrow-1'])
    expect(mockRecord).toHaveBeenCalledWith(expect.objectContaining({ escrowId: 'escrow-1', kind: 'OBSERVED_CONFIRMED', txid: TXID, observedAtHeight: 800_000 }))
  })

  it('World A, trustworthy baseline already recorded and still within the safety window — left alone, no new evidence written', async () => {
    mockEscrowFindMany.mockResolvedValue([escrowFixture()])
    mockListForEscrow.mockResolvedValue([confirmedEvidence()])
    mockChain({ tipHeight: 800_010, existence: { exists: true, confirmed: true } })

    const result = await sweepMultisigReleaseReorgs()

    expect(result.stillGood).toEqual(['escrow-1'])
    expect(mockRecord).not.toHaveBeenCalled()
  })

  it('World A after a prior REORGED_INVALIDATED — the same txid confirmed again records RECONFIRMED, never silently overwriting the old row', async () => {
    mockEscrowFindMany.mockResolvedValue([escrowFixture()])
    mockListForEscrow.mockResolvedValue([confirmedEvidence(), { kind: 'REORGED_INVALIDATED', txid: TXID, observedAtHeight: null, recordedAt: new Date() }])
    mockChain({ tipHeight: 800_010, existence: { exists: true, confirmed: true }, confirmedStatus: { confirmed: true, block_height: 800_005 } })

    const result = await sweepMultisigReleaseReorgs()

    expect(result.reconfirmed).toEqual(['escrow-1'])
    expect(mockRecord).toHaveBeenCalledWith(expect.objectContaining({ kind: 'RECONFIRMED', txid: TXID }))
  })

  it('World B: mempool-only (exists but not confirmed) — waits, records nothing yet', async () => {
    mockEscrowFindMany.mockResolvedValue([escrowFixture()])
    mockListForEscrow.mockResolvedValue([])
    mockChain({ tipHeight: 800_010, existence: { exists: true, confirmed: false } })

    const result = await sweepMultisigReleaseReorgs()

    expect(result.stillPending).toEqual(['escrow-1'])
    expect(mockRecord).not.toHaveBeenCalled()
  })

  it('World C: T absent, funding outpoint unspent — records REORGED_INVALIDATED and flags manual review, never auto-rebroadcasts', async () => {
    mockEscrowFindMany.mockResolvedValue([escrowFixture()])
    mockListForEscrow.mockResolvedValue([confirmedEvidence()])
    mockChain({ tipHeight: 800_010, existence: { exists: false, confirmed: false }, outspend: { spent: false } })

    const result = await sweepMultisigReleaseReorgs()

    expect(result.requiresManualReview).toHaveLength(1)
    expect(result.requiresManualReview[0].escrowId).toBe('escrow-1')
    expect(mockRecord).toHaveBeenCalledWith(expect.objectContaining({ kind: 'REORGED_INVALIDATED', txid: TXID, note: expect.stringContaining('exact rebroadcast is not possible') }))
  })

  it('World D: T absent, funding outpoint spent by a DIFFERENT transaction — records AMBIGUOUS, fails closed, never reinterprets as success', async () => {
    mockEscrowFindMany.mockResolvedValue([escrowFixture()])
    mockListForEscrow.mockResolvedValue([confirmedEvidence()])
    mockChain({ tipHeight: 800_010, existence: { exists: false, confirmed: false }, outspend: { spent: true, txid: CONFLICT_TXID } })

    const result = await sweepMultisigReleaseReorgs()

    expect(result.requiresManualReview).toHaveLength(1)
    expect(mockRecord).toHaveBeenCalledWith(expect.objectContaining({ kind: 'AMBIGUOUS', txid: CONFLICT_TXID }))
  })

  it('explorer indexing lag: existence check 404s but outspend confirms the SAME txid actually spent it — converges without a spurious reorg record', async () => {
    mockEscrowFindMany.mockResolvedValue([escrowFixture()])
    mockListForEscrow.mockResolvedValue([confirmedEvidence()])
    mockChain({ tipHeight: 800_010, existence: { exists: false, confirmed: false }, outspend: { spent: true, txid: TXID } })

    const result = await sweepMultisigReleaseReorgs()

    expect(result.stillGood).toEqual(['escrow-1'])
    expect(result.requiresManualReview).toEqual([])
    expect(mockRecord).not.toHaveBeenCalled()
  })

  it('legacy escrow with no recorded funding vout — never guesses, fails closed as manual review, no outspend call attempted', async () => {
    mockEscrowFindMany.mockResolvedValue([escrowFixture({ txLockVout: null })])
    mockListForEscrow.mockResolvedValue([confirmedEvidence()])
    mockChain({ tipHeight: 800_010, existence: { exists: false, confirmed: false } })

    const result = await sweepMultisigReleaseReorgs()

    expect(result.requiresManualReview).toHaveLength(1)
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/outspend/'))
    expect(mockRecord).not.toHaveBeenCalled()
  })

  it('buried deep enough (past the safety window) — skipped entirely, only the tip-height call is made', async () => {
    mockEscrowFindMany.mockResolvedValue([escrowFixture()])
    mockListForEscrow.mockResolvedValue([confirmedEvidence({ observedAtHeight: 700_000 })]) // 100_011 deep
    mockChain({ tipHeight: 800_010 })

    const result = await sweepMultisigReleaseReorgs()

    expect(result.buriedEnough).toEqual(['escrow-1'])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('World E: explorer UNKNOWN (non-404 failure) — lands in failed, never coerced into "absent"', async () => {
    mockEscrowFindMany.mockResolvedValue([escrowFixture()])
    mockListForEscrow.mockResolvedValue([])
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/status')) return Promise.resolve({ status: 503, ok: false })
      return Promise.resolve({ ok: true, json: async () => ({}) })
    })

    const result = await sweepMultisigReleaseReorgs()

    expect(result.failed).toHaveLength(1)
    expect(result.requiresManualReview).toEqual([])
  })

  it('an escrow that throws mid-sweep lands in failed, not silently dropped — and does not stop the rest of the batch', async () => {
    mockEscrowFindMany.mockResolvedValue([escrowFixture({ id: 'escrow-broken' }), escrowFixture({ id: 'escrow-ok' })])
    mockListForEscrow.mockImplementation(async (escrowId: string) => (escrowId === 'escrow-broken' ? Promise.reject(new Error('DB unavailable')) : []))
    mockChain({ tipHeight: 800_010, existence: { exists: true, confirmed: true }, confirmedStatus: { confirmed: true, block_height: 800_000 } })

    const result = await sweepMultisigReleaseReorgs()

    expect(result.failed).toEqual([{ escrowId: 'escrow-broken', error: 'DB unavailable' }])
    expect(result.observedBaseline).toEqual(['escrow-ok'])
  })
})
