/**
 * PayoutAddressService + escrow.service.ts's resolvePayoutAddress()
 * fallback — BACKLOG.md's own "Participant payout address" gap, closed
 * 2026-08-04. Mocked Prisma, real fallback/precedence logic.
 */
export {} // same forced-module reasoning used throughout this suite

const mockPayoutAddressUpsert = jest.fn()
const mockPayoutAddressFindUnique = jest.fn()

jest.mock('../src/common/database', () => ({
  prisma: {
    payoutAddress: {
      upsert: (...args: unknown[]) => mockPayoutAddressUpsert(...args),
      findUnique: (...args: unknown[]) => mockPayoutAddressFindUnique(...args),
    },
  },
}))

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { PayoutAddressService } = require('../src/modules/open-settlement/payout-address.service')

describe('PayoutAddressService — RFC-009/BACKLOG.md payout-address gap', () => {
  beforeEach(() => jest.clearAllMocks())

  it('setPayoutAddress() upserts keyed on (participantId, asset)', async () => {
    mockPayoutAddressUpsert.mockResolvedValue({ id: 'pa-1', participantId: 'user-1', asset: 'BTC', address: 'tb1qxyz' })
    const service = new PayoutAddressService()
    const result = await service.setPayoutAddress('user-1', 'BTC', 'tb1qxyz')
    expect(mockPayoutAddressUpsert).toHaveBeenCalledWith({
      where: { participantId_asset: { participantId: 'user-1', asset: 'BTC' } },
      update: { address: 'tb1qxyz' },
      create: { participantId: 'user-1', asset: 'BTC', address: 'tb1qxyz' },
    })
    expect(result.address).toBe('tb1qxyz')
  })

  it('getPayoutAddress() returns null when nothing is registered — no fabrication', async () => {
    mockPayoutAddressFindUnique.mockResolvedValue(null)
    const service = new PayoutAddressService()
    const result = await service.getPayoutAddress('user-1', 'BTC')
    expect(result).toBeNull()
  })

  it('getPayoutAddressOrThrow() throws NotFoundError when nothing is registered', async () => {
    mockPayoutAddressFindUnique.mockResolvedValue(null)
    const service = new PayoutAddressService()
    await expect(service.getPayoutAddressOrThrow('user-1', 'BTC')).rejects.toThrow('PayoutAddress')
  })
})

// escrow.service.ts's own resolvePayoutAddress() — the actual fallback
// consumer. Mocked at the payout-address.service.ts module boundary
// (not the database) since escrow.service.ts imports the singleton
// instance directly, same "mock the collaborator, not the DB it happens
// to use" idiom other escrow.service.ts test files already establish
// for wdkSettlementProvider/multisigProvider.
describe('escrow.service.ts — resolvePayoutAddress() fallback (private, exercised via releaseFunds())', () => {
  const mockLoadEscrowWithAuthorization = jest.fn()
  const mockClaimEscrowTransition = jest.fn().mockResolvedValue(undefined)
  const mockRevertEscrowStatus = jest.fn().mockResolvedValue(undefined)
  const mockEscrowUpdate = jest.fn()
  const mockGetPayoutAddress = jest.fn()

  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()

    jest.doMock('../src/modules/open-settlement/payout-address.service', () => ({
      payoutAddressService: { getPayoutAddress: (...args: unknown[]) => mockGetPayoutAddress(...args) },
    }))
    jest.doMock('../src/common/database', () => ({
      prisma: {
        escrow: { update: (...args: unknown[]) => mockEscrowUpdate(...args) },
      },
    }))
    jest.doMock('../src/config', () => ({
      config: { features: { enforceCapabilities: false, requireDualApprovalForRelease: false }, settlement: { protocolFeeRate: 0 } },
    }))
    jest.doMock('../src/common/events/event-bus', () => ({ eventBus: { emit: jest.fn().mockResolvedValue(undefined) } }))
  })

  // resolvePayoutAddress() used to be a TypeScript-private EscrowService
  // method (private is a compile-time-only restriction, so calling it via
  // `as any` was the pragmatic way to unit test it without wiring a full
  // releaseFunds() call). PRODUCTION_READINESS_FIXES.md's escrow.service.ts
  // decomposition (2026-08-08, ARCHITECTURE_AUDIT_REPORT.md §2 recommendation
  // #1) moved it to escrow-lifecycle.ts as a real exported function — this
  // now imports it directly instead of reaching through the singleton,
  // which is both more correct (no `as any` privacy-piercing) and simpler.
  it('uses the explicit toAddress when provided, never consulting PayoutAddress', async () => {
    jest.doMock('../src/modules/open-settlement/wdk-settlement.provider', () => ({ wdkSettlementProvider: {} }))
    jest.doMock('../src/modules/open-settlement/multisig.provider', () => ({ multisigProvider: {} }))
    jest.doMock('../src/modules/open-settlement/lightning-hodl.provider', () => ({ lightningHodlProvider: {} }))
    jest.doMock('../src/modules/open-settlement/safe-guard-evm.provider', () => ({ safeGuardEvmProvider: {} }))

    const { resolvePayoutAddress } = require('../src/modules/open-settlement/escrow-lifecycle')
    const resolved = await resolvePayoutAddress('explicit-address', 'buyer-1', 'BTC')
    expect(resolved).toBe('explicit-address')
    expect(mockGetPayoutAddress).not.toHaveBeenCalled()
  })

  it('falls back to the registered PayoutAddress when no explicit address is given', async () => {
    jest.doMock('../src/modules/open-settlement/wdk-settlement.provider', () => ({ wdkSettlementProvider: {} }))
    jest.doMock('../src/modules/open-settlement/multisig.provider', () => ({ multisigProvider: {} }))
    jest.doMock('../src/modules/open-settlement/lightning-hodl.provider', () => ({ lightningHodlProvider: {} }))
    jest.doMock('../src/modules/open-settlement/safe-guard-evm.provider', () => ({ safeGuardEvmProvider: {} }))
    mockGetPayoutAddress.mockResolvedValue({ address: 'registered-address' })

    const { resolvePayoutAddress } = require('../src/modules/open-settlement/escrow-lifecycle')
    const resolved = await resolvePayoutAddress(undefined, 'buyer-1', 'BTC')
    expect(resolved).toBe('registered-address')
    expect(mockGetPayoutAddress).toHaveBeenCalledWith('buyer-1', 'BTC')
  })

  it('throws a clear error when neither an explicit address nor a registered one exists — never fabricates', async () => {
    jest.doMock('../src/modules/open-settlement/wdk-settlement.provider', () => ({ wdkSettlementProvider: {} }))
    jest.doMock('../src/modules/open-settlement/multisig.provider', () => ({ multisigProvider: {} }))
    jest.doMock('../src/modules/open-settlement/lightning-hodl.provider', () => ({ lightningHodlProvider: {} }))
    jest.doMock('../src/modules/open-settlement/safe-guard-evm.provider', () => ({ safeGuardEvmProvider: {} }))
    mockGetPayoutAddress.mockResolvedValue(null)

    const { resolvePayoutAddress } = require('../src/modules/open-settlement/escrow-lifecycle')
    await expect(resolvePayoutAddress(undefined, 'buyer-1', 'BTC')).rejects.toThrow(
      /No payout address provided.*none is registered/
    )
  })
})
