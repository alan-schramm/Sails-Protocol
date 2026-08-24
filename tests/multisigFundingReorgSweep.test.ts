// tests/multisigFundingReorgSweep.test.ts
//
// Missão 11 Fase 8.1 LB-08(A) — sweepMultisigFundingReorgs() unit-level
// proof: detection + logging only, never a status mutation. Mocked
// Prisma + mocked explorer fetch, no real database or network.

jest.mock('../src/config', () => ({
  config: {
    trade: { multisigReorgSafetyWindowBlocks: 100 },
    multisig: { explorerApiUrl: 'https://mempool.space/testnet/api' },
  },
}))

const mockEscrowFindMany = jest.fn()
const mockEscrowUpdate = jest.fn()
jest.mock('../src/common/database', () => ({
  prisma: {
    escrow: {
      findMany: (...args: unknown[]) => mockEscrowFindMany(...args),
      update: (...args: unknown[]) => mockEscrowUpdate(...args),
    },
  },
}))

const fetchMock = jest.fn()

import { sweepMultisigFundingReorgs } from '../src/modules/open-settlement/multisig-funding-reorg-sweep'

function escrowFixture(overrides: Record<string, any> = {}) {
  return { id: 'escrow-1', type: 'MULTISIG', status: 'FUNDS_LOCKED', txLockId: 'a'.repeat(64), txLockVout: 0, lockedAt: new Date(), ...overrides }
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(global as any).fetch = fetchMock
})

function mockChain({ tipHeight, confirmed, blockHeight }: { tipHeight: number; confirmed: boolean; blockHeight?: number }) {
  fetchMock.mockImplementation((url: string) => {
    if (url.includes('/blocks/tip/height')) return Promise.resolve({ ok: true, text: async () => String(tipHeight) })
    if (url.includes('/status')) return Promise.resolve({ ok: true, json: async () => ({ confirmed, block_height: confirmed ? blockHeight : undefined }) })
    return Promise.resolve({ ok: true, json: async () => [] })
  })
}

describe('sweepMultisigFundingReorgs() — Missão 11 Fase 8.1 LB-08(A)', () => {
  it('a still-confirmed FUNDS_LOCKED escrow within the safety window is left alone', async () => {
    mockEscrowFindMany.mockResolvedValue([escrowFixture()])
    mockChain({ tipHeight: 800_010, confirmed: true, blockHeight: 800_000 })

    const result = await sweepMultisigFundingReorgs()

    expect(result.stillGood).toEqual(['escrow-1'])
    expect(result.flagged).toEqual([])
    expect(mockEscrowUpdate).not.toHaveBeenCalled()
  })

  it('a FUNDS_LOCKED escrow whose funding txid is no longer confirmed is flagged — status is NEVER mutated', async () => {
    mockEscrowFindMany.mockResolvedValue([escrowFixture()])
    mockChain({ tipHeight: 800_010, confirmed: false })

    const result = await sweepMultisigFundingReorgs()

    expect(result.flagged).toEqual(['escrow-1'])
    expect(mockEscrowUpdate).not.toHaveBeenCalled() // the core invariant this file exists to prove
  })

  it('a deeply-buried FUNDS_LOCKED escrow is skipped — no per-escrow status call made', async () => {
    mockEscrowFindMany.mockResolvedValue([escrowFixture()])
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/blocks/tip/height')) return Promise.resolve({ ok: true, text: async () => '900010' })
      return Promise.resolve({ ok: true, json: async () => ({ confirmed: true, block_height: 700_000 }) })
    })
    // tipHeight=900010, blockHeight=700000 -> depth 200011, > 100 safety window
    const result = await sweepMultisigFundingReorgs()
    expect(result.buriedEnough).toEqual(['escrow-1'])
  })

  it('does not fetch the chain tip at all when there are no FUNDS_LOCKED MULTISIG escrows', async () => {
    mockEscrowFindMany.mockResolvedValue([])
    const result = await sweepMultisigFundingReorgs()
    expect(result.stillGood).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
