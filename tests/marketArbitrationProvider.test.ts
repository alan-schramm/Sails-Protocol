/**
 * MarketArbitrationProvider — RFC-021 D1-D3
 * (docs/rfcs/RFC-021-market-based-arbitration-and-payment-trust.md).
 *
 * Real math (effectiveStake, K_ELIGIBILITY threshold, weighted random
 * selection), mocked Prisma — same "mock the DB boundary, exercise real
 * logic" discipline as tests/escrowReleaseControls.test.ts.
 */
export {} // same forced-module reasoning used throughout this suite

const mockArbiterProfileFindUnique = jest.fn()
const mockArbiterProfileCreate = jest.fn()
const mockArbiterProfileUpdate = jest.fn()
const mockArbiterProfileFindMany = jest.fn()
const mockDisputeFindUnique = jest.fn()
const mockEscrowFindUnique = jest.fn()

jest.mock('../src/common/database', () => ({
  prisma: {
    arbiterProfile: {
      findUnique: (...args: unknown[]) => mockArbiterProfileFindUnique(...args),
      create: (...args: unknown[]) => mockArbiterProfileCreate(...args),
      update: (...args: unknown[]) => mockArbiterProfileUpdate(...args),
      findMany: (...args: unknown[]) => mockArbiterProfileFindMany(...args),
    },
    dispute: { findUnique: (...args: unknown[]) => mockDisputeFindUnique(...args) },
    escrow: { findUnique: (...args: unknown[]) => mockEscrowFindUnique(...args) },
  },
}))

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { MarketArbitrationProvider, REPUTATION_STAKE_FACTOR, K_ELIGIBILITY } = require('../src/modules/open-settlement/market-arbitration.provider')

describe('MarketArbitrationProvider — RFC-021 D2, register()', () => {
  beforeEach(() => jest.clearAllMocks())

  it('creates a new ArbiterProfile with no approval step', async () => {
    mockArbiterProfileFindUnique.mockResolvedValue(null)
    mockArbiterProfileCreate.mockResolvedValue({
      participantId: 'arbiter-1', monetaryCollateral: '1.5', collateralAsset: 'BTC', arbiterReputation: 0,
    })

    const provider = new MarketArbitrationProvider()
    const result = await provider.register('arbiter-1', '1.5', 'BTC')

    expect(mockArbiterProfileCreate).toHaveBeenCalledWith({
      data: { participantId: 'arbiter-1', monetaryCollateral: '1.5', collateralAsset: 'BTC' },
    })
    expect(result.participantId).toBe('arbiter-1')
    expect(result.effectiveStake).toBe(1.5) // no reputation yet, pure collateral
  })

  it('tops up collateral on an existing profile instead of creating a duplicate', async () => {
    mockArbiterProfileFindUnique.mockResolvedValue({
      participantId: 'arbiter-1', monetaryCollateral: '1.0', collateralAsset: 'BTC', arbiterReputation: 20,
    })
    mockArbiterProfileUpdate.mockResolvedValue({
      participantId: 'arbiter-1', monetaryCollateral: '1.5', collateralAsset: 'BTC', arbiterReputation: 20,
    })

    const provider = new MarketArbitrationProvider()
    await provider.register('arbiter-1', '0.5', 'BTC')

    expect(mockArbiterProfileCreate).not.toHaveBeenCalled()
    expect(mockArbiterProfileUpdate).toHaveBeenCalledWith({
      where: { participantId: 'arbiter-1' },
      data: { monetaryCollateral: { increment: '0.5' }, collateralAsset: 'BTC' },
    })
  })
})

describe('MarketArbitrationProvider — RFC-021 D3, effectiveStake + eligibleFor()', () => {
  beforeEach(() => jest.clearAllMocks())

  it('computes effectiveStake as monetaryCollateral + arbiterReputation * REPUTATION_STAKE_FACTOR', async () => {
    // Real number check on the documented starting constant, so this
    // test breaks loudly (not silently) if the constant is ever tuned
    // without updating the RFC's own stated value.
    expect(REPUTATION_STAKE_FACTOR).toBe(0.01)

    mockArbiterProfileFindUnique.mockResolvedValue({
      participantId: 'arbiter-1', monetaryCollateral: '0.5', collateralAsset: 'BTC', arbiterReputation: 200,
    })
    const provider = new MarketArbitrationProvider()
    const profile = await provider.getProfile('arbiter-1')

    // 0.5 collateral + 200 reputation * 0.01 = 0.5 + 2 = 2.5
    expect(profile.effectiveStake).toBe(2.5)
  })

  it('a low-capital, high-reputation candidate can clear the same threshold as a high-capital, zero-reputation one — the RFC-021 design goal', async () => {
    expect(K_ELIGIBILITY).toBe(1.5)
    mockArbiterProfileFindMany.mockResolvedValue([
      { participantId: 'rich-newcomer', monetaryCollateral: '1.5', collateralAsset: 'BTC', arbiterReputation: 0, slashedAt: null },
      { participantId: 'veteran-low-capital', monetaryCollateral: '0.1', collateralAsset: 'BTC', arbiterReputation: 140, slashedAt: null },
      { participantId: 'below-threshold', monetaryCollateral: '0.2', collateralAsset: 'BTC', arbiterReputation: 5, slashedAt: null },
    ])

    const provider = new MarketArbitrationProvider()
    // disputeValue '1' -> threshold = 1 * 1.5 = 1.5
    const eligible = await provider.eligibleFor('1')
    const ids = eligible.map((c: { participantId: string }) => c.participantId)

    expect(ids).toContain('rich-newcomer')       // effectiveStake 1.5
    expect(ids).toContain('veteran-low-capital')  // effectiveStake 0.1 + 1.4 = 1.5
    expect(ids).not.toContain('below-threshold')  // effectiveStake 0.2 + 0.05 = 0.25
  })

  it('excludes slashed profiles from the eligible pool at the query level', async () => {
    mockArbiterProfileFindMany.mockResolvedValue([])
    const provider = new MarketArbitrationProvider()
    await provider.eligibleFor('1')
    expect(mockArbiterProfileFindMany).toHaveBeenCalledWith({ where: { slashedAt: null } })
  })
})

describe('MarketArbitrationProvider — assign() (the real ArbitrationProvider interface method)', () => {
  beforeEach(() => jest.clearAllMocks())

  it('throws a clear, actionable error when no candidate clears eligibility — not a silent fallback', async () => {
    mockDisputeFindUnique.mockResolvedValue({ id: 'dispute-1', escrowId: 'escrow-1' })
    mockEscrowFindUnique.mockResolvedValue({ id: 'escrow-1', lockedAmount: '100' })
    mockArbiterProfileFindMany.mockResolvedValue([])

    const provider = new MarketArbitrationProvider()
    await expect(provider.assign('dispute-1', 'trade-1')).rejects.toThrow(
      /no registered arbiter clears the 1\.5x eligibility threshold/
    )
  })

  it('assigns one of the eligible candidates when at least one clears the threshold', async () => {
    mockDisputeFindUnique.mockResolvedValue({ id: 'dispute-1', escrowId: 'escrow-1' })
    mockEscrowFindUnique.mockResolvedValue({ id: 'escrow-1', lockedAmount: '1' })
    mockArbiterProfileFindMany.mockResolvedValue([
      { participantId: 'only-eligible', monetaryCollateral: '2', collateralAsset: 'BTC', arbiterReputation: 0, slashedAt: null },
    ])

    const provider = new MarketArbitrationProvider()
    const arbiterId = await provider.assign('dispute-1', 'trade-1')
    expect(arbiterId).toBe('only-eligible')
  })

  it('over many draws, weighted selection favors the candidate with more effectiveStake — not a coin flip', async () => {
    mockDisputeFindUnique.mockResolvedValue({ id: 'dispute-1', escrowId: 'escrow-1' })
    mockEscrowFindUnique.mockResolvedValue({ id: 'escrow-1', lockedAmount: '0.01' }) // low threshold, both eligible
    mockArbiterProfileFindMany.mockResolvedValue([
      { participantId: 'heavy', monetaryCollateral: '99', collateralAsset: 'BTC', arbiterReputation: 0, slashedAt: null },
      { participantId: 'light', monetaryCollateral: '1', collateralAsset: 'BTC', arbiterReputation: 0, slashedAt: null },
    ])

    const provider = new MarketArbitrationProvider()
    const picks: Record<string, number> = { heavy: 0, light: 0 }
    for (let i = 0; i < 200; i++) {
      const id = await provider.assign('dispute-1', 'trade-1')
      picks[id] = (picks[id] ?? 0) + 1
    }
    // heavy has 99x the weight of light — expect it to dominate, not a 50/50 split.
    expect(picks.heavy).toBeGreaterThan(picks.light * 10)
  })
})
