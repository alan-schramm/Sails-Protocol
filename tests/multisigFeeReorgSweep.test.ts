// tests/multisigFeeReorgSweep.test.ts
//
// Missão 11 Fase 8.1 LB-08 — sweepMultisigFeeReorgs() unit-level proof.
// The revert/flag decision itself (recordReorgAndRevert()) already had
// coverage before this file (feeCollectionRecognitionService.test.ts) —
// this file proves the DETECTION half: which obligations get re-checked,
// which are skipped as buried deep enough, and that the real chain
// (never the recorded evidence row) decides whether a reorg happened.
// Mocked Prisma + mocked explorer fetch, no real database or network.

jest.mock('../src/config', () => ({
  config: {
    trade: { multisigReorgSafetyWindowBlocks: 100 },
    multisig: { explorerApiUrl: 'https://mempool.space/testnet/api' },
  },
}))

const mockFeeObligationFindMany = jest.fn()
jest.mock('../src/common/database', () => ({
  prisma: { feeObligation: { findMany: (...args: unknown[]) => mockFeeObligationFindMany(...args) } },
}))

const mockRecordReorgAndRevert = jest.fn()
jest.mock('../src/modules/open-settlement/fee-collection-recognition.service', () => ({
  feeCollectionRecognitionService: { recordReorgAndRevert: (...args: unknown[]) => mockRecordReorgAndRevert(...args) },
}))

const mockListForObligation = jest.fn()
jest.mock('../src/modules/open-settlement/fee-collection-evidence-repository', () => ({
  feeCollectionEvidenceRepository: { listForObligation: (...args: unknown[]) => mockListForObligation(...args) },
}))

const fetchMock = jest.fn()

import { sweepMultisigFeeReorgs } from '../src/modules/open-settlement/multisig-fee-reorg-sweep'

function obligationFixture(overrides: Record<string, any> = {}) {
  return { id: 'obligation-1', escrowId: 'escrow-1', collectionStatus: 'COLLECTED', ...overrides }
}

function confirmedEvidence(overrides: Record<string, any> = {}) {
  return { kind: 'CONFIRMED', txid: 'a'.repeat(64), confirmedAtHeight: 800_000, recordedAt: new Date(), ...overrides }
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(global as any).fetch = fetchMock
  mockRecordReorgAndRevert.mockResolvedValue({ reverted: true })
})

function mockChain({ tipHeight, statusFor }: { tipHeight: number; statusFor?: Record<string, boolean> }) {
  fetchMock.mockImplementation((url: string) => {
    if (url.includes('/blocks/tip/height')) return Promise.resolve({ ok: true, text: async () => String(tipHeight) })
    if (url.includes('/status')) {
      const txid = url.split('/tx/')[1]?.split('/status')[0]
      const confirmed = statusFor?.[txid ?? ''] ?? true
      return Promise.resolve({ ok: true, json: async () => ({ confirmed, block_height: confirmed ? 800_000 : undefined }) })
    }
    return Promise.resolve({ ok: true, json: async () => [] })
  })
}

describe('sweepMultisigFeeReorgs() — Missão 11 Fase 8.1 LB-08', () => {
  it('a still-confirmed obligation within the safety window is re-checked and left alone', async () => {
    mockFeeObligationFindMany.mockResolvedValue([obligationFixture()])
    mockListForObligation.mockResolvedValue([confirmedEvidence()])
    mockChain({ tipHeight: 800_010, statusFor: { ['a'.repeat(64)]: true } })

    const result = await sweepMultisigFeeReorgs()

    expect(result.stillGood).toEqual(['obligation-1'])
    expect(result.reverted).toEqual([])
    expect(mockRecordReorgAndRevert).not.toHaveBeenCalled()
  })

  it('a COLLECTED obligation whose confirming txid is no longer confirmed gets reverted via the pre-existing recordReorgAndRevert()', async () => {
    mockFeeObligationFindMany.mockResolvedValue([obligationFixture({ collectionStatus: 'COLLECTED' })])
    mockListForObligation.mockResolvedValue([confirmedEvidence()])
    mockChain({ tipHeight: 800_010, statusFor: { ['a'.repeat(64)]: false } })
    mockRecordReorgAndRevert.mockResolvedValue({ reverted: true })

    const result = await sweepMultisigFeeReorgs()

    expect(mockRecordReorgAndRevert).toHaveBeenCalledWith('obligation-1', 'a'.repeat(64))
    expect(result.reverted).toEqual(['obligation-1'])
    expect(result.flaggedDistributed).toEqual([])
  })

  it('a DISTRIBUTED obligation whose confirming txid disappears is flagged, not reverted — recordReorgAndRevert()\'s own pre-existing refusal', async () => {
    mockFeeObligationFindMany.mockResolvedValue([obligationFixture({ collectionStatus: 'DISTRIBUTED' })])
    mockListForObligation.mockResolvedValue([confirmedEvidence()])
    mockChain({ tipHeight: 800_010, statusFor: { ['a'.repeat(64)]: false } })
    mockRecordReorgAndRevert.mockResolvedValue({ reverted: false })

    const result = await sweepMultisigFeeReorgs()

    expect(mockRecordReorgAndRevert).toHaveBeenCalledWith('obligation-1', 'a'.repeat(64))
    expect(result.flaggedDistributed).toEqual(['obligation-1'])
    expect(result.reverted).toEqual([])
  })

  it('an obligation buried deeper than the safety window is skipped entirely — no explorer call for its own status', async () => {
    mockFeeObligationFindMany.mockResolvedValue([obligationFixture()])
    mockListForObligation.mockResolvedValue([confirmedEvidence({ confirmedAtHeight: 700_000 })]) // 100_011 confirmations deep
    mockChain({ tipHeight: 800_010 })

    const result = await sweepMultisigFeeReorgs()

    expect(result.buriedEnough).toEqual(['obligation-1'])
    expect(mockRecordReorgAndRevert).not.toHaveBeenCalled()
    // Only the one tip-height call was made — never a /status call for this buried obligation.
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('does not fetch the chain tip at all when there is nothing to re-check', async () => {
    mockFeeObligationFindMany.mockResolvedValue([])

    const result = await sweepMultisigFeeReorgs()

    expect(result.stillGood).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('flags (fails) an obligation with no usable CONFIRMED evidence rather than guessing', async () => {
    mockFeeObligationFindMany.mockResolvedValue([obligationFixture()])
    mockListForObligation.mockResolvedValue([]) // no CONFIRMED evidence — should never happen, but must not crash silently
    mockChain({ tipHeight: 800_010 })

    const result = await sweepMultisigFeeReorgs()

    expect(result.failed).toHaveLength(1)
    expect(result.failed[0].error).toMatch(/no usable CONFIRMED evidence/)
  })
})
