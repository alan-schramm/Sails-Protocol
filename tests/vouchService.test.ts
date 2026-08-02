/**
 * VouchService — RFC-021 D7
 * (docs/rfcs/RFC-021-market-based-arbitration-and-payment-trust.md).
 *
 * Real eligibility/uniqueness logic, mocked Prisma/eventBus/reputationService
 * — same mocking shape disputeFlow.test.ts already established for
 * dispute.service.ts.
 */
export {} // same forced-module reasoning used throughout this suite

const mockUserFindUnique = jest.fn()
const mockVouchCreate = jest.fn()
const mockVouchFindFirst = jest.fn()
const mockVouchFindMany = jest.fn()
const mockVouchUpdate = jest.fn()

jest.mock('../src/common/database', () => ({
  prisma: {
    user: { findUnique: (...args: unknown[]) => mockUserFindUnique(...args) },
    vouch: {
      create: (...args: unknown[]) => mockVouchCreate(...args),
      findFirst: (...args: unknown[]) => mockVouchFindFirst(...args),
      findMany: (...args: unknown[]) => mockVouchFindMany(...args),
      update: (...args: unknown[]) => mockVouchUpdate(...args),
    },
  },
}))

const mockEmit = jest.fn().mockResolvedValue(undefined)
jest.mock('../src/common/events/event-bus', () => ({
  eventBus: { emit: (...args: unknown[]) => mockEmit(...args) },
}))

const mockPenalizeForBurnedVouch = jest.fn().mockResolvedValue({})
jest.mock('../src/modules/open-reputation/reputation.service', () => ({
  reputationService: { penalizeForBurnedVouch: (...args: unknown[]) => mockPenalizeForBurnedVouch(...args) },
}))

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { VouchService, MIN_VOUCHER_TRADES } = require('../src/modules/open-reputation/vouch.service')

const eligibleVoucher = { id: 'voucher-1', totalTrades: MIN_VOUCHER_TRADES, reputationScore: 5 }
const newcomer = { id: 'newcomer-1', totalTrades: 0, reputationScore: 0 }

describe('VouchService.vouchFor()', () => {
  const service = new VouchService()

  beforeEach(() => jest.clearAllMocks())

  it('creates a real vouch for an eligible voucher', async () => {
    mockUserFindUnique.mockResolvedValueOnce(eligibleVoucher).mockResolvedValueOnce(newcomer)
    mockVouchCreate.mockResolvedValue({ id: 'vouch-1', voucherId: 'voucher-1', voucheeId: 'newcomer-1' })

    const result = await service.vouchFor('voucher-1', 'newcomer-1')

    expect(mockVouchCreate).toHaveBeenCalledWith({ data: { voucherId: 'voucher-1', voucheeId: 'newcomer-1' } })
    expect(mockEmit).toHaveBeenCalledWith(
      'reputation.vouch.created',
      { voucherId: 'voucher-1', voucheeId: 'newcomer-1', vouchId: 'vouch-1' },
      'newcomer-1'
    )
    expect(result.id).toBe('vouch-1')
  })

  it('rejects vouching for yourself, before ever touching the database', async () => {
    await expect(service.vouchFor('user-1', 'user-1')).rejects.toThrow('cannot vouch for yourself')
    expect(mockUserFindUnique).not.toHaveBeenCalled()
  })

  it(`rejects a voucher with fewer than ${MIN_VOUCHER_TRADES} completed trades`, async () => {
    mockUserFindUnique.mockResolvedValueOnce({ id: 'voucher-1', totalTrades: MIN_VOUCHER_TRADES - 1, reputationScore: 5 }).mockResolvedValueOnce(newcomer)

    await expect(service.vouchFor('voucher-1', 'newcomer-1')).rejects.toThrow('does not meet the eligibility bar')
    expect(mockVouchCreate).not.toHaveBeenCalled()
  })

  it('rejects a voucher with zero or negative reputation, even with enough trades', async () => {
    mockUserFindUnique.mockResolvedValueOnce({ id: 'voucher-1', totalTrades: 50, reputationScore: 0 }).mockResolvedValueOnce(newcomer)

    await expect(service.vouchFor('voucher-1', 'newcomer-1')).rejects.toThrow('does not meet the eligibility bar')
  })

  it('rejects a duplicate vouch for the same pair (P2002), with a clean error', async () => {
    mockUserFindUnique.mockResolvedValueOnce(eligibleVoucher).mockResolvedValueOnce(newcomer)
    mockVouchCreate.mockRejectedValueOnce({ code: 'P2002' })

    await expect(service.vouchFor('voucher-1', 'newcomer-1')).rejects.toThrow('has already vouched for')
  })

  it('404s for a nonexistent voucher or vouchee', async () => {
    mockUserFindUnique.mockResolvedValueOnce(null)
    await expect(service.vouchFor('ghost', 'newcomer-1')).rejects.toThrow()
  })
})

describe('VouchService.hasActiveVouch()', () => {
  const service = new VouchService()
  beforeEach(() => jest.clearAllMocks())

  it('is true when an unburned vouch exists', async () => {
    mockVouchFindFirst.mockResolvedValue({ id: 'vouch-1', burnedAt: null })
    expect(await service.hasActiveVouch('newcomer-1')).toBe(true)
  })

  it('is false when none exists', async () => {
    mockVouchFindFirst.mockResolvedValue(null)
    expect(await service.hasActiveVouch('newcomer-1')).toBe(false)
  })
})

describe('VouchService.burnVouchesFor()', () => {
  const service = new VouchService()
  beforeEach(() => jest.clearAllMocks())

  it('burns every active vouch for the vouchee and penalizes each voucher independently', async () => {
    mockVouchFindMany.mockResolvedValue([
      { id: 'vouch-1', voucherId: 'voucher-1', voucheeId: 'newcomer-1' },
      { id: 'vouch-2', voucherId: 'voucher-2', voucheeId: 'newcomer-1' },
    ])

    await service.burnVouchesFor('newcomer-1')

    expect(mockVouchUpdate).toHaveBeenCalledWith({ where: { id: 'vouch-1' }, data: { burnedAt: expect.any(Date) } })
    expect(mockVouchUpdate).toHaveBeenCalledWith({ where: { id: 'vouch-2' }, data: { burnedAt: expect.any(Date) } })
    expect(mockPenalizeForBurnedVouch).toHaveBeenCalledWith('voucher-1')
    expect(mockPenalizeForBurnedVouch).toHaveBeenCalledWith('voucher-2')
    expect(mockEmit).toHaveBeenCalledWith(
      'reputation.vouch.burned',
      { voucherId: 'voucher-1', voucheeId: 'newcomer-1', vouchId: 'vouch-1' },
      'newcomer-1'
    )
  })

  it('is a safe no-op when the vouchee has no active vouch', async () => {
    mockVouchFindMany.mockResolvedValue([])
    await service.burnVouchesFor('newcomer-1')
    expect(mockVouchUpdate).not.toHaveBeenCalled()
    expect(mockPenalizeForBurnedVouch).not.toHaveBeenCalled()
  })
})
