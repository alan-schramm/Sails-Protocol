// tests/multisigFeeConfirmationJob.test.ts
//
// Missão 11 Fase 5 §7/§15 (C/D/G/H) — sweepMultisigFeeConfirmations()
// unit-level proof: confirmation below/at threshold, re-verification
// against the REAL chain (never the recorded evidence row on faith),
// non-MULTISIG obligations skipped. Mocked Prisma + mocked explorer
// fetch, no real database or network.

import { Prisma } from '@prisma/client'

const mockFeeObligationFindMany = jest.fn()
jest.mock('../src/common/database', () => ({
  prisma: { feeObligation: { findMany: (...args: unknown[]) => mockFeeObligationFindMany(...args) } },
}))

const mockRecognizeConfirmation = jest.fn().mockResolvedValue(undefined)
jest.mock('../src/modules/open-settlement/fee-collection-recognition.service', () => ({
  feeCollectionRecognitionService: { recognizeConfirmation: (...args: unknown[]) => mockRecognizeConfirmation(...args) },
}))

const mockListForObligation = jest.fn()
jest.mock('../src/modules/open-settlement/fee-collection-evidence-repository', () => ({
  feeCollectionEvidenceRepository: { listForObligation: (...args: unknown[]) => mockListForObligation(...args) },
}))

const fetchMock = jest.fn()

import { sweepMultisigFeeConfirmations } from '../src/modules/open-settlement/multisig-fee-confirmation-job'

function obligationFixture(overrides: Record<string, any> = {}) {
  return {
    id: 'obligation-1',
    escrowId: 'escrow-1',
    escrow: { id: 'escrow-1', type: 'MULTISIG', ...overrides.escrow },
    feePolicyVersion: { id: 'policy-1', requiredConfirmations: 2, ...overrides.feePolicyVersion },
    ...overrides,
  }
}

function broadcastEvidence(overrides: Record<string, any> = {}) {
  return {
    kind: 'BROADCAST',
    txid: 'a'.repeat(64),
    vout: 1,
    scriptPubKey: 'deadbeef',
    amount: new Prisma.Decimal('0.00004'), // 4,000 sats
    recordedAt: new Date(),
    ...overrides,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(global as any).fetch = fetchMock
})

function mockChain({ confirmed, blockHeight, tipHeight, outputs }: { confirmed: boolean; blockHeight: number | null; tipHeight?: number; outputs?: Array<{ scriptpubkey: string; value: number }> }) {
  fetchMock.mockImplementation((url: string) => {
    if (url.includes('/status')) {
      return Promise.resolve({ ok: true, json: async () => ({ confirmed, block_height: blockHeight ?? undefined }) })
    }
    if (url.includes('/blocks/tip/height')) {
      return Promise.resolve({ ok: true, text: async () => String(tipHeight ?? 0) })
    }
    return Promise.resolve({ ok: true, json: async () => ({ vout: outputs ?? [] }) })
  })
}

describe('sweepMultisigFeeConfirmations() — §7/§15 C/D/G/H', () => {
  it('C: confirmation below the required threshold leaves the obligation stillPending, never recognized', async () => {
    mockFeeObligationFindMany.mockResolvedValue([obligationFixture()])
    mockListForObligation.mockResolvedValue([broadcastEvidence()])
    mockChain({ confirmed: true, blockHeight: 800_000, tipHeight: 800_000 }) // 1 confirmation, requires 2

    const result = await sweepMultisigFeeConfirmations()

    expect(result.stillPending).toEqual(['obligation-1'])
    expect(result.collected).toEqual([])
    expect(mockRecognizeConfirmation).not.toHaveBeenCalled()
  })

  it('D: confirmation threshold reached, re-verification passes -> recognized as COLLECTED', async () => {
    mockFeeObligationFindMany.mockResolvedValue([obligationFixture()])
    mockListForObligation.mockResolvedValue([broadcastEvidence()])
    mockChain({
      confirmed: true, blockHeight: 800_000, tipHeight: 800_001, // 2 confirmations, requires 2
      outputs: [{ scriptpubkey: 'not-the-fee-output', value: 1 }, { scriptpubkey: 'deadbeef', value: 4_000 }],
    })

    const result = await sweepMultisigFeeConfirmations()

    expect(result.collected).toEqual(['obligation-1'])
    expect(mockRecognizeConfirmation).toHaveBeenCalledWith('obligation-1', 'a'.repeat(64), 800_000)
  })

  it('unconfirmed transaction leaves the obligation stillPending', async () => {
    mockFeeObligationFindMany.mockResolvedValue([obligationFixture()])
    mockListForObligation.mockResolvedValue([broadcastEvidence()])
    mockChain({ confirmed: false, blockHeight: null })

    const result = await sweepMultisigFeeConfirmations()

    expect(result.stillPending).toEqual(['obligation-1'])
    expect(mockRecognizeConfirmation).not.toHaveBeenCalled()
  })

  it('G/H: re-verification failure (real chain output does not match recorded evidence) fails the sweep for that obligation, never recognizes it', async () => {
    mockFeeObligationFindMany.mockResolvedValue([obligationFixture()])
    mockListForObligation.mockResolvedValue([broadcastEvidence()]) // expects vout 1, scriptPubKey deadbeef, 4000 sats
    mockChain({
      confirmed: true, blockHeight: 800_000, tipHeight: 800_001,
      outputs: [{ scriptpubkey: 'irrelevant', value: 1 }, { scriptpubkey: 'a-different-script', value: 4_000 }], // wrong script at vout 1
    })

    const result = await sweepMultisigFeeConfirmations()

    expect(result.failed).toHaveLength(1)
    expect(result.failed[0].feeObligationId).toBe('obligation-1')
    expect(mockRecognizeConfirmation).not.toHaveBeenCalled()
  })

  it('G: an amount mismatch at re-verification also fails closed', async () => {
    mockFeeObligationFindMany.mockResolvedValue([obligationFixture()])
    mockListForObligation.mockResolvedValue([broadcastEvidence()])
    mockChain({
      confirmed: true, blockHeight: 800_000, tipHeight: 800_001,
      outputs: [{ scriptpubkey: 'irrelevant', value: 1 }, { scriptpubkey: 'deadbeef', value: 3_999 }], // right script, wrong amount
    })

    const result = await sweepMultisigFeeConfirmations()

    expect(result.failed).toHaveLength(1)
    expect(mockRecognizeConfirmation).not.toHaveBeenCalled()
  })

  it('skips a non-MULTISIG obligation entirely — this job is rail-specific by design', async () => {
    mockFeeObligationFindMany.mockResolvedValue([obligationFixture({ escrow: { type: 'WDK_USDT_EVM' } })])

    const result = await sweepMultisigFeeConfirmations()

    expect(result.collected).toEqual([])
    expect(result.stillPending).toEqual([])
    expect(result.failed).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('flags (fails) an obligation with no usable BROADCAST evidence rather than guessing', async () => {
    mockFeeObligationFindMany.mockResolvedValue([obligationFixture()])
    mockListForObligation.mockResolvedValue([]) // no evidence at all — should never happen, but must not crash silently

    const result = await sweepMultisigFeeConfirmations()

    expect(result.failed).toHaveLength(1)
    expect(result.failed[0].error).toMatch(/no usable BROADCAST evidence/)
  })

  it('flags an obligation whose FeePolicyVersion has no valid requiredConfirmations', async () => {
    mockFeeObligationFindMany.mockResolvedValue([obligationFixture({ feePolicyVersion: { requiredConfirmations: null } })])
    mockListForObligation.mockResolvedValue([broadcastEvidence()])

    const result = await sweepMultisigFeeConfirmations()

    expect(result.failed).toHaveLength(1)
    expect(result.failed[0].error).toMatch(/no valid requiredConfirmations/)
  })
})
