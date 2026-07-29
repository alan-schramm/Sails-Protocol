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

const mockEmit = jest.fn().mockResolvedValue(undefined)
jest.mock('../src/common/events/event-bus', () => ({
  eventBus: { emit: (...args: unknown[]) => mockEmit(...args) },
}))

// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  MarketArbitrationProvider, REPUTATION_STAKE_FACTOR, K_ELIGIBILITY,
  OVERTURNED_PENALTY, SLASH_COLLATERAL_FRACTION, PANEL_SIZE_BASE,
} = require('../src/modules/open-settlement/market-arbitration.provider')

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

describe('MarketArbitrationProvider — slash() (RFC-021 D6)', () => {
  beforeEach(() => jest.clearAllMocks())

  it('forfeits SLASH_COLLATERAL_FRACTION of collateral and OVERTURNED_PENALTY reputation, real math', async () => {
    expect(SLASH_COLLATERAL_FRACTION).toBe(0.5)
    expect(OVERTURNED_PENALTY).toBe(-10)

    mockArbiterProfileFindUnique.mockResolvedValue({
      participantId: 'bad-arbiter', monetaryCollateral: '2', collateralAsset: 'BTC', arbiterReputation: 30,
    })
    mockArbiterProfileUpdate.mockResolvedValue({
      participantId: 'bad-arbiter', monetaryCollateral: '1.00000000', collateralAsset: 'BTC', arbiterReputation: 20,
    })

    const provider = new MarketArbitrationProvider()
    await provider.slash('bad-arbiter')

    expect(mockArbiterProfileUpdate).toHaveBeenCalledWith({
      where: { participantId: 'bad-arbiter' },
      data: { monetaryCollateral: '1.00000000', arbiterReputation: 20, rulingsOverturned: { increment: 1 } },
    })
    expect(mockEmit).toHaveBeenCalledWith(
      'arbiter.slashed',
      expect.objectContaining({ participantId: 'bad-arbiter', newCollateral: '1.00000000', newReputation: 20 }),
      'bad-arbiter'
    )
  })

  it('floors reputation at 0 — a slash never goes negative', async () => {
    mockArbiterProfileFindUnique.mockResolvedValue({
      participantId: 'low-rep', monetaryCollateral: '1', collateralAsset: 'BTC', arbiterReputation: 3,
    })
    mockArbiterProfileUpdate.mockResolvedValue({ participantId: 'low-rep', arbiterReputation: 0 })

    const provider = new MarketArbitrationProvider()
    await provider.slash('low-rep')

    expect(mockArbiterProfileUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ arbiterReputation: 0 }) })
    )
  })

  it('throws a clear error for an arbiter with no ArbiterProfile — not a silent no-op', async () => {
    mockArbiterProfileFindUnique.mockResolvedValue(null)
    const provider = new MarketArbitrationProvider()
    await expect(provider.slash('nobody')).rejects.toThrow(/no ArbiterProfile/)
  })
})

describe('MarketArbitrationProvider — assignAppealPanel() (RFC-021 D6)', () => {
  beforeEach(() => jest.clearAllMocks())

  it('excludes the original arbiter from the appeal panel — they cannot rule on their own overturn', async () => {
    mockDisputeFindUnique.mockResolvedValue({ id: 'dispute-1', escrowId: 'escrow-1' })
    mockEscrowFindUnique.mockResolvedValue({ id: 'escrow-1', lockedAmount: '0.01' })
    mockArbiterProfileFindMany.mockResolvedValue([
      { participantId: 'original-arbiter', monetaryCollateral: '5', collateralAsset: 'BTC', arbiterReputation: 100, slashedAt: null },
      { participantId: 'only-alternative', monetaryCollateral: '1', collateralAsset: 'BTC', arbiterReputation: 10, slashedAt: null },
    ])

    const provider = new MarketArbitrationProvider()
    const picked = await provider.assignAppealPanel('dispute-1', 'trade-1', 1, 'original-arbiter')
    expect(picked).toBe('only-alternative')
  })

  it('panel size grows with round: PANEL_SIZE_BASE * 2^round', async () => {
    expect(PANEL_SIZE_BASE).toBe(3)
    mockDisputeFindUnique.mockResolvedValue({ id: 'dispute-1', escrowId: 'escrow-1' })
    mockEscrowFindUnique.mockResolvedValue({ id: 'escrow-1', lockedAmount: '0.001' })
    // 10 eligible candidates, all clearly above threshold, spread reputation so ranking is deterministic.
    mockArbiterProfileFindMany.mockResolvedValue(
      Array.from({ length: 10 }, (_, i) => ({
        participantId: `arbiter-${i}`, monetaryCollateral: '1', collateralAsset: 'BTC', arbiterReputation: (10 - i) * 10, slashedAt: null,
      }))
    )

    const provider = new MarketArbitrationProvider()
    // round 1 -> panel of 6 -> only arbiter-0..5 (highest reputation) are reachable
    const picks = new Set<string>()
    for (let i = 0; i < 100; i++) {
      picks.add(await provider.assignAppealPanel('dispute-1', 'trade-1', 1))
    }
    for (const id of picks) {
      const index = Number(id.split('-')[1])
      expect(index).toBeLessThan(6) // PANEL_SIZE_BASE * 2^1 = 6
    }
  })

  it('over many draws, reputation dominates the panel weighting (70%), not collateral', async () => {
    mockDisputeFindUnique.mockResolvedValue({ id: 'dispute-1', escrowId: 'escrow-1' })
    mockEscrowFindUnique.mockResolvedValue({ id: 'escrow-1', lockedAmount: '0.0001' })
    mockArbiterProfileFindMany.mockResolvedValue([
      // high reputation, low collateral vs. low reputation, high collateral
      { participantId: 'reputable', monetaryCollateral: '0.01', collateralAsset: 'BTC', arbiterReputation: 1000, slashedAt: null },
      { participantId: 'rich', monetaryCollateral: '100', collateralAsset: 'BTC', arbiterReputation: 1, slashedAt: null },
    ])

    const provider = new MarketArbitrationProvider()
    const picks: Record<string, number> = { reputable: 0, rich: 0 }
    for (let i = 0; i < 400; i++) {
      const id = await provider.assignAppealPanel('dispute-1', 'trade-1', 3) // panel big enough to include both
      picks[id] = (picks[id] ?? 0) + 1
    }
    // Expected weight ratio ~0.7/0.3 ≈ 2.3x — asserting a comfortably
    // smaller margin (1.5x) keeps this non-flaky while still proving
    // reputation, not collateral, is the dominant factor.
    expect(picks.reputable).toBeGreaterThan(picks.rich * 1.5)
  })

  it('throws a clear error when no eligible arbiter remains after excluding the original', async () => {
    mockDisputeFindUnique.mockResolvedValue({ id: 'dispute-1', escrowId: 'escrow-1' })
    mockEscrowFindUnique.mockResolvedValue({ id: 'escrow-1', lockedAmount: '0.01' })
    mockArbiterProfileFindMany.mockResolvedValue([
      { participantId: 'only-one', monetaryCollateral: '5', collateralAsset: 'BTC', arbiterReputation: 100, slashedAt: null },
    ])

    const provider = new MarketArbitrationProvider()
    await expect(provider.assignAppealPanel('dispute-1', 'trade-1', 1, 'only-one')).rejects.toThrow(
      /no eligible arbiter available for appeal round/
    )
  })
})

describe('MarketArbitrationProvider — recordRuling() (RFC-021 D6 track record)', () => {
  it('increments rulingsTotal for the ruling arbiter', async () => {
    mockArbiterProfileUpdate.mockResolvedValue({ participantId: 'arbiter-1', rulingsTotal: 1 })
    const provider = new MarketArbitrationProvider()
    await provider.recordRuling('arbiter-1')
    expect(mockArbiterProfileUpdate).toHaveBeenCalledWith({
      where: { participantId: 'arbiter-1' },
      data: { rulingsTotal: { increment: 1 } },
    })
  })
})
